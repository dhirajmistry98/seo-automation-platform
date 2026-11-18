import test from "node:test";
import assert from "node:assert/strict";
import {
  belongsTo, findCannibalization, gridPoints, isExtendedResearchKind, parseBacklinkGap, parseBacklinkSummary,
  parseMapsPoint, parseRankedKeywords, parseShareOfVoice, reportCsv, runExtendedResearch,
} from "../src/lib/integrations/research-reports.ts";
import { buildDomainRankRows } from "../src/lib/integrations/dataforseo.ts";

const base = { domain: "example.com", target: "example.com", competitorDomains: ["rival.com", "other.com"], keywords: [], countryLocationCode: 2356, languageCode: "en", geoPoint: null, backlinkMode: "all", gridSize: 3, gridSpacingKm: 1, now: new Date("2026-11-18T00:00:00Z") };
const task = (result) => ({ cost: 0.01, tasks: [{ result }] });

test("only known extended report kinds are accepted", () => {
  assert.equal(isExtendedResearchKind("organic_keywords"), true);
  assert.equal(isExtendedResearchKind("backlink_gap"), true);
  assert.equal(isExtendedResearchKind("drop_database"), false);
  assert.equal(isExtendedResearchKind(undefined), false);
});

test("domain matching accepts subdomains but not look-alike domains", () => {
  assert.equal(belongsTo("blog.example.com", "example.com"), true);
  assert.equal(belongsTo("https://www.example.com/page", "example.com"), true);
  assert.equal(belongsTo("example.com.evil.net", "example.com"), false);
  assert.equal(belongsTo("notexample.com", "example.com"), false);
  assert.equal(belongsTo(null, "example.com"), false);
});

test("organic research flattens ranked keywords with difficulty, intent and position change", () => {
  const rows = parseRankedKeywords(task([{ items: [{
    keyword_data: { keyword: "seo tool", keyword_info: { search_volume: 1000, cpc: 2.5, monthly_searches: [{ search_volume: 30 }, { search_volume: 10 }] }, keyword_properties: { keyword_difficulty: 42 }, search_intent_info: { main_intent: "commercial" } },
    ranked_serp_element: { serp_item: { type: "organic", rank_group: 3, rank_absolute: 4, url: "https://example.com/tool", etv: 55.5, rank_changes: { previous_rank_absolute: 9, is_new: false } } },
  }, { keyword_data: {} }] }]));
  assert.equal(rows.length, 1, "rows without a keyword are dropped");
  assert.deepEqual({ keyword: rows[0].keyword, kd: rows[0].keyword_difficulty, intent: rows[0].intent, position: rows[0].position, previous: rows[0].previous_position, url: rows[0].url, trend: rows[0].trend },
    { keyword: "seo tool", kd: 42, intent: "commercial", position: 3, previous: 9, url: "https://example.com/tool", trend: [10, 30] });
});

test("backlink summary reads metrics from the result object (the endpoint has no items list)", () => {
  const summary = parseBacklinkSummary(task([{ target: "example.com", rank: 312, backlinks: 5400, referring_domains: 210, backlinks_spam_score: 4 }]));
  assert.equal(summary.backlinks, 5400);
  assert.equal(summary.referring_domains, 210);
  assert.equal(summary.spam_score, 4);
});

test("backlink gap maps each target key to the right competitor and ranks multi-competitor prospects first", () => {
  const rows = parseBacklinkGap(task([{ items: [
    { domain_intersection: { "1": { target: "news.site", rank: 300, backlinks: 4 } } },
    { domain_intersection: { "1": { target: "blog.site", rank: 120, backlinks: 2 }, "2": { target: "blog.site", rank: 120, backlinks: 7 } } },
  ] }]), ["rival.com", "other.com"]);
  assert.equal(rows[0].domain, "blog.site");
  assert.deepEqual(rows[0].links, { "rival.com": 2, "other.com": 7 });
  assert.equal(rows[1].links["other.com"], null);
});

test("share of voice sums to 100% and flags the website and competitors", () => {
  const rows = parseShareOfVoice(task([{ items: [{ domain: "www.example.com", etv: 30 }, { domain: "rival.com", etv: 50 }, { domain: "wiki.org", etv: 20 }] }]), "example.com", ["rival.com"]);
  assert.deepEqual(rows.map((row) => row.share), [30, 50, 20]);
  assert.equal(rows[0].is_own, true);
  assert.equal(rows[1].is_competitor, true);
  assert.equal(rows[2].is_own || rows[2].is_competitor, false);
});

test("local grid points are centred, north-first and evenly spaced", () => {
  const points = gridPoints({ latitude: 19.07, longitude: 72.87 }, 3, 1);
  assert.equal(points.length, 9);
  const centre = points[4];
  assert.deepEqual([centre.row, centre.col, centre.latitude, centre.longitude], [1, 1, 19.07, 72.87]);
  assert.ok(points[0].latitude > centre.latitude, "row 0 is north of the centre");
  assert.ok(Math.abs((points[0].latitude - centre.latitude) * 111.32 - 1) < 0.001, "one km apart");
});

