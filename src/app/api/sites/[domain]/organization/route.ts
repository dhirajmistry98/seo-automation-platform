import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite, getOrganizationMemberships, hasOrganizationPermission } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

export async function PATCH(request: Request, context: { params: Promise<{ domain: string }> }) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<{ organizationId?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.organizationId !== "string" || !ObjectId.isValid(body.organizationId)) return NextResponse.json({ error: "Choose a valid organization." }, { status: 400 });
  const db = (await clientPromise).db();
  const { website: source } = await findAccessibleWebsite(db, session.user.id, domain, "websites.manage");
  if (!source) return NextResponse.json({ error: "Website not found or website management is not allowed." }, { status: 404 });
  const memberships = await getOrganizationMemberships(db, session.user.id);
  const targetMembership = memberships.find((item) => String(item.organizationId) === body.organizationId);
  if (!hasOrganizationPermission(targetMembership?.role, "websites.manage")) return NextResponse.json({ error: "You cannot add websites to that organization." }, { status: 403 });
  const targetId = new ObjectId(body.organizationId);
  if (String(source.organizationId) === String(targetId)) return NextResponse.json({ moved: false, organizationId: String(targetId) });
  const duplicate = await db.collection("websites").findOne({ organizationId: targetId, domain, _id: { $ne: source._id } }, { projection: { _id: 1 } });
  if (duplicate) return NextResponse.json({ error: "This organization already has a website with that domain." }, { status: 409 });
  const sourceId = source.organizationId;
  const movedAt = new Date();
  const siteCollections = ["seo_audits", "seo_pages", "seo_issues", "seo_issue_history", "seo_scores", "seo_authority_scores", "seo_visibility_reports", "seo_research_reports", "seo_tasks", "seo_task_history", "pagespeed_results", "integration_status", "google_connections", "google_search_console_reports", "google_analytics_reports", "google_merchant_reports", "google_business_profile_reports", "wordpress_content", "wordpress_sync_history", "notifications", "audit_logs"];
  await db.collection("websites").updateOne({ _id: source._id }, { $set: { organizationId: targetId, updatedAt: movedAt } });
  for (const name of siteCollections) await db.collection(name).updateMany({ organizationId: sourceId, websiteDomain: domain }, { $set: { organizationId: targetId } });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, organizationId: targetId, websiteDomain: domain, actorId: session.user.id, action: "website.organization_changed", previousOrganizationId: sourceId, createdAt: movedAt });
  return NextResponse.json({ moved: true, organizationId: String(targetId) });
}
