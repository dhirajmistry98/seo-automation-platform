import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { FREE_PROVIDER, freeCannibalization, freeKeywordIdeas, freeQuestionIdeas, freeQuickWins, freeRankPositions } from "@/lib/integrations/free-research";
import { normalizeSearchDevice } from "@/lib/integrations/research-utils";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ensureSeoIndexes } from "@/lib/seo/indexes";

/**
 * Free research only: Google autocomplete plus the website's own Search Console data.
 * No paid data provider is used anywhere.
 */
type Context = { params: Promise<{ domain: string }> };
type ResearchKind = "keywords" | "questions" | "rank" | "quick_wins" | "cannibalization";
const KINDS: ResearchKind[] = ["keywords", "questions", "rank", "quick_wins", "cannibalization"];
/** Reports that only look up search terms or the site's own Search Console data. */
const UNVERIFIED_OK: ResearchKind[] = ["keywords", "questions", "cannibalization", "quick_wins"];
const noStore = { "Cache-Control": "no-store" };
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: noStore }); }
function safeDomain(value: string) { return value.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const domain = safeDomain(decodeURIComponent((await context.params).domain));
  const db = (await clientPromise).db();
  await ensureSeoIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return error("Website not found.", 404);
  const history = await db.collection("seo_research_reports").find({ organizationId: website.organizationId, websiteDomain: domain, kind: { $in: KINDS } }, { projection: { result: 1, kind: 1, query: 1, locationName: 1, countryCode: 1, countryName: 1, languageCode: 1, device: 1, source: 1, fetchedAt: 1, provider: 1, searchConsoleConnected: 1, _id: 0 } }).sort({ fetchedAt: -1 }).limit(30).toArray();
  return NextResponse.json({ history }, { headers: noStore });
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
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 12_000);
  if (!parsed.ok) return error(parsed.status === 413 ? "Request is too large." : "Invalid request body.", parsed.status);
  const body = parsed.value;
  const kind = body.kind as ResearchKind;
  if (!KINDS.includes(kind)) return error("Choose a supported research report.");
  if (!website.verifiedAt && !UNVERIFIED_OK.includes(kind)) return error("Verify ownership of this website before running position reports. Keyword ideas, questions, quick wins and cannibalization work without verification.", 409);

  const countryCode = typeof body.countryCode === "string" && /^[a-z]{2}$/i.test(body.countryCode) ? body.countryCode.toUpperCase() : String(website.rankTrackingCountryCode || "IN").toUpperCase();
  const countryName = typeof body.countryName === "string" && body.countryName.trim().length <= 120 ? body.countryName.trim() : String(website.rankTrackingCountryName || countryCode);
  const languageCode = typeof body.languageCode === "string" && /^[a-z]{2,3}$/.test(body.languageCode) ? body.languageCode : String(website.rankTrackingLanguageCode || "en");
  const device = kind === "rank" ? normalizeSearchDevice(body.device) : undefined;
  if (!/^[A-Z]{2}$/.test(countryCode)) return error("Choose a valid country.");

  const limit = await consumeRateLimit(db, "seo-research", `${String(website.organizationId)}:${domain}`, 20, 60 * 60_000);
  if (!limit.allowed) return error(`Research limit reached for this website. Try again in ${limit.retryAfterSeconds} seconds.`, 429);

  const keywordList = (max: number) => Array.isArray(body.keywords) ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max) : [];
  const connectSc = (what: string) => error(`${what} uses your Google Search Console data. Connect Search Console for this website under Integrations, then run the report again.`, 409);

  try {
    let query = domain;
    let items: Array<Record<string, unknown>> = [];
    let provider: string = FREE_PROVIDER;
    let searchConsoleConnected: boolean | undefined;
    let notice = "";

    if (kind === "keywords") {
      const keywords = keywordList(25);
      if (!keywords.length || keywords.some((item) => item.length > 120)) return error("Enter between 1 and 25 keywords, up to 120 characters each.");
      const result = await freeKeywordIdeas(db, website.organizationId, domain, keywords, languageCode, countryCode);
      query = keywords.join(", ").slice(0, 2_000);
      items = result.items;
      searchConsoleConnected = result.searchConsoleConnected;
      notice = `Ideas come from Google autocomplete${searchConsoleConnected ? " plus your Search Console impressions, clicks and positions" : ". Connect Search Console to add your real impressions, clicks and positions"}. Autocomplete does not give search volume.`;
    } else if (kind === "questions") {
      const seed = keywordList(1)[0] || "";
      if (!seed || seed.length > 120) return error("Enter one topic phrase, up to 120 characters, for question research.");
      query = seed;
      items = await freeQuestionIdeas(seed, languageCode, countryCode);
      notice = "Questions come from Google autocomplete for the selected country and language. Use them as headings and FAQ answers.";
    } else if (kind === "rank") {
      const keywords = keywordList(10);
      if (!keywords.length || keywords.some((item) => item.length > 120)) return error("Enter between 1 and 10 keywords, up to 120 characters each.");
      const rows = await freeRankPositions(db, website.organizationId, domain, keywords);
      if (!rows) return connectSc("Position tracking");
      query = keywords.join(", ").slice(0, 2_000);
      items = rows;
      searchConsoleConnected = true;
      notice = "Positions come from your Google Search Console data: impression-weighted average position over the last 28 days, not a live search check.";
    } else if (kind === "quick_wins") {
      const result = await freeQuickWins(db, website.organizationId, domain);
      if (!result) return connectSc("Quick wins");
      if ("error" in result) return error(result.error, 502);
      items = result.items;
      provider = "Google Search Console";
      searchConsoleConnected = true;
      notice = result.total > 100
        ? `Found ${result.total} keywords near the top 10 — showing the top 100 by opportunity. Each has 10+ impressions in the last 90 days.`
        : `Found ${result.total} keyword${result.total === 1 ? "" : "s"} at positions 4–20 with 10+ impressions in the last 90 days.`;
    } else {
      const result = await freeCannibalization(db, website.organizationId, domain);
      if (!result) return connectSc("Cannibalization");
      if ("error" in result) return error(result.error, 502);
      items = result.items as unknown as Array<Record<string, unknown>>;
      provider = "Google Search Console";
      searchConsoleConnected = true;
      notice = "Cannibalization uses your Search Console data for the last 28 days: searches where two or more of your pages each get at least 10% of the impressions.";
    }

    const fetchedAt = new Date();
    const report = {
      ownerId: session.user.id, userId: session.user.id, createdBy: session.user.id,
      organizationId: website.organizationId, websiteDomain: domain, kind, query,
      locationName: countryName, countryCode, countryName, languageCode,
      ...(device ? { device } : {}),
      provider, ...(searchConsoleConnected !== undefined ? { searchConsoleConnected } : {}),
      providerCostUsd: 0, source: "manual", fetchedAt, result: items,
    };
    await db.collection("seo_research_reports").insertOne(report);
    await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, action: "seo.research.requested", kind, query, countryCode, languageCode, provider, createdAt: fetchedAt });
    return NextResponse.json({ report: { ...report, organizationId: undefined, _id: undefined }, requestNotice: notice }, { headers: noStore });
  } catch (caught) {
    console.error("research failed", caught instanceof Error ? caught.message : "unknown");
    return error("Research is temporarily unavailable. Please try again shortly.", 502);
  }
}
