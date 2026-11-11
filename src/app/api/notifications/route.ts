import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const db = (await clientPromise).db();
  const filter: Record<string, unknown> = { userId: session.user.id };
  if (new URL(request.url).searchParams.get("scope") === "influencer-marketing") {
    filter.type = "marketplace";
    filter.href = /^\/influencer-marketing(?:\/|\?|$)/;
  }
  const items = await db.collection("notifications").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
  const unreadCount = await db.collection("notifications").countDocuments({ ...filter, readAt: { $exists: false } });
  return NextResponse.json({ notifications: items.map((item) => ({ ...item, _id: String(item._id) })), unreadCount }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = await readJsonLimited<{ notificationId?: unknown; markAllRead?: unknown; scope?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const filter: Record<string, unknown> = { userId: session.user.id, readAt: { $exists: false } };
  if (body.scope === "influencer-marketing") {
    filter.type = "marketplace";
    filter.href = /^\/influencer-marketing(?:\/|\?|$)/;
  }
  const now = new Date();
  if (body.markAllRead === true) await (await clientPromise).db().collection("notifications").updateMany(filter, { $set: { readAt: now } });
  else if (typeof body.notificationId === "string" && ObjectId.isValid(body.notificationId)) await (await clientPromise).db().collection("notifications").updateOne({ ...filter, _id: new ObjectId(body.notificationId) }, { $set: { readAt: now } });
  else return NextResponse.json({ error: "Provide a notification ID or markAllRead." }, { status: 400 });
  return NextResponse.json({ updated: true });
}
