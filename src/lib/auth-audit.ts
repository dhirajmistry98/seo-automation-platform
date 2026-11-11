import type { Db } from "mongodb";
import { emailKey } from "@/lib/email-otp";
import { hashSecurityIdentifier } from "@/lib/security/rate-limit";

export async function recordAuthEvent(db: Db, input: { userId?: string; email?: string; provider: string; success: boolean; ip?: string; userAgent?: string }) {
  const createdAt = new Date();
  await db.collection("auth_events").insertOne({
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.email ? { emailHash: emailKey(input.email) } : {}),
    ...(input.ip ? { ipHash: hashSecurityIdentifier("auth-ip", input.ip) } : {}),
    provider: input.provider.slice(0, 40),
    success: input.success,
    ...(input.userAgent ? { userAgent: input.userAgent.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 256) } : {}),
    createdAt,
  });
}
