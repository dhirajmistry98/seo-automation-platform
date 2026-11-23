import { ObjectId } from "mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { cleanText, collaborationAccess, inrPaise, notify, objectId, safeUrl } from "@/lib/marketplace/core";
import { queueMarketplaceEvent } from "@/lib/marketplace/realtime";
import { getRazorpayConfig, marketplaceCommissionBps, razorpayRequest, verifyRazorpayHmac } from "@/lib/marketplace/razorpay";
import { recordCapturedCampaignPayment, type CampaignCapturedPayment } from "@/lib/marketplace/campaign-payments";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, records, parseReviewScores } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { userId, path, db } = ctx;
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
    return json({ collaboration: record(access.collaboration), viewerRole: access.role, offers: records(offers), deliverables: records(deliverables), reviews: records(reviews), agreement: record(agreement), order: record(order) });
  }
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { session, userId, path, db, body, now } = ctx;
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
      const comment = cleanText(body.comment, 1000, 10);
      // Brands rate creators on communication, timeliness and satisfaction; the overall rating is their average.
      const scores = access.role === "brand" ? parseReviewScores(body) : null;
      if (access.role === "brand" && !scores) return error("Rate communication, timeliness and satisfaction from 1 to 5.");
      const rating = scores ? Math.round((scores.communication + scores.timeliness + scores.satisfaction) / 3) : body.rating;
      if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5 || !comment) return error("Give a rating from 1 to 5 and a comment of at least 10 characters.");
      try { const review = { _id: new ObjectId(), collaborationId: id, reviewerId: userId, reviewedRole: access.role === "brand" ? "influencer" : "brand", rating, ...(scores ? { scores } : {}), comment, createdAt: now }; await db.collection("mp_reviews").insertOne(review); return json({ review: record(review) }, 201); }
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
  return null;
};
