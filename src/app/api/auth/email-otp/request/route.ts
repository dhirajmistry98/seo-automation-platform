import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import {
  createOtpDigest,
  EMAIL_OTP_TTL_MS,
  emailKey,
  ensureEmailOtpIndexes,
  normalizeEmail,
  reserveEmailOtpSend,
} from "@/lib/email-otp";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, requestClientIp, sameOriginError } from "@/lib/security/request";


function response(message: string, status = 200, retryAfter?: number) {
  return NextResponse.json(
    { message },
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
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !sender) return response("Email sign-in is not configured yet.", 503);

  const parsed = await readJsonLimited<{ email?: unknown }>(request, 4_096);
  if (!parsed.ok) return response(parsed.status === 413 ? "Request is too large." : "Enter a valid email address.", parsed.status);
  const body = parsed.value;

  const email = normalizeEmail(body.email);
  if (!email) return response("Enter a valid email address.", 400);

  try {
    const client = await clientPromise;
    const db = client.db();
    const now = new Date();
    const ipLimit = await consumeRateLimit(db, "email-otp-send-ip", requestClientIp(request), 10, 60 * 60_000, now);
    if (!ipLimit.allowed) return response("Please wait before requesting another sign-in code.", 429, ipLimit.retryAfterSeconds);
    const emailLimit = await consumeRateLimit(db, "email-otp-send-email", email, 5, 60 * 60_000, now);
    if (!emailLimit.allowed) return response("Please wait before requesting another sign-in code.", 429, emailLimit.retryAfterSeconds);
    const allowed = await reserveEmailOtpSend(db, email, now);
    if (!allowed) return response("Please wait a minute before requesting another code.", 429, 60);

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

    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: "Your SEO STUDIO sign-in code",
        text: `Your SEO STUDIO sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;color:#18372a;max-width:520px;margin:auto"><p style="font-size:14px">Your SEO STUDIO sign-in code</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0">${code}</p><p style="font-size:14px;color:#63756b">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
      }),
      cache: "no-store",
    });

    if (!delivery.ok) {
      await otpCodes.deleteOne({ _id: inserted.insertedId });
      return response("We could not send a sign-in code right now. Please try again later.", 503);
    }

    return response("If this address can receive mail, a sign-in code is on its way.", 200);
  } catch {
    return response("We could not send a sign-in code right now. Please try again later.", 503);
  }
}
