import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureOrganizationIndexes, ensurePersonalOrganization, getOrganizationMemberships } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const db = (await clientPromise).db();
  await ensurePersonalOrganization(db, session.user.id);
  const memberships = await getOrganizationMemberships(db, session.user.id);
  const organizations = await Promise.all(memberships.map(async (membership) => {
    const organization = await db.collection("organizations").findOne({ _id: membership.organizationId }, { projection: { name: 1, createdAt: 1 } });
    return organization ? { id: String(organization._id), name: organization.name, role: membership.role, createdAt: organization.createdAt } : null;
  }));
  return NextResponse.json({ organizations: organizations.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = await readJsonLimited<{ name?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (name.length < 2) return NextResponse.json({ error: "Organization name must contain at least two characters." }, { status: 400 });
  const db = (await clientPromise).db();
  await ensureOrganizationIndexes(db);
  const organizationId = new ObjectId();
  const now = new Date();
  await db.collection("organizations").insertOne({ _id: organizationId, name, ownerId: session.user.id, createdAt: now, updatedAt: now });
  await db.collection("organization_memberships").insertOne({ organizationId, userId: session.user.id, role: "owner", status: "active", createdAt: now });
  await db.collection("organization_activity").insertOne({ organizationId, actorId: session.user.id, action: "organization.created", createdAt: now });
  return NextResponse.json({ organization: { id: String(organizationId), name, role: "owner" } }, { status: 201 });
}