test("map pack position matches the website domain, not look-alikes", () => {
  const point = parseMapsPoint(task([{ items: [
    { type: "maps_search", rank_group: 1, title: "Fake", domain: "example.com.fake.io" },
    { type: "maps_search", rank_group: 2, title: "Ours", url: "https://www.example.com/" },
  ] }]), "example.com");
  assert.equal(point.rank, 2);
  assert.equal(point.top.length, 2);
  assert.equal(parseMapsPoint(task([{ items: [] }]), "example.com").rank, null);
});

test("extended reports call the right endpoints with the website as the backlink-gap exclusion", async () => {
  const calls = [];
  const post = async (path, payload) => { calls.push({ path, payload }); return task([{ items: [] }]); };
  await runExtendedResearch({ ...base, kind: "backlink_gap" }, post);
  assert.equal(calls[0].path, "backlinks/domain_intersection/live");
  assert.deepEqual(calls[0].payload[0].targets, { "1": "rival.com", "2": "other.com" });
  assert.deepEqual(calls[0].payload[0].exclude_targets, ["example.com"]);

  calls.length = 0;
  const overview = await runExtendedResearch({ ...base, kind: "domain_overview", target: "rival.com" }, post);
  assert.deepEqual(calls.map((call) => call.path).sort(), ["backlinks/summary/live", "dataforseo_labs/google/domain_rank_overview/live", "dataforseo_labs/google/historical_rank_overview/live", "dataforseo_labs/google/ranked_keywords/live"]);
  assert.ok(calls.every((call) => call.payload[0].target === "rival.com"));
  assert.equal(overview.cost, 0.04);

  calls.length = 0;
  await runExtendedResearch({ ...base, kind: "backlink_list", backlinkMode: "new" }, post);
  assert.deepEqual(calls[0].payload[0].filters, ["first_seen", ">=", "2026-10-19 00:00:00 +00:00"]);
});

test("the local grid makes one Maps check per point and requires a centre", async () => {
  let count = 0;
  const post = async () => { count += 1; return task([{ items: [] }]); };
  await assert.rejects(runExtendedResearch({ ...base, kind: "local_grid", keywords: ["dentist"] }, post));
  const result = await runExtendedResearch({ ...base, kind: "local_grid", keywords: ["dentist"], gridSize: 5, geoPoint: { latitude: 19.07, longitude: 72.87, radiusKm: 2 } }, post);
  assert.equal(count, 25);
  assert.equal(result.summary.found, 0);
  assert.equal(result.summary.average_rank, null);
});

test("cannibalization needs two pages that each get at least 10% of a query's impressions", () => {
  const rows = findCannibalization([
    { keys: ["seo audit", "https://example.com/a"], impressions: 60, clicks: 3, position: 5 },
    { keys: ["seo audit", "https://example.com/b"], impressions: 40, clicks: 1, position: 8 },
    { keys: ["rank tracker", "https://example.com/c"], impressions: 95 },
    { keys: ["rank tracker", "https://example.com/d"], impressions: 5 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyword, "seo audit");
  assert.deepEqual(rows[0].pages.map((page) => page.share), [60, 40]);
});

test("rank rows add competitor positions, AI Overview citation and competing own pages from the same SERP", () => {
  const [row] = buildDomainRankRows([{ result: [{ item_types: ["ai_overview", "organic", "people_also_ask"], items: [
    { type: "ai_overview", items: [{ type: "ai_overview_element", references: [{ type: "ai_overview_reference", domain: "www.example.com", url: "https://www.example.com/guide", source: "Example" }] }] },
    { type: "organic", rank_group: 1, domain: "rival.com", url: "https://rival.com/" },
    { type: "organic", rank_group: 2, domain: "www.example.com", url: "https://www.example.com/a" },
    { type: "organic", rank_group: 5, domain: "example.com", url: "https://example.com/b" },
    { type: "paid", rank_group: 1, domain: "example.com", url: "https://example.com/ad" },
  ] }] }], ["seo"], "example.com", ["rival.com", "other.com", "example.com"]);
  assert.equal(row.rank_group, 2);
  assert.deepEqual(row.competitor_positions, { "rival.com": 1, "other.com": null });
  assert.deepEqual(row.serp_features, ["ai_overview", "people_also_ask"]);
  assert.deepEqual(row.ai_overview, { present: true, cited: true, cited_url: "https://www.example.com/guide" });
  assert.deepEqual(row.own_urls, ["https://www.example.com/a", "https://example.com/b"]);
});

test("CSV export escapes quotes and neutralises spreadsheet formulas", () => {
  const csv = reportCsv([{ keyword: "=HYPERLINK(\"x\")", volume: 10 }, { keyword: "a, b", extra: { n: 1 } }]);
  const [header, first, second] = csv.split("\r\n");
  assert.equal(header, "keyword,volume,extra");
  assert.equal(first, "\"'=HYPERLINK(\"\"x\"\")\",10,");
  assert.equal(second, "\"a, b\",,\"{\"\"n\"\":1}\"");
});
