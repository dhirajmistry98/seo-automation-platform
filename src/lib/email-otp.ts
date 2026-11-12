import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export const EMAIL_OTP_TTL_MS = 15 * 60 * 1000;
export const EMAIL_OTP_RESEND_MS = 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_COLLECTION = "email_login_otps";
export const EMAIL_OTP_RATE_COLLECTION = "email_login_otp_limits";

type OtpDocument = {
  _id?: ObjectId;
  emailHash: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  consumedAt?: Date;
};

type RateLimitDocument = {
  emailHash: string;
  nextAllowedAt: Date;
  expiresAt: Date;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  return value;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function emailKey(email: string) {
  return createHmac("sha256", secret()).update(`rankpilot-email:${email}`).digest("hex");
}

function otpDigest(email: string, code: string) {
  return createHmac("sha256", secret()).update(`rankpilot-otp:${email}:${code}`).digest();
}

// Index creation is a server round trip; run it once per server instance instead of on every request.
let emailOtpIndexesReady: Promise<unknown> | null = null;

export async function ensureEmailOtpIndexes(db: Db) {
  const otpCodes = db.collection<OtpDocument>(EMAIL_OTP_COLLECTION);
  const rateLimits = db.collection<RateLimitDocument>(EMAIL_OTP_RATE_COLLECTION);
  emailOtpIndexesReady ??= Promise.all([
    otpCodes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rateLimits.createIndex({ emailHash: 1 }, { unique: true }),
    rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((error) => {
    emailOtpIndexesReady = null;
    throw error;
  });
  await emailOtpIndexesReady;
  return { otpCodes, rateLimits };
}

export async function reserveEmailOtpSend(db: Db, email: string, now: Date) {
  const { rateLimits } = await ensureEmailOtpIndexes(db);
  const key = emailKey(email);
  try {
    const result = await rateLimits.updateOne(
      { emailHash: key, nextAllowedAt: { $lte: now } },
      {
        $set: {
          nextAllowedAt: new Date(now.getTime() + EMAIL_OTP_RESEND_MS),
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true },
    );
    return result.modifiedCount === 1 || result.upsertedCount === 1;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return false;
    throw error;
  }
}

export async function consumeEmailOtp(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const client = await clientPromise;
  const db = client.db();
  const { otpCodes } = await ensureEmailOtpIndexes(db);
  const key = emailKey(email);
  const now = new Date();
  const record = await otpCodes.findOne(
    { emailHash: key, expiresAt: { $gt: now }, attempts: { $lt: EMAIL_OTP_MAX_ATTEMPTS }, consumedAt: { $exists: false } },
    { sort: { createdAt: -1 } },
  );
  if (!record) return false;

  const expected = Buffer.from(record.codeHash, "hex");
  const received = otpDigest(email, code);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    await otpCodes.updateOne(
      { _id: record._id, attempts: { $lt: EMAIL_OTP_MAX_ATTEMPTS }, consumedAt: { $exists: false } },
      { $inc: { attempts: 1 } },
    );
    return false;
  }

  const claimed = await otpCodes.updateOne(
    {
      _id: record._id,
      codeHash: record.codeHash,
      expiresAt: { $gt: now },
      attempts: { $lt: EMAIL_OTP_MAX_ATTEMPTS },
      consumedAt: { $exists: false },
    },
    { $set: { consumedAt: now } },
  );
  return claimed.modifiedCount === 1;
}

export function createOtpDigest(email: string, code: string) {
  return otpDigest(email, code).toString("hex");
}
