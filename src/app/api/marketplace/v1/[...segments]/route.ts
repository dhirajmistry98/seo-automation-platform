import { ObjectId, type Db, type Document } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { BRAND_CATEGORIES, brandMembership, cleanList, cleanText, collaborationAccess, creatorRatingMap, ensureMarketplaceIndexes, inrPaise, isActiveCreator, isPublicEmergingCreator, isPublicInfluencer, notify, objectId, PACKAGE_BOOKING_KIND, profileTier, safeUrl, startingPricePaise } from "@/lib/marketplace/core";
import { queueMarketplaceEvent, realtimeAvailable } from "@/lib/marketplace/realtime";
import { getRazorpayConfig, marketplaceCommissionBps, razorpayRequest, RazorpayApiError, verifyRazorpayHmac } from "@/lib/marketplace/razorpay";
import { recordCapturedCampaignPayment, type CampaignCapturedPayment } from "@/lib/marketplace/campaign-payments";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ segments: string[] }> };
type Body = Record<string, unknown>;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status = 400) => json({ error: message }, status);
const record = (item: Record<string, unknown> | null) => item ? { ...item, _id: String(item._id), brandId: item.brandId ? String(item.brandId) : undefined, campaignId: item.campaignId ? String(item.campaignId) : undefined, collaborationId: item.collaborationId ? String(item.collaborationId) : undefined } : null;
const records = (items: Record<string, unknown>[]) => items.map((item) => record(item));
function admin(email?: string | null) {
  return !!email && (process.env.MARKETPLACE_ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const notBooking = { kind: { $ne: PACKAGE_BOOKING_KIND } };

/** Public creator card fields with rating and "from" price; strips the owner user ID. */
async function publicCreatorCards(db: Db, profiles: Document[]) {
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
async function agreePackageBooking(db: Db, collaborationId: ObjectId, campaign: Document, application: Document, acceptedBy: string, now: Date) {
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

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const userId = session.user.id;
  const path = (await context.params).segments;
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  if (path[0] === "me" && path.length === 1) {
    const [influencer, ownedBrands, memberships, applications] = await Promise.all([
      db.collection("mp_influencers").findOne({ userId }),
      db.collection("mp_brands").find({ ownerId: userId }).limit(20).toArray(),
      db.collection("mp_brand_members").find({ userId, status: "active" }).toArray(),
      db.collection("mp_applications").find({ influencerId: userId }).sort({ createdAt: -1 }).limit(30).toArray(),
    ]);
    const memberBrandIds = memberships.map((member) => member.brandId).filter((id): id is ObjectId => id instanceof ObjectId);
    const memberBrands = memberBrandIds.length ? await db.collection("mp_brands").find({ _id: { $in: memberBrandIds } }).limit(50).toArray() : [];
    const brands = [...new Map([...ownedBrands, ...memberBrands].map((brand) => [String(brand._id), brand])).values()];
    const brandIds = brands.map((brand) => brand._id);
    const [collaborations, sentBookings] = await Promise.all([
      db.collection("mp_collaborations").find({ $or: [{ influencerId: userId }, { brandId: { $in: brandIds } }] }).sort({ updatedAt: -1 }).limit(30).toArray(),
      brandIds.length ? db.collection("mp_applications").find({ brandId: { $in: brandIds }, type: "booking" }).sort({ createdAt: -1 }).limit(30).toArray() : Promise.resolve([]),
    ]);
    // Resolve human-readable names so the inbox never shows raw IDs.
    const linked = [...applications, ...collaborations, ...sentBookings];
    const campaignIds = [...new Map(linked.map((item) => [String(item.campaignId), item.campaignId])).values()].filter((id): id is ObjectId => id instanceof ObjectId);
    const linkedBrandIds = [...new Map(linked.map((item) => [String(item.brandId), item.brandId])).values()].filter((id): id is ObjectId => id instanceof ObjectId);
    const creatorUserIds = [...new Set(linked.map((item) => item.influencerId).filter((id): id is string => typeof id === "string"))];
    const [linkedCampaigns, linkedBrands, linkedCreators] = await Promise.all([
      campaignIds.length ? db.collection("mp_campaigns").find({ _id: { $in: campaignIds } }, { projection: { title: 1, kind: 1, deadline: 1, budgetPaise: 1 } }).toArray() : Promise.resolve([]),
      linkedBrandIds.length ? db.collection("mp_brands").find({ _id: { $in: linkedBrandIds } }, { projection: { name: 1 } }).toArray() : Promise.resolve([]),
      creatorUserIds.length ? db.collection("mp_influencers").find({ userId: { $in: creatorUserIds } }, { projection: { userId: 1, displayName: 1 } }).toArray() : Promise.resolve([]),
    ]);
    const campaignById = new Map(linkedCampaigns.map((item) => [String(item._id), item]));
    const brandNameById = new Map(linkedBrands.map((item) => [String(item._id), String(item.name || "")]));
    const creatorById = new Map(linkedCreators.map((item) => [String(item.userId), { name: String(item.displayName || ""), profileId: String(item._id) }]));
    const describe = (item: Document) => {
      const campaign = campaignById.get(String(item.campaignId));
      const creator = creatorById.get(String(item.influencerId));
      return { ...record(item), influencerId: item.influencerId, campaignTitle: campaign?.title || "", isBooking: campaign?.kind === PACKAGE_BOOKING_KIND, campaignDeadline: campaign?.deadline || null, brandName: brandNameById.get(String(item.brandId)) || "", creatorName: creator?.name || "", creatorProfileId: creator?.profileId || "" };
    };
    return json({ userId, influencer: influencer ? { ...record(influencer), tier: profileTier(influencer) } : null, brands: records(brands), memberships: records(memberships), applications: applications.map(describe), collaborations: collaborations.map(describe), sentBookings: sentBookings.map(describe), admin: admin(session.user.email), realtimeAvailable: realtimeAvailable(), instagramConnectAvailable: !!(process.env.META_INSTAGRAM_APP_ID && process.env.META_INSTAGRAM_APP_SECRET && process.env.META_GRAPH_API_VERSION && process.env.META_TOKEN_ENCRYPTION_KEY), marketplacePaymentCheckoutAvailable: marketplacePaymentsEnabled() });
  }
  if (path[0] === "influencers" && path.length === 1) {
    const params = new URL(request.url).searchParams;
    const category = cleanText(params.get("category"), 60);
    const location = cleanText(params.get("location"), 80);
    const query = cleanText(params.get("q"), 80);
    const sortBy = params.get("sort");
    const minFollowers = params.get("minFollowers") ? Number(params.get("minFollowers")) : null;
    const maxFollowers = params.get("maxFollowers") ? Number(params.get("maxFollowers")) : null;
    const limitParam = Number.parseInt(params.get("limit") || "24", 10);
    const pageSize = Number.isFinite(limitParam) ? Math.min(24, Math.max(1, limitParam)) : 24;
    const minRateRupees = params.get("minRate") ? Number(params.get("minRate")) : null;
    const maxRateRupees = params.get("maxRate") ? Number(params.get("maxRate")) : null;
    const skip = Math.min(10_000, Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0));
    const track = params.get("track") === "emerging" ? "emerging" : "standard";
    const filter: Record<string, unknown> = { userId: { $ne: userId }, status: "approved", "instagram.source": "meta_api", "instagram.verifiedAt": { $gte: new Date(Date.now() - 7 * 86_400_000) } };
    if (track === "emerging") filter.creatorTrack = "emerging";
    else filter.$and = [{ $or: [{ creatorTrack: "standard" }, { creatorTrack: { $exists: false } }] }];
    const followerRange: Record<string, number> = track === "emerging" ? { $gte: 0, $lt: 5_000 } : { $gte: 5_000 };
    if (minFollowers !== null && Number.isSafeInteger(minFollowers) && minFollowers >= 0) followerRange.$gte = Math.max(followerRange.$gte, minFollowers);
    if (maxFollowers !== null && Number.isSafeInteger(maxFollowers) && maxFollowers > 0) followerRange.$lt = Math.min(followerRange.$lt ?? Number.MAX_SAFE_INTEGER, maxFollowers);
    filter["instagram.verifiedFollowers"] = followerRange;
    if (category) filter.categories = { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    if (location) filter.location = { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (minRateRupees !== null && Number.isFinite(minRateRupees) && minRateRupees >= 0 && minRateRupees <= 10_000_000) filter.ratePaise = { ...((filter.ratePaise as Record<string, unknown> | undefined) || {}), $gte: Math.round(minRateRupees * 100) };
    if (maxRateRupees !== null && Number.isFinite(maxRateRupees) && maxRateRupees >= 0 && maxRateRupees <= 10_000_000) filter.ratePaise = { ...((filter.ratePaise as Record<string, unknown> | undefined) || {}), $lte: Math.round(maxRateRupees * 100) };
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ displayName: { $regex: escaped, $options: "i" } }, { bio: { $regex: escaped, $options: "i" } }, { location: { $regex: escaped, $options: "i" } }, { categories: { $regex: escaped, $options: "i" } }];
    }
    const total = await db.collection("mp_influencers").countDocuments(filter);
    const sort: Record<string, 1 | -1> = sortBy === "rate_asc" ? { ratePaise: 1, _id: 1 } : sortBy === "rate_desc" ? { ratePaise: -1, _id: 1 } : sortBy === "followers_asc" ? { "instagram.verifiedFollowers": 1, _id: 1 } : { "instagram.verifiedFollowers": -1, _id: 1 };
    const items = await db.collection("mp_influencers").find(filter, { projection: { verificationNotes: 0, "instagram.providerUserId": 0 } }).sort(sort).skip(skip).limit(pageSize).toArray();
    const influencers = await publicCreatorCards(db, items.filter(track === "emerging" ? isPublicEmergingCreator : isPublicInfluencer));
    return json({ influencers, total, hasMore: skip + items.length < total, nextSkip: skip + items.length });
  }
  if (path[0] === "influencers" && path[1] && path.length === 2) {
    const id = objectId(path[1]);
    if (!id) return error("Invalid creator profile ID.");
    const profile = await db.collection("mp_influencers").findOne({ _id: id });
    if (!profile) return error("Creator profile not found.", 404);
    const owner = profile.userId === userId;
    if (!owner && !isPublicInfluencer(profile) && !isPublicEmergingCreator(profile)) return error("Creator profile not found.", 404);
    const instagram = profile.instagram && typeof profile.instagram === "object" ? profile.instagram as Record<string, unknown> : {};
    const creatorUserId = String(profile.userId);
    const completed = await db.collection("mp_collaborations").find({ influencerId: creatorUserId, status: "completed" }, { projection: { _id: 1, brandId: 1 } }).limit(200).toArray();
    const reviewDocs = completed.length ? await db.collection("mp_reviews").find({ collaborationId: { $in: completed.map((item) => item._id) }, reviewedRole: "influencer" }).sort({ createdAt: -1 }).limit(50).toArray() : [];
    const brandIdByCollaboration = new Map(completed.map((item) => [String(item._id), item.brandId]));
    const reviewBrandIds = [...new Map(reviewDocs.map((review) => { const brandId = brandIdByCollaboration.get(String(review.collaborationId)); return [String(brandId), brandId]; })).values()].filter((value): value is ObjectId => value instanceof ObjectId);
    const reviewBrands = reviewBrandIds.length ? await db.collection("mp_brands").find({ _id: { $in: reviewBrandIds } }, { projection: { name: 1 } }).toArray() : [];
    const reviewBrandName = new Map(reviewBrands.map((brand) => [String(brand._id), String(brand.name || "")]));
    const reviews = reviewDocs.map((review) => ({ _id: String(review._id), rating: review.rating, comment: review.comment, createdAt: review.createdAt, brandName: reviewBrandName.get(String(brandIdByCollaboration.get(String(review.collaborationId)))) || "Verified brand" }));
    const rating = reviews.length ? { average: Math.round(reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length * 10) / 10, count: reviews.length } : null;
    // Similar creators: same niche, currently public, excluding this creator and the viewer.
    const categories = Array.isArray(profile.categories) ? profile.categories.filter((value: unknown): value is string => typeof value === "string").slice(0, 5) : [];
    const similarFilter: Record<string, unknown> = { _id: { $ne: profile._id }, userId: { $ne: userId }, status: "approved", "instagram.source": "meta_api", "instagram.verifiedAt": { $gte: new Date(Date.now() - 7 * 86_400_000) }, creatorTrack: profile.creatorTrack === "emerging" ? "emerging" : { $ne: "emerging" } };
    if (categories.length) similarFilter.categories = { $in: categories.map((category: string) => new RegExp(`^${escapeRegex(category)}$`, "i")) };
    const similarDocs = await db.collection("mp_influencers").find(similarFilter, { projection: { verificationNotes: 0, "instagram.providerUserId": 0 } }).sort({ "instagram.verifiedFollowers": -1 }).limit(8).toArray();
    const similar = (await publicCreatorCards(db, similarDocs.filter(isActiveCreator))).slice(0, 4);
    return json({ influencer: {
      _id: String(profile._id), displayName: profile.displayName, bio: profile.bio, categories: profile.categories,
      location: profile.location, ratePaise: profile.ratePaise, currency: profile.currency, portfolio: profile.portfolio,
      packages: profile.packages, status: profile.status, createdAt: profile.createdAt, owner, tier: profileTier(profile),
      creatorTrack: profile.creatorTrack === "emerging" ? "emerging" : "standard", bookable: !owner && isActiveCreator(profile),
      fromPricePaise: startingPricePaise(profile), rating, completedCollaborations: completed.length,
      instagram: { username: instagram.username, accountType: instagram.accountType, verifiedFollowers: instagram.verifiedFollowers, mediaCount: instagram.mediaCount, profilePictureUrl: instagram.profilePictureUrl, recentMedia: instagram.recentMedia, mediaFetchedAt: instagram.mediaFetchedAt, verifiedAt: instagram.verifiedAt, source: instagram.source },
    }, reviews, similar });
  }
  if (path[0] === "cart" && path.length === 1) {
    const cartItems = await db.collection("mp_cart_items").find({ userId }).sort({ createdAt: -1 }).limit(30).toArray();
    const creatorIds = cartItems.map((item) => item.influencerId).filter((id): id is ObjectId => id instanceof ObjectId);
    const profiles = creatorIds.length ? await db.collection("mp_influencers").find({ _id: { $in: creatorIds }, status: "approved" }, { projection: { userId: 0, verificationNotes: 0, "instagram.providerUserId": 0 } }).toArray() : [];
    const profilesById = new Map(profiles.filter(isActiveCreator).map((profile) => [String(profile._id), { ...record(profile), tier: profileTier(profile) }]));
    const items = cartItems.flatMap((item) => {
      const influencer = item.influencerId instanceof ObjectId ? profilesById.get(String(item.influencerId)) : null;
      return influencer ? [{ id: String(item._id), addedAt: item.createdAt, creatorId: String(influencer._id), influencer }] : [];
    });
    return json({ items, total: items.length });
  }
  if (path[0] === "brands" && path.length === 1) {
    const params = new URL(request.url).searchParams;
    const query = cleanText(params.get("q"), 80);
    const skip = Math.min(10_000, Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0));
    const filter: Record<string, unknown> = { status: "approved" };
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }, { category: { $regex: escaped, $options: "i" } }, { location: { $regex: escaped, $options: "i" } }, { offerings: { $regex: escaped, $options: "i" } }];
    }
    const total = await db.collection("mp_brands").countDocuments(filter);
    const items = await db.collection("mp_brands").find(filter, { projection: { ownerId: 0 } }).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(24).toArray();
    return json({ brands: records(items), total, hasMore: skip + items.length < total, nextSkip: skip + items.length });
  }
  if (path[0] === "campaigns" && path.length === 1) {
    const mine = new URL(request.url).searchParams.get("mine") === "1";
    const memberIds = mine ? (await db.collection("mp_brand_members").find({ userId, status: "active" }, { projection: { brandId: 1 } }).toArray()).map((member) => member.brandId) : [];
    const filter = mine ? { brandId: { $in: memberIds }, ...notBooking } : { status: "open", deadline: { $gt: new Date() }, ...notBooking };
    const items = await db.collection("mp_campaigns").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    const brandIds = [...new Map(items.map((item) => [String(item.brandId), item.brandId])).values()];
    const brandItems = brandIds.length ? await db.collection("mp_brands").find({ _id: { $in: brandIds }, ...(mine ? {} : { status: "approved" }) }, { projection: { ownerId: 0 } }).toArray() : [];
    const brandById = new Map(brandItems.map((item) => [String(item._id), item]));
    const campaigns = items.map((item) => ({ ...record(item), brand: brandById.has(String(item.brandId)) ? record(brandById.get(String(item.brandId))!) : null }));
    return json({ campaigns });
  }
  if (path[0] === "campaigns" && path[1] && path.length === 2) {
    const id = objectId(path[1]); if (!id) return error("Invalid campaign ID.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: id });
    if (!campaign) return error("Campaign not found.", 404);
    const member = await brandMembership(db, campaign.brandId, userId);
    const brand = await db.collection("mp_brands").findOne({ _id: campaign.brandId });
    if ((!brand || brand.status !== "approved" || campaign.status !== "open" || campaign.kind === PACKAGE_BOOKING_KIND) && !member) return error("Campaign not found.", 404);
    const applications = member ? await db.collection("mp_applications").find({ campaignId: id }).sort({ createdAt: -1 }).limit(100).toArray() : [];
    const applicantIds = [...new Set(applications.map((application) => application.influencerId).filter((value): value is string => typeof value === "string"))];
    const applicantProfiles = applicantIds.length ? await db.collection("mp_influencers").find({ userId: { $in: applicantIds } }, { projection: { userId: 1, displayName: 1, bio: 1, location: 1, ratePaise: 1, categories: 1, instagramUsername: 1, instagram: 1, status: 1 } }).toArray() : [];
    const applicantById = new Map(applicantProfiles.map((profile) => {
      const instagram = profile.instagram && typeof profile.instagram === "object" ? profile.instagram as Record<string, unknown> : {};
      return [String(profile.userId), {
        profileId: String(profile._id), displayName: profile.displayName, bio: profile.bio, location: profile.location,
        ratePaise: profile.ratePaise, categories: profile.categories, instagramUsername: profile.instagramUsername,
        instagram: { verifiedFollowers: instagram.verifiedFollowers, verifiedAt: instagram.verifiedAt, source: instagram.source },
        status: profile.status, tier: profileTier(profile),
      }] as const;
    }));
    const activity = member ? {
      applications: await db.collection("mp_applications").countDocuments({ campaignId: id, type: "application" }),
      invitations: await db.collection("mp_applications").countDocuments({ campaignId: id, type: "invitation" }),
      accepted: await db.collection("mp_applications").countDocuments({ campaignId: id, status: "accepted" }),
      completed: await db.collection("mp_collaborations").countDocuments({ campaignId: id, status: "completed" }),
    } : null;
    const publicBrand = brand ? { name: brand.name, category: brand.category, location: brand.location, website: brand.website } : null;
    const applicationsWithProfiles = applications.map((application) => ({
      _id: String(application._id), campaignId: String(application.campaignId), type: application.type,
      status: application.status, pitch: application.pitch, createdAt: application.createdAt,
      influencer: applicantById.get(String(application.influencerId)) || null,
    }));
    return json({ campaign: { ...record(campaign), brand: publicBrand }, applications: applicationsWithProfiles, activity });
  }
  if (path[0] === "collaborations" && path[1] && path.length >= 2) {
    const id = objectId(path[1]); if (!id) return error("Invalid collaboration ID.");
    const access = await collaborationAccess(db, id, userId);
    if (!access) return error("Collaboration not found.", 404);
    if (path[2] === "messages") {
      const items = await db.collection("mp_messages").find({ collaborationId: id }).sort({ createdAt: -1 }).limit(100).toArray();
      return json({ messages: records(items.reverse()) });
    }
    const [offers, deliverables, reviews, agreement, order] = await Promise.all([
      db.collection("mp_offers").find({ collaborationId: id }).sort({ createdAt: -1 }).limit(50).toArray(),
      db.collection("mp_deliverables").find({ collaborationId: id }).sort({ createdAt: -1 }).limit(50).toArray(),
      db.collection("mp_reviews").find({ collaborationId: id }).limit(2).toArray(),
      db.collection("mp_agreements").findOne({ collaborationId: id }),
      db.collection("mp_orders").findOne({ collaborationId: id }, { projection: { _id: 1, amountPaise: 1, currency: 1, commissionBps: 1, paymentStatus: 1, checkoutState: 1, payoutStatus: 1, paidAt: 1, completedAt: 1 } }),
    ]);
    return json({ collaboration: record(access.collaboration), offers: records(offers), deliverables: records(deliverables), reviews: records(reviews), agreement: record(agreement), order: record(order) });
  }
  if (path[0] === "admin" && path.length === 1) {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const [influencers, brands, verificationRequests, campaigns, disputes, messageReports, settings, orders, refunds, payouts, anomalies, providerDisputes] = await Promise.all([
      db.collection("mp_influencers").find({ status: { $in: ["pending", "approved", "suspended"] } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("mp_brands").find({ status: { $in: ["pending", "approved", "suspended"] } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("mp_verification_requests").find({ status: "pending" }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("mp_campaigns").find({}).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("mp_disputes").find({ status: "open" }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("mp_message_reports").find({ status: "pending" }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("mp_settings").findOne({ key: "default" }),
      db.collection("mp_orders").find({}, { projection: { razorpayOrderId: 0, razorpayPaymentId: 0 } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("mp_refunds").find({}, { projection: { paymentId: 0, providerRefundId: 0, requestKey: 0 } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("mp_payout_requests").find({}, { projection: { beneficiary: 0 } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("mp_payment_anomalies").find({}, { projection: { expectedPaymentId: 0, observedPaymentId: 0 } }).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("mp_provider_disputes").find({}).sort({ updatedAt: -1 }).limit(100).toArray(),
    ]);
    const reportedMessageIds = messageReports.map((report) => report.messageId).filter((value): value is ObjectId => value instanceof ObjectId);
    const reportedMessages = reportedMessageIds.length ? await db.collection("mp_messages").find({ _id: { $in: reportedMessageIds } }, { projection: { text: 1, senderId: 1, collaborationId: 1, createdAt: 1 } }).toArray() : [];
    const messageById = new Map(reportedMessages.map((message) => [String(message._id), record(message)]));
    return json({ influencers: records(influencers), brands: records(brands), verificationRequests: records(verificationRequests), campaigns: records(campaigns), disputes: records(disputes), messageReports: messageReports.map((report) => ({ ...record(report), reportedMessage: messageById.get(String(report.messageId)) || null })), orders: records(orders), refunds: records(refunds), payouts: records(payouts), anomalies: records(anomalies), providerDisputes: records(providerDisputes), settings: record(settings) });
  }
  return error("Marketplace endpoint not found.", 404);
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

  if (path[0] === "cart" && path.length === 1) {
    const influencerId = objectId(body.influencerId);
    if (!influencerId) return error("Choose a valid creator profile.");
    const influencer = await db.collection("mp_influencers").findOne({ _id: influencerId, userId: { $ne: userId } });
    if (!influencer || !isActiveCreator(influencer)) return error("This creator is no longer available for booking.", 409);
    const existing = await db.collection("mp_cart_items").findOne({ userId, influencerId }, { projection: { _id: 1 } });
    if (!existing && await db.collection("mp_cart_items").countDocuments({ userId }) >= 30) return error("Your creator cart is full. Remove a saved creator before adding another.", 409);
    const result = await db.collection("mp_cart_items").updateOne({ userId, influencerId }, { $setOnInsert: { userId, influencerId, createdAt: now } }, { upsert: true });
    if (result.upsertedCount) await db.collection("mp_audit").insertOne({ entityId: userId, actorId: userId, action: "creator_cart.added", influencerId, createdAt: now });
    return json({ added: true, alreadyAdded: !result.upsertedCount }, 201);
  }

  if (path[0] === "influencers" && path[1] && path[2] === "bookings" && path.length === 3) {
    // Direct package booking: the brand picks a creator package and sends a brief.
    const influencerProfileId = objectId(path[1]); if (!influencerProfileId) return error("Invalid creator profile ID.");
    const brandId = objectId(body.brandId); if (!brandId) return error("Choose the brand making this booking.");
    const member = await brandMembership(db, brandId, userId);
    if (!member || !["owner", "admin", "editor"].includes(member.role)) return error("Brand edit access is required to book creators.", 403);
    const brand = await db.collection("mp_brands").findOne({ _id: brandId, status: "approved" });
    if (!brand) return error("Your brand must be approved before it can book creators.", 409);
    const influencer = await db.collection("mp_influencers").findOne({ _id: influencerProfileId });
    if (!influencer || influencer.userId === userId || !isActiveCreator(influencer)) return error("This creator is not available for booking.", 409);
    const packages = Array.isArray(influencer.packages) ? influencer.packages as Document[] : [];
    const packageIndex = body.packageIndex;
    if (!Number.isInteger(packageIndex) || Number(packageIndex) < 0 || Number(packageIndex) >= packages.length) return error("Choose one of the creator's packages.");
    const selected = packages[Number(packageIndex)];
    const pricePaise = inrPaise(selected?.pricePaise);
    if (!selected || pricePaise === null || pricePaise < 100) return error("This package does not have a bookable price.", 409);
    const brief = cleanText(body.brief, 4000, 20); if (!brief) return error("Write a brief of at least 20 characters describing your product and what you need.");
    const deadline = typeof body.deadline === "string" ? new Date(body.deadline) : new Date(NaN);
    if (!Number.isFinite(deadline.getTime()) || deadline <= now || deadline.getTime() > now.getTime() + 365 * 86_400_000) return error("Choose a delivery date within the next year.");
    const pending = await db.collection("mp_applications").countDocuments({ brandId, influencerId: String(influencer.userId), type: "booking", status: "invited" });
    if (pending) return error("You already have a pending booking with this creator. Wait for a response or withdraw it first.", 409);
    const campaignId = new ObjectId();
    const packageSnapshot = { index: Number(packageIndex), title: String(selected.title || "Package"), deliverables: String(selected.deliverables || ""), pricePaise, deliveryDays: Number.isInteger(selected.deliveryDays) ? selected.deliveryDays : null };
    await db.collection("mp_campaigns").insertOne({ _id: campaignId, kind: PACKAGE_BOOKING_KIND, brandId, influencerProfileId, title: `${packageSnapshot.title} · ${String(influencer.displayName)}`, brief, deliverables: [packageSnapshot.deliverables.slice(0, 60) || packageSnapshot.title], targetAudience: "Direct package booking", budgetPaise: pricePaise, deadline, packageSnapshot, status: "open", currency: "INR", createdBy: userId, createdAt: now, updatedAt: now });
    const booking = { _id: new ObjectId(), campaignId, brandId, influencerId: String(influencer.userId), type: "booking", status: "invited", pitch: brief, packageTitle: packageSnapshot.title, amountPaise: pricePaise, createdBy: userId, createdAt: now, updatedAt: now };
    await db.collection("mp_applications").insertOne(booking);
    await db.collection("mp_audit").insertOne({ entityId: campaignId, actorId: userId, action: "package_booking.requested", influencerProfileId, amountPaise: pricePaise, createdAt: now });
    await notify(db, String(influencer.userId), "New package booking", `${String(brand.name)} requested “${packageSnapshot.title}”.`, "/influencer-marketing/inbox");
    return json({ booking: record(booking) }, 201);
  }

  if (path[0] === "applications" && path[1] && path[2] === "withdraw") {
    const id = objectId(path[1]); if (!id) return error("Invalid request ID.");
    const application = await db.collection("mp_applications").findOne({ _id: id, status: { $in: ["pending", "invited"] } });
    if (!application) return error("This request is no longer pending.", 409);
    const member = await brandMembership(db, application.brandId, userId);
    const brandSide = !!member && ["owner", "admin", "editor"].includes(member.role);
    // Brands withdraw invitations/bookings they sent; creators withdraw their own applications.
    const allowed = application.type === "application" ? application.influencerId === userId : brandSide;
    if (!allowed) return error("Only the sender can withdraw this request.", 403);
    const updated = await db.collection("mp_applications").updateOne({ _id: id, status: application.status }, { $set: { status: "withdrawn", decidedBy: userId, updatedAt: now } });
    if (!updated.modifiedCount) return error("Request changed; refresh and try again.", 409);
    if (application.type === "booking") await db.collection("mp_campaigns").updateOne({ _id: application.campaignId, kind: PACKAGE_BOOKING_KIND }, { $set: { status: "cancelled", closedReason: "withdrawn", updatedAt: now } });
    const recipient = application.type === "application" ? String((await db.collection("mp_campaigns").findOne({ _id: application.campaignId }))?.createdBy || "") : String(application.influencerId || "");
    if (recipient) await notify(db, recipient, "Request withdrawn", "A pending marketplace request was withdrawn.", "/influencer-marketing/inbox");
    return json({ status: "withdrawn" });
  }

  if (path[0] === "collaborations" && path[1] && ["checkout", "verify"].includes(path[2] || "")) {
    const id = objectId(path[1]); if (!id) return error("Invalid collaboration ID.");
    const access = await collaborationAccess(db, id, userId);
    if (!access) return error("Collaboration access required.", 403);
    if (access.role !== "brand" || !["owner", "admin"].includes(String(access.member?.role))) return error("Only a brand owner or administrator can fund this collaboration.", 403);
    if (path[2] === "checkout") {
      if (access.collaboration.status !== "terms_agreed") return error("Both parties must agree to the price and terms before payment.", 409);
      const config = getRazorpayConfig();
      if (!config) return error("Campaign checkout is not configured.", 503);
      const order = await db.collection("mp_orders").findOne({ collaborationId: id });
      if (!order || !Number.isSafeInteger(order.amountPaise) || order.amountPaise < 100 || order.currency !== "INR") return error("Agreed campaign payment details are unavailable.", 409);
      if (order.paymentStatus === "captured") return json({ paid: true, paymentStatus: "captured" });
      if (typeof order.razorpayOrderId === "string") {
        const brand = await db.collection("mp_brands").findOne({ _id: access.collaboration.brandId });
        return json({ orderId: order.razorpayOrderId, amount: order.amountPaise, currency: "INR", keyId: config.keyId, brand: brand?.name || "Campaign collaboration", prefill: { email: session.user.email || undefined }, status: order.checkoutState });
      }
      const commissionBps = Number.isInteger(order.commissionBps) ? Number(order.commissionBps) : marketplaceCommissionBps();
      if (commissionBps === null || commissionBps < 0 || commissionBps > 3000) return error("Set a marketplace commission from 0% to 30% before accepting payments.", 503);
      if (order.checkoutState === "reconciliation_required" || order.checkoutState === "creating") return error("This checkout is being reconciled. Do not create a second payment; contact support if it does not update.", 409);
      const claim = await db.collection("mp_orders").updateOne({ _id: order._id, paymentStatus: { $ne: "captured" }, checkoutState: { $in: ["not_created", "provider_rejected"] }, razorpayOrderId: { $exists: false } }, { $set: { checkoutState: "creating", commissionBps, createdBy: userId, updatedAt: now } });
      if (!claim.modifiedCount) return error("Checkout is already being prepared. Refresh before retrying.", 409);
      try {
        const brand = await db.collection("mp_brands").findOne({ _id: access.collaboration.brandId });
        const remote = await razorpayRequest<{ id?: string; amount?: number; currency?: string }>("/orders", "POST", { amount: order.amountPaise, currency: "INR", receipt: `mp_${id.toHexString()}_${String(order._id).slice(-8)}`, notes: { collaboration_id: id.toHexString(), campaign_id: String(access.collaboration.campaignId) } });
        if (typeof remote.id !== "string" || !/^order_[A-Za-z0-9]+$/.test(remote.id) || remote.amount !== order.amountPaise || remote.currency !== "INR") throw new Error("Provider order could not be matched to the accepted INR amount.");
        await db.collection("mp_orders").updateOne({ _id: order._id, checkoutState: "creating" }, { $set: { razorpayOrderId: remote.id, checkoutState: "ready", updatedAt: new Date() } });
        await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: "campaign_payment.checkout_created", orderId: order._id, createdAt: new Date() });
        return json({ orderId: remote.id, amount: order.amountPaise, currency: "INR", keyId: config.keyId, brand: brand?.name || "Campaign collaboration", prefill: { email: session.user.email || undefined }, status: "ready" }, 201);
      } catch (caught) {
        await db.collection("mp_orders").updateOne({ _id: order._id, checkoutState: "creating" }, { $set: { checkoutState: "reconciliation_required", checkoutErrorAt: new Date(), updatedAt: new Date() } });
        return error(caught instanceof Error ? caught.message : "Payment order could not be confirmed. Do not retry with a new checkout.", 502);
      }
    }
    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;
    if (typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId) || typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || typeof signature !== "string") return error("Invalid payment confirmation.");
    const config = getRazorpayConfig();
    if (!config || !verifyRazorpayHmac(`${orderId}|${paymentId}`, signature, config.keySecret)) return error("Payment signature verification failed.", 400);
    const limit = await consumeRateLimit(db, "campaign-payment-verify", userId, 20, 60_000);
    if (!limit.allowed) return error("Too many payment verification attempts.", 429);
    const order = await db.collection("mp_orders").findOne({ collaborationId: id, razorpayOrderId: orderId });
    if (!order) return error("Payment does not match this collaboration.", 404);
    if (order.paymentStatus === "captured") return json({ paid: true, paymentStatus: "captured" });
    try {
      const payment = await razorpayRequest<CampaignCapturedPayment>(`/payments/${paymentId}`, "GET");
      if (payment.order_id !== orderId || payment.amount !== order.amountPaise || payment.currency !== "INR") return error("Provider payment does not match the accepted campaign amount.", 409);
      if (payment.status !== "captured" || payment.captured === false) return error("Payment is not captured yet. Wait for provider confirmation.", 409);
      await recordCapturedCampaignPayment(db, order, payment);
      return json({ paid: true, paymentStatus: "captured" });
    } catch (caught) { return error(caught instanceof Error ? caught.message : "Payment could not be confirmed.", 502); }
  }

  if (path[0] === "influencers" && path.length === 1) {
    const displayName = cleanText(body.displayName, 100, 2);
    const creatorTrack = body.creatorTrack === "emerging" ? "emerging" : "standard";
    const bio = cleanText(body.bio, 1500, 0);
    const categories = cleanList(body.categories);
    const location = cleanText(body.location, 100);
    const ratePaise = inrPaise(body.ratePaise);
    const portfolio = Array.isArray(body.portfolio) && body.portfolio.length <= 10 ? body.portfolio.map(safeUrl) : null;
    const packageInput = body.packages;
    const packages = packageInput === undefined ? undefined : Array.isArray(packageInput) && packageInput.length <= 10 ? packageInput.map((value) => {
      const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const title = cleanText(item.title, 100, 2);
      const pricePaise = inrPaise(item.pricePaise);
      const deliverables = cleanText(item.deliverables, 500, 2);
      const deliveryDays = item.deliveryDays == null || item.deliveryDays === "" ? null : Number.isInteger(item.deliveryDays) && Number(item.deliveryDays) >= 1 && Number(item.deliveryDays) <= 90 ? Number(item.deliveryDays) : undefined;
      return title && pricePaise !== null && deliverables && deliveryDays !== undefined ? { title, pricePaise, deliverables, deliveryDays } : null;
    }) : null;
    if (!displayName || bio === null || !categories || !location || ratePaise === null || !portfolio || portfolio.some((item) => !item) || packages === null || packages?.some((item) => !item)) return error("Provide valid creator details, HTTPS portfolio links, and packages with a title, INR price and deliverables.");
    const savedPackages = packages as { title: string; pricePaise: number; deliverables: string; deliveryDays: number | null }[] | undefined;
    const result = await db.collection("mp_influencers").findOneAndUpdate({ userId }, { $set: { displayName, bio, categories, location, ratePaise, portfolio, creatorTrack, currency: "INR", ...(savedPackages ? { packages: savedPackages } : {}), updatedAt: now }, $setOnInsert: { userId, status: "draft", instagram: { verifiedFollowers: null, verifiedAt: null }, createdAt: now } }, { upsert: true, returnDocument: "after" });
    return json({ influencer: record(result), eligibility: creatorTrack === "emerging" ? "Emerging Creator profiles appear in the Emerging directory after approval and current Meta verification, and can be booked, invited and apply to campaigns like standard creators." : "Standard influencer discovery requires approval and at least 5,000 current Meta-verified Instagram followers." }, 201);
  }
  if (path[0] === "brands" && path.length === 1) {
    const name = cleanText(body.name, 100, 2);
    const description = cleanText(body.description, 1500, 0);
    const category = BRAND_CATEGORIES.find((item) => item === body.category);
    const location = cleanText(body.location, 100);
    const website = body.website === "" || body.website == null ? null : safeUrl(body.website);
    const offerings = cleanList(body.offerings, 20);
    if (!name || description === null || !category || !location || (body.website && !website) || !offerings) return error("Provide a brand name, category, location, products or services, and a valid HTTPS website if supplied.");
    const id = new ObjectId();
    const brand = { _id: id, ownerId: userId, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${id.toHexString().slice(-6)}`, name, description, category, location, website, offerings, status: "pending", currency: "INR", createdAt: now, updatedAt: now };
    await db.collection("mp_brands").insertOne(brand);
    await db.collection("mp_brand_members").insertOne({ brandId: id, userId, role: "owner", status: "active", createdAt: now });
    await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: "brand.created", createdAt: now });
    return json({ brand: record(brand) }, 201);
  }
  if (path[0] === "campaigns" && path.length === 1) {
    const brandId = objectId(body.brandId); if (!brandId) return error("Select a brand.");
    const member = await brandMembership(db, brandId, userId); if (!member || !["owner", "admin", "editor"].includes(member.role)) return error("Brand edit access required.", 403);
    const brand = await db.collection("mp_brands").findOne({ _id: brandId, status: "approved" });
    if (!brand) return error("Brand approval is required before publishing campaigns.", 409);
    const title = cleanText(body.title, 120, 5); const brief = cleanText(body.brief, 4000, 20);
    const deliverables = cleanList(body.deliverables, 20); const targetAudience = cleanText(body.targetAudience, 500, 3);
    const budgetPaise = inrPaise(body.budgetPaise); const deadline = typeof body.deadline === "string" ? new Date(body.deadline) : new Date(NaN);
    if (!title || !brief || !deliverables?.length || !targetAudience || budgetPaise === null || budgetPaise < 100 || !Number.isFinite(deadline.getTime()) || deadline <= now || deadline.getTime() > now.getTime() + 365 * 86_400_000) return error("Provide a title, detailed brief, deliverables, audience, INR budget, and a deadline within one year.");
    const campaign = { _id: new ObjectId(), brandId, title, brief, deliverables, targetAudience, budgetPaise, deadline, status: "open", currency: "INR", createdBy: userId, createdAt: now, updatedAt: now };
    await db.collection("mp_campaigns").insertOne(campaign);
    return json({ campaign: record(campaign) }, 201);
  }
  if (path[0] === "campaigns" && path[1] && path[2] === "apply") {
    const campaignId = objectId(path[1]); if (!campaignId) return error("Invalid campaign ID.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: campaignId, status: "open", deadline: { $gt: now }, ...notBooking });
    if (!campaign) return error("Campaign is closed.", 409);
    if (!(await db.collection("mp_brands").findOne({ _id: campaign.brandId, status: "approved" }))) return error("Brand is unavailable.", 409);
    const influencer = await db.collection("mp_influencers").findOne({ userId });
    if (!influencer || !isActiveCreator(influencer)) return error("An approved influencer profile with a current Meta-verified Instagram connection is required.", 403);
    const pitch = cleanText(body.pitch, 1500, 20); if (!pitch) return error("Write a pitch of at least 20 characters.");
    try {
      const application = { _id: new ObjectId(), campaignId, brandId: campaign.brandId, influencerId: userId, type: "application", status: "pending", pitch, createdAt: now, updatedAt: now };
      await db.collection("mp_applications").insertOne(application);
      await notify(db, campaign.createdBy, "New campaign application", `${influencer.displayName} applied for ${campaign.title}.`, `/influencer-marketing/campaigns/${campaignId}`);
      return json({ application: record(application) }, 201);
    } catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("You already have an application or invitation for this campaign.", 409); throw caught; }
  }
  if (path[0] === "campaigns" && path[1] && path[2] === "invite") {
    const campaignId = objectId(path[1]); if (!campaignId) return error("Invalid campaign ID.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: campaignId, status: "open", deadline: { $gt: now }, ...notBooking });
    const member = campaign ? await brandMembership(db, campaign.brandId, userId) : null;
    if (!campaign || !member || !["owner", "admin", "editor"].includes(member.role) || !(await db.collection("mp_brands").findOne({ _id: campaign.brandId, status: "approved" }))) return error("Campaign access required.", 403);
    const influencerProfileId = objectId(body.influencerProfileId); const influencer = influencerProfileId ? await db.collection("mp_influencers").findOne({ _id: influencerProfileId }) : null;
    if (!influencer || !isActiveCreator(influencer)) return error("Choose an approved, currently verified influencer.");
    const influencerId = String(influencer.userId);
    const message = cleanText(body.message, 1000, 10); if (!message) return error("Write an invitation message.");
    try {
      const invitation = { _id: new ObjectId(), campaignId, brandId: campaign.brandId, influencerId, type: "invitation", status: "invited", pitch: message, createdBy: userId, createdAt: now, updatedAt: now };
      await db.collection("mp_applications").insertOne(invitation);
      await notify(db, influencerId!, "Campaign invitation", `You were invited to ${campaign.title}.`, "/influencer-marketing/inbox");
      return json({ invitation: record(invitation) }, 201);
    } catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("An application or invitation already exists.", 409); throw caught; }
  }
  if (path[0] === "applications" && path[1] && ["accept", "decline"].includes(path[2] || "")) {
    const id = objectId(path[1]); if (!id) return error("Invalid application ID.");
    const application = await db.collection("mp_applications").findOne({ _id: id, status: { $in: ["pending", "invited"] } });
    if (!application) return error("Application is no longer pending.", 409);
    const member = await brandMembership(db, application.brandId, userId);
    const brandSide = !!member && ["owner", "admin", "editor"].includes(member.role);
    if (application.type === "application" ? !brandSide : application.influencerId !== userId) return error("This decision belongs to the other party.", 403);
    if (path[2] === "accept") {
      const campaign = await db.collection("mp_campaigns").findOne({ _id: application.campaignId, status: "open" });
      const brand = await db.collection("mp_brands").findOne({ _id: application.brandId, status: "approved" });
      const creator = await db.collection("mp_influencers").findOne({ userId: application.influencerId });
      if (!campaign || !brand || !creator || !isActiveCreator(creator)) return error("This collaboration is no longer eligible for acceptance.", 409);
    }
    const status = path[2] === "accept" ? "accepted" : "declined";
    const updated = await db.collection("mp_applications").updateOne({ _id: id, status: application.status }, { $set: { status, updatedAt: now, decidedBy: userId } });
    if (!updated.modifiedCount) return error("Application changed; refresh and try again.", 409);
    let collaboration = null;
    const decidedCampaign = await db.collection("mp_campaigns").findOne({ _id: application.campaignId });
    const isBooking = decidedCampaign?.kind === PACKAGE_BOOKING_KIND;
    if (status === "accepted") {
      await db.collection("mp_collaborations").updateOne({ campaignId: application.campaignId, influencerId: application.influencerId }, { $setOnInsert: { brandId: application.brandId, campaignId: application.campaignId, influencerId: application.influencerId, applicationId: id, status: "negotiating", currency: "INR", createdAt: now, updatedAt: now } }, { upsert: true });
      collaboration = await db.collection("mp_collaborations").findOne({ campaignId: application.campaignId, influencerId: application.influencerId });
      if (isBooking && collaboration && decidedCampaign) {
        await agreePackageBooking(db, collaboration._id, decidedCampaign, application, userId, now);
        collaboration = await db.collection("mp_collaborations").findOne({ _id: collaboration._id });
      }
    }
    if (isBooking) await db.collection("mp_campaigns").updateOne({ _id: application.campaignId }, { $set: { status: "closed", closedReason: status === "accepted" ? "booked" : "declined", updatedAt: now } });
    await notify(db, brandSide ? application.influencerId : application.createdBy, `Invitation ${status}`, `A campaign ${application.type} was ${status}.`, "/influencer-marketing/inbox");
    return json({ status, collaboration: record(collaboration) });
  }
  if (path[0] === "collaborations" && path[1]) {
    const id = objectId(path[1]); if (!id) return error("Invalid collaboration ID.");
    const access = await collaborationAccess(db, id, userId); if (!access) return error("Collaboration access required.", 403);
    if (access.role === "brand" && !["owner", "admin", "editor"].includes(String(access.member?.role))) return error("Brand edit access required.", 403);
    const otherUserId = access.role === "influencer" ? (await db.collection("mp_brands").findOne({ _id: access.collaboration.brandId }))?.ownerId : access.collaboration.influencerId;
    if (path[2] === "messages") {
      const text = cleanText(body.text, 4000, 0); const clientId = cleanText(body.clientId, 80);
      const ids = body.attachmentIds == null ? [] : Array.isArray(body.attachmentIds) && body.attachmentIds.length <= 5 ? body.attachmentIds.map(objectId) : null;
      if (text === null || !clientId || !ids || ids.some((item) => !item) || (!text && !ids.length)) return error("Add a message or up to five uploaded attachments.");
      const files = ids.length ? await db.collection("mp_uploads.files").find({ _id: { $in: ids as ObjectId[] }, "metadata.collaborationId": id, "metadata.uploadedBy": userId }).toArray() : [];
      if (files.length !== ids.length) return error("An attachment is unavailable or does not belong to this collaboration.", 403);
      const fileById = new Map(files.map((file) => [String(file._id), file]));
      const attachments = (ids as ObjectId[]).map((fileId) => { const file = fileById.get(String(fileId))!; return { id: String(fileId), name: file.filename, type: file.metadata.originalType, size: file.length }; });
      try {
        const message = { _id: new ObjectId(), collaborationId: id, senderId: userId, clientId, text, attachments, createdAt: now };
        await db.collection("mp_messages").insertOne(message);
        if (otherUserId) await notify(db, otherUserId, "New collaboration message", text ? text.slice(0, 140) : `${attachments.length} attachment(s)`, `/influencer-marketing/inbox?conversation=${id}`);
      await queueMarketplaceEvent(db, id, "message.created");
      return json({ message: record(message) }, 201);
      } catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return json({ duplicate: true }); throw caught; }
    }
    if (path[2] === "offers") {
      if (access.collaboration.status !== "negotiating") return error("Negotiation is closed.", 409);
      if (access.role === "brand" && !["owner", "admin"].includes(String(access.member?.role))) return error("Brand owner or administrator approval is required for price proposals.", 403);
      const amountPaise = inrPaise(body.amountPaise); const terms = cleanText(body.terms, 2000, 20);
      if (amountPaise === null || amountPaise < 100 || !terms) return error("Enter an INR amount and detailed terms.");
      const offer = { _id: new ObjectId(), collaborationId: id, proposerId: userId, amountPaise, terms, currency: "INR", status: "open", createdAt: now };
      await db.collection("mp_offers").insertOne(offer);
      const negotiation = await db.collection("mp_collaborations").updateOne({ _id: id, status: "negotiating", currentOfferId: access.collaboration.currentOfferId || { $exists: false } }, { $set: { currentOfferId: offer._id, updatedAt: now } });
      if (!negotiation.modifiedCount) {
        await db.collection("mp_offers").updateOne({ _id: offer._id }, { $set: { status: "superseded", updatedAt: now } });
        return error("Negotiation changed; refresh and try again.", 409);
      }
      await db.collection("mp_offers").updateMany({ collaborationId: id, _id: { $ne: offer._id }, status: "open" }, { $set: { status: "superseded", updatedAt: now } });
      await queueMarketplaceEvent(db, id, "offer.created");
      if (otherUserId) await notify(db, otherUserId, "New price proposal", "Review the proposed collaboration terms.", `/influencer-marketing/inbox?conversation=${id}`);
      return json({ offer: record(offer) }, 201);
    }
    if (path[2] === "deliverables") {
      if (access.role !== "influencer" || access.collaboration.status !== "terms_agreed" || (marketplacePaymentsEnabled() && access.collaboration.paymentStatus !== "captured")) return error("Both parties must agree to the collaboration terms before content submission.", 409);
      const title = cleanText(body.title, 120, 3); const contentUrl = safeUrl(body.contentUrl); const note = cleanText(body.note, 1500, 0);
      if (!title || !contentUrl || note === null) return error("Provide a title and HTTPS content link.");
      const deliverable = { _id: new ObjectId(), collaborationId: id, title, contentUrl, note, status: "submitted", revision: 1, submittedBy: userId, createdAt: now, updatedAt: now };
      await db.collection("mp_deliverables").insertOne(deliverable);
      await queueMarketplaceEvent(db, id, "deliverable.created");
      if (otherUserId) await notify(db, otherUserId, "Content submitted", title, `/influencer-marketing/inbox?conversation=${id}`);
      return json({ deliverable: record(deliverable) }, 201);
    }
    if (path[2] === "complete") {
      if (access.role !== "brand" || access.collaboration.status !== "terms_agreed" || (marketplacePaymentsEnabled() && access.collaboration.paymentStatus !== "captured")) return error("Agreed collaboration terms and brand approval are required to complete work.", 403);
      if (!access.member || !["owner", "admin"].includes(String(access.member.role))) return error("Brand owner or administrator approval is required to complete work.", 403);
      const remaining = await db.collection("mp_deliverables").countDocuments({ collaborationId: id, status: { $ne: "approved" } });
      const approved = await db.collection("mp_deliverables").countDocuments({ collaborationId: id, status: "approved" });
      if (remaining || !approved) return error("Approve all submitted deliverables first.", 409);
      const completed = await db.collection("mp_collaborations").updateOne({ _id: id, status: "terms_agreed", ...(marketplacePaymentsEnabled() ? { paymentStatus: "captured" } : {}) }, { $set: { status: "completed", completedAt: now, updatedAt: now } });
      if (!completed.modifiedCount) return error("Collaboration changed; refresh before completing it.", 409);
      const payout = await db.collection("mp_orders").findOne({ collaborationId: id, paymentStatus: "captured" });
      if (payout && marketplacePaymentsEnabled()) {
        await db.collection("mp_orders").updateOne({ _id: payout._id, payoutStatus: { $ne: "on_hold" } }, { $set: { payoutStatus: "awaiting_route_setup", completedAt: now, updatedAt: now } });
        await db.collection("mp_payout_requests").updateOne({ orderId: payout._id }, { $setOnInsert: { _id: new ObjectId(), orderId: payout._id, collaborationId: id, influencerId: access.collaboration.influencerId, amountPaise: payout.amountPaise - Math.round(Number(payout.amountPaise) * Number(payout.commissionBps || 0) / 10_000), currency: "INR", status: "awaiting_route_setup", createdAt: now, updatedAt: now } }, { upsert: true });
      }
      await queueMarketplaceEvent(db, id, "collaboration.updated");
      if (otherUserId) await notify(db, otherUserId, "Collaboration completed", "The brand confirmed completion.", `/influencer-marketing/inbox?conversation=${id}`);
      return json({ completed: true });
    }
    if (path[2] === "reviews") {
      if (access.collaboration.status !== "completed") return error("Complete the collaboration before reviewing.", 409);
      if (access.role === "brand" && !["owner", "admin"].includes(String(access.member?.role))) return error("Brand owner or administrator approval is required for reviews.", 403);
      const rating = body.rating; const comment = cleanText(body.comment, 1000, 10);
      if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5 || !comment) return error("Give a rating from 1 to 5 and a comment.");
      try { const review = { _id: new ObjectId(), collaborationId: id, reviewerId: userId, reviewedRole: access.role === "brand" ? "influencer" : "brand", rating, comment, createdAt: now }; await db.collection("mp_reviews").insertOne(review); return json({ review: record(review) }, 201); }
      catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("You already reviewed this collaboration.", 409); throw caught; }
    }
    if (path[2] === "disputes") {
      const reason = cleanText(body.reason, 2000, 20); if (!reason) return error("Explain the dispute in at least 20 characters.");
      const open = await db.collection("mp_disputes").findOne({ collaborationId: id, openedBy: userId, status: "open" });
      if (open) return error("You already have an open dispute for this collaboration.", 409);
      const dispute = { _id: new ObjectId(), collaborationId: id, brandId: access.collaboration.brandId, influencerId: access.collaboration.influencerId, openedBy: userId, reason, status: "open", createdAt: now, updatedAt: now };
      await db.collection("mp_disputes").insertOne(dispute);
      await db.collection("mp_orders").updateOne({ collaborationId: id, paymentStatus: "captured" }, { $set: { payoutStatus: "on_hold", disputeOpenedAt: now, updatedAt: now } });
      await db.collection("mp_payout_requests").updateOne({ collaborationId: id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
      await db.collection("mp_audit").insertOne({ entityId: dispute._id, actorId: userId, action: "dispute.opened", createdAt: now });
      if (otherUserId) await notify(db, otherUserId, "Collaboration dispute opened", "A dispute was opened for this collaboration.", `/influencer-marketing/inbox?conversation=${id}`);
      await queueMarketplaceEvent(db, id, "dispute.opened");
      return json({ dispute: record(dispute) }, 201);
    }
  }
  if (path[0] === "messages" && path[1] && path[2] === "report") {
    const id = objectId(path[1]); if (!id) return error("Invalid message ID.");
    const message = await db.collection("mp_messages").findOne({ _id: id });
    if (!message || message.senderId === userId || !(await collaborationAccess(db, message.collaborationId, userId))) return error("Message cannot be reported.", 403);
    const reason = cleanText(body.reason, 1000, 10); if (!reason) return error("Explain the report in at least 10 characters.");
    try { const report = { _id: new ObjectId(), messageId: id, collaborationId: message.collaborationId, reporterId: userId, reason, status: "pending", createdAt: now }; await db.collection("mp_message_reports").insertOne(report); return json({ report: record(report) }, 201); }
    catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("You already reported this message.", 409); throw caught; }
  }
  if (path[0] === "offers" && path[1] && path[2] === "accept") {
    const id = objectId(path[1]); if (!id) return error("Invalid offer ID.");
    const offer = await db.collection("mp_offers").findOne({ _id: id, status: "open" }); if (!offer) return error("Offer is no longer open.", 409);
    const access = await collaborationAccess(db, offer.collaborationId, userId);
    if (!access || offer.proposerId === userId || access.collaboration.status !== "negotiating") return error("The other party must accept an open offer.", 403);
    if (access.role === "brand" && !["owner", "admin"].includes(String(access.member?.role))) return error("Brand owner or administrator approval is required to accept price terms.", 403);
    const campaign = await db.collection("mp_campaigns").findOne({ _id: access.collaboration.campaignId });
    if (!campaign || Number(offer.amountPaise) > Number(campaign.budgetPaise)) return error("The proposed amount cannot exceed the campaign budget.", 409);
    const agreed = await db.collection("mp_collaborations").findOneAndUpdate({ _id: offer.collaborationId, status: "negotiating", currentOfferId: id }, { $set: { status: "terms_agreed", amountPaise: offer.amountPaise, terms: offer.terms, agreedAt: now, updatedAt: now } }, { returnDocument: "after" });
    if (!agreed) return error("Offer changed; refresh and try again.", 409);
    await db.collection("mp_offers").updateOne({ _id: id }, { $set: { status: "accepted", acceptedBy: userId, acceptedAt: now } });
    await db.collection("mp_agreements").updateOne({ collaborationId: offer.collaborationId }, { $setOnInsert: { collaborationId: offer.collaborationId, campaignId: agreed.campaignId, brandId: agreed.brandId, influencerId: agreed.influencerId, offerId: id, proposerId: offer.proposerId, acceptedBy: userId, amountPaise: offer.amountPaise, currency: "INR", terms: offer.terms, agreedAt: now, status: "terms_recorded", electronicSignature: false } }, { upsert: true });
    const brand = await db.collection("mp_brands").findOne({ _id: agreed.brandId });
    const settings = await db.collection("mp_settings").findOne({ key: "default" });
    const configuredCommission = Number.isInteger(settings?.commissionBps) ? Number(settings?.commissionBps) : marketplaceCommissionBps();
    await db.collection("mp_orders").updateOne({ collaborationId: offer.collaborationId }, { $setOnInsert: { _id: new ObjectId(), collaborationId: offer.collaborationId, campaignId: agreed.campaignId, brandId: agreed.brandId, brandOwnerId: brand?.ownerId || "", influencerId: agreed.influencerId, offerId: id, amountPaise: offer.amountPaise, commissionBps: configuredCommission, currency: "INR", paymentStatus: "not_started", checkoutState: "not_created", payoutStatus: "not_eligible", createdAt: now, updatedAt: now } }, { upsert: true });
    await db.collection("mp_audit").insertOne({ entityId: offer.collaborationId, actorId: userId, action: "offer.accepted", offerId: id, amountPaise: offer.amountPaise, createdAt: now });
    await queueMarketplaceEvent(db, offer.collaborationId, "collaboration.updated");
    await notify(db, offer.proposerId, "Terms accepted", "The price and collaboration terms were accepted.", `/influencer-marketing/inbox?conversation=${offer.collaborationId}`);
    return json({ accepted: true });
  }
  if (path[0] === "deliverables" && path[1] && ["approve", "revise"].includes(path[2] || "")) {
    const id = objectId(path[1]); if (!id) return error("Invalid deliverable ID.");
    const deliverable = await db.collection("mp_deliverables").findOne({ _id: id, status: "submitted" }); if (!deliverable) return error("Deliverable is no longer pending.", 409);
    const access = await collaborationAccess(db, deliverable.collaborationId, userId); if (!access || access.role !== "brand") return error("Brand review access required.", 403);
    if (!access.member || !["owner", "admin", "editor"].includes(String(access.member.role))) return error("Brand edit access is required to review deliverables.", 403);
    const decision = path[2] === "approve" ? "approved" : "revision_requested";
    if (decision === "revision_requested" && Number(deliverable.revision || 1) >= 4) return error("This deliverable has reached the three-revision limit. Open a dispute or resolve the scope with the other party.", 409);
    const note = cleanText(body.note, 1000, decision === "approved" ? 0 : 10); if (note === null) return error("Add a revision note.");
    await db.collection("mp_deliverables").updateOne({ _id: id, status: "submitted" }, { $set: { status: decision, reviewNote: note, reviewedBy: userId, updatedAt: now } });
    await queueMarketplaceEvent(db, deliverable.collaborationId, "deliverable.updated");
    await notify(db, access.collaboration.influencerId, `Content ${decision.replace("_", " ")}`, deliverable.title, `/influencer-marketing/inbox?conversation=${deliverable.collaborationId}`);
    return json({ status: decision });
  }
  if (path[0] === "deliverables" && path[1] && path[2] === "resubmit") {
    const id = objectId(path[1]); if (!id) return error("Invalid deliverable ID.");
    const deliverable = await db.collection("mp_deliverables").findOne({ _id: id, status: "revision_requested", submittedBy: userId });
    const access = deliverable ? await collaborationAccess(db, deliverable.collaborationId, userId) : null;
    if (!deliverable || !access || access.role !== "influencer") return error("A requested revision is required.", 403);
    const contentUrl = safeUrl(body.contentUrl); const note = cleanText(body.note, 1500, 0);
    if (!contentUrl || note === null) return error("Provide a new HTTPS content link and note.");
    const revision = await db.collection("mp_deliverables").updateOne({ _id: id, status: "revision_requested", submittedBy: userId, revision: { $lt: 4 } }, { $set: { contentUrl, note, status: "submitted", updatedAt: now }, $inc: { revision: 1 } });
    if (!revision.modifiedCount) return error("The revision limit was reached or the deliverable changed; refresh and contact the other party.", 409);
    await queueMarketplaceEvent(db, deliverable.collaborationId, "deliverable.updated");
    const brand = await db.collection("mp_brands").findOne({ _id: access.collaboration.brandId });
    if (brand?.ownerId) await notify(db, brand.ownerId, "Content revision submitted", deliverable.title, `/influencer-marketing/inbox?conversation=${deliverable.collaborationId}`);
    return json({ status: "submitted" });
  }
  if (path[0] === "verification-requests" && path.length === 1) {
    const profile = await db.collection("mp_influencers").findOne({ userId }); if (!profile) return error("Create your influencer profile first.", 409);
    const instagramUsername = cleanText(body.instagramUsername, 50, 2); if (!instagramUsername || !/^[A-Za-z0-9._]+$/.test(instagramUsername)) return error("Enter a valid Instagram username.");
    const requestId = new ObjectId();
    await db.collection("mp_verification_requests").insertOne({ _id: requestId, userId, instagramUsername, status: "pending", method: "manual_identity_review", note: "Manual review cannot verify follower counts. Authorized Meta API data is required for public eligibility.", createdAt: now });
    await db.collection("mp_influencers").updateOne({ userId }, { $set: { status: "pending", instagramUsername, updatedAt: now } });
    return json({ id: requestId.toHexString(), status: "pending", followerVerification: "not_verified" }, 201);
  }
  if (path[0] === "admin" && path[1] === "profiles" && path[2] && path[3] === "decision") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const id = objectId(path[2]); const kind = body.kind; const decision = body.decision;
    if (!id || !["brand", "influencer"].includes(String(kind)) || !["approved", "rejected", "suspended"].includes(String(decision))) return error("Invalid profile decision.");
    const collection = db.collection(kind === "brand" ? "mp_brands" : "mp_influencers");
    const profile = await collection.findOne({ _id: id }); if (!profile) return error("Profile not found.", 404);
    if (kind === "influencer" && decision === "approved" && !isPublicInfluencer({ ...profile, status: "approved" }) && !isPublicEmergingCreator({ ...profile, status: "approved" })) return error(profile.creatorTrack === "emerging" ? "Emerging Creator approval requires a current Meta-verified account below 5,000 followers." : "Standard influencer approval requires current Meta verification and at least 5,000 followers.", 409);
    const reason = cleanText(body.reason, 500, decision === "approved" ? 0 : 10); if (reason === null) return error("A decision reason is required for rejection or suspension.");
    await collection.updateOne({ _id: id }, { $set: { status: decision, reviewReason: reason, reviewedBy: userId, reviewedAt: now, updatedAt: now } });
    if (kind === "brand" && decision !== "approved") await db.collection("mp_campaigns").updateMany({ brandId: id, status: "open" }, { $set: { status: "closed", closedReason: `brand_${decision}`, updatedAt: now } });
    await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: `profile.${decision}`, kind, reason, createdAt: now });
    await notify(db, kind === "brand" ? profile.ownerId : profile.userId, `Marketplace profile ${decision}`, reason || `Your profile is ${decision}.`, "/influencer-marketing");
    return json({ status: decision });
  }
  if (path[0] === "admin" && path[1] === "verification-requests" && path[2] && path[3] === "decision") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const id = objectId(path[2]); if (!id || !["reviewed", "dismissed"].includes(String(body.decision))) return error("Invalid review decision.");
    const note = cleanText(body.note, 500, 10); if (!note) return error("Write a short review note.");
    const updated = await db.collection("mp_verification_requests").findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status: body.decision, reviewNote: note, reviewedBy: userId, reviewedAt: now } }, { returnDocument: "after" });
    if (!updated) return error("Review request is no longer pending.", 409);
    await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: `identity_request.${body.decision}`, note, createdAt: now });
    await notify(db, updated.userId, "Identity review update", `${note} Official follower verification remains separate.`, "/influencer-marketing/influencer");
    return json({ status: body.decision, followerVerification: "unchanged" });
  }
  if (path[0] === "admin" && path[1] === "settings" && path.length === 2) {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const commissionBps = body.commissionBps;
    if (!Number.isInteger(commissionBps) || Number(commissionBps) < 0 || Number(commissionBps) > 3000) return error("Commission must be between 0% and 30% in basis points.");
    await db.collection("mp_settings").updateOne({ key: "default" }, { $set: { commissionBps, updatedBy: userId, updatedAt: now }, $setOnInsert: { key: "default", currency: "INR", createdAt: now } }, { upsert: true });
    await db.collection("mp_audit").insertOne({ entityId: "marketplace-settings", actorId: userId, action: "settings.commission_updated", commissionBps, createdAt: now });
    return json({ commissionBps });
  }
  if (path[0] === "admin" && path[1] === "orders" && path[2] && path[3] === "refund") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const orderId = objectId(path[2]);
    const requestKey = body.requestKey;
    const reason = cleanText(body.reason, 400, 10);
    const amountPaise = body.amountPaise;
    if (!orderId || typeof requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey) || !reason || !Number.isSafeInteger(amountPaise) || Number(amountPaise) < 100) return error("Provide an order, stable refund request UUID, reason, and amount in paise.");
    const order = await db.collection("mp_orders").findOne({ _id: orderId });
    if (!order || order.paymentStatus !== "captured" || typeof order.razorpayPaymentId !== "string") return error("A captured campaign payment is required before refunding.", 409);
    let refund = await db.collection("mp_refunds").findOne({ requestKey });
    if (refund && (String(refund.orderId) !== String(orderId) || refund.amountPaise !== Number(amountPaise) || refund.reason !== reason)) return error("This refund key was already used with different details.", 409);
    if (refund?.status === "processed" || refund?.status === "pending") return json({ refund: { _id: String(refund._id), status: refund.status, amountPaise: refund.amountPaise }, duplicate: true });
    const existing = await db.collection("mp_refunds").find({ orderId, status: { $in: ["processing", "pending", "processed", "reconciliation_required"] }, requestKey: { $ne: requestKey } }, { projection: { amountPaise: 1, status: 1 } }).toArray();
    const committed = Number(order.refundedPaise || 0) + existing.reduce((total, item) => total + Number(item.amountPaise || 0), 0);
    if (Number(amountPaise) > Number(order.amountPaise) - committed) return error("Refund exceeds the remaining captured balance.", 400);
    const now = new Date();
    if (!refund) {
      const document = { _id: new ObjectId(), requestKey, orderId, collaborationId: order.collaborationId, paymentId: order.razorpayPaymentId, amountPaise: Number(amountPaise), currency: "INR", reason, status: "processing", requestedBy: userId, createdAt: now, updatedAt: now };
      try { await db.collection("mp_refunds").insertOne(document); refund = document; }
      catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("This refund request is already being processed. Refresh before retrying.", 409); throw caught; }
    } else {
      const claimed = await db.collection("mp_refunds").updateOne({ _id: refund._id, status: "reconciliation_required" }, { $set: { status: "processing", retryAt: now, updatedAt: now } });
      if (!claimed.modifiedCount) return error("Refund request is already being processed.", 409);
    }
    await db.collection("mp_orders").updateOne({ _id: orderId, payoutStatus: { $ne: "paid" } }, { $set: { payoutStatus: "on_hold", refundReviewStartedAt: now, updatedAt: now } });
    await db.collection("mp_payout_requests").updateOne({ orderId, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
    try {
      const providerRefund = await razorpayRequest<{ id?: string; payment_id?: string; amount?: number; currency?: string; status?: string }>(`/payments/${order.razorpayPaymentId}/refund`, "POST", { amount: Number(amountPaise), receipt: requestKey, notes: { campaign_order: String(orderId), reason: reason.slice(0, 256) } }, `refund_${requestKey}`);
      if (typeof providerRefund.id !== "string" || !/^rfnd_[A-Za-z0-9]+$/.test(providerRefund.id) || providerRefund.payment_id !== order.razorpayPaymentId || providerRefund.amount !== Number(amountPaise) || providerRefund.currency !== "INR") {
        await db.collection("mp_refunds").updateOne({ _id: refund._id }, { $set: { status: "reconciliation_required", updatedAt: new Date() } });
        return error("Provider refund response could not be matched. Reconciliation is required.", 502);
      }
      await db.collection("mp_refunds").updateOne({ _id: refund._id }, { $set: { providerRefundId: providerRefund.id, status: "pending", submittedAt: new Date(), updatedAt: new Date() } });
      await db.collection("mp_audit").insertOne({ entityId: order.collaborationId, actorId: userId, action: "campaign_refund.requested", refundId: refund._id, amountPaise: Number(amountPaise), createdAt: now });
      return json({ refund: { _id: String(refund._id), status: providerRefund.status || "pending", amountPaise: Number(amountPaise) } }, 202);
    } catch (caught) {
      const rejected = caught instanceof RazorpayApiError && caught.status !== null && caught.status >= 400 && caught.status < 500 && caught.status !== 409;
      await db.collection("mp_refunds").updateOne({ _id: refund._id, status: "processing" }, { $set: { status: rejected ? "provider_rejected" : "reconciliation_required", lastAttemptAt: new Date(), updatedAt: new Date() } });
      return error(caught instanceof Error ? caught.message : "Refund could not be confirmed. Reuse the same request key to reconcile.", 502);
    }
  }
  if (path[0] === "admin" && path[1] === "provider-disputes" && path[2] && path[3] === "decision") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const caseId = objectId(path[2]);
    const decision = body.decision;
    const note = cleanText(body.note, 1000, 20);
    if (!caseId || !["resolved", "dismissed"].includes(String(decision)) || !note) return error("Choose a decision and record at least 20 characters of provider-resolution evidence.");
    const providerCase = await db.collection("mp_provider_disputes").findOneAndUpdate({ _id: caseId, resolution: { $exists: false } }, { $set: { resolution: decision, resolutionNote: note, resolvedBy: userId, resolvedAt: now, updatedAt: now } }, { returnDocument: "after" });
    if (!providerCase) return error("Provider dispute has already been reviewed.", 409);
    if (decision === "resolved") {
      const order = await db.collection("mp_orders").findOne({ _id: providerCase.orderId });
      const collaboration = order ? await db.collection("mp_collaborations").findOne({ _id: order.collaborationId }) : null;
      const [internalCases, externalCases, refundCases] = order ? await Promise.all([
        db.collection("mp_disputes").countDocuments({ collaborationId: order.collaborationId, status: "open" }),
        db.collection("mp_provider_disputes").countDocuments({ orderId: order._id, resolution: { $exists: false } }),
        db.collection("mp_refunds").countDocuments({ orderId: order._id, status: { $in: ["processing", "pending", "reconciliation_required", "provider_rejected"] } }),
      ]) : [0, 0, 0];
      const safeToReleaseEligibility = Boolean(order && collaboration?.status === "completed" && !Number(order.refundedPaise || 0) && !internalCases && !externalCases && !refundCases);
      if (order) await db.collection("mp_orders").updateOne({ _id: order._id, payoutStatus: "on_hold" }, { $set: { payoutStatus: safeToReleaseEligibility ? "awaiting_route_setup" : "on_hold", providerDisputeResolvedAt: now, updatedAt: now } });
      if (order && safeToReleaseEligibility) await db.collection("mp_payout_requests").updateOne({ orderId: order._id, status: "on_hold" }, { $set: { status: "awaiting_route_setup", updatedAt: now } });
    }
    await db.collection("mp_audit").insertOne({ entityId: caseId, actorId: userId, action: `provider_dispute.${decision}`, note, createdAt: now });
    return json({ resolution: decision, payoutTransfer: "not_enabled" });
  }
  if (path[0] === "admin" && ["disputes", "message-reports"].includes(path[1] || "") && path[2] && path[3] === "decision") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const id = objectId(path[2]); if (!id) return error("Invalid case ID.");
    const collection = db.collection(path[1] === "disputes" ? "mp_disputes" : "mp_message_reports");
    const expected = path[1] === "disputes" ? "open" : "pending";
    const decision = body.decision;
    if (!["resolved", "dismissed"].includes(String(decision))) return error("Choose resolved or dismissed.");
    const note = cleanText(body.note, 1000, 10); if (!note) return error("Record the decision reason.");
    const updated = await collection.findOneAndUpdate({ _id: id, status: expected }, { $set: { status: decision, reviewNote: note, reviewedBy: userId, reviewedAt: now } }, { returnDocument: "after" });
    if (!updated) return error("Case is no longer pending.", 409);
    await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: `case.${decision}`, note, createdAt: now });
    if (path[1] === "disputes") await notify(db, updated.openedBy, `Dispute ${decision}`, note, `/influencer-marketing/inbox?conversation=${updated.collaborationId}`);
    else await notify(db, updated.reporterId, `Message report ${decision}`, note, `/influencer-marketing/inbox?conversation=${updated.collaborationId}`);
    return json({ status: decision });
  }
  return error("Marketplace endpoint not found.", 404);
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const path = (await context.params).segments;
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
