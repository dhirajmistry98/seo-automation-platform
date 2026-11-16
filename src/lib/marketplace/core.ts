import { ObjectId, type Db, type Document } from "mongodb";
import { influencerTier } from "./tiers.ts";
import { instagramHandleMatches } from "./instagram-handle.ts";
import { RESPONSE_WINDOW_HOURS } from "./booking-cart.ts";

export const BRAND_CATEGORIES = ["startup", "small_business", "local_business", "ecommerce", "established_company", "marketing_agency", "enterprise"] as const;
export type BrandCategory = typeof BRAND_CATEGORIES[number];
export const PROFILE_STATUSES = ["draft", "pending", "approved", "rejected", "suspended"] as const;
export const CAMPAIGN_STATUSES = ["draft", "open", "closed", "cancelled"] as const;
/**
 * Creators verify themselves through Meta; there is no manual approval step. Only a profile an admin has
 * rejected or suspended (moderation) is kept out of listings.
 */
export const BLOCKED_CREATOR_STATUSES = ["rejected", "suspended"];
/** MongoDB status condition for creator listings (pair it with the Meta verification fields). */
export const LISTABLE_CREATOR_STATUS = { $nin: BLOCKED_CREATOR_STATUSES };
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
/**
 * The Instagram account verified through Meta is the one the creator claimed on their profile.
 * Profiles verified before the username field existed have no claim and match on the verified name.
 */
export function hasVerifiedInstagramUsername(profile: Document) {
  const verified = (profile.instagram as { username?: unknown } | undefined)?.username;
  if (typeof verified !== "string" || !verified) return false;
  return profile.instagramHandle == null || instagramHandleMatches(profile.instagramHandle, verified);
}
/**
 * A creator is listed, bookable and can apply to campaigns when approved and their Instagram username is
 * currently verified through Meta. There is no minimum follower count.
 */
export function isActiveCreator(profile: Document) {
  return !BLOCKED_CREATOR_STATUSES.includes(String(profile.status)) && isCurrentMetaVerification(profile) && hasVerifiedInstagramUsername(profile);
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

/** Status after a successful Meta verification: listed straight away, unless an admin rejected or suspended the profile. */
export function statusAfterVerification(current: unknown) {
  return current === "rejected" || current === "suspended" ? current : "approved";
}

/** Declines bookings and invitations nobody answered within RESPONSE_WINDOW_HOURS, and tells both sides. */
export async function expireOverdueRequests(db: Db, now = new Date()) {
  const overdue = await db.collection("mp_applications").find({ status: "invited", respondBy: { $lte: now } }).limit(200).toArray();
  for (const request of overdue) {
    const updated = await db.collection("mp_applications").updateOne({ _id: request._id, status: "invited" }, { $set: { status: "declined", declineReason: "no_response", decidedAt: now, updatedAt: now } });
    if (!updated.modifiedCount) continue;
    const what = request.type === "booking" ? `booking “${String(request.packageTitle || "package")}”` : "campaign invitation";
    await notify(db, String(request.createdBy), "Request expired", `The creator did not respond to your ${what} within ${RESPONSE_WINDOW_HOURS} hours. You can book another creator.`, "/influencer-marketing/inbox");
    await notify(db, String(request.influencerId), "Request expired", `A ${what} expired because it was not answered within ${RESPONSE_WINDOW_HOURS} hours.`, "/influencer-marketing/inbox");
  }
  return overdue.length;
}
