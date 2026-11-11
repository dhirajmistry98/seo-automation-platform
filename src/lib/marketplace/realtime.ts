import * as Ably from "ably";
import type { Db, ObjectId } from "mongodb";

export const collaborationChannel = (id: string | ObjectId) => `marketplace:collaboration:${String(id)}`;
const globalForAbly = globalThis as typeof globalThis & { marketplaceAbly?: Ably.Rest };
function ablyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  if (!globalForAbly.marketplaceAbly) globalForAbly.marketplaceAbly = new Ably.Rest({ key });
  return globalForAbly.marketplaceAbly;
}
export const realtimeAvailable = () => !!process.env.ABLY_API_KEY;

export async function createCollaborationTokenRequest(collaborationId: string, userId: string) {
  const ably = ablyRest(); if (!ably) throw new Error("Real-time transport is unavailable.");
  return ably.auth.createTokenRequest({ clientId: userId, ttl: 5 * 60_000, capability: JSON.stringify({ [collaborationChannel(collaborationId)]: ["subscribe", "presence"] }) });
}

export async function queueMarketplaceEvent(db: Db, collaborationId: ObjectId, name: string) {
  const ably = ablyRest(); if (!ably) return;
  const now = new Date();
  const event = { collaborationId, name, status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now };
  const result = await db.collection("mp_realtime_outbox").insertOne(event);
  try {
    await ably.channels.get(collaborationChannel(collaborationId)).publish(name, { eventId: String(result.insertedId) });
    await db.collection("mp_realtime_outbox").updateOne({ _id: result.insertedId }, { $set: { status: "delivered", deliveredAt: new Date() } });
  } catch {
    await db.collection("mp_realtime_outbox").updateOne({ _id: result.insertedId }, { $set: { lastError: "Publish failed; scheduled retry required." } });
  }
}

export async function publishQueuedMarketplaceEvent(collaborationId: ObjectId, name: string, eventId: ObjectId) {
  const ably = ablyRest(); if (!ably) throw new Error("ABLY_API_KEY is not configured.");
  await ably.channels.get(collaborationChannel(collaborationId)).publish(name, { eventId: String(eventId) });
}
