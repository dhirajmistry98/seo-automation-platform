import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { getRazorpayConfig, marketplaceCommissionBps, RazorpayApiError, razorpayRequest } from "@/lib/marketplace/razorpay";
import { ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ id: string }> };
type RazorpayOrder = { id?: string; amount?: number; currency?: string; status?: string; receipt?: string };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const validId = (value: string) => /^[\da-f]{24}$/i.test(value);

export async function POST(request: Request, context: Context) {
  if (!marketplacePaymentsEnabled()) return reply({ error: "Marketplace payments are disabled while payment and payout operations are being prepared." }, 503);
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Authentication required." }, 401);
  const body = await readJsonLimited<Record<string, unknown>>(request, 1024);
  if (!body.ok || !body.value || Array.isArray(body.value) || typeof body.value !== "object") return reply({ error: "Invalid checkout request." }, body.ok ? 400 : body.status);
  const { id } = await context.params;
  if (!validId(id)) return reply({ error: "Invalid service order." }, 400);
  const config = getRazorpayConfig();
  const commissionBps = marketplaceCommissionBps();
  if (!config || commissionBps === null) return reply({ error: "INR checkout is not available until the payment keys, webhook secret, and valid commission rate are configured." }, 503);
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "service-checkout", session.user.id, 8, 60_000);
  if (!limit.allowed) return reply({ error: "Too many checkout attempts. Try again shortly." }, 429);
  const _id = new ObjectId(id);
  const order = await db.collection("service_orders").findOne({ _id, clientUserId: session.user.id });
  if (!order) return reply({ error: "Service order not found." }, 404);
  if (order.paymentStatus === "captured") return reply({ error: "This service order is already paid." }, 409);
  if (order.status !== "awaiting_payment_setup" && order.status !== "pending_payment") return reply({ error: "This service order is not available for payment." }, 409);
  if (!Number.isSafeInteger(order.amountPaise) || Number(order.amountPaise) < 100 || Number(order.amountPaise) > 100_000_000) return reply({ error: "The accepted service amount is invalid." }, 409);
  const requestRecord = await db.collection("service_requests").findOne({ _id: order.requestId, clientUserId: session.user.id, status: "accepted", selectedProposalId: order.proposalId });
  if (!requestRecord) return reply({ error: "The accepted service terms are no longer available for checkout." }, 409);

  if (typeof order.razorpayOrderId === "string" && order.checkoutState === "created") {
    return reply({ keyId: config.keyId, orderId: order.razorpayOrderId, amount: order.amountPaise, currency: "INR", serviceOrderId: id });
  }
  if (["creating", "reconciliation_required"].includes(String(order.checkoutState))) return reply({ error: "Checkout is being reconciled. Do not retry or create another payment; contact support if it remains pending." }, 409);
  const now = new Date();
  const lease = await db.collection("service_orders").findOneAndUpdate({
    _id,
    clientUserId: session.user.id,
    paymentStatus: { $in: ["not_started", "failed"] },
    checkoutState: { $in: ["not_created", "provider_rejected", null] },
    razorpayOrderId: { $exists: false },
  }, { $set: { checkoutState: "creating", checkoutAttemptedAt: now, commissionBps, updatedAt: now } }, { returnDocument: "after" });
  if (!lease) return reply({ error: "Another checkout request is already handling this order. Refresh the order status before trying again." }, 409);

  const receipt = `svc${id}`;
  try {
    const created = await razorpayRequest<RazorpayOrder>("/orders", "POST", {
      amount: Number(order.amountPaise), currency: "INR", receipt,
      notes: { service_order_id: id, service_request_id: String(order.requestId) },
    });
    if (typeof created.id !== "string" || !/^order_[A-Za-z0-9]+$/.test(created.id) || created.amount !== order.amountPaise || created.currency !== "INR") {
      await db.collection("service_orders").updateOne({ _id, checkoutState: "creating" }, { $set: { checkoutState: "reconciliation_required", updatedAt: new Date() } });
      return reply({ error: "The payment provider response could not be safely matched to this order. Reconciliation is required." }, 502);
    }
    await db.collection("service_orders").updateOne({ _id, checkoutState: "creating" }, { $set: { razorpayOrderId: created.id, checkoutState: "created", checkoutCreatedAt: new Date(), commissionBps, updatedAt: new Date() } });
    return reply({ keyId: config.keyId, orderId: created.id, amount: order.amountPaise, currency: "INR", serviceOrderId: id });
  } catch (caught) {
    const rejected = caught instanceof RazorpayApiError && caught.status !== null && caught.status >= 400 && caught.status < 500;
    await db.collection("service_orders").updateOne({ _id, checkoutState: "creating" }, { $set: { checkoutState: rejected ? "provider_rejected" : "reconciliation_required", checkoutErrorAt: new Date(), updatedAt: new Date() } });
    return reply({ error: caught instanceof Error ? caught.message : "Checkout could not be created." }, caught instanceof RazorpayApiError && caught.status ? 502 : 503);
  }
}
