import { isMarketplaceAdmin } from "@/lib/marketplace/admin";
import { ObjectId, type Db, type Document } from "mongodb";
import { RESPONSE_WINDOW_HOURS, parseUsageRights, respondByFrom } from "@/lib/marketplace/booking-cart";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readJsonLimited } from "@/lib/security/request";
import { LISTABLE_CREATOR_STATUS, brandMembership, cleanText, creatorRatingMap, ensureMarketplaceIndexes, inrPaise, isActiveCreator, notify, objectId, PACKAGE_BOOKING_KIND, profileTier, startingPricePaise } from "@/lib/marketplace/core";
import { marketplaceCommissionBps } from "@/lib/marketplace/razorpay";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const error = (message: string, status = 400) => json({ error: message }, status);
export const record = (item: Record<string, unknown> | null) => item ? { ...item, _id: String(item._id), brandId: item.brandId ? String(item.brandId) : undefined, campaignId: item.campaignId ? String(item.campaignId) : undefined, collaborationId: item.collaborationId ? String(item.collaborationId) : undefined } : null;
export const records = (items: Record<string, unknown>[]) => items.map((item) => record(item));
export function admin(email?: string | null) {
  return isMarketplaceAdmin(email);
}
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const notBooking = { kind: { $ne: PACKAGE_BOOKING_KIND } };

/** Public creator card fields with rating and "from" price; strips the owner user ID. */
export async function publicCreatorCards(db: Db, profiles: Document[]) {
  const ratings = await creatorRatingMap(db, profiles.map((profile) => String(profile.userId || "")));
  return profiles.map((profile) => {
    const { userId, verificationNotes: _notes, ...rest } = profile;
    void _notes;
    const instagram = rest.instagram && typeof rest.instagram === "object" ? { ...(rest.instagram as Record<string, unknown>) } : {};
    delete instagram.providerUserId;
    return { ...record({ ...rest, instagram }), tier: profileTier(profile), fromPricePaise: startingPricePaise(profile), rating: ratings.get(String(userId)) || null };
  });
}

/**
 * Accepting a package booking records the package price and scope as agreed terms
 * immediately, so the collaboration skips negotiation (as on Collabstr). No payment is taken.
 */
export async function agreePackageBooking(db: Db, collaborationId: ObjectId, campaign: Document, application: Document, acceptedBy: string, now: Date) {
  const amountPaise = Number(campaign.budgetPaise);
  const terms = `${String(campaign.packageSnapshot?.title || campaign.title)}: ${String(campaign.packageSnapshot?.deliverables || "")}. Brief: ${String(campaign.brief)}`.slice(0, 2000);
  const offerId = new ObjectId();
  const agreed = await db.collection("mp_collaborations").findOneAndUpdate({ _id: collaborationId, status: "negotiating" }, { $set: { status: "terms_agreed", amountPaise, terms, agreedAt: now, currentOfferId: offerId, source: PACKAGE_BOOKING_KIND, updatedAt: now } }, { returnDocument: "after" });
  if (!agreed) return;
  await db.collection("mp_offers").insertOne({ _id: offerId, collaborationId, proposerId: String(application.createdBy || campaign.createdBy), amountPaise, terms, currency: "INR", status: "accepted", acceptedBy, acceptedAt: now, source: PACKAGE_BOOKING_KIND, createdAt: now });
  await db.collection("mp_agreements").updateOne({ collaborationId }, { $setOnInsert: { collaborationId, campaignId: agreed.campaignId, brandId: agreed.brandId, influencerId: agreed.influencerId, offerId, proposerId: String(application.createdBy || campaign.createdBy), acceptedBy, amountPaise, currency: "INR", terms, agreedAt: now, status: "terms_recorded", electronicSignature: false } }, { upsert: true });
  const brand = await db.collection("mp_brands").findOne({ _id: agreed.brandId });
  const settings = await db.collection("mp_settings").findOne({ key: "default" });
  const commissionBps = Number.isInteger(settings?.commissionBps) ? Number(settings?.commissionBps) : marketplaceCommissionBps();
  await db.collection("mp_orders").updateOne({ collaborationId }, { $setOnInsert: { _id: new ObjectId(), collaborationId, campaignId: agreed.campaignId, brandId: agreed.brandId, brandOwnerId: brand?.ownerId || "", influencerId: agreed.influencerId, offerId, amountPaise, commissionBps, currency: "INR", paymentStatus: "not_started", checkoutState: "not_created", payoutStatus: "not_eligible", createdAt: now, updatedAt: now } }, { upsert: true });
  await db.collection("mp_audit").insertOne({ entityId: collaborationId, actorId: acceptedBy, action: "package_booking.terms_agreed", amountPaise, createdAt: now });
}


