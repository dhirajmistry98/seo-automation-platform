"use server";

import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensurePersonalOrganization, findAccessibleWebsite, getOrganizationMemberships, hasOrganizationPermission } from "@/lib/organizations";
import { getRankTrackingKeywords, nextRankTrackingAt, parseRankTrackingDevice, parseRankTrackingFrequency, parseRankTrackingLanguageCode, parseRankTrackingLocationCode } from "@/lib/seo/rank-schedule";
import { normalizeResearchDomain } from "@/lib/integrations/dataforseo";
import { seoCrawlPageLimit } from "@/lib/seo/crawler";

function normalizeDomain(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;

  const input = value.trim().slice(0, 2048);
  let parsed: URL;
  try {
    parsed = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!(["https:", "http:"].includes(parsed.protocol)) || parsed.username || parsed.password || !host.includes(".") || host === "localhost") return null;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return null;
  return { domain: host, url: `${parsed.protocol}//${parsed.host}` };
}

const textField = (formData: FormData, key: string, limit = 200) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
};

const urlField = (formData: FormData, key: string, domain: string) => {
  const value = textField(formData, key, 2048);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password || parsed.hostname.toLowerCase().replace(/^www\./, "") !== domain) return null;
    return parsed.toString();
  } catch { return null; }
};

export async function updateWebsiteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = textField(formData, "domain", 253).toLowerCase();
  const base = `/dashboard/websites/${encodeURIComponent(domain)}`;
  if (!normalizeDomain(domain) || normalizeDomain(domain)?.domain !== domain) redirect("/dashboard/websites");
  const sitemapUrl = urlField(formData, "sitemapUrl", domain);
  const robotsUrl = urlField(formData, "robotsUrl", domain);
  if (sitemapUrl === null || robotsUrl === null) redirect(`${base}?error=url`);
  const websiteType = textField(formData, "websiteType", 30);
  const crawlFrequency = textField(formData, "crawlFrequency", 30);
  const pageSpeedFrequency = textField(formData, "pageSpeedFrequency", 30) || "manual";
  const maxPages = Number(textField(formData, "maxPages", 5));
  const primaryKeywords = textField(formData, "primaryKeywords", 1000).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const rankTrackingFrequency = parseRankTrackingFrequency(textField(formData, "rankTrackingFrequency", 30) || "manual");
  const rankTrackingLocationCode = parseRankTrackingLocationCode(textField(formData, "rankTrackingLocationCode", 12) || "2356");
  const rankTrackingLocationName = textField(formData, "rankTrackingLocationName", 255);
  const rankTrackingCountryCode = textField(formData, "rankTrackingCountryCode", 2).toUpperCase();
  const rankTrackingCountryName = textField(formData, "rankTrackingCountryName", 120);
  const rankTrackingCountryLocationCode = parseRankTrackingLocationCode(textField(formData, "rankTrackingCountryLocationCode", 12) || "2356");
  const rankTrackingLanguageCode = parseRankTrackingLanguageCode(textField(formData, "rankTrackingLanguageCode", 3) || "en");
  const rankTrackingDevice = parseRankTrackingDevice(textField(formData, "rankTrackingDevice", 10) || "desktop");
  if (!["business", "blog", "ecommerce", "other"].includes(websiteType) || !["manual", "weekly", "monthly"].includes(crawlFrequency) || !["manual", "weekly", "monthly"].includes(pageSpeedFrequency) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > seoCrawlPageLimit() || !rankTrackingFrequency || !rankTrackingLocationCode || !rankTrackingLocationName || !/^[A-Z]{2}$/.test(rankTrackingCountryCode) || !rankTrackingCountryName || !rankTrackingCountryLocationCode || !rankTrackingLanguageCode || !rankTrackingDevice) redirect(`${base}?error=fields`);
  if (rankTrackingFrequency !== "manual" && !getRankTrackingKeywords(primaryKeywords).length) redirect(`${base}?error=rank_keywords`);
  const rawCompetitors = textField(formData, "competitorDomains", 1000).split(",").map((value) => value.trim()).filter(Boolean);
  if (rawCompetitors.length > 20) redirect(`${base}?error=competitors`);
  const competitorDomains: string[] = [];
  for (const candidate of rawCompetitors) {
    const normalized = normalizeResearchDomain(candidate);
    if (!normalized || normalized === domain) redirect(`${base}?error=competitors`);
    if (!competitorDomains.includes(normalized)) competitorDomains.push(normalized);
  }
  try {
    const client = await clientPromise;
    const access = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.manage");
    if (!access.website) redirect("/dashboard/websites");
    const scheduleDays = crawlFrequency === "weekly" ? 7 : crawlFrequency === "monthly" ? 30 : 0;
    const pageSpeedDays = pageSpeedFrequency === "weekly" ? 7 : pageSpeedFrequency === "monthly" ? 30 : 0;
    const result = await client.db().collection("websites").updateOne(
      { _id: access.website._id, domain },
      { $set: {
        name: textField(formData, "name", 100), websiteType,
        businessCategory: textField(formData, "businessCategory", 100),
        targetCountry: rankTrackingCountryCode,
        targetLanguage: rankTrackingLanguageCode,
        timeZone: textField(formData, "timeZone", 80),
        primaryKeywords,
        competitorDomains,
        sitemapUrl, robotsUrl, crawlFrequency, maxPages, pageSpeedFrequency, rankTrackingFrequency, rankTrackingLocationCode, rankTrackingLocationName, rankTrackingCountryCode, rankTrackingCountryName, rankTrackingCountryLocationCode, rankTrackingLanguageCode, rankTrackingDevice,
        nextScheduledRankTrackingAt: nextRankTrackingAt(rankTrackingFrequency),
        updatedBy: session.user.id,
        nextScheduledAuditAt: scheduleDays ? new Date(Date.now() + scheduleDays * 86400_000) : null,
        nextScheduledPageSpeedAt: pageSpeedDays ? new Date(Date.now() + pageSpeedDays * 86400_000) : null,
        updatedAt: new Date(),
      } },
    );
    if (!result.matchedCount) redirect("/dashboard/websites");
    await client.db().collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId: access.website.organizationId, websiteDomain: domain, action: "website.settings.updated", changedFields: ["name", "websiteType", "businessCategory", "targetCountry", "targetLanguage", "timeZone", "primaryKeywords", "competitorDomains", "sitemapUrl", "robotsUrl", "crawlFrequency", "maxPages", "pageSpeedFrequency", "rankTrackingFrequency", "rankTrackingLocationCode", "rankTrackingLocationName", "rankTrackingCountryCode", "rankTrackingCountryName", "rankTrackingCountryLocationCode", "rankTrackingLanguageCode", "rankTrackingDevice"], createdAt: new Date() });
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Website settings failed:", error);
    redirect(`${base}?error=save`);
  }
  revalidatePath(base);
  redirect(`${base}?saved=1`);
}

