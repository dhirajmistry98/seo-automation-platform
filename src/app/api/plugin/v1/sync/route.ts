import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { readJsonLimited } from "@/lib/security/request";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!/^sseo_[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ error: "Valid plugin credentials are required." }, { status: 401 });
  const parsed = await readJsonLimited<{ siteUrl?: unknown; pluginVersion?: unknown; posts?: unknown }>(request, 2_000_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Sync payload exceeds the 2 MB limit." : "Invalid JSON body." }, { status: parsed.status });
  const body = parsed.value;
  if (typeof body.siteUrl !== "string" || typeof body.pluginVersion !== "string" || !Array.isArray(body.posts) || body.posts.length > 100) return NextResponse.json({ error: "Provide site details and no more than 100 content records." }, { status: 400 });
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const tokenHash = digest(token);
  const site = await db.collection("websites").findOne({ pluginTokenHash: tokenHash, active: { $ne: false }, verifiedAt: { $exists: true } });
  if (!site) return NextResponse.json({ error: "Plugin token is invalid, revoked, or the website is not verified." }, { status: 401 });
  let sourceUrl: URL;
  try { sourceUrl = new URL(body.siteUrl); } catch { return NextResponse.json({ error: "Invalid WordPress site URL." }, { status: 400 }); }
  if (!(["https:", "http:"].includes(sourceUrl.protocol)) || sourceUrl.hostname.replace(/^www\./, "").toLowerCase() !== String(site.domain).replace(/^www\./, "").toLowerCase()) return NextResponse.json({ error: "The sync URL must match the verified website domain." }, { status: 403 });

  const now = new Date();
  const records = body.posts.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const post = raw as Record<string, unknown>;
    const postId = Number(post.postId);
    if (!Number.isSafeInteger(postId) || postId < 1 || typeof post.url !== "string" || typeof post.title !== "string" || typeof post.postType !== "string") return [];
    let pageUrl: URL;
    try { pageUrl = new URL(post.url); } catch { return []; }
    if (pageUrl.hostname.replace(/^www\./, "").toLowerCase() !== String(site.domain).replace(/^www\./, "").toLowerCase() || !["http:", "https:"].includes(pageUrl.protocol)) return [];
    const meta = post.meta && typeof post.meta === "object" ? post.meta as Record<string, unknown> : {};
    const status = post.status === "deleted" ? "deleted" : post.status === "publish" ? "publish" : "private";
    return [{
      ownerId: site.ownerId,
      userId: site.ownerId,
      organizationId: site.organizationId,
      websiteDomain: site.domain,
      wordpressPostId: postId,
      url: pageUrl.href,
      title: String(post.title).slice(0, 500),
      postType: String(post.postType).slice(0, 80),
      status,
      ...(status === "deleted" ? { deletedAt: now } : {}),
      meta: {
        title: typeof meta.title === "string" ? meta.title.slice(0, 300) : "",
        description: typeof meta.description === "string" ? meta.description.slice(0, 500) : "",
        canonical: typeof meta.canonical === "string" ? meta.canonical.slice(0, 2048) : "",
        robots: typeof meta.robots === "string" ? meta.robots.slice(0, 100) : "",
      },
      syncedAt: now,
    }];
  });
  const content = db.collection("wordpress_content");
  for (const record of records) await content.updateOne(
    { organizationId: record.organizationId, websiteDomain: record.websiteDomain, wordpressPostId: record.wordpressPostId },
    { $set: record, ...(record.status === "deleted" ? {} : { $unset: { deletedAt: "" } }), $setOnInsert: { firstSyncedAt: now } },
    { upsert: true },
  );
  await db.collection("wordpress_sync_history").insertOne({ ownerId: site.ownerId, userId: site.ownerId, actorId: "wordpress_plugin", organizationId: site.organizationId, websiteDomain: site.domain, source: "wordpress_plugin", pluginVersion: body.pluginVersion.slice(0, 40), recordCount: records.length, receivedCount: body.posts.length, syncedAt: now });
  await db.collection("websites").updateOne({ _id: site._id }, { $set: { pluginConnectedAt: site.pluginConnectedAt ?? now, pluginLastSyncAt: now, pluginLastSyncStatus: "completed", pluginLastSyncCount: records.length, pluginVersion: body.pluginVersion.slice(0, 40), updatedBy: site.ownerId, updatedAt: now } });
  await db.collection("audit_logs").insertOne({ ownerId: site.ownerId, userId: site.ownerId, actorId: "wordpress_plugin", organizationId: site.organizationId, websiteDomain: site.domain, action: "integration.wordpress.synced", recordCount: records.length, createdAt: now });
  return NextResponse.json({ synced: records.length, received: body.posts.length, syncedAt: now });
}
