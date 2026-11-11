import clientPromise from "@/lib/mongodb";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";
import { decryptToken, encryptToken, fetchInstagramInsights, fetchInstagramMedia, fetchInstagramProfile, refreshInstagramToken } from "@/lib/marketplace/meta";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const db = (await clientPromise).db(); await ensureMarketplaceIndexes(db);
  const now = new Date();
  const connection = await db.collection("mp_social_connections").findOneAndUpdate(
    { provider: "instagram", nextCheckAt: { $lte: now }, $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: new Date(now.getTime() + 60_000) } },
    { sort: { nextCheckAt: 1 }, returnDocument: "after" },
  );
  if (!connection) return Response.json({ processed: 0 });
  try {
    let token = decryptToken(connection.accessTokenEncrypted);
    let expiresAt = connection.expiresAt as Date;
    if (expiresAt.getTime() < now.getTime() + 14 * 86_400_000) {
      const refreshed = await refreshInstagramToken(token);
      token = refreshed.token; expiresAt = refreshed.expiresAt;
    }
    const profile = await fetchInstagramProfile(token);
    if (String(profile.user_id || profile.id) !== connection.providerUserId) throw new Error("Instagram account identity changed.");
    const eligible = typeof profile.followers_count === "number" && Number.isSafeInteger(profile.followers_count) && profile.followers_count >= 0;
    if (!eligible) throw new Error("Meta did not return a valid follower count.");
    const recentMedia = await fetchInstagramMedia(token, connection.providerUserId).catch(() => null);
    const previous = await db.collection("mp_influencers").findOne({ userId: connection.userId });
    const oldInstagram = previous?.instagram && typeof previous.instagram === "object" ? previous.instagram as Record<string, unknown> : {};
    const mediaSnapshot = recentMedia === null ? { ...(Array.isArray(oldInstagram.recentMedia) ? { recentMedia: oldInstagram.recentMedia } : {}), ...(oldInstagram.mediaFetchedAt ? { mediaFetchedAt: oldInstagram.mediaFetchedAt } : {}) } : { recentMedia, mediaFetchedAt: now };
    await db.collection("mp_influencers").updateOne({ userId: connection.userId }, { $set: { instagram: { providerUserId: connection.providerUserId, username: profile.username, accountType: profile.account_type, verifiedFollowers: profile.followers_count, mediaCount: profile.media_count ?? null, profilePictureUrl: profile.profile_picture_url || null, ...mediaSnapshot, verifiedAt: now, source: "meta_api" }, instagramUsername: profile.username, status: previous?.status || "draft", updatedAt: now } });
    await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { username: profile.username, accessTokenEncrypted: encryptToken(token), expiresAt, nextCheckAt: new Date(now.getTime() + 86_400_000), lastCheckedAt: now, lastError: null, updatedAt: now }, $unset: { lockUntil: "" } });
    // Follower verification must succeed independently from Insights permission.
    // Once per day, persist authorized account metrics when Meta grants the scope.
    const lastInsightsAt = connection.lastInsightsAt instanceof Date ? connection.lastInsightsAt : connection.lastInsightsAt ? new Date(connection.lastInsightsAt) : null;
    if (!lastInsightsAt || lastInsightsAt.getTime() < now.getTime() - 23 * 60 * 60_000) {
      try {
        const metrics = await fetchInstagramInsights(token, connection.providerUserId);
        if (metrics.length) {
          await db.collection("mp_instagram_insights").insertOne({ userId: connection.userId, provider: "instagram_graph_api", providerUserId: connection.providerUserId, username: String(profile.username || ""), metrics, source: "Meta Instagram Insights API", fetchedAt: now });
          await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { lastInsightsAt: now, lastInsightsError: null, updatedAt: now } });
        }
      } catch {
        await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { lastInsightsError: "permission_or_provider_error", lastInsightsAttemptAt: now, updatedAt: now } });
      }
    }
    return Response.json({ processed: 1, verified: eligible });
  } catch {
    await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { nextCheckAt: new Date(now.getTime() + 3_600_000), lastError: "Provider verification failed.", updatedAt: now }, $unset: { lockUntil: "" } });
    return Response.json({ processed: 1, verified: false }, { status: 502 });
  }
}
