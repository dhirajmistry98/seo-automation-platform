import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureMarketplaceIndexes, statusAfterVerification } from "@/lib/marketplace/core";
import { instagramHandleMatches } from "@/lib/marketplace/instagram-handle";
import { encryptToken, exchangeInstagramCode, exchangeUnifiedCode, fetchInstagramAnalytics, fetchInstagramMedia, fetchInstagramProfile, hashState, listAssignedInstagramAccounts, metaConfig, type InstagramApi } from "@/lib/marketplace/meta";

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
    const creator = await db.collection("mp_influencers").findOne({ userId: session.user.id }, { projection: { instagramHandle: 1, status: 1 } });
    if (!creator?.instagramHandle) return go("username-required");
    let api: InstagramApi = "instagram";
    let exchange: { token: string; userId: string; expiresAt: Date };
    let profile: Awaited<ReturnType<typeof fetchInstagramProfile>>;
    if (metaConfig().configId) {
      // Unified Login: the person may grant several Instagram accounts; use the one matching the claimed username.
      api = "facebook";
      const unified = await exchangeUnifiedCode(code);
      const accounts = await listAssignedInstagramAccounts(unified.token);
      if (!accounts.length) return go("verification-unavailable");
      const chosen = accounts.find((account) => instagramHandleMatches(creator.instagramHandle, account.username)) ?? (accounts.length === 1 ? accounts[0] : null);
      if (!chosen) return go("username-mismatch");
      exchange = { token: unified.token, userId: chosen.id, expiresAt: unified.expiresAt };
      profile = await fetchInstagramProfile(unified.token, { api, id: chosen.id });
      if (String(profile.id) !== chosen.id) return go("identity-mismatch");
    } else {
      exchange = await exchangeInstagramCode(code);
      profile = await fetchInstagramProfile(exchange.token);
      if (String(profile.user_id || profile.id) !== exchange.userId) return go("identity-mismatch");
    }
    // The Instagram account Meta logged in as must be the username the creator entered on their profile.
    if (!instagramHandleMatches(creator.instagramHandle, profile.username)) {
      await db.collection("mp_audit").insertOne({ entityId: session.user.id, actorId: session.user.id, action: "instagram.username_mismatch", claimed: creator.instagramHandle, actual: typeof profile.username === "string" ? profile.username.slice(0, 30) : null, createdAt: new Date() });
      return go("username-mismatch");
    }
    const recentMedia = await fetchInstagramMedia(exchange.token, exchange.userId, api).catch(() => []);
    const alreadyLinked = await db.collection("mp_social_connections").findOne({ provider: "instagram", providerUserId: exchange.userId, userId: { $ne: session.user.id } });
    if (alreadyLinked) return go("already-linked");
    const now = new Date();
    const followerCountAvailable = typeof profile.followers_count === "number" && Number.isSafeInteger(profile.followers_count) && profile.followers_count >= 0;
    if (!followerCountAvailable) return go("verification-unavailable");
    await db.collection("mp_social_connections").updateOne({ userId: session.user.id, provider: "instagram" }, { $set: { providerUserId: exchange.userId, api, username: profile.username, accessTokenEncrypted: encryptToken(exchange.token), expiresAt: exchange.expiresAt, nextCheckAt: new Date(now.getTime() + 86_400_000), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    // A successful Meta verification lists the creator straight away; an admin's rejection or suspension stays in force.
    const listedStatus = statusAfterVerification(creator.status);
    await db.collection("mp_influencers").updateOne({ userId: session.user.id }, { $set: { instagram: { providerUserId: exchange.userId, username: profile.username, accountType: profile.account_type, verifiedFollowers: profile.followers_count, mediaCount: profile.media_count ?? null, profilePictureUrl: profile.profile_picture_url || null, recentMedia, mediaFetchedAt: now, verifiedAt: now, source: "meta_api" }, instagramUsername: profile.username, status: listedStatus, updatedAt: now } });
    // Public analytics (average Reel views, audience location and age) are best-effort and never block verification.
    const analytics = await Promise.race([fetchInstagramAnalytics(exchange.token, exchange.userId, api), new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000))]).catch(() => null);
    if (analytics) await db.collection("mp_influencers").updateOne({ userId: session.user.id }, { $set: { "instagram.analytics": analytics } });
    await db.collection("mp_audit").insertOne({ entityId: session.user.id, actorId: session.user.id, action: "instagram.connected", followerCountAvailable, followerCount: profile.followers_count, createdAt: now });
    return go("connected-review");
  } catch { return go("verification-unavailable"); }
}
