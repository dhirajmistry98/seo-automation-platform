import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";
import { buildOverview, performanceScore, rankingDistribution, searchVisibilityScore } from "../../src/lib/seo/site-overview.ts";

const q = (query, impressions, position, clicks = 0) => ({ query, impressions, position, clicks });
const empty = { audit: null, healthHistory: [], search: null, ga4: null, speed: { mobile: null, desktop: null, history: [] }, readiness: null, answers: null, openIssues: [], strategy: null };
const full = {
  audit: { score: 82, pageCount: 40, issueCounts: { critical: 2, warning: 5, notice: 9 }, completedAt: "2026-11-01" },
  healthHistory: [{ date: "2026-10-01", score: 70 }, { date: "2026-11-01", score: 82 }],
  search: { queries: [q("a", 1000, 1, 280), q("b", 500, 8, 20), q("c", 100, 30, 1)], history: [{ date: "2026-10-01", clicks: 400, impressions: 1500 }, { date: "2026-11-01", clicks: 300, impressions: 1600 }], startDate: "2026-10-01", endDate: "2026-10-28" },
  ga4: { sessions: { current: 900, previous: 1200, changePercent: -25 }, activeUsers: { current: 700, previous: 800, changePercent: -12 } },
  speed: { mobile: 40, desktop: 80, history: [{ date: "2026-10-01", performance: 55 }, { date: "2026-11-01", performance: 60 }] },
  readiness: { geo: 60, aeo: 60, llmo: 60, eeat: 50 }, answers: { answered: 5, mentioned: 0, cited: 0 },
  openIssues: [{ title: "Missing H1", severity: "critical" }, { title: "Missing H1", severity: "critical" }, { title: "Short title", severity: "notice" }, { title: "Long description", severity: "warning" }],
  strategy: { quickWins: 3, contentGaps: 2 },
};

test("search visibility: all #1 rankings score 100, page-two rankings score low, no data is null", () => {
  assert.equal(searchVisibilityScore([q("a", 100, 1)]), 100);
  assert.ok(searchVisibilityScore([q("a", 100, 15)]) < 10);
  assert.equal(searchVisibilityScore([]), null);
  assert.equal(searchVisibilityScore([q("a", 0, 1)]), null);
});
test("ranking distribution buckets every position exactly once", () => {
  const d = rankingDistribution([q("a", 1, 1), q("b", 1, 3), q("c", 1, 4), q("d", 1, 10), q("e", 1, 11), q("f", 1, 50), q("g", 1, 51), q("h", 1, 120)]);
  assert.deepEqual(d, { top3: 2, pos4to10: 2, pos11to20: 1, pos21to50: 1, pos51to100: 1, beyond100: 1 });
});
test("performance score: weighted mean over available parts, with coverage", () => {
  assert.deepEqual(performanceScore({ health: 80, search: 60, speed: 40, ai: 20 }), { score: 55, coverage: 100 });
  assert.deepEqual(performanceScore({ health: 80, search: null, speed: null, ai: null }), { score: 80, coverage: 35 });
  assert.deepEqual(performanceScore({ health: null, search: null, speed: null, ai: null }), { score: null, coverage: 0 });
});
test("overview with no data: no scores, asks for every source, never invents numbers", () => {
  const o = buildOverview(empty);
  assert.equal(o.scores.performance, null);
  assert.equal(o.search, null); assert.equal(o.technical, null); assert.equal(o.traffic, null);
  assert.deepEqual(o.missing, ["Site audit", "Search Console", "Google Analytics (GA4)", "PageSpeed", "AI readiness report", "Gemini visibility check"]);
  assert.ok(o.recommendations.some((r) => /first site audit/.test(r.title)));
  assert.ok(o.recommendations.some((r) => /Connect Search Console/.test(r.title)));
  assert.ok(o.needsDataProvider.length >= 3);
});
test("overview with data: scores, search totals and technical counts are correct", () => {
  const o = buildOverview(full);
  assert.equal(o.scores.health, 82);
  assert.equal(o.scores.speed, 60);
  assert.equal(o.scores.mentionRate, 0);
  assert.equal(o.scores.readiness, 60);
  assert.equal(o.scores.aiVisibility, 30);
  assert.equal(o.search.clicks, 301); assert.equal(o.search.impressions, 1600); assert.equal(o.search.keywords, 3);
  assert.equal(o.search.ctr, 18.8); assert.equal(o.search.clicksChange, -25);
  assert.equal(o.technical.counts.critical, 2);
  assert.deepEqual(o.technical.topIssues[0], { title: "Missing H1", severity: "critical", count: 2 });
  assert.equal(o.technical.topIssues.at(-1).severity, "notice");
});
test("recommendations: drops, speed, quick wins, gaps and AI mentions are flagged, high first", () => {
  const titles = buildOverview(full).recommendations.map((r) => r.title);
  assert.ok(titles.some((t) => /Fix 2 critical/.test(t)));
  assert.ok(titles.some((t) => /Clicks fell 25%/.test(t)));
  assert.ok(titles.some((t) => /sessions fell 25%/.test(t)));
  assert.ok(titles.some((t) => /Speed is average \(score 60\)/.test(t)));
  assert.ok(buildOverview({ ...full, speed: { mobile: 30, desktop: 40, history: [] } }).recommendations.some((r) => /Improve page speed \(score 35\)/.test(r.title) && r.severity === "high"));
  assert.ok(titles.some((t) => /3 queries are close/.test(t)));
  assert.ok(titles.some((t) => /2 search topics/.test(t)));
  assert.ok(titles.some((t) => /does not mention/.test(t)));
  const order = buildOverview(full).recommendations.map((r) => r.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b]));
});
test("recommendations: a healthy site gets no alarms", () => {
  const healthy = { ...full, audit: { ...full.audit, issueCounts: { critical: 0, warning: 0, notice: 0 } }, ga4: { sessions: { current: 10, previous: 9, changePercent: 11 } }, search: { ...full.search, history: [{ date: "2026-10-01", clicks: 100, impressions: 1 }, { date: "2026-11-01", clicks: 120, impressions: 1 }] }, speed: { mobile: 95, desktop: 97, history: [] }, readiness: { geo: 90, aeo: 90, llmo: 90, eeat: 90 }, answers: { answered: 4, mentioned: 3, cited: 2 }, strategy: { quickWins: 0, contentGaps: 0 } };
  assert.deepEqual(buildOverview(healthy).recommendations, []);
});
test("trends are sorted oldest to newest", () => {
  const o = buildOverview({ ...full, healthHistory: [{ date: "2026-11-01", score: 82 }, { date: "2026-10-01", score: 70 }] });
  assert.deepEqual(o.trends.health.map((r) => r.score), [70, 82]);
});

