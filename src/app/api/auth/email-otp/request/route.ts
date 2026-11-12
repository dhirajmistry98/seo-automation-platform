import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import {
  createOtpDigest,
  EMAIL_OTP_RESEND_MS,
  EMAIL_OTP_TTL_MS,
  emailKey,
  ensureEmailOtpIndexes,
  normalizeEmail,
  reserveEmailOtpSend,
} from "@/lib/email-otp";
import { buildSignInCodeEmail } from "@/lib/email-otp-template";
import { emailDeliveryConfigured, sendTransactionalEmail } from "@/lib/email";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, requestClientIp, sameOriginError } from "@/lib/security/request";


function response(message: string, status = 200, retryAfter?: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { message, ...extra },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  if (!emailDeliveryConfigured()) return response("Email sign-in is not configured yet.", 503);

  const parsed = await readJsonLimited<{ email?: unknown }>(request, 4_096);
  if (!parsed.ok) return response(parsed.status === 413 ? "Request is too large." : "Enter a valid email address.", parsed.status);
  const body = parsed.value;

  const email = normalizeEmail(body.email);
  if (!email) return response("Enter a valid email address.", 400);

  try {
    const client = await clientPromise;
    const db = client.db();
    const now = new Date();
    const ipLimit = await consumeRateLimit(db, "email-otp-send-ip", requestClientIp(request), 20, 60 * 60_000, now);
    if (!ipLimit.allowed) return response("Please wait before requesting another sign-in code.", 429, ipLimit.retryAfterSeconds);
    const emailLimit = await consumeRateLimit(db, "email-otp-send-email", email, 10, 60 * 60_000, now);
    if (!emailLimit.allowed) return response("Please wait before requesting another sign-in code.", 429, emailLimit.retryAfterSeconds);
    const allowed = await reserveEmailOtpSend(db, email, now);
    if (!allowed) return response("Please wait a few seconds before requesting another code.", 429, Math.ceil(EMAIL_OTP_RESEND_MS / 1000));

    const { otpCodes } = await ensureEmailOtpIndexes(db);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(now.getTime() + EMAIL_OTP_TTL_MS);
    const inserted = await otpCodes.insertOne({
      emailHash: emailKey(email),
      codeHash: createOtpDigest(email, code),
      createdAt: now,
      expiresAt,
      attempts: 0,
    });

    const delivered = await sendTransactionalEmail({ to: email, ...buildSignInCodeEmail(code, email, expiresAt, EMAIL_OTP_TTL_MS) });

    if (!delivered) {
      await otpCodes.deleteOne({ _id: inserted.insertedId });
      return response("We could not send a sign-in code right now. Please try again later.", 503);
    }

    return response("If this address can receive mail, a sign-in code is on its way.", 200, undefined, {
      expiresInSeconds: Math.floor(EMAIL_OTP_TTL_MS / 1000),
    });
  } catch {
    return response("We could not send a sign-in code right now. Please try again later.", 503);
  }
}
