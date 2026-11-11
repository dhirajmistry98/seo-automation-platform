import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId, type Document, type UpdateFilter } from "mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  await ensureSeoIndexes(client.db());
  const { website: site } = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.read");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const memberships = await client.db().collection("organization_memberships").find({ organizationId: site.organizationId, status: "active" }, { projection: { userId: 1 } }).toArray();
  const memberIds = memberships.map((item) => String(item.userId));
  const userObjectIds = memberIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users = userObjectIds.length ? await client.db().collection("users").find({ _id: { $in: userObjectIds } }, { projection: { name: 1 } }).toArray() : [];
  const members = memberIds.map((id) => {
    const user = users.find((item) => String(item._id) === id);
    return { id, label: typeof user?.name === "string" && user.name ? user.name : `Member ${id.slice(-5)}` };
  });
  const tasks = await client.db().collection("seo_tasks").find({ organizationId: site.organizationId, websiteDomain: domain })
    .sort({ createdAt: -1 }).limit(100).project({ _id: 1, title: 1, description: 1, severity: 1, status: 1, pageUrl: 1, createdAt: 1, completedAt: 1, assigneeId: 1, dueDate: 1, comments: 1 }).toArray();
  return NextResponse.json({ members, tasks: tasks.map((task) => ({ ...task, _id: String(task._id), assigneeId: task.assigneeId ? String(task.assigneeId) : "", dueDate: task.dueDate instanceof Date ? task.dueDate.toISOString().slice(0, 10) : task.dueDate || "", comments: Array.isArray(task.comments) ? task.comments.slice(-50).map((comment) => ({ ...comment, userId: String(comment.userId), createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : String(comment.createdAt) })) : [] })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "tasks.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 12_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request is too large." : "Invalid request body." }, { status: parsed.status });
  const body = parsed.value;
  if (body.action === "comment") {
    if (typeof body.taskId !== "string" || !ObjectId.isValid(body.taskId) || typeof body.comment !== "string" || !body.comment.trim() || body.comment.trim().length > 2_000) return NextResponse.json({ error: "Enter a comment up to 2,000 characters for a valid task." }, { status: 400 });
    const taskId = new ObjectId(body.taskId);
    const now = new Date();
    const commentUpdate = { $push: { comments: { $each: [{ userId: session.user.id, text: body.comment.trim(), createdAt: now }], $slice: -50 } }, $set: { updatedAt: now } } as unknown as UpdateFilter<Document>;
    const result = await db.collection("seo_tasks").updateOne({ _id: taskId, organizationId: site.organizationId, websiteDomain: domain }, commentUpdate);
    if (!result.matchedCount) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    await db.collection("seo_task_history").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, taskId, action: "comment_added", changedAt: now });
    return NextResponse.json({ added: true });
  }
  if (typeof body.auditId !== "string" || body.auditId.length > 80) return NextResponse.json({ error: "A valid audit ID is required." }, { status: 400 });
  const audit = await db.collection("seo_audits").findOne({ organizationId: site.organizationId, websiteDomain: domain, auditId: body.auditId, status: "completed" });
  if (!audit) return NextResponse.json({ error: "Completed audit not found." }, { status: 404 });
  const issues = await db.collection("seo_issues").find({ organizationId: site.organizationId, websiteDomain: domain, auditId: body.auditId, status: "open" }).limit(500).toArray();
  const tasks = db.collection("seo_tasks");
  let created = 0;
  let reopened = 0;
  for (const item of issues) {
    const alreadyExists = await tasks.findOne({ organizationId: site.organizationId, sourceIssueId: String(item._id) }, { projection: { _id: 1 } });
    if (alreadyExists) {
      const result = await tasks.updateOne({ _id: alreadyExists._id, status: "done" }, { $set: { status: "todo", auditId: body.auditId, updatedAt: new Date(), completedAt: null } });
      if (result.modifiedCount) {
        reopened++;
        await db.collection("seo_task_history").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, taskId: alreadyExists._id, action: "reopened_from_new_audit", auditId: body.auditId, changedAt: new Date() });
      }
      continue;
    }
    const now = new Date();
    const insertedTask = await tasks.insertOne({
      ownerId: session.user.id,
      organizationId: site.organizationId,
      websiteDomain: domain,
      sourceIssueId: String(item._id),
      auditId: body.auditId,
      title: item.title,
      description: item.recommendation,
      severity: item.severity,
      pageUrl: item.pageUrl,
      status: "todo",
      createdAt: now,
      updatedAt: now,
    });
    created++;
    await db.collection("seo_task_history").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, taskId: insertedTask.insertedId, sourceIssueId: String(item._id), action: "created_from_issue", auditId: body.auditId, changedAt: now });
  }
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "seo.tasks.generated", auditId: body.auditId, createdCount: created, reopenedCount: reopened, createdAt: new Date() });
  return NextResponse.json({ created, reopened, total: issues.length });
}

export async function PATCH(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 12_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request is too large." : "Invalid request body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.taskId !== "string" || body.taskId.length > 80) return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });
  if (!ObjectId.isValid(body.taskId)) return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
  if (body.status !== undefined && !["todo", "in_progress", "done"].includes(String(body.status))) return NextResponse.json({ error: "Choose a valid task status." }, { status: 400 });
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) { update.status = body.status; update.completedAt = body.status === "done" ? new Date() : null; }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") update.dueDate = null;
    else if (typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
      const dueDate = new Date(`${body.dueDate}T00:00:00.000Z`);
      if (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== body.dueDate) return NextResponse.json({ error: "Choose a valid due date." }, { status: 400 });
      update.dueDate = dueDate;
    } else return NextResponse.json({ error: "Choose a valid due date." }, { status: 400 });
  }
  const client = await clientPromise;
  await ensureSeoIndexes(client.db());
  const { website: site } = await findAccessibleWebsite(client.db(), session.user.id, domain, "tasks.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (body.assigneeId !== undefined) {
    if (body.assigneeId === null || body.assigneeId === "") update.assigneeId = null;
    else {
      const validMember = await client.db().collection("organization_memberships").findOne({ organizationId: site.organizationId, userId: body.assigneeId, status: "active" }, { projection: { _id: 1 } });
      if (!validMember) return NextResponse.json({ error: "Choose an active member of this organization." }, { status: 400 });
      update.assigneeId = body.assigneeId;
    }
  }
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "Provide a task update." }, { status: 400 });
  const result = await client.db().collection("seo_tasks").updateOne(
    { _id: new ObjectId(body.taskId), organizationId: site.organizationId, websiteDomain: domain },
    { $set: update },
  );
  if (!result.matchedCount) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await client.db().collection("seo_task_history").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, taskId: body.taskId, action: "task_updated", changes: Object.keys(update).filter((key) => key !== "updatedAt"), status: body.status, changedAt: new Date() });
  await client.db().collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "seo.task.updated", taskId: body.taskId, status: body.status, createdAt: new Date() });
  return NextResponse.json({ updated: true });
}
