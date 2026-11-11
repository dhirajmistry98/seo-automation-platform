import { ObjectId, type Db, type Document } from "mongodb";
import { influencerTier } from "./tiers.ts";

export const BRAND_CATEGORIES = ["startup", "small_business", "local_business", "ecommerce", "established_company", "marketing_agency", "enterprise"] as const;
export type BrandCategory = typeof BRAND_CATEGORIES[number];
export const PROFILE_STATUSES = ["draft", "pending", "approved", "rejected", "suspended"] as const;
export const CAMPAIGN_STATUSES = ["draft", "open", "closed", "cancelled"] as const;
export const APPLICATION_STATUSES = ["pending", "invited", "accepted", "declined", "withdrawn"] as const;

export function cleanText(value: unknown, max = 200, min = 1): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return text.length >= min && text.length <= max ? text : null;
}
export function cleanList(value: unknown, maxItems = 10): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => cleanText(item, 60));
  return items.some((item) => !item) ? null : [...new Set(items as string[])];
}
export function inrPaise(value: unknown, maximum = 100_000_000): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}
export function objectId(value: unknown): ObjectId | null {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
export function profileTier(profile: Document) {
  const stat = profile.instagram as { verifiedFollowers?: number | null; verifiedAt?: Date | null; source?: string } | undefined;
  if (stat?.source !== "meta_api" || !stat.verifiedAt || Date.now() - new Date(stat.verifiedAt).getTime() > 7 * 86_400_000) return null;
  return influencerTier(stat.verifiedFollowers);
}
export function isCurrentMetaVerification(profile: Document) {
  const stat = profile.instagram as { verifiedFollowers?: number | null; verifiedAt?: Date | null; source?: string } | undefined;
  const verifiedAt = stat?.verifiedAt ? new Date(stat.verifiedAt).getTime() : NaN;
  return stat?.source === "meta_api" && Number.isSafeInteger(stat.verifiedFollowers) && Number(stat.verifiedFollowers) >= 0 && Number.isFinite(verifiedAt) && Date.now() - verifiedAt >= 0 && Date.now() - verifiedAt <= 7 * 86_400_000;
}
export function isPublicInfluencer(profile: Document) {
  return profile.status === "approved" && profile.creatorTrack !== "emerging" && isCurrentMetaVerification(profile) && profileTier(profile) !== null;
}
export function isPublicEmergingCreator(profile: Document) {
  return profile.status === "approved" && profile.creatorTrack === "emerging" && isCurrentMetaVerification(profile) && Number((profile.instagram as { verifiedFollowers?: number } | undefined)?.verifiedFollowers) < 5_000;
}
/**
 * Any listed creator — standard (5K+) or Emerging — can be saved, invited, booked and
 * can apply to campaigns. The tracks differ only in which directory they appear in.
 */
export function isActiveCreator(profile: Document) {
  return isPublicInfluencer(profile) || isPublicEmergingCreator(profile);
}

const globalIndexes = globalThis as typeof globalThis & { marketplaceIndexes?: Promise<void>; marketplaceCartIndexes?: Promise<void>; marketplaceBookingIndexes?: Promise<void> };
export async function ensureMarketplaceIndexes(db: Db) {
  if (!globalIndexes.marketplaceIndexes) globalIndexes.marketplaceIndexes = Promise.all([
    db.collection("mp_influencers").createIndex({ userId: 1 }, { unique: true }),
    db.collection("mp_influencers").createIndex({ status: 1, "instagram.verifiedFollowers": -1 }),
    db.collection("mp_brands").createIndex({ ownerId: 1 }),
    db.collection("mp_brands").createIndex({ slug: 1 }, { unique: true }),
    db.collection("mp_brand_members").createIndex({ brandId: 1, userId: 1 }, { unique: true }),
    db.collection("mp_brand_members").createIndex({ userId: 1, status: 1 }),
    db.collection("mp_campaigns").createIndex({ brandId: 1, createdAt: -1 }),
    db.collection("mp_campaigns").createIndex({ status: 1, deadline: 1 }),
    db.collection("mp_applications").createIndex({ campaignId: 1, influencerId: 1 }, { unique: true }),
    db.collection("mp_applications").createIndex({ influencerId: 1, createdAt: -1 }),
    db.collection("mp_collaborations").createIndex({ campaignId: 1, influencerId: 1 }, { unique: true }),
    db.collection("mp_messages").createIndex({ collaborationId: 1, createdAt: -1 }),
    db.collection("mp_messages").createIndex({ collaborationId: 1, senderId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }),
    db.collection("mp_offers").createIndex({ collaborationId: 1, createdAt: -1 }),
    db.collection("mp_agreements").createIndex({ collaborationId: 1 }, { unique: true }),
    db.collection("mp_orders").createIndex({ collaborationId: 1 }, { unique: true }),
    db.collection("mp_orders").createIndex({ razorpayOrderId: 1 }, { unique: true, partialFilterExpression: { razorpayOrderId: { $type: "string" } } }),
    db.collection("mp_orders").createIndex({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }),
    db.collection("mp_financial_ledger").createIndex({ orderId: 1, entryType: 1 }, { unique: true }),
    db.collection("mp_payout_requests").createIndex({ orderId: 1 }, { unique: true }),
    db.collection("mp_payment_anomalies").createIndex({ orderId: 1, paymentId: 1 }, { unique: true }),
    db.collection("mp_refunds").createIndex({ providerRefundId: 1 }, { unique: true, partialFilterExpression: { providerRefundId: { $type: "string" } } }),
    db.collection("mp_refunds").createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } }),
    db.collection("mp_provider_disputes").createIndex({ providerDisputeId: 1 }, { unique: true }),
    db.collection("mp_deliverables").createIndex({ collaborationId: 1, createdAt: -1 }),
    db.collection("mp_reviews").createIndex({ collaborationId: 1, reviewerId: 1 }, { unique: true }),
    db.collection("mp_verification_requests").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("mp_social_connections").createIndex({ userId: 1, provider: 1 }, { unique: true }),
    db.collection("mp_social_connections").createIndex({ provider: 1, providerUserId: 1 }, { unique: true }),
    db.collection("mp_instagram_insights").createIndex({ userId: 1, fetchedAt: -1 }),
    db.collection("mp_social_connections").createIndex({ provider: 1, nextCheckAt: 1, lockUntil: 1 }),
    db.collection("mp_oauth_states").createIndex({ stateHash: 1 }, { unique: true }),
    db.collection("mp_oauth_states").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("mp_audit").createIndex({ entityId: 1, createdAt: -1 }),
    db.collection("mp_realtime_outbox").createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection("mp_disputes").createIndex({ collaborationId: 1, createdAt: -1 }),
    db.collection("mp_disputes").createIndex({ status: 1, createdAt: -1 }),
    db.collection("mp_message_reports").createIndex({ messageId: 1, reporterId: 1 }, { unique: true }),
    db.collection("mp_message_reports").createIndex({ status: 1, createdAt: -1 }),
    db.collection("mp_settings").createIndex({ key: 1 }, { unique: true }),
  ]).then(() => undefined).catch((error) => { globalIndexes.marketplaceIndexes = undefined; throw error; });
  await globalIndexes.marketplaceIndexes;
  // Separate this migration from the original index promise so a hot-reloaded
  // development server can create the newly added cart indexes without a restart.
  if (!globalIndexes.marketplaceCartIndexes) globalIndexes.marketplaceCartIndexes = Promise.all([
    db.collection("mp_cart_items").createIndex({ userId: 1, influencerId: 1 }, { unique: true }),
    db.collection("mp_cart_items").createIndex({ userId: 1, createdAt: -1 }),
  ]).then(() => undefined).catch((error) => { globalIndexes.marketplaceCartIndexes = undefined; throw error; });
  await globalIndexes.marketplaceCartIndexes;
  if (!globalIndexes.marketplaceBookingIndexes) globalIndexes.marketplaceBookingIndexes = Promise.all([
    db.collection("mp_applications").createIndex({ brandId: 1, type: 1, createdAt: -1 }),
    db.collection("mp_campaigns").createIndex({ kind: 1, status: 1 }),
    db.collection("mp_collaborations").createIndex({ influencerId: 1, status: 1 }),
  ]).then(() => undefined).catch((error) => { globalIndexes.marketplaceBookingIndexes = undefined; throw error; });
  await globalIndexes.marketplaceBookingIndexes;
}

