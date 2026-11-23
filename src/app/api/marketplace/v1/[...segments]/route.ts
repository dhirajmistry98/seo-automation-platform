import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { ensureMarketplaceIndexes, objectId } from "@/lib/marketplace/core";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";
import { json, error, deleteCreatorProfile } from "@/lib/marketplace/api/helpers";
import * as adminRoutes from "@/lib/marketplace/api/handlers/admin";
import * as brandsRoutes from "@/lib/marketplace/api/handlers/brands";
import * as campaignsRoutes from "@/lib/marketplace/api/handlers/campaigns";
import * as cartsRoutes from "@/lib/marketplace/api/handlers/carts";
import * as collaborationsRoutes from "@/lib/marketplace/api/handlers/collaborations";
import * as profilesRoutes from "@/lib/marketplace/api/handlers/profiles";

import type { AuthedSession, Body } from "@/lib/marketplace/api/context";

type Context = { params: Promise<{ segments: string[] }> };
const GROUPS: Record<string, typeof profilesRoutes> = {
  "me": profilesRoutes,
  "influencers": profilesRoutes,
  "verification-requests": profilesRoutes,
  "booking-cart": cartsRoutes,
  "saved-campaigns": cartsRoutes,
  "cart": cartsRoutes,
  "brands": brandsRoutes,
  "campaigns": campaignsRoutes,
  "applications": campaignsRoutes,
  "collaborations": collaborationsRoutes,
  "messages": collaborationsRoutes,
  "offers": collaborationsRoutes,
  "deliverables": collaborationsRoutes,
  "admin": adminRoutes
};

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const userId = session.user.id;
  const path = (await context.params).segments;
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  const handler = GROUPS[path[0]]?.handleGet;
  return (handler && (await handler({ request, session: session as AuthedSession, userId, path, db }))) || error("Marketplace endpoint not found.", 404);
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const userId = session.user.id;
  const path = (await context.params).segments;
  if (!marketplacePaymentsEnabled() && ((path[0] === "collaborations" && ["checkout", "verify"].includes(path[2] || "")) || (path[0] === "admin" && path[1] === "orders" && path[3] === "refund"))) return error("Marketplace payments are disabled while payment and payout operations are being prepared.", 503);
  const parsed = await readJsonLimited<Body>(request, 16_384);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return error("Invalid JSON request body.", parsed.ok ? 400 : parsed.status);
  const body = parsed.value;
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "marketplace-mutation", userId, 90, 60_000);
  if (!limit.allowed) return error("Too many requests. Try again shortly.", 429);
  const now = new Date();

  const handler = GROUPS[path[0]]?.handlePost;
  return (handler && (await handler({ request, session: session as AuthedSession, userId, path, db, body, now }))) || error("Marketplace endpoint not found.", 404);
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const path = (await context.params).segments;
  if (path[0] === "influencers" && path[1] === "me" && path.length === 2) return deleteCreatorProfile(request, session.user.id);
  if (path[0] === "booking-cart" && path.length === 2) {
    const itemId = objectId(path[1]); if (!itemId) return error("Choose a cart item.");
    const db = (await clientPromise).db();
    const result = await db.collection("mp_booking_cart").deleteOne({ userId: session.user.id, _id: itemId });
    return json({ removed: result.deletedCount > 0 });
  }
  if (path[0] === "saved-campaigns" && path.length === 2) {
    const campaignId = objectId(path[1]); if (!campaignId) return error("Choose a valid campaign.");
    const db = (await clientPromise).db();
    const result = await db.collection("mp_saved_campaigns").deleteOne({ userId: session.user.id, campaignId });
    return json({ removed: result.deletedCount > 0 });
  }
  if (path[0] !== "cart" || path.length !== 2) return error("Marketplace endpoint not found.", 404);
  const influencerId = objectId(path[1]);
  if (!influencerId) return error("Choose a valid creator profile.");
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "marketplace-cart-remove", session.user.id, 60, 60_000);
  if (!limit.allowed) return error("Too many requests. Try again shortly.", 429);
  const result = await db.collection("mp_cart_items").deleteOne({ userId: session.user.id, influencerId });
  if (result.deletedCount) await db.collection("mp_audit").insertOne({ entityId: session.user.id, actorId: session.user.id, action: "creator_cart.removed", influencerId, createdAt: new Date() });
  return json({ removed: result.deletedCount > 0 });
}

/**
 * DELETE /influencers/me: the creator removes their creator account. The sign-in account, brand profiles and
 * finished collaborations (the brand's business record) are kept; everything that identifies or lists the
 * creator is removed. Blocked while a collaboration or payout is still open, so nobody is left mid-deal.
 */
