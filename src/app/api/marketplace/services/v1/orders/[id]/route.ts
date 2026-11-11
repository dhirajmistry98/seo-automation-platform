import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ id: string }> };
type Body = Record<string, unknown>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const objectId = (value: string) => /^[\da-f]{24}$/i.test(value) ? new ObjectId(value) : null;
const clean = (value: unknown, max: number, min = 1) => {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned.length >= min ? cleaned : "";
};
function isAdmin(email?: string | null) { return !!email && (process.env.MARKETPLACE_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase()); }
function visible(doc: Record<string, unknown>) { const result = { ...doc }; for (const key of ["clientUserId", "expertUserId", "providerPaymentId"]) delete result[key]; return result; }

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Authentication required." }, 401);
  const { id } = await context.params;
  const _id = objectId(id);
  if (!_id) return reply({ error: "Invalid service order." }, 400);
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const order = await db.collection("service_orders").findOne({ _id, $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] });
  if (!order) return reply({ error: "Service order not found." }, 404);
  const [plan, deliverables, revisions, review, dispute, refunds, payout] = await Promise.all([
    db.collection("service_milestone_plans").findOne({ orderId: _id }, { projection: { _id: 0 } }),
    db.collection("service_deliverables").find({ orderId: _id }, { projection: { uploadedBy: 0 } }).sort({ createdAt: -1 }).limit(30).toArray(),
    db.collection("service_revisions").find({ orderId: _id }, { projection: { requestedBy: 0 } }).sort({ createdAt: -1 }).limit(30).toArray(),
    db.collection("service_reviews").findOne({ orderId: _id }, { projection: { reviewerId: 0 } }),
    db.collection("service_disputes").findOne({ orderId: _id, status: { $in: ["open", "under_review"] } }, { projection: { openedBy: 0, resolvedBy: 0 } }),
    db.collection("service_refunds").find({ orderId: _id }, { projection: { _id: 0, requestKey: 0, paymentId: 0 } }).sort({ createdAt: -1 }).limit(20).toArray(),
    db.collection("service_payout_requests").findOne({ orderId: _id }, { projection: { _id: 0, expertUserId: 0, beneficiary: 0 } }),
  ]);
  const safeOrder = { ...order, _id: String(order._id), requestId: String(order.requestId), proposalId: String(order.proposalId) };
  for (const key of ["clientUserId", "expertUserId", "razorpayPaymentId", "razorpayOrderId", "commissionBps"]) delete (safeOrder as Record<string, unknown>)[key];
  return reply({ order: safeOrder, milestonePlan: plan, deliverables: deliverables.map((item) => ({ ...item, _id: String(item._id) })), revisions: revisions.map((item) => ({ ...item, _id: String(item._id) })), review: review ? visible({ ...review, _id: String(review._id) }) : null, dispute: dispute ? visible({ ...dispute, _id: String(dispute._id) }) : null, refunds, payout });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Authentication required." }, 401);
  const parsed = await readJsonLimited<Body>(request, 8_000);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return reply({ error: "Invalid service order request." }, parsed.ok ? 400 : parsed.status);
  const { id } = await context.params;
  const _id = objectId(id);
  if (!_id) return reply({ error: "Invalid service order." }, 400);
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "service-order-action", session.user.id, 30, 60_000);
  if (!limit.allowed) return reply({ error: "Too many order updates. Try again shortly." }, 429);
  const body = parsed.value;
  const action = typeof body.action === "string" ? body.action : "";
  if (!marketplacePaymentsEnabled() && action === "request_payout") return reply({ error: "Payout setup is disabled while payment operations are being prepared." }, 503);
  const now = new Date();
  let order = await db.collection("service_orders").findOne({ _id, $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] });

  if (action === "resolve_dispute") {
    if (!isAdmin(session.user.email)) return reply({ error: "Marketplace administrator access required." }, 403);
    order = await db.collection("service_orders").findOne({ _id });
    if (!order) return reply({ error: "Service order not found." }, 404);
    const decision = body.decision === "client_favor" ? "client_favor" : body.decision === "expert_favor" ? "expert_favor" : "";
    const note = clean(body.note, 1000, 20);
    if (!decision || note.length < 20) return reply({ error: "Choose a resolution and provide at least 20 characters of reasoning." }, 400);
    const dispute = await db.collection("service_disputes").findOne({ orderId: _id, status: { $in: ["open", "under_review"] } });
    if (!dispute) return reply({ error: "No open dispute exists for this order." }, 409);
    await db.collection("service_disputes").updateOne({ _id: dispute._id, status: { $in: ["open", "under_review"] } }, { $set: { status: "resolved", decision, resolutionNote: note, resolvedBy: session.user.id, resolvedAt: now, updatedAt: now } });
    const resultingStatus = decision === "expert_favor" ? (order.disputedPreviousStatus === "completed" ? "completed" : "in_progress") : "refund_review_required";
    const pendingRefunds = await db.collection("service_refunds").countDocuments({ orderId: _id, status: { $in: ["processing", "pending", "reconciliation_required", "provider_rejected"] } });
    const canRequestPayout = decision === "expert_favor" && !Number(order.refundedPaise || 0) && !pendingRefunds;
    await db.collection("service_orders").updateOne({ _id, status: "disputed" }, { $set: { status: resultingStatus, payoutStatus: canRequestPayout ? "awaiting_route_setup" : "on_hold", disputeResolution: decision, updatedAt: now } });
    if (canRequestPayout) await db.collection("service_payout_requests").updateOne({ orderId: _id, status: "on_hold" }, { $set: { status: "awaiting_route_setup", updatedAt: now } });
    else await db.collection("service_payout_requests").updateOne({ orderId: _id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "dispute.resolved", decision, createdAt: now });
    await db.collection("notifications").insertMany([{ userId: order.clientUserId, title: "Project dispute reviewed", message: `The marketplace administrator recorded a dispute decision: ${decision.replaceAll("_", " ")}.`, href: "/marketplace/services", type: "marketplace", createdAt: now }, { userId: order.expertUserId, title: "Project dispute reviewed", message: `The marketplace administrator recorded a dispute decision: ${decision.replaceAll("_", " ")}.`, href: "/marketplace/services", type: "marketplace", createdAt: now }]);
    return reply({ resolved: true, decision });
  }
  if (!order) return reply({ error: "Service order not found." }, 404);
  const role = order.clientUserId === session.user.id ? "client" : "expert";

  if (action === "submit_delivery") {
    if (role !== "expert" || order.paymentStatus !== "captured" || order.status !== "in_progress") return reply({ error: "Only the assigned expert can submit work on an active funded order." }, 403);
    const note = clean(body.note, 3000, 20);
    const ids = Array.isArray(body.fileIds) && body.fileIds.length <= 10 ? body.fileIds.filter((item): item is string => typeof item === "string" && /^[\da-f]{24}$/i.test(item)) : [];
    if (ids.length !== (Array.isArray(body.fileIds) ? body.fileIds.length : 0) || (!note || note.length < 20) && !ids.length) return reply({ error: "Describe the completed work or attach up to 10 project files." }, 400);
    const requestRecord = await db.collection("service_requests").findOne({ _id: order.requestId, expertUserId: session.user.id, status: "accepted" });
    const attachments = Array.isArray(requestRecord?.attachments) ? requestRecord.attachments as Array<Record<string, unknown>> : [];
    const files = attachments.filter((file) => ids.includes(String(file.id)) && file.uploadedBy === session.user.id).map((file) => ({ id: String(file.id), name: String(file.name || "Project file").slice(0, 120), type: String(file.type || "application/octet-stream"), size: Number(file.size) || 0 }));
    if (files.length !== ids.length) return reply({ error: "One or more delivery files are not attached by you to this project." }, 403);
    const plan = await db.collection("service_milestone_plans").findOne({ orderId: _id, status: "approved" });
    const milestone = plan?.milestones?.find((item: Record<string, unknown>) => item.status === "in_progress");
    if (!plan || !milestone) return reply({ error: "There is no active milestone ready for delivery." }, 409);
    const deliverableId = new ObjectId();
    const deliverable = { _id: deliverableId, orderId: _id, requestId: order.requestId, milestoneId: milestone.id, submittedBy: session.user.id, note: note || "Work files submitted for review.", files, status: "submitted", revision: Number(milestone.revisionCount) || 0, createdAt: now };
    await db.collection("service_deliverables").insertOne(deliverable);
    await db.collection("service_milestone_plans").updateOne({ _id: plan._id, milestones: { $elemMatch: { id: milestone.id, status: "in_progress" } } }, { $set: { "milestones.$.status": "submitted", "milestones.$.latestDeliverableId": deliverableId, "milestones.$.submittedAt": now, updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "delivery.submitted", deliverableId, createdAt: now });
    await db.collection("notifications").insertOne({ userId: order.clientUserId, title: "Work submitted for review", message: "Your service expert submitted a project delivery.", href: "/marketplace/services", type: "marketplace", createdAt: now });
    return reply({ deliverable: visible({ ...deliverable, _id: String(deliverableId) }) }, 201);
  }

  if (action === "request_revision") {
    if (role !== "client" || order.status !== "in_progress") return reply({ error: "Only the client can request revisions on an active project." }, 403);
    const note = clean(body.note, 1500, 20);
    if (note.length < 20) return reply({ error: "Explain the revision needed in at least 20 characters." }, 400);
    const plan = await db.collection("service_milestone_plans").findOne({ orderId: _id, status: "approved" });
    const milestone = plan?.milestones?.find((item: Record<string, unknown>) => item.status === "submitted");
    if (!plan || !milestone) return reply({ error: "There is no submitted milestone to revise." }, 409);
    if (Number(milestone.revisionCount || 0) >= 3) return reply({ error: "This milestone has reached its three revision limit. Open a dispute if you need administrator review." }, 409);
    const revisionId = new ObjectId();
    await db.collection("service_revisions").insertOne({ _id: revisionId, orderId: _id, requestId: order.requestId, milestoneId: milestone.id, deliverableId: milestone.latestDeliverableId, requestedBy: session.user.id, note, sequence: Number(milestone.revisionCount || 0) + 1, status: "requested", createdAt: now });
    await db.collection("service_milestone_plans").updateOne({ _id: plan._id, milestones: { $elemMatch: { id: milestone.id, status: "submitted", revisionCount: { $lt: 3 } } } }, { $set: { "milestones.$.status": "in_progress", "milestones.$.revisionRequestedAt": now, updatedAt: now }, $inc: { "milestones.$.revisionCount": 1 } });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "revision.requested", revisionId, createdAt: now });
    await db.collection("notifications").insertOne({ userId: order.expertUserId, title: "Revision requested", message: "The client requested a revision to your project delivery.", href: "/marketplace/services", type: "marketplace", createdAt: now });
    return reply({ revisionId: String(revisionId), status: "requested" }, 201);
  }

  if (action === "approve_delivery") {
    if (role !== "client" || order.status !== "in_progress") return reply({ error: "Only the client can approve work on an active project." }, 403);
    const plan = await db.collection("service_milestone_plans").findOne({ orderId: _id, status: "approved" });
    const milestone = plan?.milestones?.find((item: Record<string, unknown>) => item.status === "submitted");
    if (!plan || !milestone) return reply({ error: "No submitted delivery is waiting for approval." }, 409);
    const planUpdate = await db.collection("service_milestone_plans").updateOne({ _id: plan._id, milestones: { $elemMatch: { id: milestone.id, status: "submitted" } } }, { $set: { "milestones.$.status": "accepted", "milestones.$.acceptedAt": now, status: "completed", updatedAt: now } });
    if (!planUpdate.modifiedCount) return reply({ error: "The milestone changed. Refresh the order and try again." }, 409);
    await db.collection("service_orders").updateOne({ _id, status: "in_progress", paymentStatus: "captured" }, { $set: { status: "completed", orderStatus: "completed", completedAt: now, payoutStatus: "awaiting_route_setup", updatedAt: now } });
    await db.collection("service_requests").updateOne({ _id: order.requestId, status: "accepted" }, { $set: { status: "completed", orderStatus: "completed", completedAt: now, updatedAt: now } });
    await db.collection("service_financial_ledger").updateOne({ orderId: _id, entryType: "service_completed" }, { $setOnInsert: { _id: new ObjectId(), orderId: _id, requestId: order.requestId, entryType: "service_completed", grossPaise: order.amountPaise, commissionBps: order.commissionBps, createdAt: now } }, { upsert: true });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "order.completed", createdAt: now });
    await db.collection("notifications").insertOne({ userId: order.expertUserId, title: "Project approved", message: "The client approved your project delivery. Payout setup may still be required.", href: "/marketplace/services", type: "marketplace", createdAt: now });
    return reply({ completed: true, payoutStatus: "awaiting_route_setup" });
  }

  if (action === "open_dispute") {
    if (order.paymentStatus !== "captured" || !["in_progress", "completed"].includes(String(order.status))) return reply({ error: "A dispute can only be opened on a funded active or completed order." }, 409);
    const note = clean(body.note, 2000, 30);
    if (note.length < 30) return reply({ error: "Explain the dispute in at least 30 characters." }, 400);
    const existing = await db.collection("service_disputes").findOne({ orderId: _id, status: { $in: ["open", "under_review"] } });
    if (existing) return reply({ disputeId: String(existing._id), status: existing.status });
    const disputeId = new ObjectId();
    try { await db.collection("service_disputes").insertOne({ _id: disputeId, orderId: _id, requestId: order.requestId, openedBy: session.user.id, role, reason: note, status: "open", createdAt: now, updatedAt: now }); }
    catch (caught) { if (!(typeof caught === "object" && caught && "code" in caught && caught.code === 11000)) throw caught; return reply({ error: "A dispute is already open for this order." }, 409); }
    await db.collection("service_orders").updateOne({ _id, status: order.status }, { $set: { status: "disputed", disputedPreviousStatus: order.status, payoutStatus: "on_hold", disputedAt: now, updatedAt: now } });
    await db.collection("service_payout_requests").updateOne({ orderId: _id, status: { $in: ["awaiting_route_setup", "queued"] } }, { $set: { status: "on_hold", updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "dispute.opened", disputeId, createdAt: now });
    const other = role === "client" ? order.expertUserId : order.clientUserId;
    await db.collection("notifications").insertOne({ userId: other, title: "Project dispute opened", message: "A participant asked the marketplace administrator to review this project.", href: "/marketplace/services", type: "marketplace", createdAt: now });
    return reply({ disputeId: String(disputeId), status: "open" }, 201);
  }

  if (action === "review") {
    if (role !== "client" || order.status !== "completed") return reply({ error: "Only the client can review a completed project." }, 403);
    const rating = body.rating;
    const comment = clean(body.comment, 1200, 10);
    if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5 || comment.length < 10) return reply({ error: "Choose a 1–5 star rating and write at least 10 characters." }, 400);
    const reviewId = new ObjectId();
    try { await db.collection("service_reviews").insertOne({ _id: reviewId, orderId: _id, requestId: order.requestId, expertUserId: order.expertUserId, reviewerId: session.user.id, rating: Number(rating), comment, status: "published", createdAt: now }); }
    catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return reply({ error: "A review has already been submitted for this project." }, 409); throw caught; }
    await db.collection("service_experts").updateOne({ userId: order.expertUserId }, [{ $set: { reviewCount: { $add: [{ $ifNull: ["$reviewCount", 0] }, 1] }, ratingTotal: { $add: [{ $ifNull: ["$ratingTotal", 0] }, Number(rating)] } } }, { $set: { ratingAverage: { $divide: ["$ratingTotal", "$reviewCount"] }, updatedAt: now } }]);
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "review.submitted", reviewId, createdAt: now });
    await db.collection("notifications").insertOne({ userId: order.expertUserId, title: "New project review", message: "The client left a review for your completed project.", href: "/marketplace/services", type: "marketplace", createdAt: now });
    return reply({ review: { rating: Number(rating), comment, createdAt: now } }, 201);
  }

  if (action === "request_payout") {
    if (role !== "expert" || order.status !== "completed" || order.payoutStatus === "on_hold") return reply({ error: "Only the assigned expert can request payout for a completed, undisputed project." }, 403);
    const grossPaise = Number(order.amountPaise);
    const bps = Number(order.commissionBps);
    if (!Number.isSafeInteger(grossPaise) || !Number.isInteger(bps) || bps < 0 || bps > 3000) return reply({ error: "The payout ledger is unavailable until checkout commission is recorded." }, 409);
    const netPaise = grossPaise - Math.round(grossPaise * bps / 10_000);
    const payout = { _id: new ObjectId(), orderId: _id, requestId: order.requestId, expertUserId: session.user.id, grossPaise, commissionBps: bps, netPaise, currency: "INR", status: "awaiting_route_setup", createdAt: now, updatedAt: now };
    try { await db.collection("service_payout_requests").insertOne(payout); }
    catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) { const prior = await db.collection("service_payout_requests").findOne({ orderId: _id }); return reply({ payout: prior ? visible({ ...prior, _id: String(prior._id) }) : null }); } throw caught; }
    await db.collection("service_orders").updateOne({ _id, status: "completed", payoutStatus: { $ne: "on_hold" } }, { $set: { payoutStatus: "awaiting_route_setup", payoutRequestedAt: now, updatedAt: now } });
    await db.collection("service_financial_ledger").updateOne({ orderId: _id, entryType: "payout_requested" }, { $setOnInsert: { _id: new ObjectId(), orderId: _id, expertUserId: session.user.id, grossPaise, commissionBps: bps, netPaise, currency: "INR", entryType: "payout_requested", createdAt: now } }, { upsert: true });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "payout.requested", createdAt: now });
    return reply({ payout: visible({ ...payout, _id: String(payout._id) }), message: "Payout request is recorded. Route onboarding, KYC, and merchant approval are required before funds can be transferred." }, 201);
  }

  return reply({ error: "Unsupported order action." }, 400);
}