export async function brandMembership(db: Db, brandId: ObjectId, userId: string) {
  return db.collection("mp_brand_members").findOne({ brandId, userId, status: "active" });
}
export async function collaborationAccess(db: Db, collaborationId: ObjectId, userId: string) {
  const collaboration = await db.collection("mp_collaborations").findOne({ _id: collaborationId });
  if (!collaboration) return null;
  if (collaboration.influencerId === userId) return { collaboration, role: "influencer" as const, member: null };
  const member = await brandMembership(db, collaboration.brandId, userId);
  return member ? { collaboration, role: "brand" as const, member } : null;
}
export async function notify(db: Db, userId: string, title: string, body: string, href: string) {
  await db.collection("notifications").insertOne({ userId, title, message: body, href, type: "marketplace", createdAt: new Date() });
}

/** Campaign documents created for a direct package booking are private and never listed publicly. */
export const PACKAGE_BOOKING_KIND = "package_booking";

export type CreatorRating = { average: number; count: number };
/**
 * Average brand-to-creator review rating per creator user ID. Reviews reference a
 * collaboration, so ratings are resolved through completed collaborations.
 */
export async function creatorRatingMap(db: Db, creatorUserIds: string[]): Promise<Map<string, CreatorRating>> {
  const ids = [...new Set(creatorUserIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await db.collection("mp_collaborations").aggregate<{ _id: string; average: number; count: number }>([
    { $match: { influencerId: { $in: ids }, status: "completed" } },
    { $lookup: { from: "mp_reviews", let: { collaborationId: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$collaborationId", "$$collaborationId"] }, reviewedRole: "influencer" } }, { $project: { rating: 1 } }], as: "reviews" } },
    { $unwind: "$reviews" },
    { $group: { _id: "$influencerId", average: { $avg: "$reviews.rating" }, count: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.map((row) => [row._id, { average: Math.round(row.average * 10) / 10, count: row.count }]));
}

/** Lowest package price, falling back to the starting rate — the "From ₹X" shown on cards. */
export function startingPricePaise(profile: Document): number | null {
  const prices = Array.isArray(profile.packages) ? profile.packages.map((item: { pricePaise?: unknown }) => item?.pricePaise).filter((value: unknown): value is number => typeof value === "number" && value > 0) : [];
  if (prices.length) return Math.min(...prices);
  return typeof profile.ratePaise === "number" ? profile.ratePaise : null;
}
