import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { RazorpayApiError, razorpayRequest } from "@/lib/marketplace/razorpay";
import { ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ id: string }> };
type Refund = { id?: string; payment_id?: string; amount?: number; currency?: string; status?: string; receipt?: string };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function isAdmin(email?: string | null) { return !!email && (process.env.MARKETPLACE_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase()); }

export async function POST(request: Request, context: Context) {
  if (!marketplacePaymentsEnabled()) return reply({ error: "Marketplace refunds are disabled while payment and payout operations are being prepared." }, 503);
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Authentication required." }, 401);
  if (!isAdmin(session.user.email)) return reply({ error: "Marketplace administrator access required." }, 403);
  const parsed = await readJsonLimited<{ requestKey?: unknown; amountPaise?: unknown; reason?: unknown }>(request, 3_000);
  if (!parsed.ok) return reply({ error: "Invalid refund request." }, parsed.status);
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return reply({ error: "Invalid service order." }, 400);
  const requestKey = parsed.value.requestKey;
  if (typeof requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return reply({ error: "A stable UUID refund request key is required for safe retries." }, 400);
  const reason = typeof parsed.value.reason === "string" ? parsed.value.reason.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : "";
  if (reason.length < 10) return reply({ error: "Enter a refund reason of at least 10 characters." }, 400);
  if (!Number.isSafeInteger(parsed.value.amountPaise) || Number(parsed.value.amountPaise) < 100) return reply({ error: "Enter the refund amount in paise; minimum is ₹1." }, 400);
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "service-refund", session.user.id, 10, 60_000);
  if (!limit.allowed) return reply({ error: "Too many refund attempts." }, 429);
  const _id = new ObjectId(id);
  const order = await db.collection("service_orders").findOne({ _id });
  if (!order || order.paymentStatus !== "captured" || typeof order.razorpayPaymentId !== "string") return reply({ error: "A captured payment is required before issuing a refund." }, 409);
  let refund = await db.collection("service_refunds").findOne({ requestKey });
  if (refund && (String(refund.orderId) !== id || refund.amountPaise !== parsed.value.amountPaise || refund.reason !== reason)) return reply({ error: "This refund request key was already used with different details." }, 409);
  if (refund?.status === "processed" || refund?.status === "pending") return reply({ refund: { requestKey, status: refund.status, providerRefundId: refund.providerRefundId || null }, duplicate: true }, 200);
  const existingRefunds = await db.collection("service_refunds").find({ orderId: _id, status: { $in: ["processing", "pending", "processed", "reconciliation_required"] }, requestKey: { $ne: requestKey } }, { projection: { amountPaise: 1 } }).toArray();
  const processedSoFar = Number(order.refundedPaise || 0);
  const pendingSoFar = existingRefunds.filter((item) => ["processing", "pending", "reconciliation_required"].includes(String(item.status))).reduce((sum, item) => sum + Number(item.amountPaise || 0), 0);
  const remaining = Number(order.amountPaise) - processedSoFar - pendingSoFar;
  const amountPaise = parsed.value.amountPaise;
  if (!Number.isSafeInteger(amountPaise) || Number(amountPaise) < 100 || Number(amountPaise) > remaining) return reply({ error: "Refund amount must be between ₹1 and the remaining captured balance." }, 400);
  const now = new Date();
  if (!refund) {
    const document = { _id: new ObjectId(), requestKey, idempotencyKey: `refund_${requestKey}`, orderId: _id, paymentId: order.razorpayPaymentId, amountPaise, currency: "INR", reason, status: "processing", requestedBy: session.user.id, createdAt: now, updatedAt: now };
    try { await db.collection("service_refunds").insertOne(document); refund = document; }
    catch (caught) { if (typeof caught === "object" && caught && "code" in caught && caught.code === 11000) return reply({ error: "This refund request is already being created. Refresh before retrying." }, 409); throw caught; }
  } else {
    const claimed = await db.collection("service_refunds").updateOne({ _id: refund._id, status: "reconciliation_required" }, { $set: { status: "processing", retryAt: now, updatedAt: now } });
    if (!claimed.modifiedCount) return reply({ error: "This refund request is already being processed." }, 409);
  }
  await db.collection("service_orders").updateOne({ _id, payoutStatus: { $ne: "paid" } }, { $set: { payoutStatus: "on_hold", refundReviewStartedAt: now, updatedAt: now } });
  await db.collection("service_payout_requests").updateOne({ orderId: _id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
  try {
    const result = await razorpayRequest<Refund>(`/payments/${order.razorpayPaymentId}/refund`, "POST", { amount: amountPaise, receipt: requestKey, notes: { service_order: id, reason: reason.slice(0, 256) } }, `refund_${requestKey}`);
    if (typeof result.id !== "string" || !/^rfnd_[A-Za-z0-9]+$/.test(result.id) || result.payment_id !== order.razorpayPaymentId || result.amount !== amountPaise || result.currency !== "INR") {
      await db.collection("service_refunds").updateOne({ _id: refund._id }, { $set: { status: "reconciliation_required", updatedAt: new Date() } });
      return reply({ error: "The provider refund response could not be matched. Reconciliation is required." }, 502);
    }
    await db.collection("service_refunds").updateOne({ _id: refund._id }, { $set: { providerRefundId: result.id, status: "pending", submittedAt: new Date(), updatedAt: new Date() } });
    await db.collection("service_marketplace_events").insertOne({ requestId: order.requestId, orderId: _id, actorId: session.user.id, action: "refund.requested", refundId: refund._id, amountPaise, createdAt: now });
    return reply({ refund: { requestKey, providerRefundId: result.id, status: result.status || "pending", amountPaise, currency: "INR" } }, 202);
  } catch (caught) {
    const isClientRejection = caught instanceof RazorpayApiError && caught.status !== null && caught.status >= 400 && caught.status < 500 && caught.status !== 409;
    await db.collection("service_refunds").updateOne({ _id: refund._id, status: "processing" }, { $set: { status: isClientRejection ? "provider_rejected" : "reconciliation_required", lastAttemptAt: new Date(), updatedAt: new Date() } });
    return reply({ error: caught instanceof Error ? caught.message : "Refund could not be confirmed. Reuse the same request key to reconcile; do not create another refund." }, caught instanceof RazorpayApiError && caught.status ? 502 : 503);
  }
}
