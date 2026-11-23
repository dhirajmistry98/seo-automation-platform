import { ObjectId } from "mongodb";
import { cleanText, isActiveCreator, notify, objectId } from "@/lib/marketplace/core";
import { razorpayRequest, RazorpayApiError } from "@/lib/marketplace/razorpay";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, records, admin } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { session, path, db } = ctx;
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
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { session, userId, path, db, body, now } = ctx;
  if (path[0] === "admin" && path[1] === "profiles" && path[2] && path[3] === "decision") {
    if (!admin(session.user.email)) return error("Admin access required.", 403);
    const id = objectId(path[2]); const kind = body.kind; const decision = body.decision;
    if (!id || !["brand", "influencer"].includes(String(kind)) || !["approved", "rejected", "suspended"].includes(String(decision))) return error("Invalid profile decision.");
    const collection = db.collection(kind === "brand" ? "mp_brands" : "mp_influencers");
    const profile = await collection.findOne({ _id: id }); if (!profile) return error("Profile not found.", 404);
    if (kind === "influencer" && decision === "approved" && !isActiveCreator({ ...profile, status: "approved" })) return error("Creator approval requires a current Meta verification of the Instagram username on the profile.", 409);
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
    await notify(db, updated.userId, "Identity review update", `${note} Official follower verification remains separate.`, "/influencer-marketing/creator");
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
  return null;
};
