import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";
import { encryptToken, exchangeInstagramCode, fetchInstagramMedia, fetchInstagramProfile, hashState } from "@/lib/marketplace/meta";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const go = (status: string) => Response.redirect(new URL(`/influencer-marketing/creator?meta=${status}`, appUrl));
  const session = await auth(); if (!session?.user?.id) return go("sign-in-required");
  const params = new URL(request.url).searchParams;
  const state = params.get("state"); const code = params.get("code");
  if (!state || !code || state.length > 256 || code.length > 4096 || params.has("error")) return go("cancelled");
  const db = (await clientPromise).db(); await ensureMarketplaceIndexes(db);
  const used = await db.collection("mp_oauth_states").findOneAndDelete({ stateHash: hashState(state), userId: session.user.id, expiresAt: { $gt: new Date() } });
  if (!used) return go("invalid-state");
  try {
    const exchange = await exchangeInstagramCode(code);
    const profile = await fetchInstagramProfile(exchange.token);
    if (String(profile.user_id || profile.id) !== exchange.userId) return go("identity-mismatch");
    const recentMedia = await fetchInstagramMedia(exchange.token, exchange.userId).catch(() => []);
    const alreadyLinked = await db.collection("mp_social_connections").findOne({ provider: "instagram", providerUserId: exchange.userId, userId: { $ne: session.user.id } });
    if (alreadyLinked) return go("already-linked");
    const now = new Date();
    const followerCountAvailable = typeof profile.followers_count === "number" && Number.isSafeInteger(profile.followers_count) && profile.followers_count >= 0;
    if (!followerCountAvailable) return go("verification-unavailable");
    await db.collection("mp_social_connections").updateOne({ userId: session.user.id, provider: "instagram" }, { $set: { providerUserId: exchange.userId, username: profile.username, accessTokenEncrypted: encryptToken(exchange.token), expiresAt: exchange.expiresAt, nextCheckAt: new Date(now.getTime() + 86_400_000), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    await db.collection("mp_influencers").updateOne({ userId: session.user.id }, { $set: { instagram: { providerUserId: exchange.userId, username: profile.username, accountType: profile.account_type, verifiedFollowers: profile.followers_count, mediaCount: profile.media_count ?? null, profilePictureUrl: profile.profile_picture_url || null, recentMedia, mediaFetchedAt: now, verifiedAt: now, source: "meta_api" }, instagramUsername: profile.username, status: "pending", updatedAt: now } });
    await db.collection("mp_audit").insertOne({ entityId: session.user.id, actorId: session.user.id, action: "instagram.connected", followerCountAvailable, followerCount: profile.followers_count, createdAt: now });
    return go("connected-review");
  } catch { return go("verification-unavailable"); }
}
