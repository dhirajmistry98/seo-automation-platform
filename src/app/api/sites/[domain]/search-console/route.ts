import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { getGoogleAccessToken } from "@/lib/integrations/google";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { defaultReportRange, percentChange, previousReportRange, reportRangeIsValid } from "@/lib/integrations/google-reports";

type Context = { params: Promise<{ domain: string }> };
function siteHost(property: string) {
  const value = property.startsWith("sc-domain:") ? property.slice("sc-domain:".length) : (() => { try { return new URL(property).hostname; } catch { return ""; } })();
  return value.toLowerCase().replace(/^www\./, "");
}
function googleErrorMessage(fallback: string, detail?: string) {
  if (!detail) return fallback;
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) return `${fallback} The Google Search Console API is not enabled for this app's Google Cloud project. Enable it in Google Cloud Console and try again.`;
  if (/insufficient|scope/i.test(detail)) return `${fallback} Google did not grant Search Console access. Click Reconnect and allow Search Console on the consent screen.`;
  if (/permission|not have sufficient/i.test(detail)) return `${fallback} The connected Google account does not have access to this property in Search Console.`;
  return `${fallback} Google said: ${detail.slice(0, 300)}`;
}
function responseError(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return responseError("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return responseError("Website not found.", 404);
  try {
    const accessToken = await getGoogleAccessToken(db, website.organizationId, domain, "search_console");
    const response = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", { redirect: "manual", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => ({})) as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }>; error?: { message?: string } };
    if (!response.ok) return responseError(googleErrorMessage("Search Console could not list accessible properties.", payload.error?.message), response.status === 401 ? 401 : 502);
    const entries = (payload.siteEntry || []).filter((item) => item.permissionLevel !== "siteUnverifiedUser");
    const properties = entries.filter((item) => siteHost(item.siteUrl) === domain.replace(/^www\./, "")).map((item) => ({ siteUrl: item.siteUrl, permissionLevel: item.permissionLevel }));
    // When nothing matches, list what the connected account can see so the user knows why.
    const otherProperties = properties.length ? [] : entries.slice(0, 20).map((item) => item.siteUrl);
    return NextResponse.json({ properties, otherProperties }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseError(error instanceof Error ? error.message : "Search Console is unavailable.", 503); }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return responseError("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return responseError("Website not found.", 404);
  const parsed = await readJsonLimited<{ property?: unknown; startDate?: unknown; endDate?: unknown; dimension?: unknown; compare?: unknown }>(request, 6_144);
  if (!parsed.ok) return responseError(parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body.", parsed.status);
  const body = parsed.value;
  const property = typeof body.property === "string" ? body.property.slice(0, 2048) : "";
  let parsedPropertyHost = "";
  if (property.startsWith("sc-domain:")) parsedPropertyHost = property.slice(10).toLowerCase().replace(/^www\./, "");
  else { try { parsedPropertyHost = new URL(property).hostname.toLowerCase().replace(/^www\./, ""); } catch {} }
  if (!property || parsedPropertyHost !== domain.replace(/^www\./, "")) return responseError("Choose a Search Console property for this website.");
  const dimension = ["query", "page", "country", "device", "date"].includes(String(body.dimension)) ? String(body.dimension) : "query";
  const defaults = defaultReportRange(28, 3);
  const startDate = typeof body.startDate === "string" ? body.startDate : defaults.startDate;
  const endDate = typeof body.endDate === "string" ? body.endDate : defaults.endDate;
  if (!reportRangeIsValid(startDate, endDate) || endDate > defaults.endDate) return responseError("Choose a valid Search Console date range of up to 366 days. Search Console data may be delayed by several days.");
  const comparisonEnabled = body.compare !== false;
  const previous = previousReportRange(startDate, endDate);
  try {
    const accessToken = await getGoogleAccessToken(db, website.organizationId, domain, "search_console");
    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
    const query = async (from: string, to: string) => {
      const response = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ startDate: from, endDate: to, dimensions: [dimension], rowLimit: 250, dataState: "final" }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const payload = await response.json().catch(() => ({})) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>; error?: { message?: string } };
      if (!response.ok) throw new Error(googleErrorMessage("Search Console report request failed.", payload.error?.message));
      return payload.rows || [];
    };
    const [rows, previousRows] = await Promise.all([query(startDate, endDate), comparisonEnabled ? query(previous.startDate, previous.endDate) : Promise.resolve([])]);
    const keyed = new Map(previousRows.map((row) => [row.keys?.join("\u0000") || "", row]));
    const comparisonRows = rows.map((row) => {
      const prior = keyed.get(row.keys?.join("\u0000") || "");
      return { keys: row.keys || [], clicks: { current: row.clicks || 0, previous: prior?.clicks || 0, changePercent: percentChange(row.clicks || 0, prior?.clicks || 0) }, impressions: { current: row.impressions || 0, previous: prior?.impressions || 0, changePercent: percentChange(row.impressions || 0, prior?.impressions || 0) }, ctr: { current: row.ctr || 0, previous: prior?.ctr || 0, changePercent: percentChange(row.ctr || 0, prior?.ctr || 0) }, position: { current: row.position || 0, previous: prior?.position || 0, change: prior ? Math.round(((row.position || 0) - (prior.position || 0)) * 100) / 100 : null } };
    });
    const queryOpportunities = dimension === "query" ? rows.filter((row) => (row.impressions || 0) >= 100 && (row.position || 0) >= 4 && (row.position || 0) <= 20).slice(0, 50).map((row) => ({ query: row.keys?.[0] || "", impressions: row.impressions || 0, clicks: row.clicks || 0, ctr: row.ctr || 0, averagePosition: row.position || 0, priorClicks: keyed.get(row.keys?.join("\u0000") || "")?.clicks || 0 })) : [];
    const generatedAt = new Date();
    const report = { ownerId: session.user.id, userId: session.user.id, createdBy: session.user.id, organizationId: website.organizationId, websiteDomain: domain, property, dimension, startDate, endDate, previousDateRange: comparisonEnabled ? previous : null, rowCount: rows.length, rows, comparisonRows, queryOpportunities, generatedAt, source: "Google Search Console API" };
    await db.collection("google_search_console_reports").insertOne(report);
    return NextResponse.json({ report: { ...report, organizationId: undefined } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : "Search Console is unavailable."; return responseError(message, message.startsWith("Search Console report request failed") ? 502 : 503); }
}
