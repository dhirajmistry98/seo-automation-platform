import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { dataForSeoPost, buildDomainRankRows, isDataForSeoConfigured } from "@/lib/integrations/dataforseo";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { getRankTrackingKeywords, nextRankTrackingAt, parseRankTrackingDevice, parseRankTrackingFrequency, parseRankTrackingLanguageCode, parseRankTrackingLocationCode } from "@/lib/seo/rank-schedule";
import { parseGeoPoint, serpLocation } from "@/lib/seo/geo-target";

export const maxDuration = 90;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

function resultDocument(result: unknown): Array<Record<string, unknown>> {
  return Array.isArray(result) ? result.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, 100) : [];
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "A valid CRON_SECRET bearer token is required." }, { status: 401 });
  if (!isDataForSeoConfigured()) return NextResponse.json({ error: "Scheduled rank tracking requires configured DataForSEO credentials." }, { status: 503 });

  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const now = new Date();
  const leaseToken = randomUUID();
  const claimed = await db.collection("websites").findOneAndUpdate(
    {
      active: { $ne: false },
      verifiedAt: { $exists: true },
      rankTrackingFrequency: { $in: ["weekly", "monthly"] },
      "primaryKeywords.0": { $exists: true },
      nextScheduledRankTrackingAt: { $lte: now },
      $and: [
        { $or: [{ lastRankTrackingAttemptAt: { $lt: new Date(now.getTime() - 60_000) } }, { lastRankTrackingAttemptAt: { $exists: false } }] },
        { $or: [{ rankTrackingLeaseUntil: { $lt: now } }, { rankTrackingLeaseUntil: { $exists: false } }] },
      ],
    },
    { $set: { lastRankTrackingAttemptAt: now, rankTrackingLeaseToken: leaseToken, rankTrackingLeaseUntil: new Date(now.getTime() + 120_000) } },
    { sort: { nextScheduledRankTrackingAt: 1 }, returnDocument: "after" },
  );
  const site = claimed && "value" in claimed ? claimed.value : claimed;
  if (!site) return NextResponse.json({ processed: false, message: "No scheduled rank checks are due." });

  const keywords = getRankTrackingKeywords(site.primaryKeywords);
  const frequency = parseRankTrackingFrequency(site.rankTrackingFrequency);
  if (!keywords.length || !frequency || frequency === "manual") {
    await db.collection("websites").updateOne({ _id: site._id, rankTrackingLeaseToken: leaseToken }, { $set: { lastRankTrackingStatus: "invalid_settings", nextScheduledRankTrackingAt: new Date(now.getTime() + 24 * 60 * 60_000) }, $unset: { rankTrackingLeaseToken: "", rankTrackingLeaseUntil: "" } });
    return NextResponse.json({ processed: true, error: "Rank tracking settings need at least one keyword." }, { status: 409 });
  }

  const locationCode = parseRankTrackingLocationCode(site.rankTrackingLocationCode) || 2356;
  const locationName = typeof site.rankTrackingLocationName === "string" ? site.rankTrackingLocationName : "India";
  const countryCode = typeof site.rankTrackingCountryCode === "string" ? site.rankTrackingCountryCode : "IN";
  const countryName = typeof site.rankTrackingCountryName === "string" ? site.rankTrackingCountryName : countryCode;
  const languageCode = parseRankTrackingLanguageCode(site.rankTrackingLanguageCode) || "en";
  const device = parseRankTrackingDevice(site.rankTrackingDevice) || "desktop";
  const geoPoint = parseGeoPoint(site.rankTrackingLatitude, site.rankTrackingLongitude, site.rankTrackingRadiusKm);
  const query = keywords.join(", ");

  try {
    const providerResult = await dataForSeoPost("serp/google/organic/live/advanced", keywords.map((keyword) => ({ keyword, ...serpLocation(locationCode, geoPoint), language_code: languageCode, device, depth: 100 })));
    const rows = resultDocument(buildDomainRankRows(providerResult.tasks || [], keywords, String(site.domain)));
    const completedAt = new Date();
    const ownership = await db.collection("websites").findOne({ _id: site._id, rankTrackingLeaseToken: leaseToken }, { projection: { rankTrackingFrequency: 1 } });
    if (!ownership) return NextResponse.json({ processed: false, message: "Rank tracking settings changed while this report was running." });

    const nextRunAt = nextRankTrackingAt(frequency, completedAt);
    const ownerId = typeof site.ownerId === "string" ? site.ownerId : "system";
    const report = {
      ownerId,
      organizationId: site.organizationId,
      websiteDomain: site.domain,
      kind: "rank",
      query,
      locationCode,
      locationName,
      countryCode,
      countryName,
      countryLocationCode: parseRankTrackingLocationCode(site.rankTrackingCountryLocationCode) || locationCode,
      languageCode,
      device,
      provider: "DataForSEO",
      source: "scheduled",
      fetchedAt: completedAt,
      result: rows,
    };
    const inserted = await db.collection("seo_research_reports").insertOne(report);
    await db.collection("websites").updateOne(
      { _id: site._id, rankTrackingLeaseToken: leaseToken },
      { $set: { lastRankTrackingAt: completedAt, lastRankTrackingStatus: "completed", nextScheduledRankTrackingAt: nextRunAt, updatedAt: completedAt }, $unset: { rankTrackingLeaseToken: "", rankTrackingLeaseUntil: "" } },
    );
    await db.collection("audit_logs").insertOne({ ownerId, userId: ownerId, actorId: "system", organizationId: site.organizationId, websiteDomain: site.domain, action: "seo.rank_tracking.scheduled_completed", locationCode, locationName, countryCode, countryName, languageCode, device, keywordCount: keywords.length, createdAt: completedAt });

    const members = await db.collection("organization_memberships").find({ organizationId: site.organizationId, status: "active" }, { projection: { userId: 1 } }).toArray();
    if (members.length) await db.collection("notifications").insertMany(members.map((member) => ({ userId: member.userId, organizationId: site.organizationId, websiteDomain: site.domain, type: "rank_tracking.completed", title: "Scheduled search position check completed for " + site.domain, message: keywords.length + " keywords checked · " + device + " · " + locationName + ".", createdAt: completedAt })));
    return NextResponse.json({ processed: true, domain: site.domain, reportId: String(inserted.insertedId), keywordCount: keywords.length, nextRunAt });
  } catch {
    const failedAt = new Date();
    await db.collection("websites").updateOne(
      { _id: site._id, rankTrackingLeaseToken: leaseToken },
      { $set: { lastRankTrackingAt: failedAt, lastRankTrackingStatus: "failed", nextScheduledRankTrackingAt: new Date(failedAt.getTime() + 6 * 60 * 60_000), updatedAt: failedAt }, $unset: { rankTrackingLeaseToken: "", rankTrackingLeaseUntil: "" } },
    );
    await db.collection("audit_logs").insertOne({ ownerId: typeof site.ownerId === "string" ? site.ownerId : "system", actorId: "system", organizationId: site.organizationId, websiteDomain: site.domain, action: "seo.rank_tracking.scheduled_failed", createdAt: failedAt });
    return NextResponse.json({ processed: true, domain: site.domain, error: "Scheduled rank tracking failed. The site will be retried later." }, { status: 502 });
  }
}
