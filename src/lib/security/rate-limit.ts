import { createHmac } from "node:crypto";
import type { Db } from "mongodb";

const globalForRateLimit = globalThis as typeof globalThis & { securityRateIndexes?: Promise<void> };

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  return value;
}

export function hashSecurityIdentifier(scope: string, value: string) {
  return createHmac("sha256", secret()).update(`${scope}:${value}`).digest("hex");
}

export async function ensureRateLimitIndexes(db: Db) {
  if (!globalForRateLimit.securityRateIndexes) globalForRateLimit.securityRateIndexes = Promise.all([
    db.collection("security_rate_limits").createIndex({ key: 1, bucket: 1 }, { unique: true, name: "security_rate_bucket_unique" }),
    db.collection("security_rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "security_rate_expiry" }),
  ]).then(() => undefined).catch((error) => { globalForRateLimit.securityRateIndexes = undefined; throw error; });
  await globalForRateLimit.securityRateIndexes;
}

export async function consumeRateLimit(db: Db, scope: string, identity: string, limit: number, windowMs: number, now = new Date()) {
  await ensureRateLimitIndexes(db);
  const bucket = Math.floor(now.getTime() / windowMs);
  const key = hashSecurityIdentifier(scope, identity);
  const collection = db.collection("security_rate_limits");
  let result;
  try {
    result = await collection.findOneAndUpdate(
      { key, bucket },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
    result = await collection.findOneAndUpdate({ key, bucket }, { $inc: { count: 1 } }, { returnDocument: "after" });
  }
  const record = result && typeof result === "object" && "value" in result ? result.value : result;
  const count = record && typeof record === "object" && "count" in record ? Number(record.count) : limit + 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: Math.max(1, Math.ceil(((bucket + 1) * windowMs - now.getTime()) / 1000)) };
}
