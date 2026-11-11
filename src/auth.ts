import NextAuth from "next-auth";
import { randomUUID } from "node:crypto";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter, format as mongoAdapterFormat } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import type { Adapter } from "next-auth/adapters";

import clientPromise from "@/lib/mongodb";
import { consumeEmailOtp, normalizeEmail } from "@/lib/email-otp";
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/mfa";
import { recordAuthEvent } from "@/lib/auth-audit";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { requestClientIp } from "@/lib/security/request";
import { persistUserProfile } from "@/lib/user-profile";
import { formatAuthUser } from "@/lib/auth-user-format";
import { isVerifiedGoogleSignIn } from "@/lib/google-signin";

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const mongoAdapter = MongoDBAdapter(clientPromise);
const adapter: Adapter = {
  ...mongoAdapter,
  async getUser(id) {
    if (!ObjectId.isValid(id)) return null;
    const db = (await clientPromise).db();
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    return user ? formatAuthUser(user) : null;
  },
  async getUserByEmail(email) {
    const db = (await clientPromise).db();
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const user = await db.collection("users").findOne({ email: normalized, _id: { $type: "objectId" } });
    return user ? formatAuthUser(user) : null;
  },
  async getUserByAccount(accountKey) {
    const db = (await clientPromise).db();
    const account = await db.collection("accounts").findOne(accountKey);
    if (!account || !ObjectId.isValid(String(account.userId))) return null;
    const user = await db.collection("users").findOne({ _id: new ObjectId(String(account.userId)) });
    return user ? formatAuthUser(user) : null;
  },
  async getSessionAndUser(sessionToken) {
    const db = (await clientPromise).db();
    const session = await db.collection("sessions").findOne({ sessionToken });
    if (!session || !ObjectId.isValid(String(session.userId))) return null;
    const user = await db.collection("users").findOne({ _id: new ObjectId(String(session.userId)) });
    if (!user) return null;
    return { user: formatAuthUser(user), session: mongoAdapterFormat.from(session) };
  },
  async updateUser(data) {
    if (!ObjectId.isValid(data.id)) throw new Error("Auth.js user ID is invalid.");
    const fields = Object.fromEntries(Object.entries(data).filter(([key, value]) => key !== "id" && key !== "userId" && value !== undefined));
    const db = (await clientPromise).db();
    const user = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(data.id) },
      { $set: fields },
      { returnDocument: "after" },
    );
    if (!user) throw new Error("Auth.js user record was not found.");
    return formatAuthUser(user);
  },
};
const globalForAuthIndexes = globalThis as typeof globalThis & { authSessionIndexesPromise?: Promise<void> };

