import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createState, hashState, metaConfig, unifiedLoginUrl } from "@/lib/marketplace/meta";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";

/** Version of the in-app permission notice shown before Meta login (see CreatorVerificationCard). */
const INSTAGRAM_CONSENT_VERSION = "v1";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL("/login?callbackUrl=%2Finfluencer-marketing%2Fcreator", appUrl));
  // Creators must agree to the in-app permission notice before we send them to Meta.
  if (new URL(request.url).searchParams.get("consent") !== INSTAGRAM_CONSENT_VERSION) return Response.redirect(new URL("/influencer-marketing/creator?meta=consent-required", appUrl));
  const db = (await clientPromise).db(); await ensureMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "marketplace-meta-connect", session.user.id, 5, 15 * 60_000);
  // Send people back to the creator studio with a readable message instead of a raw JSON error page.
  if (!limit.allowed) return Response.redirect(new URL(`/influencer-marketing/creator?meta=too-many-attempts&wait=${Math.max(1, Math.ceil(limit.retryAfterSeconds / 60))}`, appUrl));
  const creator = await db.collection("mp_influencers").findOne({ userId: session.user.id }, { projection: { instagramHandle: 1 } });
  if (!creator) return Response.redirect(new URL("/influencer-marketing/creator?meta=profile-required", appUrl));
  if (!creator.instagramHandle) return Response.redirect(new URL("/influencer-marketing/creator?meta=username-required", appUrl));
  try {
    const config = metaConfig(); const state = createState();
    const now = new Date();
    await db.collection("mp_oauth_states").insertOne({ stateHash: hashState(state), userId: session.user.id, consentVersion: INSTAGRAM_CONSENT_VERSION, expiresAt: new Date(now.getTime() + 10 * 60_000), createdAt: now });
    // Record of the creator's consent (DPDP Act): what they agreed to and when.
    await db.collection("mp_consents").insertOne({ userId: session.user.id, purpose: "instagram_verification", version: INSTAGRAM_CONSENT_VERSION, scopes: ["profile", "followers", "recent_posts", "insights"], givenAt: now });
    // Unified Login (Facebook Login for Business) when a login configuration is set; otherwise Instagram Login.
    if (config.configId) return Response.redirect(unifiedLoginUrl(state));
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "instagram_business_basic,instagram_business_manage_insights", state, enable_fb_login: "0", force_authentication: "1" }).toString();
    return Response.redirect(url);
  } catch { return Response.redirect(new URL("/influencer-marketing/creator?meta=not-configured", appUrl)); }
}
