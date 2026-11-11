import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { decryptWordPressToken } from "@/lib/integrations/wordpress";
import { isSameOriginRequest, readJsonLimited, readTextLimited, sameOriginError } from "@/lib/security/request";
import { createPinnedLookup, resolvePublicUrl } from "@/lib/seo/url-security";
import { Agent } from "undici";

const fieldLimits = { title: 300, description: 500, canonical: 2048, robots: 100, schema: 20_000, altText: 300 } as const;
type Field = keyof typeof fieldLimits;
function isField(value: string): value is Field { return value in fieldLimits; }

export async function POST(request: Request, context: { params: Promise<{ domain: string }> }) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<{ postId?: unknown; metadata?: unknown; approved?: unknown }>(request, 30_000);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Metadata request is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (body.approved !== true) return NextResponse.json({ error: "Review the proposed metadata and confirm the change before applying it." }, { status: 400 });
  const postId = Number(body.postId);
  if (!Number.isSafeInteger(postId) || postId < 1 || !body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) return NextResponse.json({ error: "Choose a synced WordPress post and metadata fields." }, { status: 400 });
  const proposed = body.metadata as Record<string, unknown>;
  const metadata: Partial<Record<Field, string>> = {};
  for (const [name, raw] of Object.entries(proposed)) {
    if (!isField(name) || typeof raw !== "string" || raw.length > fieldLimits[name]) return NextResponse.json({ error: `Invalid WordPress metadata field: ${name}.` }, { status: 400 });
    metadata[name] = raw;
  }
  if (!Object.keys(metadata).length) return NextResponse.json({ error: "Select at least one supported metadata field." }, { status: 400 });
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "content.edit");
  if (!website) return NextResponse.json({ error: "Website not found or content editing is not allowed." }, { status: 404 });
  if (!website.verifiedAt || !website.pluginTokenEncrypted) return NextResponse.json({ error: "Connect or reconnect the WordPress plugin and configure token encryption before applying changes." }, { status: 409 });
  const syncedPost = await db.collection("wordpress_content").findOne({ organizationId: website.organizationId, websiteDomain: domain, wordpressPostId: postId, status: "publish" });
  if (!syncedPost) return NextResponse.json({ error: "Choose a published post from the latest WordPress sync." }, { status: 404 });
  const origin = new URL(website.url);
  if (origin.protocol !== "https:" || origin.hostname.toLowerCase().replace(/^www\./, "") !== domain) return NextResponse.json({ error: "App-initiated WordPress changes require the verified HTTPS site URL." }, { status: 400 });
  const endpoint = new URL(`${origin.pathname.replace(/\/$/, "")}/wp-json/seo-studio/v1/app/metadata`, origin.origin);
  try {
    const safeEndpoint = await resolvePublicUrl(endpoint.href);
    const token = decryptWordPressToken(website.pluginTokenEncrypted);
    const dispatcher = new Agent({ connect: { lookup: createPinnedLookup(safeEndpoint.url.hostname, safeEndpoint.addresses) } });
    let response: Response;
    let responseText: string;
    try {
      response = await fetch(safeEndpoint.url, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ postId, metadata }), cache: "no-store", signal: AbortSignal.timeout(15_000), dispatcher } as RequestInit & { dispatcher: Agent });
      responseText = await readTextLimited(response, 30_000);
    } finally { await dispatcher.close(); }
    if (Buffer.byteLength(responseText, "utf8") > 30_000) return NextResponse.json({ error: "WordPress returned an oversized response." }, { status: 502 });
    const result = (responseText ? JSON.parse(responseText) : {}) as { fields?: Partial<Record<Field, string>>; message?: string };
    if (!response.ok || response.status >= 300) return NextResponse.json({ error: "WordPress rejected the metadata update. Confirm the plugin is current and the connection token matches." }, { status: 502 });
    const updatedMeta = { ...(syncedPost.meta || {}), ...(result.fields || metadata) };
    const now = new Date();
    await db.collection("wordpress_content").updateOne({ _id: syncedPost._id }, { $set: { meta: updatedMeta, appUpdatedAt: now, appUpdatedBy: session.user.id } });
    await db.collection("wordpress_sync_history").insertOne({ ownerId: syncedPost.ownerId || website.ownerId, organizationId: website.organizationId, websiteDomain: domain, wordpressPostId: postId, source: "seo_studio_app", changedFields: Object.keys(metadata), actorId: session.user.id, syncedAt: now });
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, action: "integration.wordpress.metadata_updated", wordpressPostId: postId, fields: Object.keys(metadata), createdAt: now });
    return NextResponse.json({ updated: true, postId, fields: Object.keys(metadata), updatedAt: now }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("WordPress metadata update failed:", error);
    return NextResponse.json({ error: error instanceof Error && error.message.includes("network") ? error.message : "WordPress could not be reached safely. Check the public HTTPS URL and plugin connection." }, { status: 502 });
  }
}
