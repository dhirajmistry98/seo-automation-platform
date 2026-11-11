import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getRazorpayConfig, verifyRazorpayHmac } from "@/lib/marketplace/razorpay";
import { recordCapturedServicePayment, type CapturedPayment } from "@/lib/marketplace/service-payments";
import { ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";
import { recordCapturedCampaignPayment } from "@/lib/marketplace/campaign-payments";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
type Entity = Record<string, unknown> & { id?: string; order_id?: string; payment_id?: string; amount?: number; currency?: string; status?: string; captured?: boolean };
type WebhookPayload = { event?: unknown; payload?: Record<string, { entity?: Entity }> };

async function readBoundedBody(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return total ? Buffer.concat(chunks, total) : null;
}

export async function POST(request: Request) {
  if (!marketplacePaymentsEnabled()) return json({ received: true, ignored: true, reason: "Payment processing is disabled." });
  const config = getRazorpayConfig();
  if (!config) return json({ error: "Webhook is not configured." }, 503);
  const signature = request.headers.get("x-razorpay-signature") || "";
  const eventId = request.headers.get("x-razorpay-event-id") || "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(eventId)) return json({ error: "Invalid event identifier." }, 400);
  const raw = await readBoundedBody(request, 1_000_000);
  if (!raw) return json({ error: "Webhook payload is too large or empty." }, 413);
  if (!verifyRazorpayHmac(raw, signature, config.webhookSecret)) return json({ error: "Invalid webhook signature." }, 400);
  let payload: WebhookPayload;
  try { payload = JSON.parse(raw.toString("utf8")) as WebhookPayload; }
  catch { return json({ error: "Invalid webhook JSON." }, 400); }
  if (typeof payload.event !== "string" || payload.event.length > 100 || !payload.payload || typeof payload.payload !== "object") return json({ error: "Invalid webhook event." }, 400);

  const eventName = payload.event;
  const payment = payload.payload.payment?.entity;
  const refund = payload.payload.refund?.entity;
  const dispute = payload.payload.dispute?.entity;
  const orderEntity = payload.payload.order?.entity;
  const entity = payment || refund || dispute || orderEntity;
  const now = new Date();
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  await ensureMarketplaceIndexes(db);
  try {
    await db.collection("razorpay_webhook_events").insertOne({ eventId, event: eventName, entityId: typeof entity?.id === "string" ? entity.id : null, orderId: typeof entity?.order_id === "string" ? entity.order_id : null, paymentId: typeof entity?.payment_id === "string" ? entity.payment_id : typeof entity?.id === "string" && entity.id.startsWith("pay_") ? entity.id : null, status: "received", receivedAt: now });
  } catch (caught) {
    if (!(typeof caught === "object" && caught && "code" in caught && caught.code === 11000)) return json({ error: "Webhook receipt could not be stored." }, 503);
  }
  const claim = await db.collection("razorpay_webhook_events").findOneAndUpdate({ eventId, $or: [{ status: { $in: ["received", "failed"] } }, { status: "processing", claimedAt: { $lt: new Date(now.getTime() - 5 * 60_000) } }] }, { $set: { status: "processing", claimedAt: now, updatedAt: now } }, { returnDocument: "after" });
  if (!claim) {
    const prior = await db.collection("razorpay_webhook_events").findOne({ eventId }, { projection: { status: 1 } });
    return prior?.status === "processed" ? json({ received: true, duplicate: true }) : json({ error: "Webhook event is already being processed." }, 503);
  }

  try {
    if (eventName === "payment.captured" || eventName === "order.paid") {
      const capturedPayment = payment as (CapturedPayment & Entity) | undefined;
      const remoteOrderId = capturedPayment?.order_id || (typeof orderEntity?.id === "string" ? orderEntity.id : "");
      if (capturedPayment?.id && remoteOrderId) {
        const serviceOrder = await db.collection("service_orders").findOne({ razorpayOrderId: remoteOrderId });
        if (serviceOrder) await recordCapturedServicePayment(db, serviceOrder, { id: capturedPayment.id, order_id: remoteOrderId, amount: Number(capturedPayment.amount), currency: String(capturedPayment.currency), status: String(capturedPayment.status), captured: capturedPayment.captured === true });
        const campaignOrder = await db.collection("mp_orders").findOne({ razorpayOrderId: remoteOrderId });
        if (campaignOrder) await recordCapturedCampaignPayment(db, campaignOrder, { id: capturedPayment.id, order_id: remoteOrderId, amount: Number(capturedPayment.amount), currency: String(capturedPayment.currency), status: String(capturedPayment.status), captured: capturedPayment.captured === true });
      }
    } else if (eventName === "payment.failed" && typeof payment?.order_id === "string") {
      await db.collection("service_orders").updateOne({ razorpayOrderId: payment.order_id, paymentStatus: { $ne: "captured" } }, { $set: { paymentStatus: "failed", lastPaymentFailureAt: now, updatedAt: now } });
      await db.collection("mp_orders").updateOne({ razorpayOrderId: payment.order_id, paymentStatus: { $ne: "captured" } }, { $set: { paymentStatus: "failed", checkoutState: "ready", lastPaymentFailureAt: now, updatedAt: now } });
    } else if (["refund.created", "refund.processed", "refund.failed"].includes(eventName) && typeof refund?.id === "string" && typeof refund.payment_id === "string") {
      const serviceOrder = await db.collection("service_orders").findOne({ razorpayPaymentId: refund.payment_id });
      if (serviceOrder) {
        const status = eventName === "refund.processed" ? "processed" : eventName === "refund.failed" ? "failed" : "pending";
        const amountPaise = Number(refund.amount);
        const currency = String(refund.currency || "INR");
        if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || currency !== "INR" || amountPaise > Number(serviceOrder.amountPaise)) throw new Error("Provider refund does not match a valid INR service order amount.");
        await db.collection("service_refunds").updateOne({ providerRefundId: refund.id }, { $setOnInsert: { _id: new ObjectId(), orderId: serviceOrder._id, paymentId: refund.payment_id, providerRefundId: refund.id, amountPaise, currency, source: "razorpay_webhook", createdAt: now } }, { upsert: true });
        // Keep the provider's terminal processed state monotonic when webhook retries arrive out of order.
        await db.collection("service_refunds").updateOne({ providerRefundId: refund.id, status: { $ne: "processed" } }, { $set: { status, updatedAt: now } });
        if (eventName === "refund.processed") {
          const applied = await db.collection("service_refunds").updateOne({ providerRefundId: refund.id, processedAt: { $exists: false } }, { $set: { processedAt: now, status: "processed", updatedAt: now } });
          if (applied.modifiedCount) {
            const amount = Number(refund.amount);
            await db.collection("service_orders").updateOne({ _id: serviceOrder._id }, [{ $set: { refundedPaise: { $add: [{ $ifNull: ["$refundedPaise", 0] }, amount] }, payoutStatus: "on_hold", updatedAt: now } }, { $set: { status: { $cond: [{ $gte: ["$refundedPaise", "$amountPaise"] }, "refunded", "partially_refunded"] } } }]);
            await db.collection("service_payout_requests").updateOne({ orderId: serviceOrder._id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
            const commissionReversedPaise = Math.round(amount * Math.max(0, Math.min(3000, Number(serviceOrder.commissionBps) || 0)) / 10_000);
            await db.collection("service_financial_ledger").updateOne({ orderId: serviceOrder._id, entryType: `refund:${refund.id}` }, { $setOnInsert: { _id: new ObjectId(), orderId: serviceOrder._id, providerRefundId: refund.id, grossPaise: amount, commissionReversedPaise, expertNetReversedPaise: amount - commissionReversedPaise, currency: String(refund.currency || "INR"), entryType: `refund:${refund.id}`, createdAt: now } }, { upsert: true });
          }
        }
      }
      const campaignOrder = await db.collection("mp_orders").findOne({ razorpayPaymentId: refund.payment_id });
      if (campaignOrder) {
        const amountPaise = Number(refund.amount);
        const currency = String(refund.currency || "INR");
        if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || currency !== "INR" || amountPaise > Number(campaignOrder.amountPaise)) throw new Error("Provider refund does not match a valid INR campaign order.");
        await db.collection("mp_refunds").updateOne({ providerRefundId: refund.id }, { $setOnInsert: { _id: new ObjectId(), orderId: campaignOrder._id, collaborationId: campaignOrder.collaborationId, paymentId: refund.payment_id, providerRefundId: refund.id, amountPaise, currency, createdAt: now } }, { upsert: true });
        const status = eventName === "refund.processed" ? "processed" : eventName === "refund.failed" ? "failed" : "pending";
        await db.collection("mp_refunds").updateOne({ providerRefundId: refund.id, status: { $ne: "processed" } }, { $set: { status, updatedAt: now } });
        if (eventName === "refund.processed") {
          const applied = await db.collection("mp_refunds").updateOne({ providerRefundId: refund.id, processedAt: { $exists: false } }, { $set: { processedAt: now, status: "processed", updatedAt: now } });
          if (applied.modifiedCount) {
            await db.collection("mp_orders").updateOne({ _id: campaignOrder._id }, [{ $set: { refundedPaise: { $add: [{ $ifNull: ["$refundedPaise", 0] }, amountPaise] }, payoutStatus: "on_hold", updatedAt: now } }]);
            await db.collection("mp_payout_requests").updateOne({ orderId: campaignOrder._id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
            const commissionReversedPaise = Math.round(amountPaise * Math.max(0, Math.min(3000, Number(campaignOrder.commissionBps) || 0)) / 10_000);
            await db.collection("mp_financial_ledger").updateOne({ orderId: campaignOrder._id, entryType: `refund:${refund.id}` }, { $setOnInsert: { _id: new ObjectId(), orderId: campaignOrder._id, collaborationId: campaignOrder.collaborationId, providerRefundId: refund.id, grossPaise: amountPaise, commissionReversedPaise, influencerNetReversedPaise: amountPaise - commissionReversedPaise, currency, entryType: `refund:${refund.id}`, createdAt: now } }, { upsert: true });
          }
        }
      }
    } else if (eventName.startsWith("payment.dispute.") && typeof dispute?.payment_id === "string" && typeof dispute.id === "string") {
      const serviceOrder = await db.collection("service_orders").findOne({ razorpayPaymentId: dispute.payment_id });
      if (serviceOrder) {
        await db.collection("provider_payment_disputes").updateOne({ providerDisputeId: dispute.id }, { $setOnInsert: { _id: new ObjectId(), orderId: serviceOrder._id, providerDisputeId: dispute.id, createdAt: now }, $set: { providerStatus: typeof dispute.status === "string" ? dispute.status : eventName, updatedAt: now } }, { upsert: true });
        await db.collection("service_orders").updateOne({ _id: serviceOrder._id, status: { $ne: "refunded" } }, { $set: { status: "disputed", payoutStatus: "on_hold", updatedAt: now } });
        await db.collection("service_payout_requests").updateOne({ orderId: serviceOrder._id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
      }
      const campaignOrder = await db.collection("mp_orders").findOne({ razorpayPaymentId: dispute.payment_id });
      if (campaignOrder) {
        await db.collection("mp_provider_disputes").updateOne({ providerDisputeId: dispute.id }, { $setOnInsert: { _id: new ObjectId(), orderId: campaignOrder._id, collaborationId: campaignOrder.collaborationId, providerDisputeId: dispute.id, createdAt: now }, $set: { providerStatus: typeof dispute.status === "string" ? dispute.status : eventName, updatedAt: now } }, { upsert: true });
        await db.collection("mp_orders").updateOne({ _id: campaignOrder._id }, { $set: { payoutStatus: "on_hold", providerDisputeAt: now, updatedAt: now } });
        await db.collection("mp_payout_requests").updateOne({ orderId: campaignOrder._id, status: { $ne: "paid" } }, { $set: { status: "on_hold", updatedAt: now } });
      }
    }
    await db.collection("razorpay_webhook_events").updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), updatedAt: new Date() }, $unset: { lastError: "" } });
    return json({ received: true });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 300) : "Processing failed.";
    await db.collection("razorpay_webhook_events").updateOne({ eventId }, { $set: { status: "failed", lastError: message, updatedAt: new Date() } }).catch(() => undefined);
    return json({ error: "Webhook processing failed; the provider may retry this event." }, 503);
  }
}
