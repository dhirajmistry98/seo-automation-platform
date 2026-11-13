import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { runPageSpeed } from "@/lib/integrations/pagespeed";

export const maxDuration = 90;
type Context = { params: Promise<{ domain: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const reports = await db.collection("pagespeed_results").find({ organizationId: site.organizationId, websiteDomain: domain })
    .sort({ retrievedAt: -1 }).limit(10).project({ _id: 0 }).toArray();
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const parsed = await readJsonLimited<{ url?: unknown; strategy?: unknown }>(request, 4_096);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  const strategy = body.strategy === "desktop" ? "desktop" : body.strategy === "mobile" ? "mobile" : null;
  if (!strategy || typeof body.url !== "string" || body.url.length > 2048) return NextResponse.json({ error: "Provide a URL and either the mobile or desktop strategy." }, { status: 400 });
  let target: URL;
  try { target = new URL(body.url); } catch { return NextResponse.json({ error: "Invalid page URL." }, { status: 400 }); }
  if (!(target.protocol === "http:" || target.protocol === "https:") || target.username || target.password) return NextResponse.json({ error: "Only public HTTP and HTTPS URLs are supported." }, { status: 400 });
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "audit.run");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!site.verifiedAt) return NextResponse.json({ error: "Verify domain ownership before requesting PageSpeed data." }, { status: 403 });
  const rootHost = String(site.domain).replace(/^www\./, "").toLowerCase();
  const targetHost = target.hostname.replace(/^www\./, "").toLowerCase();
  if (targetHost !== rootHost) return NextResponse.json({ error: "The page URL must belong to this verified website." }, { status: 403 });
  const recentlyRequested = await db.collection("pagespeed_results").findOne({ organizationId: site.organizationId, websiteDomain: domain, url: target.href, strategy, retrievedAt: { $gte: new Date(Date.now() - 60_000) } }, { projection: { _id: 1 } });
  if (recentlyRequested) return NextResponse.json({ error: "Please wait one minute before requesting another PageSpeed report for this page and device." }, { status: 429 });
  const integrations = db.collection("integration_status");
  const statusFilter = { ownerId: session.user.id, websiteDomain: domain, provider: "google_pagespeed" };
  const setIntegrationStatus = async (status: string, errorMessage?: string) => integrations.updateOne(statusFilter, {
    $set: { userId: session.user.id, updatedBy: session.user.id, status, lastAttemptAt: new Date(), ...(status === "connected" ? { lastSyncedAt: new Date(), lastError: null } : errorMessage ? { lastError: errorMessage } : {}) },
    $setOnInsert: { ownerId: session.user.id, userId: session.user.id, createdBy: session.user.id, websiteDomain: domain, provider: "google_pagespeed", createdAt: new Date() },
  }, { upsert: true });
  try {
    await setIntegrationStatus("syncing");
    const report = await runPageSpeed(target.href, strategy);
    const record = {
      ownerId: session.user.id,
      userId: session.user.id,
      createdBy: session.user.id,
      organizationId: site.organizationId,
      websiteDomain: domain,
      url: target.href,
      strategy,
      ...report,
      retrievedAt: new Date(),
    };
    const previous = await db.collection("pagespeed_results").findOne(
      { organizationId: site.organizationId, websiteDomain: domain, url: target.href, strategy },
      { sort: { retrievedAt: -1 }, projection: { "categories.performance": 1 } },
    );
    await db.collection("pagespeed_results").insertOne(record);
    await setIntegrationStatus("connected");
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "integration.pagespeed.completed", url: target.href, strategy, createdAt: record.retrievedAt });
    const previousPerformance = previous?.categories?.performance;
    const currentPerformance = report.categories.performance;
    if (typeof previousPerformance === "number" && typeof currentPerformance === "number" && currentPerformance <= previousPerformance - 10) {
      const members = await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active", userId: { $ne: session.user.id } }, { projection: { userId: 1 } }).toArray();
      if (members.length) await db.collection("notifications").insertMany(members.map((member) => ({
        userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "pagespeed.regression",
        title: `PageSpeed score dropped for ${domain}`,
        message: `${strategy === "mobile" ? "Mobile" : "Desktop"} Lighthouse performance fell from ${previousPerformance} to ${currentPerformance} for ${target.href}.`,
        url: target.href, strategy, previousPerformance, currentPerformance, createdAt: record.retrievedAt,
      })));
    }
    return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PageSpeed request failed.";
    // Recording the failure must never turn a readable error into an empty 500.
    await setIntegrationStatus("error", message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