// ---------- route ----------
const { GET } = await import("../../src/app/api/sites/[domain]/overview/route.ts");
const call = (domain = "example.com") => GET(req(`/api/sites/${domain}/overview`, { method: "GET" }), ctx(domain));
test("overview route: logged-out gets 401; no permission or unknown site gets 404", async () => {
  setup({ loggedIn: false }); assert.equal((await call()).status, 401);
  setup({ perms: [] }); assert.equal((await call()).status, 404);
  setup(); assert.equal((await call("other.com")).status, 404);
});
test("overview route: a site with no data returns an empty overview, not an error", async () => {
  setup();
  const res = await call();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const { overview } = await json(res);
  assert.equal(overview.scores.performance, null);
  assert.ok(overview.recommendations.length >= 2);
});
test("overview route: builds from stored audit, search, speed and AI data", async () => {
  const t = setup();
  t.collections.seo_audits = [{ score: 90, pageCount: 12, issueCounts: { critical: 0, warning: 1, notice: 2 } }];
  t.collections.google_search_console_reports = [{ startDate: "2026-10-01", endDate: "2026-10-28", generatedAt: new Date("2026-11-01"), rows: [{ keys: ["seo audit"], clicks: 10, impressions: 100, position: 2 }] }];
  t.collections.pagespeed_results = [{ strategy: "mobile", categories: { performance: 70 }, retrievedAt: new Date() }, { strategy: "desktop", categories: { performance: 90 }, retrievedAt: new Date() }];
  t.collections.ai_answer_reports = [{ summary: { answered: 4, mentioned: 2, cited: 1 } }];
  const { overview } = await json(await call());
  assert.equal(overview.scores.health, 90);
  assert.equal(overview.scores.speed, 80);
  assert.equal(overview.search.keywords, 1);
  assert.equal(overview.scores.mentionRate, 50);
  assert.ok(overview.scores.performance > 0);
});