async function ensureAuthSessionIndexes(db: ReturnType<Awaited<typeof clientPromise>["db"]>) {
  if (!globalForAuthIndexes.authSessionIndexesPromise) {
    globalForAuthIndexes.authSessionIndexesPromise = Promise.all([
      db.collection("auth_revoked_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "revoked_session_expiry" }),
      db.collection("active_sessions").createIndex({ jti: 1 }, { unique: true, name: "active_session_jti_unique" }),
      db.collection("active_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "active_session_expiry" }),
    ]).then(() => undefined).catch((error) => {
      globalForAuthIndexes.authSessionIndexesPromise = undefined;
      throw error;
    });
  }
  await globalForAuthIndexes.authSessionIndexesPromise;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      id: "email-otp",
      name: "Email one-time code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Email code", type: "text" },
        mfaCode: { label: "Authenticator or recovery code", type: "text" },
      },
      async authorize(credentials, request) {
        const email = normalizeEmail(credentials.email);
        const code = typeof credentials.code === "string" ? credentials.code.trim() : "";
        const db = (await clientPromise).db();
        const ip = requestClientIp(request);
        const ipLimit = await consumeRateLimit(db, "email-otp-verify-ip", ip, 20, 15 * 60_000);
        const emailLimit = email ? await consumeRateLimit(db, "email-otp-verify-email", email, 10, 15 * 60_000) : { allowed: true };
        if (!ipLimit.allowed || !emailLimit.allowed) {
          await recordAuthEvent(db, { email: email || undefined, provider: "email-otp", success: false, ip, userAgent: request.headers.get("user-agent") || undefined });
          return null;
        }
        if (!email || !(await consumeEmailOtp(email, code))) {
          await recordAuthEvent(db, { email: email || undefined, provider: "email-otp", success: false, ip, userAgent: request.headers.get("user-agent") || undefined });
          return null;
        }

        let user = await adapter.getUserByEmail?.(email) ?? null;
        if (!user) {
          try {
            user = await adapter.createUser?.({
              id: new ObjectId().toHexString(),
              email,
              emailVerified: new Date(),
              name: email.split("@")[0],
              image: null,
            }) ?? null;
          } catch (error) {
            user = await adapter.getUserByEmail?.(email) ?? null;
            if (!user) throw error;
          }
        }

        if (!user?.email || !user.id) return null;
        const mfa = await db.collection("user_mfa").findOne({ userId: user.id, enabled: true });
        if (mfa?.secretEncrypted) {
          const mfaCode = typeof credentials.mfaCode === "string" ? credentials.mfaCode.trim() : "";
          const secret = decryptTotpSecret(mfa.secretEncrypted);
          if (!verifyTotp(secret, mfaCode)) {
            const recoveryHash = hashRecoveryCode(mfaCode);
            const consumed = await db.collection<{ recoveryCodeHashes: string[] }>("user_mfa").updateOne({ _id: mfa._id, enabled: true, recoveryCodeHashes: recoveryHash }, { $pull: { recoveryCodeHashes: recoveryHash }, $set: { lastUsedAt: new Date() } });
            if (!consumed.modifiedCount) {
              await recordAuthEvent(db, { userId: user.id, email, provider: "email-otp", success: false, ip, userAgent: request.headers.get("user-agent") || undefined });
              return null;
            }
          } else {
            await db.collection("user_mfa").updateOne({ _id: mfa._id }, { $set: { lastUsedAt: new Date() } });
          }
        }
        await persistUserProfile(db, { id: user.id, email: user.email, name: user.name, image: user.image, emailVerified: user.emailVerified, provider: "email-otp" });
        await recordAuthEvent(db, { userId: user.id, email, provider: "email-otp", success: true, ip, userAgent: request.headers.get("user-agent") || undefined });
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "email-otp") return true;
      if (!user.email) return false;
      if (account?.provider === "google" && !isVerifiedGoogleSignIn(profile, user.email)) return false;
      const db = (await clientPromise).db();
      const mfa = await db.collection("user_mfa").findOne({ email: normalizeEmail(user.email), enabled: true }, { projection: { _id: 1 } });
      if (mfa) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.jti = randomUUID();
        token.authTime = Math.floor(Date.now() / 1000);
      }
      if (token.sub && token.jti) {
        const jti = token.jti;
        const userId = token.sub;
        const client = await clientPromise;
        const db = client.db();
        const now = new Date();
        await ensureAuthSessionIndexes(db);
        const revoked = await db.collection("auth_revoked_sessions").findOne({ jti, expiresAt: { $gt: now } }, { projection: { _id: 1 } });
        if (revoked) { token.sub = undefined; return token; }
        await db.collection("active_sessions").updateOne({ jti, userId }, { $set: { userId, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000) }, $setOnInsert: { jti, createdAt: now } }, { upsert: true });
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.sessionId = token.jti;
        session.user.authTime = token.authTime;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "email-otp" || !user.id) return;
      const db = (await clientPromise).db();
      if (user.email) await persistUserProfile(db, { id: user.id, email: user.email, name: user.name, image: user.image, emailVerified: account?.provider === "google" && isVerifiedGoogleSignIn(profile, user.email) ? new Date() : "emailVerified" in user && user.emailVerified instanceof Date ? user.emailVerified : null, provider: account?.provider || "oauth" });
      await recordAuthEvent(db, { userId: user.id, email: user.email || undefined, provider: account?.provider || "oauth", success: true });
    },
    async signOut(message) {
      if (!("token" in message) || !message.token?.jti || !message.token.sub) return;
      const db = (await clientPromise).db();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
      await db.collection("auth_revoked_sessions").updateOne({ jti: message.token.jti }, { $set: { userId: message.token.sub, revokedAt: now, expiresAt } }, { upsert: true });
      await db.collection("active_sessions").deleteOne({ jti: message.token.jti, userId: message.token.sub });
      await db.collection("auth_events").insertOne({ userId: message.token.sub, provider: "session", action: "logout", success: true, createdAt: now });
    },
  },
});
