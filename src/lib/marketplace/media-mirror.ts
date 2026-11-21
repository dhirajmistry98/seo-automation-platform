import { Binary, type Db } from "mongodb";
import { createHash } from "node:crypto";

// Instagram CDN links are signed and expire within days, so creators' images are copied and served from our own route.
const COLLECTION = "mp_media_cache";
const MAX_BYTES = 1_500_000;
const ALLOWED_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
export const MIRROR_PATH = "/api/marketplace/instagram/media/";

type Media = { id?: string; mediaUrl?: string; thumbnailUrl?: string; [key: string]: unknown };

function keyFor(userId: string, slot: string) {
  return createHash("sha256").update(`${userId}:${slot}`).digest("hex").slice(0, 40);
}

async function copy(db: Db, userId: string, slot: string, source: string | null | undefined) {
  if (!source || source.startsWith(MIRROR_PATH)) return source || null;
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) return source;
  try {
    const response = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const type = response.headers.get("content-type")?.split(";")[0].trim() || "";
    if (!response.ok || !/^image\/(jpeg|png|webp|gif|heic)$/.test(type)) return source;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return source;
    const key = keyFor(userId, slot);
    await db.collection(COLLECTION).updateOne({ _id: key as never }, { $set: { userId, contentType: type, data: new Binary(bytes), size: bytes.length, updatedAt: new Date() } }, { upsert: true });
    return `${MIRROR_PATH}${key}?v=${Date.now().toString(36)}`;
  } catch {
    return source;
  }
}

export async function mirrorInstagramImages(db: Db, userId: string, profilePictureUrl: string | null | undefined, recentMedia: Media[] | null) {
  const avatar = await copy(db, userId, "avatar", profilePictureUrl);
  const media = recentMedia ? await Promise.all(recentMedia.map(async (item) => {
    const image = await copy(db, userId, `media:${item.id || ""}`, item.thumbnailUrl || item.mediaUrl);
    return image ? { ...item, thumbnailUrl: image, mediaUrl: image } : item;
  })) : null;
  const keep = [keyFor(userId, "avatar"), ...(media || []).map((item) => keyFor(userId, `media:${item.id || ""}`))];
  if (media) await db.collection(COLLECTION).deleteMany({ userId, _id: { $nin: keep as never[] } }).catch(() => undefined);
  return { profilePictureUrl: avatar, recentMedia: media };
}
