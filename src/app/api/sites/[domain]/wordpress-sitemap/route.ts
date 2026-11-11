import { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { decryptWordPressToken } from "@/lib/integrations/wordpress";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, readTextLimited, sameOriginError } from "@/lib/security/request";
import { createPinnedLookup, resolvePublicUrl } from "@/lib/seo/url-security";
import { Agent } from "undici";

type Context = { params: Promise<{ domain: string }> };
type ConnectedWebsite = { _id: ObjectId; url: string; domain: string; verifiedAt?: Date; pluginTokenEncrypted?: string; organizationId: ObjectId; ownerId?: string };
type SitemapState = {
  manager: "wordpress_core" | "seo_plugin" | "unsupported";
  enabled: boolean | null;
  blogPublic: boolean;
  sitemapUrl: string | null;
  pluginVersion: string;
};

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getSite(userId: string, domain: string) {
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, userId, domain, "integrations.manage");
  return website ? { db, website: website as ConnectedWebsite } : { db, website: null };
}

async function requestPlugin(site: ConnectedWebsite, method: "GET" | "POST", body?: Record<string, unknown>) {
  if (!site.pluginTokenEncrypted) throw new Error("Connect the WordPress plugin and rotate its token after configuring WORDPRESS_TOKEN_ENCRYPTION_KEY.");
  const origin = new URL(site.url);
  if (origin.protocol !== "https:" || origin.hostname.toLowerCase().replace(/^www\./, "") !== site.domain) throw new Error("WordPress sitemap management requires the verified HTTPS website URL.");
  const endpoint = new URL(origin.pathname.replace(/\/$/, "") + "/wp-json/seo-studio/v1/sitemap", origin.origin);
  const safeEndpoint = await resolvePublicUrl(endpoint.href);
  const token = decryptWordPressToken(site.pluginTokenEncrypted);
  const dispatcher = new Agent({ connect: { lookup: createPinnedLookup(safeEndpoint.url.hostname, safeEndpoint.addresses) } });
  let result: unknown;
  let response: Response;
  try {
    response = await fetch(safeEndpoint.url, {
      method,
      redirect: "manual",
      headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      dispatcher,
    } as RequestInit & { dispatcher: Agent });
    const raw = await readTextLimited(response, 20_000);
    try { result = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error("WordPress returned an invalid sitemap response."); }
  } finally {
    await dispatcher.close();
  }
  if (!response.ok || response.status >= 300) {
    if (response.status === 404) throw new Error("Update the SEO Studio WordPress Connector to version 0.3.0 or newer to manage sitemaps.");
    const data = result && typeof result === "object" ? result as { message?: unknown } : {};
    if (response.status === 409 && typeof data.message === "string") throw new Error(data.message.slice(0, 300));
    throw new Error("WordPress could not apply the sitemap request. Confirm the connector is active and the connection token is current.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("WordPress returned an invalid sitemap status.");
  const data = result as Record<string, unknown>;
  if (!["wordpress_core", "seo_plugin", "unsupported"].includes(String(data.manager)) || typeof data.blogPublic !== "boolean" || !(typeof data.enabled === "boolean" || data.enabled === null) || typeof data.pluginVersion !== "string") {
    throw new Error("WordPress returned an invalid sitemap status.");
  }
  let sitemapUrl: string | null = null;
  if (typeof data.sitemapUrl === "string") {
    try {
      const candidate = new URL(data.sitemapUrl);
      if (candidate.protocol === "https:" && candidate.hostname.toLowerCase().replace(/^www\./, "") === site.domain) sitemapUrl = candidate.href;
    } catch {}
  }
  return { manager: data.manager as SitemapState["manager"], enabled: data.enabled as boolean | null, blogPublic: data.blogPublic, sitemapUrl, pluginVersion: data.pluginVersion } satisfies SitemapState;
}

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return responseError("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const { website } = await getSite(session.user.id, domain);
  if (!website) return responseError("Website not found or integration management is not allowed.", 404);
  if (!website.verifiedAt) return responseError("Verify website ownership before connecting WordPress.", 409);
  try {
    const status = await requestPlugin(website, "GET");
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return responseError(caught instanceof Error ? caught.message : "Could not read WordPress sitemap status.", 502);
  }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return responseError("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<{ enabled?: unknown; approved?: unknown }>(request, 2_048);
  if (!parsed.ok) return responseError(parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body.", parsed.status);
  if (typeof parsed.value.enabled !== "boolean" || parsed.value.approved !== true) return responseError("Review and confirm the sitemap setting change.", 400);
  const { db, website } = await getSite(session.user.id, domain);
  if (!website) return responseError("Website not found or integration management is not allowed.", 404);
  if (!website.verifiedAt) return responseError("Verify website ownership before changing WordPress settings.", 409);
  const limit = await consumeRateLimit(db, "wordpress-sitemap", String(website.organizationId) + ":" + domain, 8, 60 * 60_000);
  if (!limit.allowed) return responseError("Sitemap settings were changed too often. Try again later.", 429);
  try {
    const status = await requestPlugin(website, "POST", { enabled: parsed.value.enabled, approved: true });
    const now = new Date();
    await db.collection("websites").updateOne({ _id: website._id }, { $set: { wordpressSitemapControl: status, wordpressSitemapChangedAt: now, wordpressSitemapChangedBy: session.user.id, updatedAt: now } });
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, actorId: session.user.id, action: "integration.wordpress.sitemap_updated", enabled: status.enabled, manager: status.manager, createdAt: now });
    return NextResponse.json({ ...status, updatedAt: now }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return responseError(caught instanceof Error ? caught.message : "WordPress could not update its sitemap setting.", 502);
  }
}
