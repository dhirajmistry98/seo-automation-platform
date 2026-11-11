import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { getGoogleAccessToken } from "@/lib/integrations/google";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { defaultReportRange, percentChange, previousReportRange, reportRangeIsValid } from "@/lib/integrations/google-reports";

export async function GET(_request: Request, context: { params: Promise<{ domain: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  try {
    const accessToken = await getGoogleAccessToken(db, website.organizationId, domain, "analytics");
    const properties: Array<{ property: string; displayName: string }> = [];
    let pageToken = "";
    for (let page = 0; page < 5; page += 1) {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { redirect: "manual", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const data = await response.json() as { accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string; displayName?: string; parent?: string }> }>; nextPageToken?: string; error?: { message?: string } };
      if (!response.ok) return NextResponse.json({ error: data.error?.message || "Analytics Admin API could not list properties." }, { status: response.status === 401 ? 401 : 502 });
      for (const account of data.accountSummaries || []) for (const property of account.propertySummaries || []) {
        if (property.property && /^properties\/\d+$/.test(property.property)) properties.push({ property: property.property, displayName: property.displayName || property.property });
      }
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
    return NextResponse.json({ properties }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Analytics properties are unavailable." }, { status: 503 }); }
}

export async function POST(request: Request, context: { params: Promise<{ domain: string }> }) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const parsed = await readJsonLimited<{ propertyId?: unknown; startDate?: unknown; endDate?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
  if (!/^\d{4,30}$/.test(propertyId)) return NextResponse.json({ error: "Enter the numeric GA4 property ID." }, { status: 400 });
  const defaults = defaultReportRange(28, 1);
  const startDate = typeof body.startDate === "string" ? body.startDate : defaults.startDate;
  const endDate = typeof body.endDate === "string" ? body.endDate : defaults.endDate;
  if (!reportRangeIsValid(startDate, endDate) || endDate > defaults.endDate) return NextResponse.json({ error: "Choose a valid date range of up to 366 days ending no later than yesterday." }, { status: 400 });
  try {
    const accessToken = await getGoogleAccessToken(db, website.organizationId, domain, "analytics");
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const previous = previousReportRange(startDate, endDate);
    const metrics = [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "conversions" }, { name: "engagedSessions" }, { name: "engagementRate" }];
    const landingMetrics = [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "conversions" }];
    const organicFilter = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: false } } };
    const runReport = async (requestBody: Record<string, unknown>) => {
      const response = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody), cache: "no-store", signal: AbortSignal.timeout(25_000) });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error("Analytics Data API report failed. Check the GA4 property ID, permissions, and API setup.");
      return payload;
    };
    const [trend, summary, previousSummary, landingPages] = await Promise.all([
      runReport({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: "date" }], metrics, dimensionFilter: organicFilter, limit: "1000" }),
      runReport({ dateRanges: [{ startDate, endDate }], metrics, dimensionFilter: organicFilter }),
      runReport({ dateRanges: [{ startDate: previous.startDate, endDate: previous.endDate }], metrics, dimensionFilter: organicFilter }),
      runReport({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: "landingPagePlusQueryString" }], metrics: landingMetrics, dimensionFilter: organicFilter, orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: "100" }),
    ]);
    const metricNames = metrics.map((metric) => metric.name);
    const metricRow = (value: Record<string, unknown>) => Array.isArray(value.rows) ? (value.rows[0] as { metricValues?: Array<{ value?: string }> } | undefined)?.metricValues || [] : [];
    const currentValues = metricRow(summary);
    const previousValues = metricRow(previousSummary);
    const comparison = Object.fromEntries(metricNames.map((name, index) => {
      const current = Number(currentValues[index]?.value || 0);
      const prior = Number(previousValues[index]?.value || 0);
      return [name, { current, previous: prior, changePercent: percentChange(current, prior) }];
    }));
    const report = {
      rows: (trend.rows as unknown[]) || [],
      rowCount: Number(trend.rowCount || 0),
      metricHeaders: (trend.metricHeaders as unknown[]) || [],
      dimensionHeaders: (trend.dimensionHeaders as unknown[]) || [],
      organicSummary: currentValues,
      previousOrganicSummary: previousValues,
      comparison,
      landingPages: (landingPages.rows as unknown[]) || [],
      dateRange: { startDate, endDate },
      previousDateRange: previous,
      channel: "Organic Search",
    };
    const generatedAt = new Date();
    const saved = { ownerId: session.user.id, userId: session.user.id, createdBy: session.user.id, organizationId: website.organizationId, websiteDomain: domain, propertyId, report, startDate, endDate, previousDateRange: previous, channel: "Organic Search", source: "Google Analytics Data API", generatedAt };
    await db.collection("google_analytics_reports").insertOne(saved);
    return NextResponse.json({ ...saved, organizationId: undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Analytics is unavailable." }, { status: error instanceof Error && error.message.startsWith("Analytics Data API") ? 502 : 503 }); }
}