export async function deleteCreatorProfile(request: Request, userId: string) {
  const parsed = await readJsonLimited<{ confirm?: unknown }>(request, 1_024);
  if (!parsed.ok || parsed.value.confirm !== "DELETE") return error("Type DELETE to confirm deleting your creator account.");
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "marketplace-creator-delete", userId, 5, 60 * 60_000);
  if (!limit.allowed) return error("Too many requests. Try again later.", 429);
  const profile = await db.collection("mp_influencers").findOne({ userId }, { projection: { _id: 1 } });
  if (!profile) return error("You do not have a creator account.", 404);
  const collaborations = await db.collection("mp_collaborations").find({ influencerId: userId }, { projection: { _id: 1, status: 1 } }).toArray();
  const open = collaborations.filter((item) => item.status !== "completed");
  if (open.length) return error(`Finish or cancel your ${open.length === 1 ? "open collaboration" : `${open.length} open collaborations`} before deleting your creator account.`, 409);
  const unpaid = collaborations.length ? await db.collection("mp_payout_requests").countDocuments({ collaborationId: { $in: collaborations.map((item) => item._id) }, status: { $ne: "paid" } }) : 0;
  if (unpaid) return error("You have a payout still in progress. Delete your creator account after it is paid.", 409);
  const now = new Date();
  await Promise.all([
    db.collection("mp_influencers").deleteOne({ _id: profile._id, userId }),
    db.collection("mp_social_connections").deleteMany({ userId, provider: "instagram" }),
    db.collection("mp_instagram_insights").deleteMany({ userId }),
    db.collection("mp_oauth_states").deleteMany({ userId }),
    db.collection("mp_verification_requests").deleteMany({ userId }),
    db.collection("mp_cart_items").deleteMany({ influencerId: profile._id }),
    // Pending applications, invitations and bookings can no longer go ahead.
    db.collection("mp_applications").updateMany({ influencerId: userId, status: { $in: ["pending", "invited"] } }, { $set: { status: "withdrawn", withdrawnReason: "creator_account_deleted", updatedAt: now } }),
  ]);
  await db.collection("mp_audit").insertOne({ entityId: userId, actorId: userId, action: "creator.deleted", retainedCollaborations: collaborations.length, createdAt: now });
  return json({ deleted: true });
}

/** Explains what is wrong with one creator package. */
export function packageProblem(value: unknown, number: number) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const label = `Package ${number}`;
  if (!cleanText(item.title, 100, 2)) return `${label}: give the package a name (2 to 100 characters).`;
  if (inrPaise(item.pricePaise) === null) return `${label}: enter a price in rupees.`;
  if (!cleanText(item.deliverables, 500, 2)) return `${label}: describe what's included (at least 2 characters, up to 500).`;
  return `${label}: delivery must be between 1 and 90 days.`;
}

/**
 * Creates one package booking request (one or more packages from the same creator), shared by "Book now" and
 * cart checkout. The creator has RESPONSE_WINDOW_HOURS to accept before the request expires.
 */