export async function setWebsiteActiveAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = textField(formData, "domain", 253).toLowerCase();
  const active = textField(formData, "active", 5) === "true";
  if (!normalizeDomain(domain) || normalizeDomain(domain)?.domain !== domain) redirect("/dashboard/websites");
  try {
    const client = await clientPromise;
    const access = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.manage");
    if (!access.website) redirect("/dashboard/websites");
    await client.db().collection("websites").updateOne({ _id: access.website._id }, { $set: { active, updatedBy: session.user.id, updatedAt: new Date() } });
    await client.db().collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId: access.website.organizationId, websiteDomain: domain, action: active ? "website.activated" : "website.paused", createdAt: new Date() });
  } catch (error) {
    console.error("Website status failed:", error);
    redirect(`/dashboard/websites/${encodeURIComponent(domain)}?error=save`);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/websites/${encodeURIComponent(domain)}?saved=1`);
}

export async function addWebsiteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const website = normalizeDomain(formData.get("domain"));
  if (!website) redirect("/dashboard/websites?site=invalid");

  try {
    const client = await clientPromise;
    let organizationId: ObjectId;
    const memberships = await getOrganizationMemberships(client.db(), session.user.id);
    const requestedOrganization = textField(formData, "organizationId", 32);
    if (requestedOrganization) {
      if (!ObjectId.isValid(requestedOrganization)) redirect("/dashboard/websites");
      const membership = memberships.find((item) => String(item.organizationId) === requestedOrganization);
      if (!hasOrganizationPermission(membership?.role, "websites.manage")) redirect("/dashboard/websites");
      organizationId = new ObjectId(requestedOrganization);
    } else {
      organizationId = (await ensurePersonalOrganization(client.db(), session.user.id))._id;
    }
    const manageableOrganizationIds = memberships.filter((item) => hasOrganizationPermission(item.role, "websites.manage")).map((item) => item.organizationId);
    const existing = await client.db().collection("websites").findOne({ domain: website.domain, organizationId: { $in: manageableOrganizationIds } }, { projection: { organizationId: 1 } });
    if (existing) {
      if (String(existing.organizationId) !== String(organizationId)) redirect(`/dashboard/websites/${encodeURIComponent(website.domain)}`);
      redirect(`/dashboard/websites?site=exists`);
    }
    const result = await client.db().collection("websites").updateOne(
      { organizationId, domain: website.domain },
      {
        $setOnInsert: {
          ownerId: session.user.id,
          userId: session.user.id,
          createdBy: session.user.id,
          updatedBy: session.user.id,
          organizationId,
          domain: website.domain,
          url: website.url,
          status: "not_connected",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) await client.db().collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId, websiteDomain: website.domain, action: "website.created", createdAt: new Date() });
  } catch (error) {
    console.error("Website registration failed:", error);
    redirect("/dashboard/websites?site=unavailable");
  }

  redirect("/dashboard/websites?site=added");
}
