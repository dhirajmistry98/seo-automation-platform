import type { Db, Document } from "mongodb";
import { ObjectId } from "mongodb";

export type CapturedPayment = { id: string; order_id: string; amount: number; currency: string; status: string; captured?: boolean };

export async function recordCapturedServicePayment(db: Db, order: Document, payment: CapturedPayment) {
  if (!order._id || payment.status !== "captured" || payment.captured === false || payment.order_id !== order.razorpayOrderId || payment.currency !== "INR" || payment.amount !== order.amountPaise) {
    throw new Error("Captured payment does not match the accepted service order.");
  }
  const initialBps = Number.isInteger(order.commissionBps) ? Number(order.commissionBps) : null;
  if (initialBps === null || initialBps < 0 || initialBps > 3000) throw new Error("The saved marketplace commission configuration is invalid.");
  const now = new Date();
  const changed = await db.collection("service_orders").updateOne(
    { _id: order._id, paymentStatus: { $ne: "captured" }, razorpayOrderId: payment.order_id, amountPaise: payment.amount, currency: "INR" },
    { $set: { paymentStatus: "captured", status: "in_progress", orderStatus: "in_progress", razorpayPaymentId: payment.id, paidAt: now, checkoutState: "paid", payoutStatus: "awaiting_route_setup", updatedAt: now } },
  );
  const current = await db.collection("service_orders").findOne({ _id: order._id });
  if (!current) throw new Error("Service order is unavailable.");
  if (current.paymentStatus === "captured" && current.razorpayPaymentId !== payment.id) {
    await db.collection("service_payment_anomalies").updateOne(
      { orderId: current._id, paymentId: payment.id },
      { $setOnInsert: { orderId: current._id, expectedPaymentId: current.razorpayPaymentId, observedOrderId: payment.order_id, amountPaise: payment.amount, currency: payment.currency, status: "manual_review_required", createdAt: now } },
      { upsert: true },
    );
    await db.collection("service_orders").updateOne({ _id: current._id }, { $set: { payoutStatus: "on_hold", paymentAnomalyAt: now, updatedAt: now } });
    throw new Error("A second captured payment was reported for this order. Funds are on hold for reconciliation.");
  }
  const bps = initialBps;
  const commissionPaise = Math.round(payment.amount * bps / 10_000);
  await db.collection("service_financial_ledger").updateOne(
    { orderId: current._id, entryType: "payment_captured" },
    { $setOnInsert: { _id: new ObjectId(), orderId: current._id, requestId: current.requestId, provider: "razorpay", providerPaymentId: payment.id, currency: "INR", grossPaise: payment.amount, commissionBps: bps, commissionPaise, expertNetPaise: payment.amount - commissionPaise, entryType: "payment_captured", createdAt: now } },
    { upsert: true },
  );
  await db.collection("service_requests").updateOne({ _id: current.requestId, status: "accepted", selectedProposalId: current.proposalId }, { $set: { orderStatus: "in_progress", paidAt: now, updatedAt: now } });
  await db.collection("service_milestone_plans").updateOne(
    { orderId: current._id, version: 1 },
    { $setOnInsert: { _id: new ObjectId(), orderId: current._id, requestId: current.requestId, version: 1, status: "approved", milestones: [{ id: new ObjectId().toHexString(), sequence: 1, title: "Agreed project scope and delivery", scope: String(current.scope || "Complete the agreed project scope."), amountPaise: payment.amount, currency: "INR", status: "in_progress", revisionCount: 0, dueAt: new Date(now.getTime() + Math.max(1, Number(current.deliveryDays) || 7) * 86_400_000) }], createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  if (changed.modifiedCount) {
    await db.collection("service_marketplace_events").insertOne({ requestId: current.requestId, orderId: current._id, actorId: "system", action: "payment.captured", provider: "razorpay", createdAt: now });
    await db.collection("notifications").insertMany([
      { userId: current.clientUserId, title: "Service payment confirmed", message: "Payment is captured. The expert can begin the agreed work.", href: "/marketplace/services", type: "marketplace", createdAt: now },
      { userId: current.expertUserId, title: "Project funded", message: "Payment is confirmed. Start the agreed project work.", href: "/marketplace/services", type: "marketplace", createdAt: now },
    ]);
  }
  return current;
}
