import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number; user_id?: number | string; error?: unknown };
export type InstagramProfile = { id?: string; user_id?: string; username?: string; name?: string; account_type?: string; followers_count?: number; media_count?: number; profile_picture_url?: string; error?: unknown };
export type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
};

function safeProviderUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function metaConfig() {
  const clientId = process.env.META_INSTAGRAM_APP_ID;
  const clientSecret = process.env.META_INSTAGRAM_APP_SECRET;
  const version = process.env.META_GRAPH_API_VERSION;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !version || !/^v\d+\.\d+$/.test(version) || !appUrl) throw new Error("Configure Meta Instagram app ID, secret, Graph API version, and application URL.");
  const origin = new URL(appUrl).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://") && !origin.startsWith("http://localhost:")) throw new Error("Meta OAuth requires an HTTPS application origin.");
  return { clientId, clientSecret, version, redirectUri: `${origin}/api/marketplace/meta/callback` };
}
function encryptionKey() {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("META_TOKEN_ENCRYPTION_KEY is required for Instagram connections.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must encode 32 bytes.");
  return key;
}
export const hashState = (state: string) => createHash("sha256").update(state).digest("hex");
export const createState = () => randomBytes(32).toString("base64url");
export function encryptToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split("."); if (!iv || !tag || !encrypted) throw new Error("Stored Instagram token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
async function jsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text.length > 100_000) throw new Error("Instagram returned an unexpectedly large response.");
  const data = JSON.parse(text) as T;
  if (!response.ok) throw new Error("Instagram rejected the connection or requested permissions.");
  return data;
}
export async function exchangeInstagramCode(code: string) {
  const config = metaConfig();
  const response = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", redirect_uri: config.redirectUri, code }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const short = await jsonResponse<TokenResponse>(response);
  if (!short.access_token || !short.user_id) throw new Error("Instagram did not return an account token.");
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: config.clientSecret, access_token: short.access_token }).toString();
  const long = await jsonResponse<TokenResponse>(await fetch(longUrl, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000) }));
  if (!long.access_token || !Number.isFinite(long.expires_in) || (long.expires_in || 0) < 86_400) throw new Error("Instagram did not grant a refreshable access token.");
  return { token: long.access_token, userId: String(short.user_id), expiresAt: new Date(Date.now() + Number(long.expires_in) * 1000) };
}
export async function fetchInstagramProfile(token: string) {
  const config = metaConfig();
  const url = new URL(`https://graph.instagram.com/${config.version}/me`);
  url.searchParams.set("fields", "user_id,username,name,account_type,followers_count,media_count,profile_picture_url");
  const profile = await jsonResponse<InstagramProfile>(await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000) }));
  if (!profile.user_id && !profile.id) throw new Error("Instagram account identity is unavailable.");
  if (!Number.isSafeInteger(profile.followers_count) || Number(profile.followers_count) < 0) throw new Error("Instagram did not provide an authorized follower count. This profile cannot be verified.");
  if (!profile.username) throw new Error("Instagram did not provide a username.");
  return { ...profile, profile_picture_url: safeProviderUrl(profile.profile_picture_url) || undefined };
}

export async function fetchInstagramMedia(token: string, userId: string): Promise<InstagramMediaItem[]> {
  if (!/^[0-9]+$/.test(userId)) throw new Error("Instagram account identity is invalid.");
  const config = metaConfig();
  const url = new URL(`https://graph.instagram.com/${config.version}/${encodeURIComponent(userId)}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
  url.searchParams.set("limit", "9");
  const result = await jsonResponse<{ data?: InstagramMediaItem[] }>(await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) }));
  return (result.data || []).slice(0, 9).flatMap((item) => {
    const id = typeof item.id === "string" ? item.id.slice(0, 100) : "";
    const mediaUrl = safeProviderUrl(item.media_url);
    const thumbnailUrl = safeProviderUrl(item.thumbnail_url);
    const permalink = safeProviderUrl(item.permalink);
    if (!id || (!mediaUrl && !thumbnailUrl)) return [];
    return [{
      id,
      caption: typeof item.caption === "string" ? item.caption.slice(0, 500) : undefined,
      mediaType: typeof item.media_type === "string" ? item.media_type.slice(0, 30) : "IMAGE",
      mediaUrl: mediaUrl || thumbnailUrl || undefined,
      thumbnailUrl: thumbnailUrl || mediaUrl || undefined,
      permalink: permalink || undefined,
      timestamp: typeof item.timestamp === "string" && !Number.isNaN(Date.parse(item.timestamp)) ? item.timestamp : undefined,
    }];
  });
}

export async function fetchInstagramInsights(token: string, userId: string) {
  if (!/^[0-9]+$/.test(userId)) throw new Error("Instagram account identity is invalid.");
  const config = metaConfig();
  const url = new URL(`https://graph.instagram.com/${config.version}/${encodeURIComponent(userId)}/insights`);
  url.searchParams.set("metric", "reach,views,accounts_engaged,total_interactions,profile_views");
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = await jsonResponse<{ data?: Array<{ name?: string; title?: string; period?: string; total_value?: { value?: unknown }; values?: Array<{ value?: unknown }> }> }>(response);
  return (result.data || []).slice(0, 20).flatMap((item) => {
    const raw = item.total_value?.value ?? item.values?.[0]?.value;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return item.name && value !== null ? [{ name: item.name.slice(0, 80), title: typeof item.title === "string" ? item.title.slice(0, 120) : item.name.slice(0, 80), period: typeof item.period === "string" ? item.period.slice(0, 40) : "day", value }] : [];
  });
}

export async function refreshInstagramToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token }).toString();
  const response = await jsonResponse<TokenResponse>(await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000) }));
  if (!response.access_token || !Number.isFinite(response.expires_in) || Number(response.expires_in) < 86_400) throw new Error("Instagram token refresh failed.");
  return { token: response.access_token, expiresAt: new Date(Date.now() + Number(response.expires_in) * 1000) };
}