export async function createPackageBooking(db: Db, input: { userId: string; brandId: unknown; influencerProfileId: ObjectId; packageIndexes: unknown[]; brief: unknown; deadline: unknown; usageRights: unknown; message: unknown; now: Date }): Promise<{ booking: Document } | { error: string; status: number; creatorName?: string }> {
  const { userId, now } = input;
  const brandId = objectId(input.brandId); if (!brandId) return { error: "Choose the brand making this booking.", status: 400 };
  const member = await brandMembership(db, brandId, userId);
  if (!member || !["owner", "admin", "editor"].includes(member.role)) return { error: "Brand edit access is required to book creators.", status: 403 };
  const brand = await db.collection("mp_brands").findOne({ _id: brandId, status: LISTABLE_CREATOR_STATUS });
  if (!brand) return { error: "This brand profile is paused and cannot book creators.", status: 403 };
  const brief = cleanText(input.brief, 4000, 20); if (!brief) return { error: "Write a brief of at least 20 characters describing your product and what you need.", status: 400 };
  const deadline = typeof input.deadline === "string" ? new Date(input.deadline) : new Date(NaN);
  if (!Number.isFinite(deadline.getTime()) || deadline <= now || deadline.getTime() > now.getTime() + 365 * 86_400_000) return { error: "Choose a delivery date within the next year.", status: 400 };
  const message = input.message == null || input.message === "" ? "" : cleanText(input.message, 1000, 0);
  if (message === null) return { error: "Keep the message under 1,000 characters.", status: 400 };
  const usageRights = parseUsageRights(input.usageRights);
  const influencer = await db.collection("mp_influencers").findOne({ _id: input.influencerProfileId });
  const creatorName = influencer ? String(influencer.displayName || "Creator") : undefined;
  if (!influencer || influencer.userId === userId || !isActiveCreator(influencer)) return { error: `${creatorName || "This creator"} is not available for booking right now.`, status: 409, creatorName };
  const all = Array.isArray(influencer.packages) ? influencer.packages as Document[] : [];
  const indexes = [...new Set(input.packageIndexes)];
  if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || Number(index) < 0 || Number(index) >= all.length)) return { error: "Choose one of the creator's packages.", status: 400, creatorName };
  const packages = indexes.map((index) => { const item = all[Number(index)]; return { index: Number(index), title: String(item?.title || "Package"), deliverables: String(item?.deliverables || ""), pricePaise: inrPaise(item?.pricePaise) ?? 0, deliveryDays: Number.isInteger(item?.deliveryDays) ? Number(item.deliveryDays) : null }; });
  if (packages.some((item) => item.pricePaise < 100)) return { error: "A selected package does not have a bookable price.", status: 409, creatorName };
  const pending = await db.collection("mp_applications").countDocuments({ brandId, influencerId: String(influencer.userId), type: "booking", status: "invited" });
  if (pending) return { error: `You already have a pending request with ${creatorName}. Wait for a response or withdraw it first.`, status: 409, creatorName };
  const amountPaise = packages.reduce((sum, item) => sum + item.pricePaise, 0);
  const title = packages.map((item) => item.title).join(" + ");
  const campaignId = new ObjectId();
  await db.collection("mp_campaigns").insertOne({ _id: campaignId, kind: PACKAGE_BOOKING_KIND, brandId, influencerProfileId: input.influencerProfileId, title: `${title} · ${creatorName}`.slice(0, 200), brief, deliverables: packages.map((item) => (item.deliverables || item.title).slice(0, 60)), targetAudience: "Package booking", budgetPaise: amountPaise, deadline, usageRights, status: "open", currency: "INR", packageSnapshot: packages[0], packages, createdBy: userId, createdAt: now, updatedAt: now });
  const booking = { _id: new ObjectId(), campaignId, brandId, influencerId: String(influencer.userId), type: "booking", status: "invited", pitch: brief, ...(message ? { message } : {}), usageRights, packageTitle: title, packages, amountPaise, respondBy: respondByFrom(now), createdBy: userId, createdAt: now, updatedAt: now };
  await db.collection("mp_applications").insertOne(booking);
  await db.collection("mp_audit").insertOne({ entityId: campaignId, actorId: userId, action: "package_booking.requested", influencerProfileId: input.influencerProfileId, amountPaise, packages: packages.length, createdAt: now });
  await notify(db, String(influencer.userId), "New booking request", `${String(brand.name)} requested “${title}”. Respond within ${RESPONSE_WINDOW_HOURS} hours.`, "/influencer-marketing/inbox");
  return { booking };
}

/** Brand's 1-5 scores for a creator; null unless all three are whole numbers from 1 to 5. */
export function parseReviewScores(body: Record<string, unknown>) {
  const score = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
  const communication = score(body.communication), timeliness = score(body.timeliness), satisfaction = score(body.satisfaction);
  return communication && timeliness && satisfaction ? { communication, timeliness, satisfaction } : null;
}

/** Average communication, timeliness and satisfaction over the reviews that have them (older reviews may not). */
export function reviewScoreAverages(reviews: Document[]) {
  const scored = reviews.map((review) => review.scores as Record<string, number> | undefined).filter((scores): scores is Record<string, number> => Boolean(scores));
  if (!scored.length) return {};
  const average = (key: string) => Math.round(scored.reduce((sum, scores) => sum + Number(scores[key] || 0), 0) / scored.length * 10) / 10;
  const parts = { communication: average("communication"), timeliness: average("timeliness"), satisfaction: average("satisfaction") };
  // When every review has the three scores, the overall rating is their precise average (e.g. 4.7 rather than 5).
  const precise = scored.length === reviews.length ? { average: Math.round((parts.communication + parts.timeliness + parts.satisfaction) / 3 * 10) / 10 } : {};
  return { ...parts, ...precise };
}
