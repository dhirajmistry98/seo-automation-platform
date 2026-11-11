import clientPromise from "@/lib/mongodb";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";
import { publishQueuedMarketplaceEvent, realtimeAvailable } from "@/lib/marketplace/realtime";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!realtimeAvailable()) return Response.json({ error: "ABLY_API_KEY is not configured." }, { status: 503 });
  const db = (await clientPromise).db(); await ensureMarketplaceIndexes(db);
  const now = new Date();
  const event = await db.collection("mp_realtime_outbox").findOneAndUpdate({ $or: [{ status: "pending", nextAttemptAt: { $lte: now } }, { status: "processing", lockedAt: { $lt: new Date(now.getTime() - 120_000) } }] }, { $set: { status: "processing", lockedAt: now } }, { sort: { nextAttemptAt: 1 }, returnDocument: "after" });
  if (!event) return Response.json({ processed: 0 });
  try {
    await publishQueuedMarketplaceEvent(event.collaborationId, event.name, event._id);
    await db.collection("mp_realtime_outbox").updateOne({ _id: event._id }, { $set: { status: "delivered", deliveredAt: new Date() }, $unset: { lockedAt: "" } });
    return Response.json({ processed: 1, delivered: true });
  } catch {
    const attempts = Number(event.attempts || 0) + 1;
    await db.collection("mp_realtime_outbox").updateOne({ _id: event._id }, { $set: { status: attempts >= 20 ? "failed" : "pending", attempts, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 10_000 * 2 ** attempts)), lastError: "Provider publish failed." }, $unset: { lockedAt: "" } });
    return Response.json({ processed: 1, delivered: false }, { status: 502 });
  }
}
