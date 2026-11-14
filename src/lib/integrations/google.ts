import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";

export const GOOGLE_SERVICES = {
  search_console: { label: "Search Console", scope: "https://www.googleapis.com/auth/webmasters.readonly" },
  analytics: { label: "Google Analytics", scope: "https://www.googleapis.com/auth/analytics.readonly" },
  merchant_center: { label: "Merchant Center", scope: "https://www.googleapis.com/auth/content" },
  business_profile: { label: "Business Profile", scope: "https://www.googleapis.com/auth/business.manage" },
} as const;
export type GoogleService = keyof typeof GOOGLE_SERVICES;

export function isGoogleService(value: string): value is GoogleService {
  return value in GOOGLE_SERVICES;
}
export function googleClientConfig() {
  // Reuse the Auth.js Google client unless the operator supplies a dedicated
  // reporting OAuth client. The same client must have both callback URLs set.
  const hasDedicatedClient = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const clientId = hasDedicatedClient ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.AUTH_GOOGLE_ID;
  const clientSecret = hasDedicatedClient ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.AUTH_GOOGLE_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) throw new Error("Set a complete Google OAuth client pair using AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET or GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET, and configure NEXT_PUBLIC_APP_URL.");
  let origin: string;
  try {
    const parsed = new URL(appUrl);
    if (parsed.username || parsed.password || process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("NEXT_PUBLIC_APP_URL must be an HTTPS origin in production.");
    origin = parsed.origin;
  } catch (error) { throw error instanceof Error && error.message.includes("HTTPS") ? error : new Error("NEXT_PUBLIC_APP_URL must be a valid application URL."); }
  // Reuse the Auth.js Google sign-in callback, which is already registered on the OAuth client.
  // The Auth.js route hands integration callbacks (identified by their stored state) to the
  // integration handler. Set GOOGLE_OAUTH_REDIRECT_PATH to use a dedicated callback instead.
  const redirectPath = process.env.GOOGLE_OAUTH_REDIRECT_PATH?.startsWith("/api/") ? process.env.GOOGLE_OAUTH_REDIRECT_PATH : "/api/auth/callback/google";
  return { clientId, clientSecret, appUrl: origin, redirectUri: `${origin}${redirectPath}` };
}
function encryptionKey() {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required to store provider tokens.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}
export function encryptGoogleSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptGoogleSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Stored Google token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export const hashOAuthState = (state: string) => createHash("sha256").update(state).digest("hex");
export const createOAuthState = () => randomBytes(32).toString("base64url");
export function createOAuthPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

const globalForGoogleIndexes = globalThis as typeof globalThis & { googleIntegrationIndexesPromise?: Promise<void> };
export async function ensureGoogleIntegrationIndexes(db: Db) {
  if (!globalForGoogleIndexes.googleIntegrationIndexesPromise) globalForGoogleIndexes.googleIntegrationIndexesPromise = Promise.all([
    db.collection("google_oauth_states").createIndex({ stateHash: 1 }, { unique: true, name: "google_oauth_state_unique" }),
    db.collection("google_oauth_states").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "google_oauth_state_expiry" }),
    db.collection("google_connections").createIndex({ organizationId: 1, domain: 1, service: 1 }, { unique: true, name: "google_connection_unique" }),
    db.collection("google_search_console_reports").createIndex({ organizationId: 1, websiteDomain: 1, generatedAt: -1 }, { name: "gsc_report_site_history" }),
    db.collection("google_analytics_reports").createIndex({ organizationId: 1, websiteDomain: 1, generatedAt: -1 }, { name: "ga_report_site_history" }),
  ]).then(() => undefined).catch((error) => { globalForGoogleIndexes.googleIntegrationIndexesPromise = undefined; throw error; });
  await globalForGoogleIndexes.googleIntegrationIndexesPromise;
}

export async function getGoogleAccessToken(db: Db, organizationId: unknown, domain: string, service: GoogleService) {
  const connection = await db.collection("google_connections").findOne({ organizationId, domain, service, status: "connected" });
  if (!connection?.refreshTokenEncrypted) throw new Error(`${GOOGLE_SERVICES[service].label} is not connected.`);
  const expiresAt = connection.accessTokenExpiresAt instanceof Date ? connection.accessTokenExpiresAt.getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && connection.accessTokenEncrypted) return decryptGoogleSecret(connection.accessTokenEncrypted);
  const config = googleClientConfig();
  const refreshToken = decryptGoogleSecret(connection.refreshTokenEncrypted);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const body = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !body.access_token) throw new Error("Google access token refresh failed. Reconnect this service.");
  const accessTokenExpiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000);
  await db.collection("google_connections").updateOne({ _id: connection._id }, { $set: { accessTokenEncrypted: encryptGoogleSecret(body.access_token), accessTokenExpiresAt, lastRefreshedAt: new Date() } });
  return body.access_token;
}
