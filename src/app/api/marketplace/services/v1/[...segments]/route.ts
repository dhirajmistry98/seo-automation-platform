import { ObjectId, type Document } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { cleanServiceListing, cleanServiceProfile, cleanServiceProposal, cleanServiceRequest, ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ segments: string[] }> };
type Body = Record<string, unknown>;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status = 400) => json({ error: message }, status);
const id = (value: unknown) => typeof value === "string" && /^[\da-f]{24}$/i.test(value) ? new ObjectId(value) : null;
const str = (value: unknown) => typeof value === "string" ? value : "";
const safeDoc = (item: Document) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value instanceof ObjectId ? String(value) : value]));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function isMarketplaceAdmin(email?: string | null) {
  return !!email && (process.env.MARKETPLACE_ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

function requestForParticipant(item: Document, userId: string) {
  const result = safeDoc(item);
  delete result.clientUserId;
  delete result.expertUserId;
  if (Array.isArray(result.attachments)) {
    result.attachments = result.attachments.map((attachment) => {
      if (!attachment || typeof attachment !== "object") return attachment;
      const safe = { ...(attachment as Record<string, unknown>) };
      safe.uploadedByMe = safe.uploadedBy === userId;
      delete safe.uploadedBy;
      return safe;
    });
  }
  return result;
}

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const userId = session.user.id;
  const path = (await context.params).segments;
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);

  if (path.length === 1 && path[0] === "listings") {
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim().slice(0, 80) || "";
    const category = params.get("category")?.trim().slice(0, 60) || "";
    const skip = Math.min(10_000, Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0));
    const filter: Record<string, unknown> = { status: "active", expertUserId: { $ne: userId } };
    if (category) filter.category = category;
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ title: regex }, { summary: regex }, { description: regex }, { category: regex }];
    }
    const [items, total] = await Promise.all([
      db.collection("service_listings").find(filter, { projection: { expertUserId: 1, title: 1, summary: 1, description: 1, category: 1, deliveryDays: 1, pricePaise: 1, currency: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(24).toArray(),
      db.collection("service_listings").countDocuments(filter),
    ]);
    const expertIds = [...new Set(items.map((item) => str(item.expertUserId)))];
    const profiles = expertIds.length ? await db.collection("service_experts").find({ userId: { $in: expertIds }, status: "approved" }, { projection: { userId: 1, displayName: 1, headline: 1, specialties: 1, location: 1, experienceYears: 1, portfolio: 1, website: 1 } }).toArray() : [];
    const profileByUser = new Map(profiles.map((profile) => [str(profile.userId), profile]));
    const listings = items.flatMap((item) => {
      const profile = profileByUser.get(str(item.expertUserId));
      if (!profile || str(item.expertUserId) === userId) return [];
      const visible = safeDoc(item);
      delete visible.expertUserId;
      return [{ ...visible, expert: { displayName: profile.displayName, headline: profile.headline, specialties: profile.specialties, location: profile.location, experienceYears: profile.experienceYears, portfolio: profile.portfolio, website: profile.website } }];
    });
    return json({ listings, total, hasMore: skip + items.length < total, nextSkip: skip + items.length });
  }

  if (path.length === 1 && path[0] === "overview") {
    const [profile, listings, outgoing, incoming] = await Promise.all([
      db.collection("service_experts").findOne({ userId }),
      db.collection("service_listings").find({ expertUserId: userId }).sort({ createdAt: -1 }).limit(30).toArray(),
      db.collection("service_requests").find({ clientUserId: userId }).sort({ updatedAt: -1 }).limit(50).toArray(),
      db.collection("service_requests").find({ expertUserId: userId }).sort({ updatedAt: -1 }).limit(50).toArray(),
    ]);
    const requestIds = [...new Set([...outgoing, ...incoming].map((item) => item._id))];
    const outgoingIds = outgoing.map((item) => item._id);
    const proposals = requestIds.length ? await db.collection("service_proposals").find({ requestId: { $in: requestIds }, $or: [{ expertUserId: userId }, { requestId: { $in: outgoingIds } }] }).sort({ createdAt: -1 }).limit(200).toArray() : [];
    const orders = requestIds.length ? await db.collection("service_orders").find({ requestId: { $in: requestIds }, $or: [{ clientUserId: userId }, { expertUserId: userId }] }, { projection: { _id: 1, requestId: 1, status: 1, paymentStatus: 1, checkoutState: 1, amountPaise: 1, currency: 1, payoutStatus: 1, completedAt: 1 } }).toArray() : [];
    const orderByRequest = new Map(orders.map((order) => [String(order.requestId), { ...safeDoc(order), _id: String(order._id) }]));
    const proposalGroups = new Map<string, Document[]>();
    for (const proposal of proposals) {
      const key = String(proposal.requestId);
      const visible = { ...safeDoc(proposal) };
      delete visible.expertUserId;
      proposalGroups.set(key, [...(proposalGroups.get(key) || []), visible]);
    }
    const withProposals = (items: Document[]) => items.map((item) => ({ ...requestForParticipant(item, userId), proposals: proposalGroups.get(String(item._id)) || [], order: orderByRequest.get(String(item._id)) || null }));
    return json({
      profile: profile ? (() => { const safe = safeDoc(profile); delete safe.userId; return safe; })() : null,
      listings: listings.map((item) => { const result = safeDoc(item); delete result.expertUserId; return result; }),
      outgoing: withProposals(outgoing),
      incoming: withProposals(incoming),
      admin: isMarketplaceAdmin(session.user.email),
    });
  }

  if (path[0] === "requests" && path[1] && path.length === 2) {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const item = await db.collection("service_requests").findOne({ _id: requestId, $or: [{ clientUserId: userId }, { expertUserId: userId }] });
    if (!item) return error("Service request not found.", 404);
    const role = item.clientUserId === userId ? "client" : "expert";
    const proposals = await db.collection("service_proposals").find({ requestId, ...(role === "expert" ? { expertUserId: userId } : {}) }).sort({ createdAt: -1 }).limit(50).toArray();
    const result = proposals.map((proposal) => { const safe = safeDoc(proposal); delete safe.expertUserId; return safe; });
    return json({ request: requestForParticipant(item, userId), proposals: result });
  }

  if (path.length === 3 && path[0] === "requests" && path[2] === "messages") {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const item = await db.collection("service_requests").findOne({
      _id: requestId,
      $or: [{ clientUserId: userId }, { expertUserId: userId }],
    });
    if (!item) return error("Service request not found.", 404);
    const records = await db.collection("service_messages").find({ requestId }).sort({ createdAt: -1 }).limit(100).toArray();
    const messages = records.reverse().map((record) => {
      const visible = safeDoc(record);
      delete visible.senderId;
      delete visible.clientId;
      return { ...visible, mine: record.senderId === userId };
    });
    return json({ messages });
  }

  if (path.length === 1 && path[0] === "admin") {
    if (!isMarketplaceAdmin(session.user.email)) return error("Marketplace administrator access required.", 403);
    const [experts, listings] = await Promise.all([
      db.collection("service_experts").find({ status: { $in: ["pending_review", "approved", "rejected", "suspended"] } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_listings").find({ status: { $in: ["pending_review", "active", "rejected", "suspended"] } }).sort({ updatedAt: -1 }).limit(100).toArray(),
    ]);
    return json({ experts: experts.map((item) => { const safe = safeDoc(item); delete safe.userId; return safe; }), listings: listings.map((item) => { const safe = safeDoc(item); delete safe.expertUserId; return safe; }) });
  }
  if (path.length === 2 && path[0] === "admin" && path[1] === "orders") {
    if (!isMarketplaceAdmin(session.user.email)) return error("Marketplace administrator access required.", 403);
    const [orders, disputes, payouts, refunds, ledger, providerDisputes, anomalies] = await Promise.all([
      db.collection("service_orders").find({}).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_disputes").find({ status: { $in: ["open", "under_review", "resolved"] } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_payout_requests").find({}).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_refunds").find({}).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_financial_ledger").find({}).sort({ createdAt: -1 }).limit(200).toArray(),
      db.collection("provider_payment_disputes").find({}).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection("service_payment_anomalies").find({}, { projection: { expectedPaymentId: 0, observedPaymentId: 0 } }).sort({ createdAt: -1 }).limit(100).toArray(),
    ]);
    const redact = (item: Document) => { const safe = safeDoc(item); for (const key of ["razorpayOrderId", "razorpayPaymentId", "paymentId", "accessTokenEncrypted", "beneficiary"]) delete safe[key]; return safe; };
    return json({ orders: orders.map(redact), disputes: disputes.map(redact), payouts: payouts.map(redact), refunds: refunds.map(redact), ledger: ledger.map(redact), providerDisputes: providerDisputes.map(redact), anomalies: anomalies.map(redact) });
  }
  return error("Service marketplace endpoint not found.", 404);
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const userId = session.user.id;
  const path = (await context.params).segments;
  const parsed = await readJsonLimited<Body>(request, 24_000);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return error("Invalid JSON request body.", parsed.ok ? 400 : parsed.status);
  const body = parsed.value;
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "service-marketplace-mutation", userId, 60, 60_000);
  if (!limit.allowed) return error("Too many requests. Try again shortly.", 429);
  const now = new Date();

  if (path.length === 2 && path[0] === "expert" && path[1] === "profile") {
    const profile = cleanServiceProfile(body);
    if (!profile) return error("Complete your name, headline, biography, specialties, location, experience and valid HTTPS portfolio links.");
    const existing = await db.collection("service_experts").findOne({ userId }, { projection: { createdAt: 1 } });
    const result = await db.collection("service_experts").findOneAndUpdate({ userId }, {
      $set: { ...profile, status: "pending_review", updatedAt: now },
      $setOnInsert: { userId, createdAt: now },
    }, { upsert: true, returnDocument: "after" });
    await db.collection("service_listings").updateMany({ expertUserId: userId, status: "active" }, { $set: { status: "pending_review", updatedAt: now, moderationNote: "Expert profile updated; review is required again." } });
    await db.collection("service_marketplace_events").insertOne({ actorId: userId, action: existing ? "expert.profile_updated" : "expert.profile_created", createdAt: now });
    const output = result ? { ...result, _id: String(result._id) } as Record<string, unknown> : null;
    if (output) delete output.userId;
    return json({ profile: output, status: "pending_review" }, existing ? 200 : 201);
  }

  if (path.length === 1 && path[0] === "listings") {
    const profile = await db.collection("service_experts").findOne({ userId, status: "approved" });
    if (!profile) return error("An approved expert profile is required before you can publish a service listing.", 403);
    const listing = cleanServiceListing(body);
    if (!listing) return error("Provide a service title, detailed description, supported specialty, INR price and delivery time.");
    const document = { _id: new ObjectId(), expertUserId: userId, ...listing, currency: "INR", status: "pending_review", createdAt: now, updatedAt: now };
    await db.collection("service_listings").insertOne(document);
    const safe = { ...document, _id: String(document._id) } as Record<string, unknown>;
    delete safe.expertUserId;
    return json({ listing: safe, status: "pending_review" }, 201);
  }

  if (path.length === 1 && path[0] === "requests") {
    const listingId = id(body.listingId);
    if (!listingId) return error("Choose an available service listing.");
    const listing = await db.collection("service_listings").findOne({ _id: listingId, status: "active" });
    if (!listing || listing.expertUserId === userId) return error("This service is unavailable.", 404);
    const expert = await db.collection("service_experts").findOne({ userId: listing.expertUserId, status: "approved" });
    if (!expert) return error("This expert is unavailable.", 404);
    const details = cleanServiceRequest(body);
    if (!details) return error("Provide a project title, at least 40 characters of project detail, an optional secure website and an optional INR budget.");
    const clientName = typeof session.user.name === "string" ? session.user.name.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 100) : "";
    const document = { _id: new ObjectId(), listingId, clientUserId: userId, expertUserId: listing.expertUserId, clientNameSnapshot: clientName || "Marketplace customer", expertNameSnapshot: expert.displayName, expertHeadlineSnapshot: expert.headline, title: details.title, details: details.details, website: details.website, budgetPaise: details.budgetPaise, listingTitle: listing.title, listingCategory: listing.category, status: "open", orderStatus: null, selectedProposalId: null, createdAt: now, updatedAt: now };
    await db.collection("service_requests").insertOne(document);
    await db.collection("service_marketplace_events").insertOne({ requestId: document._id, actorId: userId, action: "request.created", createdAt: now });
    await db.collection("notifications").insertOne({ userId: listing.expertUserId, title: "New expert service request", message: `A client requested ${listing.title}.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
    return json({ request: requestForParticipant(document, userId) }, 201);
  }

  if (path.length === 3 && path[0] === "requests" && path[2] === "messages") {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const message = typeof body.text === "string"
      ? body.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
      : "";
    const clientId = typeof body.clientId === "string" && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.clientId) ? body.clientId : "";
    if (!message || message.length > 4000) return error("Write a message up to 4,000 characters.");
    if (!clientId) return error("A valid message request ID is required.");
    const item = await db.collection("service_requests").findOne({
      _id: requestId,
      $or: [{ clientUserId: userId }, { expertUserId: userId }],
      status: { $in: ["open", "accepted"] },
    });
    if (!item) return error("Active service request access required.", 404);
    const existing = await db.collection("service_messages").findOne({ requestId, senderId: userId, clientId });
    if (existing) {
      const safe = safeDoc(existing);
      delete safe.senderId;
      delete safe.clientId;
      return json({ message: { ...safe, mine: true } });
    }
    const document = {
      _id: new ObjectId(),
      requestId,
      senderId: userId,
      senderName: typeof session.user.name === "string" ? session.user.name.trim().slice(0, 100) : "Marketplace participant",
      clientId,
      text: message,
      createdAt: now,
    };
    try {
      await db.collection("service_messages").insertOne(document);
    } catch (caught) {
      if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) {
        const duplicate = await db.collection("service_messages").findOne({ requestId, senderId: userId, clientId });
        if (duplicate) {
          const safe = safeDoc(duplicate);
          delete safe.senderId;
          delete safe.clientId;
          return json({ message: { ...safe, mine: true } });
        }
      }
      throw caught;
    }
    await db.collection("service_marketplace_events").insertOne({ requestId, actorId: userId, action: "message.sent", messageId: document._id, createdAt: now });
    const otherUserId = item.clientUserId === userId ? item.expertUserId : item.clientUserId;
    await db.collection("notifications").insertOne({
      userId: otherUserId,
      title: "New project message",
      message: message.slice(0, 180),
      href: "/marketplace/services",
      type: "marketplace",
      createdAt: now,
    });
    const visible = safeDoc(document);
    delete visible.senderId;
    delete visible.clientId;
    return json({ message: { ...visible, mine: true } }, 201);
  }

  if (path.length === 3 && path[0] === "requests" && path[2] === "proposals") {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const item = await db.collection("service_requests").findOne({ _id: requestId, expertUserId: userId, status: "open" });
    if (!item) return error("Open service request not found.", 404);
    const profile = await db.collection("service_experts").findOne({ userId, status: "approved" });
    if (!profile) return error("An approved expert profile is required to send a proposal.", 403);
    const proposal = cleanServiceProposal(body);
    if (!proposal) return error("Provide a detailed scope, proposal message, INR amount and delivery time.");
    const document = { _id: new ObjectId(), requestId, expertUserId: userId, ...proposal, currency: "INR", status: "pending", createdAt: now, updatedAt: now };
    try {
      await db.collection("service_proposals").insertOne(document);
      await db.collection("service_requests").updateOne({ _id: requestId, status: "open" }, { $set: { updatedAt: now } });
      await db.collection("service_marketplace_events").insertOne({ requestId, actorId: userId, action: "proposal.created", proposalId: document._id, createdAt: now });
      await db.collection("notifications").insertOne({ userId: item.clientUserId, title: "New expert proposal", message: `An expert sent a proposal for ${item.title}.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
      const safe = { ...document, _id: String(document._id) } as Record<string, unknown>;
      delete safe.expertUserId;
      return json({ proposal: safe }, 201);
    } catch (caught) {
      if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return error("You already sent a proposal for this request.", 409);
      throw caught;
    }
  }

  if (path.length === 3 && path[0] === "proposals" && path[2] === "accept") {
    if (!marketplacePaymentsEnabled()) return error("Proposal acceptance is temporarily unavailable because project payments are disabled. Your request and discussion remain saved.", 503);
    const proposalId = id(path[1]);
    if (!proposalId) return error("Invalid proposal ID.");
    const proposal = await db.collection("service_proposals").findOne({ _id: proposalId, status: { $in: ["pending", "accepted"] } });
    if (!proposal) return error("This proposal is no longer available.", 409);
    const alreadyAccepted = await db.collection("service_requests").findOne({ _id: proposal.requestId, clientUserId: userId, status: "accepted", selectedProposalId: proposalId });
    if (alreadyAccepted) {
      await db.collection("service_orders").updateOne({ proposalId }, { $setOnInsert: { _id: new ObjectId(), proposalId, requestId: alreadyAccepted._id, clientUserId: userId, expertUserId: proposal.expertUserId, amountPaise: proposal.amountPaise, scope: proposal.scope, deliveryDays: proposal.deliveryDays, currency: "INR", status: "awaiting_payment_setup", paymentStatus: "not_started", checkoutState: "not_created", createdAt: now, updatedAt: now } }, { upsert: true });
      await db.collection("service_proposals").updateOne({ _id: proposalId, status: "pending" }, { $set: { status: "accepted", updatedAt: now } });
      const order = await db.collection("service_orders").findOne({ proposalId }, { projection: { _id: 1 } });
      return json({ accepted: true, orderStatus: "awaiting_payment_setup", orderId: order?._id ? String(order._id) : null, paymentAvailable: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET && process.env.MARKETPLACE_COMMISSION_BPS), retry: true });
    }
    if (proposal.status !== "pending") return error("This proposal is no longer available.", 409);
    const serviceRequest = await db.collection("service_requests").findOne({ _id: proposal.requestId, clientUserId: userId, status: "open" });
    if (!serviceRequest) {
      const ownedRequest = await db.collection("service_requests").findOne({ _id: proposal.requestId, clientUserId: userId });
      return error(ownedRequest ? "This request has already been decided." : "Only the requesting customer can accept this proposal.", ownedRequest ? 409 : 403);
    }
    await db.collection("service_orders").updateOne({ proposalId }, { $setOnInsert: { _id: new ObjectId(), proposalId, requestId: serviceRequest._id, clientUserId: userId, expertUserId: proposal.expertUserId, amountPaise: proposal.amountPaise, scope: proposal.scope, deliveryDays: proposal.deliveryDays, currency: "INR", status: "awaiting_payment_setup", paymentStatus: "not_started", checkoutState: "not_created", createdAt: now, updatedAt: now } }, { upsert: true });
    const accepted = await db.collection("service_requests").updateOne({ _id: serviceRequest._id, clientUserId: userId, status: "open" }, { $set: { status: "accepted", orderStatus: "awaiting_payment_setup", selectedProposalId: proposalId, updatedAt: now, acceptedAt: now } });
    const latestRequest = accepted.modifiedCount ? null : await db.collection("service_requests").findOne({ _id: serviceRequest._id, clientUserId: userId });
    const retry = String(latestRequest?.selectedProposalId || "") === String(proposalId) && latestRequest?.status === "accepted";
    if (!accepted.modifiedCount && !retry) {
      await db.collection("service_orders").deleteOne({ proposalId, paymentStatus: "not_started" });
      return error("The request has already been decided. Refresh and try again.", 409);
    }
    await db.collection("service_proposals").updateOne({ _id: proposalId, status: "pending" }, { $set: { status: "accepted", updatedAt: now } });
    await db.collection("service_proposals").updateMany({ requestId: serviceRequest._id, _id: { $ne: proposalId }, status: "pending" }, { $set: { status: "declined", updatedAt: now } });
    if (!retry) {
      await db.collection("service_marketplace_events").insertOne({ requestId: serviceRequest._id, actorId: userId, action: "proposal.accepted", proposalId, createdAt: now });
      await db.collection("notifications").insertOne({ userId: proposal.expertUserId, title: "Proposal accepted", message: `Your proposal for ${serviceRequest.title} was selected. Payment setup is required before the order can start.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
    }
    const order = await db.collection("service_orders").findOne({ proposalId }, { projection: { _id: 1 } });
    return json({ accepted: true, orderStatus: "awaiting_payment_setup", orderId: order?._id ? String(order._id) : null, paymentAvailable: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET && process.env.MARKETPLACE_COMMISSION_BPS), retry });
  }

  if (path.length === 3 && path[0] === "requests" && path[2] === "close") {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const result = await db.collection("service_requests").updateOne({ _id: requestId, clientUserId: userId, status: "open" }, { $set: { status: "closed", closedAt: now, updatedAt: now } });
    if (!result.modifiedCount) return error("Only an open request owned by you can be closed.", 409);
    await db.collection("service_proposals").updateMany({ requestId, status: "pending" }, { $set: { status: "declined", updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ requestId, actorId: userId, action: "request.closed", createdAt: now });
    return json({ closed: true });
  }

  if (path.length === 3 && path[0] === "requests" && path[2] === "cancel") {
    const requestId = id(path[1]);
    if (!requestId) return error("Invalid service request ID.");
    const orderRequest = await db.collection("service_requests").findOne({ _id: requestId, $or: [{ clientUserId: userId }, { expertUserId: userId }], status: "accepted", orderStatus: "awaiting_payment_setup" });
    if (!orderRequest) return error("Only an accepted order that has not started can be cancelled here.", 409);
    const result = await db.collection("service_requests").updateOne({ _id: requestId, status: "accepted", orderStatus: "awaiting_payment_setup" }, { $set: { status: "cancelled", orderStatus: "cancelled_before_start", cancelledAt: now, updatedAt: now } });
    if (!result.modifiedCount) return error("Only an accepted order that has not started can be cancelled here.", 409);
    await db.collection("service_orders").updateMany({ requestId, paymentStatus: "not_started" }, { $set: { status: "cancelled_before_start", updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ requestId, actorId: userId, action: "request.cancelled_before_start", createdAt: now });
    const otherUserId = orderRequest.clientUserId === userId ? orderRequest.expertUserId : orderRequest.clientUserId;
    await db.collection("notifications").insertOne({ userId: otherUserId, title: "Service request cancelled", message: `${orderRequest.title} was cancelled before work started.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
    return json({ cancelled: true });
  }

  if (path.length === 4 && path[0] === "admin" && path[1] === "experts" && path[3] === "decision") {
    if (!isMarketplaceAdmin(session.user.email)) return error("Marketplace administrator access required.", 403);
    const expertId = id(path[2]);
    const decision = body.decision;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!expertId || !["approved", "rejected", "suspended"].includes(String(decision)) || note.length < 10) return error("Record a valid moderation decision and a reason of at least 10 characters.");
    const expert = await db.collection("service_experts").findOne({ _id: expertId });
    if (!expert) return error("Expert not found.", 404);
    await db.collection("service_experts").updateOne({ _id: expertId }, { $set: { status: decision, moderationNote: note, reviewedBy: userId, reviewedAt: now, updatedAt: now } });
    if (decision !== "approved") await db.collection("service_listings").updateMany({ expertUserId: expert.userId, status: "active" }, { $set: { status: "suspended", updatedAt: now, moderationNote: "Listing hidden because the expert profile is not approved." } });
    await db.collection("service_marketplace_events").insertOne({ actorId: userId, expertId, action: `expert.${String(decision)}`, note, createdAt: now });
    if (typeof expert.userId === "string") await db.collection("notifications").insertOne({ userId: expert.userId, title: "Expert profile reviewed", message: `Your expert profile was ${String(decision)}.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
    return json({ status: decision });
  }

  if (path.length === 4 && path[0] === "admin" && path[1] === "listings" && path[3] === "decision") {
    if (!isMarketplaceAdmin(session.user.email)) return error("Marketplace administrator access required.", 403);
    const listingId = id(path[2]);
    const decision = body.decision;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!listingId || !["active", "rejected", "suspended"].includes(String(decision)) || note.length < 10) return error("Record a valid moderation decision and a reason of at least 10 characters.");
    const listing = await db.collection("service_listings").findOne({ _id: listingId });
    if (!listing) return error("Service listing not found.", 404);
    await db.collection("service_listings").updateOne({ _id: listingId }, { $set: { status: decision, moderationNote: note, reviewedBy: userId, reviewedAt: now, updatedAt: now } });
    await db.collection("service_marketplace_events").insertOne({ actorId: userId, listingId, action: `listing.${String(decision)}`, note, createdAt: now });
    if (typeof listing.expertUserId === "string") await db.collection("notifications").insertOne({ userId: listing.expertUserId, title: "Service listing reviewed", message: `Your service listing was ${String(decision)}.`, href: "/marketplace/services", type: "marketplace", createdAt: now });
    return json({ status: decision });
  }

  return error("Service marketplace endpoint not found.", 404);
}
