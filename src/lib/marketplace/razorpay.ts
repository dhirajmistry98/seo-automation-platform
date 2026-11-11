import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string };
export class RazorpayApiError extends Error {
  constructor(message: string, readonly status: number | null = null) { super(message); }
}

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";
  return keyId && keySecret && webhookSecret ? { keyId, keySecret, webhookSecret } : null;
}

export function marketplaceCommissionBps() {
  const raw = process.env.MARKETPLACE_COMMISSION_BPS?.trim() || "";
  if (!/^\d{1,4}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 3000 ? value : null;
}

export function verifyRazorpayHmac(message: string | Buffer, signature: string, secret: string) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function razorpayRequest<T>(path: string, method: "GET" | "POST", body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const config = getRazorpayConfig();
  if (!config) throw new RazorpayApiError("Razorpay payments are not fully configured.");
  if (!/^\/(?:orders|payments)(?:\/[A-Za-z0-9_-]+)*(?:\/refund)?$/.test(path)) throw new RazorpayApiError("Invalid payment provider endpoint.");
  if (idempotencyKey && (method !== "POST" || !/^\/payments\/[A-Za-z0-9_-]+\/refund$/.test(path) || !/^[A-Za-z0-9_-]{10,64}$/.test(idempotencyKey))) throw new RazorpayApiError("Invalid refund idempotency key.");
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      redirect: "manual",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "X-Refund-Idempotency": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RazorpayApiError("The payment provider could not be reached. Reconcile the order before retrying.");
  }
  if (response.status >= 300 && response.status < 400) throw new RazorpayApiError("The payment provider returned an unexpected redirect.", response.status);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 256_000) throw new RazorpayApiError("The payment provider response exceeded the configured size limit.", response.status);
  let data: T;
  try { data = JSON.parse(text) as T; }
  catch { throw new RazorpayApiError("The payment provider returned an invalid response.", response.status); }
  if (!response.ok) throw new RazorpayApiError("The payment provider rejected the request. Review the merchant account, payment status, and request settings.", response.status);
  return data;
}
