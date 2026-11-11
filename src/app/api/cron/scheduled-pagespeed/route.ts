import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { runPageSpeed } from "@/lib/integrations/pagespeed";
import { ensureSeoIndexes } from "@/lib/seo/indexes";

export const maxDuration = 90;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "A valid CRON_SECRET bearer token is required." }, { status: 401 });
  if (!process.env.GOOGLE_PAGESPEED_API_KEY) return NextResponse.json({ error: "Scheduled PageSpeed checks require GOOGLE_PAGESPEED_API_KEY." }, { status: 503 });
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const now = new Date();
  const leaseToken = randomUUID();
  const claimed = await db.collection("websites").findOneAndUpdate(
    {
      active: { $ne: false }, verifiedAt: { $type: "date" },
      pageSpeedFrequency: { $in: ["weekly", "monthly"] }, nextScheduledPageSpeedAt: { $lte: now },
      $or: [{ pageSpeedLeaseUntil: { $lt: now } }, { pageSpeedLeaseUntil: { $exists: false } }],
    },
    { $set: { pageSpeedLeaseToken: leaseToken, pageSpeedLeaseUntil: new Date(now.getTime() + 120_000), lastPageSpeedAttemptAt: now } },
    { sort: { nextScheduledPageSpeedAt: 1 }, returnDocument: "after" },
  );
  const site = claimed && "value" in claimed ? claimed.value : claimed;
  if (!site) return NextResponse.json({ processed: false, message: "No scheduled PageSpeed checks are due." });
  const ownerId = typeof site.ownerId === "string" ? site.ownerId : "system";
  const domain = String(site.domain || "").toLowerCase();
  const frequency = site.pageSpeedFrequency === "weekly" ? "weekly" : "monthly";
  const strategy = "mobile" as const;
  try {
    const target = new URL(String(site.url));
    if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password || target.hostname.replace(/^www\./, "").toLowerCase() !== domain.replace(/^www\./, "")) throw new Error("The website homepage URL is invalid.");
    const report = await runPageSpeed(target.href, strategy);
    const completedAt = new Date();
    const prior = await db.collection("pagespeed_results").findOne(
      { organizationId: site.organizationId, websiteDomain: domain, url: target.href, strategy },
      { sort: { retrievedAt: -1 }, projection: { "categories.performance": 1 } },
    );
    const record = { ownerId, userId: ownerId, createdBy: "system", organizationId: site.organizationId, websiteDomain: domain, url: target.href, strategy, ...report, scheduleSource: "scheduled", retrievedAt: completedAt };
    const ownership = await db.collection("websites").findOne({ _id: site._id, organizationId: site.organizationId, pageSpeedFrequency: site.pageSpeedFrequency, active: { $ne: false }, pageSpeedLeaseToken: leaseToken }, { projection: { _id: 1 } });
    if (!ownership) return NextResponse.json({ processed: false, message: "PageSpeed settings changed while this check was running." });
    await db.collection("pagespeed_results").insertOne(record);
    const nextRunAt = new Date(completedAt.getTime() + (frequency === "weekly" ? 7 : 30) * 86400_000);
    await db.collection("websites").updateOne({ _id: site._id, pageSpeedLeaseToken: leaseToken }, {
      $set: { lastScheduledPageSpeedAt: completedAt, lastScheduledPageSpeedStatus: "completed", nextScheduledPageSpeedAt: nextRunAt, updatedAt: completedAt },
      $unset: { pageSpeedLeaseToken: "", pageSpeedLeaseUntil: "", lastScheduledPageSpeedError: "" },
    });
    await db.collection("audit_logs").insertOne({ ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: domain, action: "integration.pagespeed.scheduled_completed", strategy, createdAt: completedAt });
    const currentPerformance = report.categories.performance;
    const previousPerformance = prior?.categories?.performance;
    if (typeof currentPerformance === "number" && typeof previousPerformance === "number" && currentPerformance <= previousPerformance - 10) {
      const members = await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active" }, { projection: { userId: 1 } }).toArray();
      if (members.length) await db.collection("notifications").insertMany(members.map((member) => ({
        userId: member.userId, organizationId: site.organizationId, websiteDomain: domain, type: "pagespeed.regression",
        title: `PageSpeed score dropped for ${domain}`,
        message: `Mobile Lighthouse performance fell from ${previousPerformance} to ${currentPerformance} for ${target.href}.`,
        url: target.href, strategy, previousPerformance, currentPerformance, createdAt: completedAt,
      })));
    }
    return NextResponse.json({ processed: true, domain, strategy, performance: currentPerformance, nextRunAt });
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message.slice(0, 300) : "PageSpeed request failed.";
    await db.collection("websites").updateOne({ _id: site._id, pageSpeedLeaseToken: leaseToken }, {
      $set: { lastScheduledPageSpeedAt: failedAt, lastScheduledPageSpeedStatus: "failed", lastScheduledPageSpeedError: message, nextScheduledPageSpeedAt: new Date(failedAt.getTime() + 6 * 3600_000), updatedAt: failedAt },
      $unset: { pageSpeedLeaseToken: "", pageSpeedLeaseUntil: "" },
    });
    await db.collection("audit_logs").insertOne({ ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: domain, action: "integration.pagespeed.scheduled_failed", createdAt: failedAt });
    return NextResponse.json({ processed: true, domain, error: "Scheduled PageSpeed check failed. The site will be retried later." }, { status: 502 });
  }
}
