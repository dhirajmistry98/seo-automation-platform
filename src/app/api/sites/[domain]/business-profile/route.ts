import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { getGoogleAccessToken } from "@/lib/integrations/google";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };
async function getSite(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return { error: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  return { session, domain, db, website };
}

export async function GET(request: Request, context: Context) {
  const site = await getSite(context); if ("error" in site) return site.error;
  try {
    const accessToken = await getGoogleAccessToken(site.db, site.website.organizationId, site.domain, "business_profile");
    const account = new URL(request.url).searchParams.get("account");
    const endpoint = account && /^accounts\/\d{1,30}$/.test(account)
      ? `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title,storefrontAddress,websiteUri,primaryCategory&pageSize=100`
      : "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
    const response = await fetch(endpoint, { redirect: "manual", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ error: "Business Profile data could not be listed. Confirm API access and account permissions." }, { status: 502 });
    return NextResponse.json({ ...data, kind: account ? "locations" : "accounts" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Business Profile is unavailable." }, { status: 503 }); }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const site = await getSite(context); if ("error" in site) return site.error;
  const parsed = await readJsonLimited<{ locationName?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const locationName = typeof body.locationName === "string" ? body.locationName : "";
  if (!/^locations\/\d{1,30}$/.test(locationName)) return NextResponse.json({ error: "Choose a valid Business Profile location." }, { status: 400 });
  const end = new Date(Date.now() - 2 * 86400_000); const start = new Date(end.getTime() - 27 * 86400_000);
  const dateParts = (date: Date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
  const endpoint = new URL(`https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries`);
  for (const metric of ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"]) endpoint.searchParams.append("dailyMetrics", metric);
  const startDate = dateParts(start); const endDate = dateParts(end);
  for (const [key, value] of Object.entries(startDate)) endpoint.searchParams.set(`dailyRange.start_date.${key}`, String(value));
  for (const [key, value] of Object.entries(endDate)) endpoint.searchParams.set(`dailyRange.end_date.${key}`, String(value));
  try {
    const accessToken = await getGoogleAccessToken(site.db, site.website.organizationId, site.domain, "business_profile");
    const response = await fetch(endpoint, { redirect: "manual", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const report = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ error: "Business Profile performance report failed. Check listing access and API approval." }, { status: 502 });
    const saved = { ownerId: site.session.user.id, userId: site.session.user.id, createdBy: site.session.user.id, organizationId: site.website.organizationId, websiteDomain: site.domain, locationName, startDate, endDate, report, source: "Google Business Profile Performance API", generatedAt: new Date() };
    await site.db.collection("google_business_profile_reports").insertOne(saved);
    return NextResponse.json({ ...saved, organizationId: undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Business Profile is unavailable." }, { status: 503 }); }
}
