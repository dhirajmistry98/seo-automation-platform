import { ObjectId, type Document } from "mongodb";
import { MAX_CART_ITEMS, RESPONSE_WINDOW_HOURS, summarizeCart, type CartPackage } from "@/lib/marketplace/booking-cart";
import { LISTABLE_CREATOR_STATUS, inrPaise, isActiveCreator, objectId, profileTier } from "@/lib/marketplace/core";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, notBooking, createPackageBooking } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { userId, path, db } = ctx;
  if (path[0] === "booking-cart" && path.length === 1) {
    const items = await db.collection("mp_booking_cart").find({ userId }).sort({ createdAt: 1 }).limit(MAX_CART_ITEMS).toArray();
    const profiles = items.length ? new Map((await db.collection("mp_influencers").find({ _id: { $in: [...new Set(items.map((item) => String(item.influencerProfileId)))].map((value) => new ObjectId(value)) } }).toArray()).map((profile) => [String(profile._id), profile])) : new Map<string, Document>();
    const packages: CartPackage[] = []; const unavailable: string[] = [];
    for (const item of items) {
      const profile = profiles.get(String(item.influencerProfileId)); const selected = profile && Array.isArray(profile.packages) ? (profile.packages as Document[])[Number(item.packageIndex)] : null; const price = inrPaise(selected?.pricePaise);
      if (!profile || !selected || price === null || price < 100 || !isActiveCreator(profile)) { unavailable.push(String(item._id)); continue; }
      packages.push({ itemId: String(item._id), creatorId: String(profile._id), creatorName: String(profile.displayName || "Creator"), packageIndex: Number(item.packageIndex), title: String(selected.title || "Package"), pricePaise: price, deliveryDays: Number.isInteger(selected.deliveryDays) ? Number(selected.deliveryDays) : null });
    }
    if (unavailable.length) await db.collection("mp_booking_cart").deleteMany({ userId, _id: { $in: unavailable.map((value) => new ObjectId(value)) } });
    const pictures = new Map([...profiles.values()].map((profile) => [String(profile._id), String((profile.instagram as { profilePictureUrl?: unknown } | undefined)?.profilePictureUrl || "")]));
    const summary = summarizeCart(packages);
    return json({ ...summary, creators: summary.creators.map((group) => ({ ...group, picture: pictures.get(group.creatorId) || null })), removedUnavailable: unavailable.length, respondWithinHours: RESPONSE_WINDOW_HOURS });
  }
  if (path[0] === "saved-campaigns" && path.length === 1) {
    const saved = await db.collection("mp_saved_campaigns").find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
    const items = saved.length ? await db.collection("mp_campaigns").find({ _id: { $in: saved.map((item) => item.campaignId) }, ...notBooking }).toArray() : [];
    const brandIds = [...new Map(items.map((item) => [String(item.brandId), item.brandId])).values()];
    const brands = brandIds.length ? new Map((await db.collection("mp_brands").find({ _id: { $in: brandIds } }, { projection: { name: 1, location: 1, category: 1 } }).toArray()).map((brand) => [String(brand._id), record(brand)])) : new Map();
    const byId = new Map(items.map((item) => [String(item._id), item]));
    const campaigns = saved.flatMap((entry) => { const item = byId.get(String(entry.campaignId)); if (!item) return []; const open = item.status === "open" && item.deadline instanceof Date && item.deadline.getTime() > Date.now(); return [{ ...record(item), saved: true, open, savedAt: entry.createdAt, brand: brands.get(String(item.brandId)) ?? null }]; });
    return json({ campaigns });
  }
  if (path[0] === "cart" && path.length === 1) {
    const cartItems = await db.collection("mp_cart_items").find({ userId }).sort({ createdAt: -1 }).limit(30).toArray();
    const creatorIds = cartItems.map((item) => item.influencerId).filter((id): id is ObjectId => id instanceof ObjectId);
    const profiles = creatorIds.length ? await db.collection("mp_influencers").find({ _id: { $in: creatorIds }, status: LISTABLE_CREATOR_STATUS }, { projection: { userId: 0, verificationNotes: 0, "instagram.providerUserId": 0 } }).toArray() : [];
    const profilesById = new Map(profiles.filter(isActiveCreator).map((profile) => [String(profile._id), { ...record(profile), tier: profileTier(profile) }]));
    const items = cartItems.flatMap((item) => {
      const influencer = item.influencerId instanceof ObjectId ? profilesById.get(String(item.influencerId)) : null;
      return influencer ? [{ id: String(item._id), addedAt: item.createdAt, creatorId: String(influencer._id), influencer }] : [];
    });
    return json({ items, total: items.length });
  }
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { userId, path, db, body, now } = ctx;
  if (path[0] === "booking-cart" && path.length === 1) {
    const influencerProfileId = objectId(body.influencerProfileId); if (!influencerProfileId) return error("Choose a creator package.");
    const packageIndex = body.packageIndex;
    const influencer = await db.collection("mp_influencers").findOne({ _id: influencerProfileId });
    if (!influencer || influencer.userId === userId || !isActiveCreator(influencer)) return error("This creator is not available for booking.", 409);
    const packages = Array.isArray(influencer.packages) ? influencer.packages as Document[] : [];
    if (!Number.isInteger(packageIndex) || Number(packageIndex) < 0 || Number(packageIndex) >= packages.length || (inrPaise(packages[Number(packageIndex)]?.pricePaise) ?? 0) < 100) return error("Choose one of the creator's packages.");
    if (await db.collection("mp_booking_cart").countDocuments({ userId }) >= MAX_CART_ITEMS) return error(`Your cart holds up to ${MAX_CART_ITEMS} packages. Check out or remove some first.`, 409);
    const result = await db.collection("mp_booking_cart").updateOne({ userId, influencerProfileId, packageIndex: Number(packageIndex) }, { $setOnInsert: { userId, influencerProfileId, packageIndex: Number(packageIndex), createdAt: now } }, { upsert: true });
    return json({ added: result.upsertedCount > 0, count: await db.collection("mp_booking_cart").countDocuments({ userId }) }, 201);
  }
  if (path[0] === "booking-cart" && path[1] === "checkout" && path.length === 2) {
    const items = await db.collection("mp_booking_cart").find({ userId }).sort({ createdAt: 1 }).toArray();
    if (!items.length) return error("Your cart is empty.");
    const byCreator = new Map<string, { influencerProfileId: ObjectId; packageIndexes: number[]; itemIds: ObjectId[] }>();
    for (const item of items) { const key = String(item.influencerProfileId); const group: { influencerProfileId: ObjectId; packageIndexes: number[]; itemIds: ObjectId[] } = byCreator.get(key) ?? { influencerProfileId: item.influencerProfileId, packageIndexes: [], itemIds: [] }; group.packageIndexes.push(Number(item.packageIndex)); group.itemIds.push(item._id); byCreator.set(key, group); }
    const sent: Array<Record<string, unknown>> = []; const failed: Array<{ creator: string; error: string }> = [];
    for (const group of byCreator.values()) {
      const result = await createPackageBooking(db, { userId, brandId: body.brandId, influencerProfileId: group.influencerProfileId, packageIndexes: group.packageIndexes, brief: body.brief, deadline: body.deadline, usageRights: body.usageRights, message: body.message, now });
      if ("error" in result) { if (result.status === 400 || result.status === 403) return error(result.error, result.status); failed.push({ creator: result.creatorName || "A creator", error: result.error }); continue; }
      sent.push(record(result.booking) ?? {});
      await db.collection("mp_booking_cart").deleteMany({ userId, _id: { $in: group.itemIds } });
    }
    return json({ sent, failed, respondWithinHours: RESPONSE_WINDOW_HOURS }, sent.length ? 201 : 409);
  }
  if (path[0] === "saved-campaigns" && path.length === 1) {
    const campaignId = objectId(body.campaignId); if (!campaignId) return error("Choose a valid campaign.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: campaignId, ...notBooking }, { projection: { _id: 1 } });
    if (!campaign) return error("This campaign is no longer available.", 404);
    if (await db.collection("mp_saved_campaigns").countDocuments({ userId }) >= 100) return error("You have saved 100 campaigns. Remove some before saving more.", 409);
    await db.collection("mp_saved_campaigns").updateOne({ userId, campaignId }, { $setOnInsert: { userId, campaignId, createdAt: now } }, { upsert: true });
    return json({ saved: true }, 201);
  }
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
  return null;
};
