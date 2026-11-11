import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { createRecoveryCodes, createTotpSecret, decryptTotpSecret, encryptTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/mfa";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

async function getUser() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const db = (await clientPromise).db();
  await db.collection("user_mfa").createIndex({ userId: 1 }, { unique: true, name: "user_mfa_unique" });
  return { session, db };
}

export async function GET() {
  const context = await getUser(); if ("error" in context) return context.error;
  const record = await context.db.collection("user_mfa").findOne({ userId: context.session.user.id }, { projection: { enabled: 1, recoveryCodeHashes: 1, pendingUntil: 1 } });
  return NextResponse.json({ enabled: Boolean(record?.enabled), remainingRecoveryCodes: record?.enabled ? (record.recoveryCodeHashes || []).length : 0, setupPending: Boolean(record?.pendingUntil && record.pendingUntil > new Date()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const context = await getUser(); if ("error" in context) return context.error;
  const parsed = await readJsonLimited<{ action?: unknown; code?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const userId = context.session.user.id!;
  const limit = await consumeRateLimit(context.db, "mfa-setup-user", userId, 10, 15 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many authenticator attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" } });
  const existing = await context.db.collection("user_mfa").findOne({ userId });
  if (body.action === "begin") {
    if (existing?.enabled) return NextResponse.json({ error: "Authenticator MFA is already enabled." }, { status: 409 });
    if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) return NextResponse.json({ error: "Configure email sign-in delivery before enabling MFA. MFA requires both an email code and an authenticator code at sign-in." }, { status: 503 });
    if (!process.env.MFA_ENCRYPTION_KEY) return NextResponse.json({ error: "Set MFA_ENCRYPTION_KEY before enabling authenticator MFA." }, { status: 503 });
    const secret = createTotpSecret(); const now = new Date(); const email = context.session.user.email || userId;
    await context.db.collection("user_mfa").updateOne({ userId }, { $set: { email: email.toLowerCase(), pendingSecretEncrypted: encryptTotpSecret(secret), pendingUntil: new Date(now.getTime() + 10 * 60_000), updatedAt: now }, $setOnInsert: { userId, createdAt: now } }, { upsert: true });
    const issuer = "SEO Studio";
    const label = encodeURIComponent(`${issuer}:${email}`);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return NextResponse.json({ otpauthUri, expiresAt: new Date(now.getTime() + 10 * 60_000) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.action === "confirm") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!existing?.pendingSecretEncrypted || !existing.pendingUntil || existing.pendingUntil <= new Date()) return NextResponse.json({ error: "Start setup again; the authenticator setup has expired." }, { status: 409 });
    if (!verifyTotp(decryptTotpSecret(existing.pendingSecretEncrypted), code)) return NextResponse.json({ error: "The authenticator code is invalid." }, { status: 400 });
    const recoveryCodes = createRecoveryCodes();
    await context.db.collection("user_mfa").updateOne({ _id: existing._id, enabled: { $ne: true } }, { $set: { enabled: true, secretEncrypted: existing.pendingSecretEncrypted, recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode), enabledAt: new Date(), lastUsedAt: new Date() }, $unset: { pendingSecretEncrypted: "", pendingUntil: "" } });
    return NextResponse.json({ enabled: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Choose begin or confirm." }, { status: 400 });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const context = await getUser(); if ("error" in context) return context.error;
  const parsed = await readJsonLimited<{ code?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const userId = context.session.user.id!;
  const limit = await consumeRateLimit(context.db, "mfa-disable-user", userId, 10, 15 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many authenticator attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" } });
  const body = parsed.value;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const record = await context.db.collection("user_mfa").findOne({ userId, enabled: true });
  if (!record?.secretEncrypted) return NextResponse.json({ error: "Authenticator MFA is not enabled." }, { status: 409 });
  let valid = verifyTotp(decryptTotpSecret(record.secretEncrypted), code);
  if (!valid) {
    const recoveryHash = hashRecoveryCode(code);
    const consumed = await context.db.collection<{ recoveryCodeHashes: string[] }>("user_mfa").updateOne({ _id: record._id, enabled: true, recoveryCodeHashes: recoveryHash }, { $pull: { recoveryCodeHashes: recoveryHash } });
    valid = consumed.modifiedCount > 0;
  }
  if (!valid) return NextResponse.json({ error: "Enter a current authenticator code or unused recovery code." }, { status: 400 });
  await context.db.collection("user_mfa").updateOne({ _id: record._id }, { $set: { enabled: false, recoveryCodeHashes: [], disabledAt: new Date() }, $unset: { secretEncrypted: "", pendingSecretEncrypted: "", pendingUntil: "" } });
  return NextResponse.json({ enabled: false });
}
