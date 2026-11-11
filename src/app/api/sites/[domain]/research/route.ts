import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { buildDomainRankRows, dataForSeoPost, getProviderItems, isDataForSeoConfigured, normalizeResearchDomain, normalizeSearchDevice } from "@/lib/integrations/dataforseo";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ensureSeoIndexes } from "@/lib/seo/indexes";

type Context = { params: Promise<{ domain: string }> };
type ResearchKind = "keywords" | "questions" | "rank" | "backlinks" | "competitors" | "ai_visibility";
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }
function safeDomain(value: string) { return value.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const domain = safeDomain(decodeURIComponent((await context.params).domain));
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return error("Website not found.", 404);
  const history = await db.collection("seo_research_reports").find({ organizationId: website.organizationId, websiteDomain: domain }, { projection: { result: 1, providerSummary: 1, kind: 1, query: 1, competitorDomain: 1, locationCode: 1, locationName: 1, countryCode: 1, countryName: 1, countryLocationCode: 1, languageCode: 1, device: 1, platform: 1, source: 1, fetchedAt: 1, provider: 1, providerCostUsd: 1, _id: 0 } }).sort({ fetchedAt: -1 }).limit(30).toArray();
  return NextResponse.json({ configured: isDataForSeoConfigured(), history }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const domain = safeDomain(decodeURIComponent((await context.params).domain));
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return error("Website not found.", 404);
  if (!website.verifiedAt) return error("Verify ownership of this website before running paid research reports.", 409);
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 12_000);
  if (!parsed.ok) return error(parsed.status === 413 ? "Request is too large." : "Invalid request body.", parsed.status);
  const body = parsed.value;
  const kind = body.kind as ResearchKind;
  if (!["keywords", "questions", "rank", "backlinks", "competitors", "ai_visibility"].includes(kind)) return error("Choose a supported research report.");
  const locationCode = Number.isSafeInteger(body.locationCode) ? Number(body.locationCode) : Number(website.rankTrackingLocationCode || 2356);
  const countryLocationCode = Number.isSafeInteger(body.countryLocationCode) ? Number(body.countryLocationCode) : Number(website.rankTrackingCountryLocationCode || website.rankTrackingLocationCode || 2356);
  const countryCode = typeof body.countryCode === "string" && /^[a-z]{2}$/i.test(body.countryCode) ? body.countryCode.toUpperCase() : String(website.rankTrackingCountryCode || "IN").toUpperCase();
  const countryName = typeof body.countryName === "string" && body.countryName.trim().length <= 120 ? body.countryName.trim() : String(website.rankTrackingCountryName || countryCode);
  const locationName = typeof body.locationName === "string" && body.locationName.trim().length <= 255 ? body.locationName.trim() : String(website.rankTrackingLocationName || countryCode);
  const languageCode = typeof body.languageCode === "string" && /^[a-z]{2,3}$/.test(body.languageCode) ? body.languageCode : String(website.rankTrackingLanguageCode || "en");
  const device = kind === "rank" ? normalizeSearchDevice(body.device) : undefined;
  const platform = kind === "ai_visibility" && body.platform === "chat_gpt" ? "chat_gpt" : "google";
  const competitorDomain = kind === "competitors" ? normalizeResearchDomain(body.competitorDomain) : null;
  if (kind === "competitors") {
    const configuredCompetitors = Array.isArray(website.competitorDomains)
      ? website.competitorDomains.map(normalizeResearchDomain).filter((item): item is string => Boolean(item))
      : [];
    if (!competitorDomain || competitorDomain === domain || !configuredCompetitors.includes(competitorDomain)) return error("Choose one of the competitor domains saved in website settings.");
  }
  if (!Number.isSafeInteger(locationCode) || locationCode < 1 || locationCode > 999_999_999_999 || !Number.isSafeInteger(countryLocationCode) || countryLocationCode < 1 || countryLocationCode > 999_999_999_999 || !/^[A-Z]{2}$/.test(countryCode)) return error("Choose a valid provider location.");
  if (kind === "ai_visibility" && platform === "chat_gpt" && (countryLocationCode !== 2840 || languageCode !== "en")) return error("ChatGPT mention data is currently available only for United States English. Select United States and en.");
  if (!isDataForSeoConfigured()) return error("SEO research is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the server environment.", 503);
  const limit = await consumeRateLimit(db, "seo-research", `${String(website.organizationId)}:${domain}`, 20, 60 * 60_000);
  if (!limit.allowed) return error(`Research limit reached for this website. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
  try {
    let providerResult;
    let query = "";
    let items: Array<Record<string, unknown>> = [];
    let providerSummary: Array<Record<string, unknown>> | undefined;
    let additionalProviderCost = 0;
    if (kind === "keywords") {
      const keywords = Array.isArray(body.keywords) ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 25) : [];
      if (!keywords.length || keywords.some((item) => item.length > 120)) return error("Enter between 1 and 25 keywords, up to 120 characters each.");
      query = keywords.join(", ").slice(0, 2_000);
      providerResult = await dataForSeoPost("dataforseo_labs/google/keyword_overview/live", [{ keywords, location_code: countryLocationCode, language_code: languageCode }]);
      items = getProviderItems(providerResult);
    } else if (kind === "questions") {
      const seed = Array.isArray(body.keywords) ? body.keywords.find((item): item is string => typeof item === "string")?.trim() || "" : "";
      if (!seed || seed.length > 120) return error("Enter one topic phrase, up to 120 characters, for question research.");
      query = seed;
      providerResult = await dataForSeoPost("dataforseo_labs/google/keyword_suggestions/live", [{ keyword: seed, location_code: countryLocationCode, language_code: languageCode, include_serp_info: true, limit: 100 }]);
      items = getProviderItems(providerResult).filter((item) => typeof item.keyword === "string" && /^(who|what|where|when|why|how|which|can|does|do|is|are|should|will|could|would)\b/i.test(item.keyword.trim())).slice(0, 100);
    } else if (kind === "rank") {
      const keywords = Array.isArray(body.keywords) ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 10) : [];
      if (!keywords.length || keywords.some((item) => item.length > 120)) return error("Enter between 1 and 10 keywords, up to 120 characters each.");
      query = keywords.join(", ").slice(0, 2_000);
      providerResult = await dataForSeoPost("serp/google/organic/live/advanced", keywords.map((keyword) => ({ keyword, location_code: locationCode, language_code: languageCode, device, depth: 100 })));
      items = buildDomainRankRows(providerResult.tasks || [], keywords, domain);
    } else if (kind === "backlinks") {
      query = safeDomain(domain);
      providerResult = await dataForSeoPost("backlinks/summary/live", [{ target: domain, include_subdomains: true, backlinks_status_type: "live" }]);
      items = getProviderItems(providerResult);
    } else if (kind === "competitors") {
      query = competitorDomain as string;
      const [gapResult, overviewResult] = await Promise.all([
        dataForSeoPost("dataforseo_labs/google/domain_intersection/live", [{
          target1: domain,
          target2: competitorDomain,
          location_code: countryLocationCode,
          language_code: languageCode,
          intersections: false,
          item_types: ["organic"],
          limit: 100,
        }]),
        dataForSeoPost("dataforseo_labs/google/domain_rank_overview/live", [domain, competitorDomain].map((target) => ({ target, location_code: countryLocationCode, language_code: languageCode }))),
      ]);
      providerResult = gapResult;
      providerSummary = getProviderItems(overviewResult).slice(0, 2);
      additionalProviderCost = Number.isFinite(overviewResult.cost) ? Number(overviewResult.cost) : 0;
      items = getProviderItems(providerResult).slice(0, 100);
    } else {
      query = domain;
      providerResult = await dataForSeoPost("ai_optimization/llm_mentions/search_mentions/live", [{
        platform,
        location_code: countryLocationCode,
        language_code: languageCode,
        target: [{ domain, search_filter: "include", search_scope: ["any"], include_subdomains: true }],
        order_by: ["ai_search_volume,desc"],
        limit: 100,
      }]);
      items = getProviderItems(providerResult).slice(0, 100);
    }
    const report = {
      ownerId: session.user.id,
      userId: session.user.id,
      createdBy: session.user.id,
      organizationId: website.organizationId,
      websiteDomain: domain,
      kind,
      query,
      locationCode,
      locationName,
      countryCode,
      countryName,
      countryLocationCode,
      languageCode,
      ...(device ? { device } : {}),
      ...(kind === "ai_visibility" ? { platform } : {}),
      ...(kind === "competitors" && competitorDomain ? { competitorDomain } : {}),
      provider: "DataForSEO",
      providerCostUsd: Number.isFinite(providerResult.cost) ? Number(providerResult.cost) + additionalProviderCost : null,
      source: "manual",
      fetchedAt: new Date(),
      result: items,
      ...(providerSummary ? { providerSummary } : {}),
    };
    await db.collection("seo_research_reports").insertOne(report);
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, action: "seo.research.requested", kind, query, locationCode, locationName, countryCode, countryName, countryLocationCode, languageCode, ...(device ? { device } : {}), provider: "DataForSEO", createdAt: report.fetchedAt });
    const requestNotice = kind === "ai_visibility"
      ? "This report queries DataForSEO AI search mention data. Results are third-party observations, platform coverage varies by location, and the provider may charge your account. It does not prove rankings or future citations."
      : kind === "questions"
        ? "Question keywords are provider suggestions for AEO research, not proof of search intent, featured snippets, or AI answers. The provider may charge your account."
      : "This report uses your DataForSEO account and may incur provider charges. Competitor metrics are third-party estimates.";
    return NextResponse.json({ report: { ...report, organizationId: undefined, _id: undefined }, requestNotice }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "SEO research is temporarily unavailable.";
    const status = /not configured/.test(message) ? 503 : 502;
    return error(message, status);
  }
}
