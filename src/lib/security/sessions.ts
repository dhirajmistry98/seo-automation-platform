import type { Db } from "mongodb";

export async function revokeUserSessions(db: Db, userId: string, currentSessionId?: string, now = new Date(), maxAgeSeconds = 8 * 60 * 60) {
  const activeSessions = await db.collection("active_sessions").find({ userId }, { projection: { jti: 1 } }).toArray();
  const sessionIds = new Set(activeSessions.map((item) => item.jti).filter((jti): jti is string => typeof jti === "string"));
  if (currentSessionId) sessionIds.add(currentSessionId);

  if (sessionIds.size) {
    const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1_000);
    const revoked = db.collection("auth_revoked_sessions");
    await revoked.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "revoked_session_expiry" });
    await revoked.bulkWrite([...sessionIds].map((jti) => ({
      updateOne: {
        filter: { jti },
        update: { $set: { userId, revokedAt: now, expiresAt } },
        upsert: true,
      },
    })), { ordered: false });
  }

  await db.collection("active_sessions").deleteMany({ userId });
  return sessionIds.size;
}
