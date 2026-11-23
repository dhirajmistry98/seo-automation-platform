import { ObjectId, type Document } from "mongodb";
import { locationSearchTerm } from "@/lib/marketplace/india-cities";
import { instagramHandleMatches, normalizeInstagramHandle } from "@/lib/marketplace/instagram-handle";
import { LISTABLE_CREATOR_STATUS, expireOverdueRequests, isCurrentMetaVerification, cleanList, cleanText, inrPaise, isActiveCreator, objectId, PACKAGE_BOOKING_KIND, profileTier, safeUrl, startingPricePaise } from "@/lib/marketplace/core";
import { realtimeAvailable } from "@/lib/marketplace/realtime";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, records, admin, escapeRegex, publicCreatorCards, packageProblem, createPackageBooking, reviewScoreAverages } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { request, session, userId, path, db } = ctx;
  if (path[0] === "me" && path.length === 1) {
    await expireOverdueRequests(db);
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
    return json({ userId, influencer: influencer ? { ...record(influencer), tier: profileTier(influencer), listed: isActiveCreator(influencer), verificationCurrent: isCurrentMetaVerification(influencer), paused: ["rejected", "suspended"].includes(String(influencer.status)) } : null, brands: records(brands), memberships: records(memberships), applications: applications.map(describe), collaborations: collaborations.map(describe), sentBookings: sentBookings.map(describe), admin: admin(session.user.email), realtimeAvailable: realtimeAvailable(), instagramConnectAvailable: !!(process.env.META_INSTAGRAM_APP_ID && process.env.META_INSTAGRAM_APP_SECRET && process.env.META_GRAPH_API_VERSION && process.env.META_TOKEN_ENCRYPTION_KEY), marketplacePaymentCheckoutAvailable: marketplacePaymentsEnabled() });
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
    // Includes the signed-in creator's own listing, so creators can see how brands find them.
    const filter: Record<string, unknown> = { status: LISTABLE_CREATOR_STATUS, "instagram.source": "meta_api", "instagram.verifiedAt": { $gte: new Date(Date.now() - 7 * 86_400_000) } };
    // No minimum audience: one directory of Meta-verified creators, optionally narrowed by the follower filter.
    const followerRange: Record<string, number> = { $gte: 0 };
    if (minFollowers !== null && Number.isSafeInteger(minFollowers) && minFollowers >= 0) followerRange.$gte = minFollowers;
    if (maxFollowers !== null && Number.isSafeInteger(maxFollowers) && maxFollowers > 0) followerRange.$lt = Math.min(followerRange.$lt ?? Number.MAX_SAFE_INTEGER, maxFollowers);
    filter["instagram.verifiedFollowers"] = followerRange;
    if (category) filter.categories = { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    // Match on the city so "Mumbai, Maharashtra" also finds profiles that only say "Mumbai".
    const city = location ? locationSearchTerm(location) : "";
    if (city) filter.location = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (minRateRupees !== null && Number.isFinite(minRateRupees) && minRateRupees >= 0 && minRateRupees <= 10_000_000) filter.ratePaise = { ...((filter.ratePaise as Record<string, unknown> | undefined) || {}), $gte: Math.round(minRateRupees * 100) };
    if (maxRateRupees !== null && Number.isFinite(maxRateRupees) && maxRateRupees >= 0 && maxRateRupees <= 10_000_000) filter.ratePaise = { ...((filter.ratePaise as Record<string, unknown> | undefined) || {}), $lte: Math.round(maxRateRupees * 100) };
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ displayName: { $regex: escaped, $options: "i" } }, { bio: { $regex: escaped, $options: "i" } }, { location: { $regex: escaped, $options: "i" } }, { categories: { $regex: escaped, $options: "i" } }];
    }
    const total = await db.collection("mp_influencers").countDocuments(filter);
    const sort: Record<string, 1 | -1> = sortBy === "newest" ? { _id: -1 } : sortBy === "rate_asc" ? { ratePaise: 1, _id: 1 } : sortBy === "rate_desc" ? { ratePaise: -1, _id: 1 } : sortBy === "followers_asc" ? { "instagram.verifiedFollowers": 1, _id: 1 } : { "instagram.verifiedFollowers": -1, _id: 1 };
    const items = await db.collection("mp_influencers").find(filter, { projection: { verificationNotes: 0, "instagram.providerUserId": 0 } }).sort(sort).skip(skip).limit(pageSize).toArray();
    const ownIds = new Set(items.filter((item) => item.userId === userId).map((item) => String(item._id)));
    const influencers = (await publicCreatorCards(db, items.filter(isActiveCreator))).map((card) => ({ ...card, isOwn: ownIds.has(String(card._id)) }));
    return json({ influencers, total, hasMore: skip + items.length < total, nextSkip: skip + items.length });
  }
  if (path[0] === "influencers" && path[1] && path.length === 2) {
    const id = objectId(path[1]);
    if (!id) return error("Invalid creator profile ID.");
    const profile = await db.collection("mp_influencers").findOne({ _id: id });
    if (!profile) return error("Creator profile not found.", 404);
    const owner = profile.userId === userId;
    if (!owner && !isActiveCreator(profile)) return error("Creator profile not found.", 404);
    const instagram = profile.instagram && typeof profile.instagram === "object" ? profile.instagram as Record<string, unknown> : {};
    const creatorUserId = String(profile.userId);
    const completed = await db.collection("mp_collaborations").find({ influencerId: creatorUserId, status: "completed" }, { projection: { _id: 1, brandId: 1 } }).limit(200).toArray();
    const reviewDocs = completed.length ? await db.collection("mp_reviews").find({ collaborationId: { $in: completed.map((item) => item._id) }, reviewedRole: "influencer" }).sort({ createdAt: -1 }).limit(50).toArray() : [];
    const brandIdByCollaboration = new Map(completed.map((item) => [String(item._id), item.brandId]));
    const reviewBrandIds = [...new Map(reviewDocs.map((review) => { const brandId = brandIdByCollaboration.get(String(review.collaborationId)); return [String(brandId), brandId]; })).values()].filter((value): value is ObjectId => value instanceof ObjectId);
    const reviewBrands = reviewBrandIds.length ? await db.collection("mp_brands").find({ _id: { $in: reviewBrandIds } }, { projection: { name: 1 } }).toArray() : [];
    const reviewBrandName = new Map(reviewBrands.map((brand) => [String(brand._id), String(brand.name || "")]));
    const reviews = reviewDocs.map((review) => ({ _id: String(review._id), rating: review.rating, ...(review.scores ? { scores: review.scores } : {}), comment: review.comment, createdAt: review.createdAt, brandName: reviewBrandName.get(String(brandIdByCollaboration.get(String(review.collaborationId)))) || "Verified brand" }));
    const rating = reviews.length ? { average: Math.round(reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length * 10) / 10, count: reviews.length, ...reviewScoreAverages(reviewDocs) } : null;
    // Similar creators: same niche, currently public, excluding this creator and the viewer.
    const categories = Array.isArray(profile.categories) ? profile.categories.filter((value: unknown): value is string => typeof value === "string").slice(0, 5) : [];
    const similarFilter: Record<string, unknown> = { _id: { $ne: profile._id }, userId: { $ne: userId }, status: LISTABLE_CREATOR_STATUS, "instagram.source": "meta_api", "instagram.verifiedAt": { $gte: new Date(Date.now() - 7 * 86_400_000) } };
    if (categories.length) similarFilter.categories = { $in: categories.map((category: string) => new RegExp(`^${escapeRegex(category)}$`, "i")) };
    const similarDocs = await db.collection("mp_influencers").find(similarFilter, { projection: { verificationNotes: 0, "instagram.providerUserId": 0 } }).sort({ "instagram.verifiedFollowers": -1 }).limit(8).toArray();
    const similar = (await publicCreatorCards(db, similarDocs.filter(isActiveCreator))).slice(0, 4);
    return json({ influencer: {
      _id: String(profile._id), displayName: profile.displayName, bio: profile.bio, categories: profile.categories,
      location: profile.location, ratePaise: profile.ratePaise, currency: profile.currency, portfolio: profile.portfolio,
      packages: profile.packages, status: profile.status, createdAt: profile.createdAt, owner, tier: profileTier(profile),
      bookable: !owner && isActiveCreator(profile),
      fromPricePaise: startingPricePaise(profile), rating, completedCollaborations: completed.length,
      instagram: { username: instagram.username, accountType: instagram.accountType, verifiedFollowers: instagram.verifiedFollowers, analytics: instagram.analytics ?? null, mediaCount: instagram.mediaCount, profilePictureUrl: instagram.profilePictureUrl, recentMedia: instagram.recentMedia, mediaFetchedAt: instagram.mediaFetchedAt, verifiedAt: instagram.verifiedAt, source: instagram.source },
    }, reviews, similar });
  }
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { userId, path, db, body, now } = ctx;
  if (path[0] === "influencers" && path[1] && path[2] === "bookings" && path.length === 3) {
    // Direct package booking: the brand picks a creator package and sends a brief.
    const influencerProfileId = objectId(path[1]); if (!influencerProfileId) return error("Invalid creator profile ID.");
    const result = await createPackageBooking(db, { userId, brandId: body.brandId, influencerProfileId, packageIndexes: [body.packageIndex], brief: body.brief, deadline: body.deadline, usageRights: body.usageRights, message: body.message, now });
    if ("error" in result) return error(result.error, result.status);
    return json({ booking: record(result.booking) }, 201);
  }
  if (path[0] === "influencers" && path.length === 1) {
    const displayName = cleanText(body.displayName, 100, 2);
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
    // Name the exact field that is wrong, instead of one message for every rule.
    const problem =
      !displayName ? "Display name must be 2 to 100 characters."
      : bio === null ? "About you can be at most 1,500 characters."
      : !location ? "Add your location (for example Mumbai, Maharashtra)."
      : ratePaise === null ? "Starting rate must be a whole rupee amount of 0 or more."
      : !categories ? "Add up to 10 content categories, comma separated, each up to 60 characters."
      : !portfolio ? "Add up to 10 portfolio links."
      : portfolio.some((item) => !item) ? "Each portfolio link must be a full https:// address."
      : packages === null ? "Add up to 10 packages."
      : packages?.map((item, index) => item ? null : packageProblem(Array.isArray(packageInput) ? packageInput[index] : null, index + 1)).find(Boolean) || null;
    if (problem) return error(problem);
    const instagramHandle = normalizeInstagramHandle(body.instagramHandle);
    if (!instagramHandle) return error("Enter your Instagram username (letters, numbers, periods and underscores, up to 30 characters).");
    const current = await db.collection("mp_influencers").findOne({ userId }, { projection: { instagram: 1 } });
    const verifiedUsername = current?.instagram && typeof current.instagram === "object" ? (current.instagram as { username?: unknown; verifiedAt?: unknown }) : null;
    // A verified profile cannot quietly switch to another account: the username must be re-proven through Meta.
    if (verifiedUsername?.verifiedAt && verifiedUsername.username && !instagramHandleMatches(instagramHandle, verifiedUsername.username)) return error(`Your profile is verified as @${String(verifiedUsername.username)}. To use a different Instagram account, connect that account through Meta instead.`, 409);
    const takenByVerified = await db.collection("mp_influencers").findOne({ userId: { $ne: userId }, "instagram.username": instagramHandle, "instagram.verifiedAt": { $ne: null } }, { projection: { _id: 1 } });
    if (takenByVerified) return error(`@${instagramHandle} is already verified by another creator. If this is your account, contact support.`, 409);
    const savedPackages = packages as { title: string; pricePaise: number; deliverables: string; deliveryDays: number | null }[] | undefined;
    const result = await db.collection("mp_influencers").findOneAndUpdate({ userId }, { $set: { instagramHandle, displayName, bio, categories, location, ratePaise, portfolio, currency: "INR", ...(savedPackages ? { packages: savedPackages } : {}), updatedAt: now }, $setOnInsert: { userId, status: "draft", instagram: { verifiedFollowers: null, verifiedAt: null }, createdAt: now } }, { upsert: true, returnDocument: "after" });
    const verifiedNow = Boolean(result && isActiveCreator({ ...result, status: "approved" }));
    return json({ influencer: record(result), verificationRequired: !verifiedNow, eligibility: verifiedNow ? "Your Instagram is verified through Meta. Your profile is listed once approved." : `Verify @${instagramHandle} through Meta to finish your creator account. Profiles are listed only after Instagram verification.` }, 201);
  }
  if (path[0] === "verification-requests" && path.length === 1) {
    const profile = await db.collection("mp_influencers").findOne({ userId }); if (!profile) return error("Create your influencer profile first.", 409);
    const instagramUsername = cleanText(body.instagramUsername, 50, 2); if (!instagramUsername || !/^[A-Za-z0-9._]+$/.test(instagramUsername)) return error("Enter a valid Instagram username.");
    const requestId = new ObjectId();
    await db.collection("mp_verification_requests").insertOne({ _id: requestId, userId, instagramUsername, status: "pending", method: "manual_identity_review", note: "Manual review cannot verify follower counts. Authorized Meta API data is required for public eligibility.", createdAt: now });
    await db.collection("mp_influencers").updateOne({ userId }, { $set: { status: "pending", instagramUsername, updatedAt: now } });
    return json({ id: requestId.toHexString(), status: "pending", followerVerification: "not_verified" }, 201);
  }
  return null;
};
