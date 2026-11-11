import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureOrganizationIndexes } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Sign in with the invited email to accept." }, { status: 401 });
  const parsed = await readJsonLimited<{ token?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.token !== "string" || body.token.length > 100) return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
  const db = (await clientPromise).db();
  await ensureOrganizationIndexes(db);
  const invitation = await db.collection("organization_invitations").findOne({ tokenHash: hashToken(body.token), status: "pending", expiresAt: { $gt: new Date() } });
  if (!invitation) return NextResponse.json({ error: "Invitation is invalid or expired." }, { status: 404 });
  if (session.user.email.trim().toLowerCase() !== invitation.email) return NextResponse.json({ error: "Sign in with the email address the invitation was sent to." }, { status: 403 });
  const now = new Date();
  await db.collection("organization_memberships").updateOne(
    { organizationId: invitation.organizationId, userId: session.user.id },
    { $set: { role: invitation.role, status: "active", acceptedAt: now }, $setOnInsert: { organizationId: invitation.organizationId, userId: session.user.id, createdAt: now } },
    { upsert: true },
  );
  await db.collection("organization_invitations").updateOne({ _id: invitation._id, status: "pending" }, { $set: { status: "accepted", acceptedBy: session.user.id, acceptedAt: now } });
  await db.collection("organization_activity").insertOne({ organizationId: invitation.organizationId, actorId: session.user.id, action: "member.accepted_invitation", createdAt: now });
  return NextResponse.json({ accepted: true });
}
