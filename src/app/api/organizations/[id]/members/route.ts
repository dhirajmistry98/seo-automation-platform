import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureOrganizationIndexes, hasOrganizationPermission, ORGANIZATION_ROLES } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, requestClientIp, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { buildOrganizationInvitationEmail, sendTransactionalEmail } from "@/lib/email";

type Context = { params: Promise<{ id: string }> };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function getContext(userId: string, rawId: string) {
  if (!ObjectId.isValid(rawId)) return null;
  const db = (await clientPromise).db();
  await ensureOrganizationIndexes(db);
  const organizationId = new ObjectId(rawId);
  const membership = await db.collection("organization_memberships").findOne({ organizationId, userId, status: "active" });
  if (!membership) return null;
  const organization = await db.collection("organizations").findOne({ _id: organizationId });
  return organization ? { db, organization, membership, organizationId } : null;
}

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const org = await getContext(session.user.id, id);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!hasOrganizationPermission(org.membership.role, "members.manage")) return NextResponse.json({ error: "You cannot view organization members." }, { status: 403 });
  const members = await org.db.collection("organization_memberships").aggregate([
    { $match: { organizationId: org.organizationId, status: "active" } },
    { $lookup: { from: "users", let: { memberId: "$userId" }, pipeline: [{ $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$memberId"] } } }], as: "user" } },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, userId: 1, role: 1, joinedAt: "$createdAt", name: "$user.name", email: "$user.email" } },
  ]).toArray();
  const invitations = await org.db.collection("organization_invitations").find({ organizationId: org.organizationId, status: "pending", expiresAt: { $gt: new Date() } }, { projection: { _id: 0, email: 1, role: 1, createdAt: 1, expiresAt: 1 } }).toArray();
  return NextResponse.json({ members, invitations }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const org = await getContext(session.user.id, id);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!hasOrganizationPermission(org.membership.role, "members.manage")) return NextResponse.json({ error: "You cannot invite organization members." }, { status: 403 });
  const parsed = await readJsonLimited<{ email?: unknown; role?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (typeof role !== "string" || !(ORGANIZATION_ROLES as readonly string[]).includes(role) || role === "owner") return NextResponse.json({ error: "Choose a valid non-owner role." }, { status: 400 });
  const now = new Date();
  const actorLimit = await consumeRateLimit(org.db, "organization-invitation-actor", String(org.organizationId) + ":" + session.user.id, 20, 60 * 60_000, now);
  const emailLimit = await consumeRateLimit(org.db, "organization-invitation-email", email, 5, 24 * 60 * 60_000, now);
  const ipLimit = await consumeRateLimit(org.db, "organization-invitation-ip", requestClientIp(request), 80, 60 * 60_000, now);
  const limited = [actorLimit, emailLimit, ipLimit].find((limit) => !limit.allowed);
  if (limited) return NextResponse.json({ error: "Invitation limit reached. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });

  const existingUser = await org.db.collection("users").findOne({ email, _id: { $type: "objectId" } }, { projection: { _id: 1 } });
  if (existingUser && await org.db.collection("organization_memberships").findOne({ organizationId: org.organizationId, userId: String(existingUser._id), status: "active" })) return NextResponse.json({ error: "That user is already a member." }, { status: 409 });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 7 * 86400_000);
  await org.db.collection("organization_invitations").updateOne(
    { organizationId: org.organizationId, email, status: "pending" },
    { $set: { role, tokenHash: hashToken(token), invitedBy: session.user.id, expiresAt, updatedAt: now }, $setOnInsert: { organizationId: org.organizationId, email, createdAt: now } },
    { upsert: true },
  );
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const invitationUrl = base.replace(/\/$/, "") + "/dashboard/invitations/accept?token=" + encodeURIComponent(token);
  const organizationName = typeof org.organization.name === "string" ? org.organization.name : "your SEO Studio workspace";
  const invitationEmail = buildOrganizationInvitationEmail(organizationName, role, invitationUrl);
  const delivered = await sendTransactionalEmail({ to: email, ...invitationEmail });
  const delivery = delivered ? "email" : "copy_link";
  await org.db.collection("organization_activity").insertOne({ organizationId: org.organizationId, actorId: session.user.id, action: "member.invited", email, role, delivery, createdAt: now });
  return NextResponse.json({ invited: true, delivery, ...(delivered ? {} : { invitationUrl }), expiresAt }, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const org = await getContext(session.user.id, id);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!hasOrganizationPermission(org.membership.role, "members.manage")) return NextResponse.json({ error: "You cannot change member roles." }, { status: 403 });
  const parsed = await readJsonLimited<{ userId?: unknown; role?: unknown; action?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (body.action === "transfer_owner") {
    if (org.membership.role !== "owner") return NextResponse.json({ error: "Only the current owner can transfer ownership." }, { status: 403 });
    if (typeof body.userId !== "string" || body.userId === session.user.id) return NextResponse.json({ error: "Choose another active organization member." }, { status: 400 });
    const nextOwner = await org.db.collection("organization_memberships").findOne({ organizationId: org.organizationId, userId: body.userId, status: "active", role: { $ne: "owner" } });
    if (!nextOwner) return NextResponse.json({ error: "The new owner must be an active organization member." }, { status: 404 });
    const now = new Date();
    const promoted = await org.db.collection("organization_memberships").updateOne({ _id: nextOwner._id, role: { $ne: "owner" }, status: "active" }, { $set: { role: "owner", updatedAt: now } });
    if (!promoted.modifiedCount) return NextResponse.json({ error: "The member changed; reload the team and try again." }, { status: 409 });
    const demoted = await org.db.collection("organization_memberships").updateOne({ organizationId: org.organizationId, userId: session.user.id, role: "owner", status: "active" }, { $set: { role: "administrator", updatedAt: now } });
    if (!demoted.modifiedCount) {
      await org.db.collection("organization_memberships").updateOne({ _id: nextOwner._id, role: "owner" }, { $set: { role: nextOwner.role, updatedAt: new Date() } });
      return NextResponse.json({ error: "Ownership transfer could not be completed. Refresh and try again." }, { status: 409 });
    }
    const organizationUpdated = await org.db.collection("organizations").updateOne({ _id: org.organizationId, ownerId: session.user.id }, { $set: { ownerId: body.userId, updatedAt: now } });
    if (!organizationUpdated.modifiedCount) {
      await org.db.collection("organization_memberships").updateOne({ _id: nextOwner._id, role: "owner" }, { $set: { role: nextOwner.role, updatedAt: new Date() } });
      await org.db.collection("organization_memberships").updateOne({ organizationId: org.organizationId, userId: session.user.id, role: "administrator", status: "active" }, { $set: { role: "owner", updatedAt: new Date() } });
      return NextResponse.json({ error: "Organization ownership changed elsewhere. Refresh and try again." }, { status: 409 });
    }
    await org.db.collection("organization_activity").insertOne({ organizationId: org.organizationId, actorId: session.user.id, targetUserId: body.userId, action: "organization.ownership_transferred", createdAt: now });
    return NextResponse.json({ transferred: true });
  }
  if (typeof body.userId !== "string" || typeof body.role !== "string" || !(ORGANIZATION_ROLES as readonly string[]).includes(body.role) || body.role === "owner") return NextResponse.json({ error: "Provide a valid member and non-owner role." }, { status: 400 });
  const target = await org.db.collection("organization_memberships").findOne({ organizationId: org.organizationId, userId: body.userId, status: "active" });
  if (!target || target.role === "owner") return NextResponse.json({ error: "Member not found or the owner role cannot be changed." }, { status: 404 });
  await org.db.collection("organization_memberships").updateOne({ _id: target._id }, { $set: { role: body.role, updatedAt: new Date() } });
  await org.db.collection("organization_activity").insertOne({ organizationId: org.organizationId, actorId: session.user.id, targetUserId: body.userId, action: "member.role_changed", role: body.role, createdAt: new Date() });
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const org = await getContext(session.user.id, id);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!hasOrganizationPermission(org.membership.role, "members.manage")) return NextResponse.json({ error: "You cannot remove members." }, { status: 403 });
  const parsed = await readJsonLimited<{ userId?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.userId !== "string") return NextResponse.json({ error: "A member user ID is required." }, { status: 400 });
  const removed = await org.db.collection("organization_memberships").updateOne({ organizationId: org.organizationId, userId: body.userId, status: "active", role: { $ne: "owner" } }, { $set: { status: "removed", removedAt: new Date(), removedBy: session.user.id } });
  if (!removed.modifiedCount) return NextResponse.json({ error: "Member not found or the owner cannot be removed." }, { status: 404 });
  await org.db.collection("organization_activity").insertOne({ organizationId: org.organizationId, actorId: session.user.id, targetUserId: body.userId, action: "member.removed", createdAt: new Date() });
  return NextResponse.json({ removed: true });
}
