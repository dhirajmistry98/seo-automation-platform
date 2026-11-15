import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { getGoogleAccessToken, googlePayloadError } from "@/lib/integrations/google";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };
function dateString(date: Date) { return date.toISOString().slice(0, 10); }
async function getSite(request: Request, context: Context, permission: "websites.read" | "reports.read" | "integrations.manage") {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, permission);
  if (!website) return { error: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  return { session, domain, db, website };
}

export async function GET(request: Request, context: Context) {
  const site = await getSite(request, context, "reports.read"); if ("error" in site) return site.error;
  try {
    const accessToken = await getGoogleAccessToken(site.db, site.website.organizationId, site.domain, "merchant_center");
    const response = await fetch("https://merchantapi.googleapis.com/accounts/v1/accounts?pageSize=100", { redirect: "manual", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const payload = await response.json() as { accounts?: Array<Record<string, unknown>> };
    if (!response.ok) return NextResponse.json({ error: googlePayloadError(payload, "Merchant Center accounts could not be listed.") }, { status: 502 });
    return NextResponse.json({ accounts: payload.accounts || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Merchant Center is unavailable." }, { status: 503 }); }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const site = await getSite(request, context, "reports.read"); if ("error" in site) return site.error;
  const parsed = await readJsonLimited<{ accountId?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!/^\d{1,30}$/.test(accountId)) return NextResponse.json({ error: "Choose a numeric Merchant Center account." }, { status: 400 });
  const end = new Date(Date.now() - 2 * 86400_000); const start = new Date(end.getTime() - 27 * 86400_000);
  const query = `SELECT date, clicks, impressions, click_through_rate, conversions FROM product_performance_view WHERE date BETWEEN '${dateString(start)}' AND '${dateString(end)}' ORDER BY date ASC`;
  try {
    const accessToken = await getGoogleAccessToken(site.db, site.website.organizationId, site.domain, "merchant_center");
    const response = await fetch(`https://merchantapi.googleapis.com/reports/v1/accounts/${accountId}/reports:search`, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, pageSize: 100 }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const report = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ error: googlePayloadError(report, "Merchant Center report failed.") }, { status: 502 });
    const saved = { ownerId: site.session.user.id, userId: site.session.user.id, createdBy: site.session.user.id, organizationId: site.website.organizationId, websiteDomain: site.domain, accountId, startDate: dateString(start), endDate: dateString(end), report, source: "Google Merchant API Reports", generatedAt: new Date() };
    await site.db.collection("google_merchant_reports").insertOne(saved);
    return NextResponse.json({ ...saved, organizationId: undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Merchant Center is unavailable." }, { status: 503 }); }
}

/**
 * PUT: register this app's Google Cloud project with the user's Merchant Center account. The Merchant API
 * refuses every call from a project that is not registered with the account ("GCP project … is not registered
 * with the merchant account"). The developer email is the connected Google account's, read server-side.
 */
export async function PUT(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const site = await getSite(request, context, "integrations.manage"); if ("error" in site) return site.error;
  const parsed = await readJsonLimited<{ accountId?: unknown }>(request, 2_048);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const accountId = typeof parsed.value.accountId === "string" ? parsed.value.accountId.trim() : "";
  if (!/^\d{1,30}$/.test(accountId)) return NextResponse.json({ error: "Enter your numeric Merchant Center account ID (shown at the top of Merchant Center)." }, { status: 400 });
  const connection = await site.db.collection("google_connections").findOne({ organizationId: site.website.organizationId, domain: site.domain, service: "merchant_center", status: "connected" }, { projection: { providerEmail: 1 } });
  const developerEmail = typeof connection?.providerEmail === "string" ? connection.providerEmail : "";
  if (!developerEmail) return NextResponse.json({ error: "Reconnect Merchant Center so the connected Google account's email is known, then try again." }, { status: 409 });
  try {
    const accessToken = await getGoogleAccessToken(site.db, site.website.organizationId, site.domain, "merchant_center");
    const response = await fetch(`https://merchantapi.googleapis.com/accounts/v1/accounts/${accountId}/developerRegistration:registerGcp`, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ developerEmail }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json({ error: googlePayloadError(payload, "Merchant Center registration failed. You must be an admin of that Merchant Center account.") }, { status: 502 });
    return NextResponse.json({ registered: true, accountId, message: "Registered. Google can take up to 5 minutes to apply this, then load your Merchant accounts again." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Merchant Center is unavailable." }, { status: 503 }); }
}
