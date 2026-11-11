import { ObjectId, type Db, type Document } from "mongodb";

export type CampaignCapturedPayment = { id: string; order_id: string; amount: number; currency: string; status: string; captured?: boolean };

export async function recordCapturedCampaignPayment(db: Db, order: Document, payment: CampaignCapturedPayment) {
  if (!order._id || payment.status !== "captured" || payment.captured === false || payment.order_id !== order.razorpayOrderId || payment.currency !== "INR" || payment.amount !== order.amountPaise) {
    throw new Error("Captured payment does not match the agreed campaign collaboration.");
  }
  const configuredBps = Number.isInteger(order.commissionBps) ? Number(order.commissionBps) : null;
  if (configuredBps === null || configuredBps < 0 || configuredBps > 3000) throw new Error("The saved marketplace commission configuration is invalid. The payment is recorded for reconciliation, but work cannot start.");
  const now = new Date();
  const result = await db.collection("mp_orders").updateOne(
    { _id: order._id, paymentStatus: { $ne: "captured" }, razorpayOrderId: payment.order_id, amountPaise: payment.amount, currency: "INR" },
    { $set: { paymentStatus: "captured", razorpayPaymentId: payment.id, paidAt: now, checkoutState: "paid", payoutStatus: "awaiting_route_setup", updatedAt: now } },
  );
  const current = await db.collection("mp_orders").findOne({ _id: order._id });
  if (!current) throw new Error("Campaign payment order is unavailable.");
  if (current.paymentStatus === "captured" && current.razorpayPaymentId !== payment.id) {
    await db.collection("mp_payment_anomalies").updateOne(
      { orderId: current._id, paymentId: payment.id },
      { $setOnInsert: { orderId: current._id, expectedPaymentId: current.razorpayPaymentId, amountPaise: payment.amount, currency: payment.currency, status: "manual_review_required", createdAt: now } },
      { upsert: true },
    );
    await db.collection("mp_orders").updateOne({ _id: current._id }, { $set: { payoutStatus: "on_hold", paymentAnomalyAt: now, updatedAt: now } });
    throw new Error("A second captured payment was reported for this collaboration. Funds are on hold for reconciliation.");
  }
  const bps = configuredBps;
  const commissionPaise = Math.round(payment.amount * bps / 10_000);
  await db.collection("mp_financial_ledger").updateOne(
    { orderId: current._id, entryType: "payment_captured" },
    { $setOnInsert: { _id: new ObjectId(), orderId: current._id, collaborationId: current.collaborationId, provider: "razorpay", providerPaymentId: payment.id, currency: "INR", grossPaise: payment.amount, commissionBps: bps, commissionPaise, influencerNetPaise: payment.amount - commissionPaise, entryType: "payment_captured", createdAt: now } },
    { upsert: true },
  );
  await db.collection("mp_collaborations").updateOne({ _id: current.collaborationId, status: "terms_agreed" }, { $set: { paymentStatus: "captured", paidAt: now, updatedAt: now } });
  if (result.modifiedCount) {
    await db.collection("mp_audit").insertOne({ entityId: current.collaborationId, actorId: "system", action: "campaign_payment.captured", orderId: current._id, createdAt: now });
    await db.collection("notifications").insertMany([
      { userId: current.brandOwnerId, title: "Campaign payment confirmed", message: "The collaboration is funded and ready to begin.", href: "/influencer-marketing/inbox", type: "marketplace", createdAt: now },
      { userId: current.influencerId, title: "Campaign funded", message: "Payment is confirmed. Begin the agreed collaboration work.", href: "/influencer-marketing/inbox", type: "marketplace", createdAt: now },
    ]);
  }
  return current;
}
