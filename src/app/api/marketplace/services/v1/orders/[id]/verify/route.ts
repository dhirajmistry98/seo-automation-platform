import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { getRazorpayConfig, razorpayRequest, verifyRazorpayHmac } from "@/lib/marketplace/razorpay";
import { recordCapturedServicePayment, type CapturedPayment } from "@/lib/marketplace/service-payments";
import { ensureServiceMarketplaceIndexes } from "@/lib/marketplace/services";
import { marketplacePaymentsEnabled } from "@/lib/marketplace/payments";

type Context = { params: Promise<{ id: string }> };
type Payment = CapturedPayment & { id: string; order_id: string; amount: number; currency: string; status: string; captured?: boolean };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, context: Context) {
  if (!marketplacePaymentsEnabled()) return reply({ error: "Marketplace payments are disabled while payment and payout operations are being prepared." }, 503);
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return reply({ error: "Authentication required." }, 401);
  const parsed = await readJsonLimited<{ razorpay_order_id?: unknown; razorpay_payment_id?: unknown; razorpay_signature?: unknown }>(request, 2_048);
  if (!parsed.ok) return reply({ error: "Invalid payment confirmation." }, parsed.status);
  const orderId = parsed.value.razorpay_order_id;
  const paymentId = parsed.value.razorpay_payment_id;
  const signature = parsed.value.razorpay_signature;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id) || typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId) || typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || typeof signature !== "string") return reply({ error: "Invalid payment confirmation." }, 400);
  const config = getRazorpayConfig();
  if (!config) return reply({ error: "Payment verification is not configured." }, 503);
  if (!verifyRazorpayHmac(`${orderId}|${paymentId}`, signature, config.keySecret)) return reply({ error: "Payment signature verification failed." }, 400);
  const db = (await clientPromise).db();
  await ensureServiceMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "service-payment-verify", session.user.id, 20, 60_000);
  if (!limit.allowed) return reply({ error: "Too many payment verification attempts." }, 429);
  const _id = new ObjectId(id);
  const order = await db.collection("service_orders").findOne({ _id, clientUserId: session.user.id, razorpayOrderId: orderId });
  if (!order) return reply({ error: "Payment does not match a service order in this account." }, 404);
  if (order.paymentStatus === "captured") return reply({ paid: true, status: "captured" });
  try {
    const payment = await razorpayRequest<Payment>(`/payments/${paymentId}`, "GET");
    if (payment.order_id !== orderId || payment.amount !== order.amountPaise || payment.currency !== "INR") return reply({ error: "The provider payment does not match the accepted service amount." }, 409);
    if (payment.status !== "captured" || payment.captured === false) return reply({ error: "Payment is not captured yet. The order will update when the provider confirms capture." }, 409);
    await recordCapturedServicePayment(db, order, payment);
    return reply({ paid: true, status: "captured" });
  } catch (caught) {
    return reply({ error: caught instanceof Error ? caught.message : "Payment status could not be confirmed." }, 502);
  }
}
