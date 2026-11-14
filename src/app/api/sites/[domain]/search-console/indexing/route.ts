import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite, type OrganizationPermission } from "@/lib/organizations";
import { getGoogleAccessToken, googleConnectionHasScope } from "@/lib/integrations/google";
import { assertPublicUrl } from "@/lib/seo/crawler";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

/**
 * Google indexing from inside the app, using the Search Console API:
 * - GET  : sitemaps Google knows for the property, with status and counts
 * - POST : { action: "submit_sitemap" } submits a sitemap so Google crawls it
 *          { action: "inspect", url }   returns Google's index status for one URL
 * Google does not offer "Request indexing" through its API; the UI links to Search Console for that.
 */

type Context = { params: Promise<{ domain: string }> };
const FULL_SCOPE = "https://www.googleapis.com/auth/webmasters";
const API = "https://searchconsole.googleapis.com";
const noStore = { "Cache-Control": "no-store" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: noStore });
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

function propertyHost(property: string) {
  if (property.startsWith("sc-domain:")) return bare(property.slice(10));
  try { return bare(new URL(property).hostname); } catch { return ""; }
}

/** A URL belongs to a property when it is on the property's domain (domain property) or under its prefix (URL-prefix property). */
function urlInProperty(url: URL, property: string) {
  if (property.startsWith("sc-domain:")) { const host = bare(property.slice(10)); return bare(url.hostname) === host || url.hostname.toLowerCase().endsWith(`.${host}`); }
  return url.href.startsWith(property);
}

async function googleError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  const detail = body.error?.message || "";
  if (response.status === 403 && /insufficient|scope/i.test(detail)) return "Search Console needs updated access to submit sitemaps. Click Reconnect next to Search Console and allow access.";
  if (response.status === 403) return "The connected Google account does not have owner or full-user access to this Search Console property.";
  if (/has not been used|is disabled/i.test(detail)) return "The Google Search Console API is not enabled for this app's Google Cloud project.";
  return detail ? `${fallback} Google said: ${detail.slice(0, 240)}` : fallback;
}

async function context(request: Request, params: Context["params"], permission: OrganizationPermission, property?: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: fail("Authentication required.", 401) };
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, permission);
  if (!website) return { response: fail("Website not found or you do not have access.", 404) };
  if (property !== undefined && propertyHost(property) !== bare(domain)) return { response: fail("Choose a Search Console property for this website.") };
  let accessToken: string;
  try { accessToken = await getGoogleAccessToken(db, website.organizationId, domain, "search_console"); }
  catch (error) { return { response: fail(error instanceof Error ? error.message : "Search Console is not connected.", 409) }; }
  const canSubmit = await googleConnectionHasScope(db, website.organizationId, domain, "search_console", FULL_SCOPE);
  return { db, domain, website, accessToken, canSubmit };
}

export async function GET(request: Request, { params }: Context) {
  const property = new URL(request.url).searchParams.get("property") || "";
  const ctx = await context(request, params, "reports.read", property);
  if ("response" in ctx) return ctx.response;
  const response = await fetch(`${API}/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`, { headers: { Authorization: `Bearer ${ctx.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return fail(await googleError(response, "Could not load sitemaps from Search Console."), 502);
  const body = await response.json().catch(() => ({})) as { sitemap?: Array<Record<string, unknown>> };
  const sitemaps = (body.sitemap || []).map((item) => ({
    path: String(item.path || ""),
    lastSubmitted: item.lastSubmitted ?? null,
    lastDownloaded: item.lastDownloaded ?? null,
    isPending: item.isPending === true,
    errors: Number(item.errors || 0),
    warnings: Number(item.warnings || 0),
    submitted: Array.isArray(item.contents) ? item.contents.reduce((sum: number, entry: Record<string, unknown>) => sum + Number(entry.submitted || 0), 0) : null,
  }));
  return NextResponse.json({ sitemaps, canSubmit: ctx.canSubmit }, { headers: noStore });
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const parsed = await readJsonLimited<{ action?: unknown; property?: unknown; sitemapUrl?: unknown; url?: unknown }>(request, 8_192);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const { action } = parsed.value;
  const property = typeof parsed.value.property === "string" ? parsed.value.property.slice(0, 2048) : "";
  if (action !== "submit_sitemap" && action !== "inspect") return fail("Unknown action.");
  const ctx = await context(request, params, action === "submit_sitemap" ? "integrations.manage" : "reports.read", property);
  if ("response" in ctx) return ctx.response;
  const headers = { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" };

  if (action === "submit_sitemap") {
    if (!ctx.canSubmit) return fail("Search Console needs updated access to submit sitemaps. Click Reconnect next to Search Console and allow access.", 409);
    const fallbackBase = typeof ctx.website.url === "string" && ctx.website.url ? ctx.website.url : `https://${ctx.domain}/`;
    let sitemap: URL;
    try { sitemap = new URL(typeof parsed.value.sitemapUrl === "string" && parsed.value.sitemapUrl.trim() ? parsed.value.sitemapUrl.trim() : "/sitemap.xml", fallbackBase); } catch { return fail("Enter a valid sitemap address."); }
    if (!["http:", "https:"].includes(sitemap.protocol) || !urlInProperty(sitemap, property)) return fail("The sitemap must be on this website and inside the selected Search Console property.");
    // Make sure the sitemap exists before telling Google about it.
    try { await assertPublicUrl(sitemap.href); } catch { return fail("The sitemap address is not a public website."); }
    const check = await fetch(sitemap, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!check?.ok) return fail(`The sitemap could not be loaded at ${sitemap.href}${check ? ` (HTTP ${check.status})` : ""}. Publish a sitemap first or enter its correct address.`, 422);
    const response = await fetch(`${API}/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemap.href)}`, { method: "PUT", headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return fail(await googleError(response, "Google did not accept the sitemap."), 502);
    await ctx.db.collection("audit_logs").insertOne({ organizationId: ctx.website.organizationId, websiteDomain: ctx.domain, action: "google.sitemap.submitted", sitemap: sitemap.href, property, createdAt: new Date() });
    return NextResponse.json({ submitted: true, sitemap: sitemap.href }, { headers: noStore });
  }

  let target: URL;
  try { target = new URL(typeof parsed.value.url === "string" ? parsed.value.url.trim() : ""); } catch { return fail("Enter the full page address, including https://."); }
  if (!urlInProperty(target, property)) return fail("That page is not inside the selected Search Console property.");
  const response = await fetch(`${API}/v1/urlInspection/index:inspect`, { method: "POST", headers, body: JSON.stringify({ inspectionUrl: target.href, siteUrl: property }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return fail(await googleError(response, "Google could not inspect that page."), 502);
  const body = await response.json().catch(() => ({})) as { inspectionResult?: { indexStatusResult?: Record<string, unknown>; inspectionResultLink?: string } };
  const status = body.inspectionResult?.indexStatusResult ?? {};
  return NextResponse.json({
    url: target.href,
    verdict: status.verdict ?? "VERDICT_UNSPECIFIED",
    coverageState: status.coverageState ?? null,
    lastCrawlTime: status.lastCrawlTime ?? null,
    pageFetchState: status.pageFetchState ?? null,
    robotsTxtState: status.robotsTxtState ?? null,
    indexingState: status.indexingState ?? null,
    googleCanonical: status.googleCanonical ?? null,
    userCanonical: status.userCanonical ?? null,
    searchConsoleLink: body.inspectionResult?.inspectionResultLink ?? null,
  }, { headers: noStore });
}
