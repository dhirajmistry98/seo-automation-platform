import { ObjectId } from "mongodb";
import { locationSearchTerm } from "@/lib/marketplace/india-cities";
import { RESPONSE_WINDOW_HOURS, isResponseOverdue, respondByFrom } from "@/lib/marketplace/booking-cart";
import { CAMPAIGN_CATEGORIES, COMPENSATION_TYPES, meetsFollowerMinimum, parseCampaign, parseProposedPrice } from "@/lib/marketplace/campaigns";
import { LISTABLE_CREATOR_STATUS, expireOverdueRequests, brandMembership, cleanText, isActiveCreator, notify, objectId, PACKAGE_BOOKING_KIND, profileTier } from "@/lib/marketplace/core";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, notBooking, agreePackageBooking } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { request, userId, path, db } = ctx;
  if (path[0] === "campaigns" && path.length === 1) {
    const mine = new URL(request.url).searchParams.get("mine") === "1";
    const memberIds = mine ? (await db.collection("mp_brand_members").find({ userId, status: "active" }, { projection: { brandId: 1 } }).toArray()).map((member) => member.brandId) : [];
    const params = new URL(request.url).searchParams;
    const filter: Record<string, unknown> = mine ? { brandId: { $in: memberIds }, ...notBooking } : { status: "open", deadline: { $gt: new Date() }, ...notBooking };
    if (!mine) {
      const category = CAMPAIGN_CATEGORIES.find((item) => item.toLowerCase() === (params.get("category") || "").toLowerCase());
      if (category) filter.category = category;
      const compensation = COMPENSATION_TYPES.find((item) => item === params.get("compensation"));
      if (compensation) filter.compensation = compensation;
      const city = locationSearchTerm(cleanText(params.get("location"), 80) || "");
      // Campaigns without a location are open to creators anywhere.
      if (city) filter.$and = [{ $or: [{ location: { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { location: "" }, { location: { $exists: false } }] }];
      const q = cleanText(params.get("q"), 80);
      if (q) filter.$or = [{ title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { brief: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }];
    }
    const items = await db.collection("mp_campaigns").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    const brandIds = [...new Map(items.map((item) => [String(item.brandId), item.brandId])).values()];
    const brandItems = brandIds.length ? await db.collection("mp_brands").find({ _id: { $in: brandIds }, ...(mine ? {} : { status: LISTABLE_CREATOR_STATUS }) }, { projection: { ownerId: 0 } }).toArray() : [];
    const brandById = new Map(brandItems.map((item) => [String(item._id), item]));
    const savedIds = new Set((await db.collection("mp_saved_campaigns").find({ userId, campaignId: { $in: items.map((item) => item._id) } }, { projection: { campaignId: 1 } }).toArray()).map((item) => String(item.campaignId)));
    const counts = mine && items.length ? new Map((await db.collection("mp_applications").aggregate([{ $match: { campaignId: { $in: items.map((item) => item._id) }, type: "application" } }, { $group: { _id: "$campaignId", count: { $sum: 1 } } }]).toArray()).map((row) => [String(row._id), Number(row.count)])) : new Map<string, number>();
    const campaigns = items.filter((item) => mine || brandById.has(String(item.brandId))).map((item) => ({ ...record(item), saved: savedIds.has(String(item._id)), ...(mine ? { applicationCount: counts.get(String(item._id)) ?? 0 } : {}), brand: brandById.has(String(item.brandId)) ? record(brandById.get(String(item.brandId))!) : null }));
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
      ...(typeof application.proposedPricePaise === "number" ? { proposedPricePaise: application.proposedPricePaise } : {}),
      influencer: applicantById.get(String(application.influencerId)) || null,
    }));
    return json({ campaign: { ...record(campaign), brand: publicBrand }, applications: applicationsWithProfiles, activity });
  }
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { userId, path, db, body, now } = ctx;
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
  if (path[0] === "campaigns" && path.length === 1) {
    const brandId = objectId(body.brandId); if (!brandId) return error("Select a brand.");
    const member = await brandMembership(db, brandId, userId); if (!member || !["owner", "admin", "editor"].includes(member.role)) return error("Brand edit access required.", 403);
    const brand = await db.collection("mp_brands").findOne({ _id: brandId, status: LISTABLE_CREATOR_STATUS });
    if (!brand) return error("This brand profile is paused and cannot publish campaigns.", 409);
    const parsedCampaign = parseCampaign(body, now);
    if ("error" in parsedCampaign) return error(parsedCampaign.error);
    const campaign = { _id: new ObjectId(), brandId, ...parsedCampaign.value, status: "open", currency: "INR", createdBy: userId, createdAt: now, updatedAt: now };
    await db.collection("mp_campaigns").insertOne(campaign);
    // Tell listed creators in this category (and city, when set) about the new opportunity.
    const city = locationSearchTerm(campaign.location);
    const matching = await db.collection("mp_influencers").find({ status: LISTABLE_CREATOR_STATUS, userId: { $ne: userId }, categories: { $regex: `^${campaign.category}$`, $options: "i" }, ...(city ? { location: { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}) }, { projection: { userId: 1, instagram: 1, status: 1, instagramHandle: 1 } }).limit(300).toArray();
    const eligible = matching.filter((creator) => isActiveCreator(creator) && meetsFollowerMinimum(campaign, (creator.instagram as { verifiedFollowers?: unknown } | undefined)?.verifiedFollowers));
    await Promise.all(eligible.map((creator) => notify(db, String(creator.userId), `New ${campaign.category} campaign`, `${String(brand.name)}: ${campaign.title}`, `/influencer-marketing/campaigns/${campaign._id}`)));
    return json({ campaign: record(campaign), notifiedCreators: eligible.length }, 201);
  }
  if (path[0] === "campaigns" && path[1] && path[2] === "apply") {
    const campaignId = objectId(path[1]); if (!campaignId) return error("Invalid campaign ID.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: campaignId, status: "open", deadline: { $gt: now }, ...notBooking });
    if (!campaign) return error("Campaign is closed.", 409);
    if (!(await db.collection("mp_brands").findOne({ _id: campaign.brandId, status: LISTABLE_CREATOR_STATUS }))) return error("Brand is unavailable.", 409);
    const influencer = await db.collection("mp_influencers").findOne({ userId });
    if (!influencer || !isActiveCreator(influencer)) return error("An approved influencer profile with a current Meta-verified Instagram connection is required.", 403);
    if (!meetsFollowerMinimum(campaign, (influencer.instagram as { verifiedFollowers?: unknown } | undefined)?.verifiedFollowers)) return error(`This campaign needs at least ${Number(campaign.minFollowers).toLocaleString("en-IN")} followers.`, 409);
    const pitch = cleanText(body.pitch, 1500, 20); if (!pitch) return error("Write a pitch of at least 20 characters.");
    const price = parseProposedPrice(body.proposedPricePaise, Number(campaign.budgetPaise) || 0);
    if ("error" in price) return error(price.error);
    try {
      const application = { _id: new ObjectId(), campaignId, brandId: campaign.brandId, influencerId: userId, type: "application", status: "pending", pitch, ...(price.value ? { proposedPricePaise: price.value } : {}), createdAt: now, updatedAt: now };
      await db.collection("mp_applications").insertOne(application);
      await notify(db, campaign.createdBy, "New campaign application", `${influencer.displayName} applied for ${campaign.title}.`, `/influencer-marketing/campaigns/${campaignId}`);
      return json({ application: record(application) }, 201);
    } catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("You already have an application or invitation for this campaign.", 409); throw caught; }
  }
  if (path[0] === "campaigns" && path[1] && path[2] === "invite") {
    const campaignId = objectId(path[1]); if (!campaignId) return error("Invalid campaign ID.");
    const campaign = await db.collection("mp_campaigns").findOne({ _id: campaignId, status: "open", deadline: { $gt: now }, ...notBooking });
    const member = campaign ? await brandMembership(db, campaign.brandId, userId) : null;
    if (!campaign || !member || !["owner", "admin", "editor"].includes(member.role) || !(await db.collection("mp_brands").findOne({ _id: campaign.brandId, status: LISTABLE_CREATOR_STATUS }))) return error("Campaign access required.", 403);
    const influencerProfileId = objectId(body.influencerProfileId); const influencer = influencerProfileId ? await db.collection("mp_influencers").findOne({ _id: influencerProfileId }) : null;
    if (!influencer || !isActiveCreator(influencer)) return error("Choose an approved, currently verified influencer.");
    const influencerId = String(influencer.userId);
    const message = cleanText(body.message, 1000, 10); if (!message) return error("Write an invitation message.");
    try {
      const invitation = { _id: new ObjectId(), campaignId, brandId: campaign.brandId, influencerId, type: "invitation", status: "invited", pitch: message, respondBy: respondByFrom(now), createdBy: userId, createdAt: now, updatedAt: now };
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
    if (isResponseOverdue(application, now)) { await expireOverdueRequests(db, now); return error(`This request expired: it was not answered within ${RESPONSE_WINDOW_HOURS} hours.`, 409); }
    if (path[2] === "accept") {
      const campaign = await db.collection("mp_campaigns").findOne({ _id: application.campaignId, status: "open" });
      const brand = await db.collection("mp_brands").findOne({ _id: application.brandId, status: LISTABLE_CREATOR_STATUS });
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
  return null;
};
