import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";
import { classifyIntent, clusterQueries, matchPage, opportunityScore, isQuestion, lengthClass, significantTokens, buildKeywordStrategy, strategyToCsv, brandTermsFor } from "../../src/lib/seo/keyword-strategy.ts";

const row = (query, impressions, position, clicks = 0) => ({ query, impressions, position, clicks });

// ---------- logic ----------
test("intent: classifies the four search intents", () => {
  assert.equal(classifyIntent("buy running shoes online"), "transactional");
  assert.equal(classifyIntent("seo agency pricing"), "transactional");
  assert.equal(classifyIntent("best seo tools"), "commercial");
  assert.equal(classifyIntent("semrush vs ahrefs"), "commercial");
  assert.equal(classifyIntent("how to do keyword research"), "informational");
  assert.equal(classifyIntent("what is hreflang"), "informational");
  assert.equal(classifyIntent("seo studio login"), "navigational");
  assert.equal(classifyIntent("acme pricing", ["acme"]), "navigational", "brand terms win");
});
test("questions and keyword length are detected", () => {
  assert.ok(isQuestion("how do i fix this") && isQuestion("is seo worth it") && isQuestion("anything?"));
  assert.ok(!isQuestion("seo audit tool"));
  assert.equal(lengthClass("seo"), "short");
  assert.equal(lengthClass("local seo"), "short");
  assert.equal(lengthClass("local seo checklist"), "long-tail");
});
test("tokens drop stop words and plurals", () => {
  assert.deepEqual(significantTokens("The best SEO tools for you"), ["seo", "tool"]);
  assert.deepEqual(significantTokens(""), []);
});
test("opportunity: zero at the top, positive in striking distance, never negative", () => {
  assert.equal(opportunityScore(row("a", 1000, 2, 150)), 0);
  assert.ok(opportunityScore(row("a", 1000, 8, 20)) > 0);
  assert.equal(opportunityScore(row("a", 1000, 8, 500)), 0);
  assert.equal(opportunityScore(row("a", 0, 8)), 0);
});
test("clusters: related queries group together, unrelated stay apart, biggest first", () => {
  const clusters = clusterQueries([row("seo audit tool", 500, 5), row("free seo audit", 300, 7), row("seo audit checklist", 200, 9), row("pizza recipe", 100, 3)]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].queries.length, 3);
  assert.equal(clusters[0].topic, "seo audit tool");
  assert.equal(clusters[0].impressions, 1000);
  assert.equal(clusters[1].topic, "pizza recipe");
});
test("clusters: average position is weighted by impressions", () => {
  const [c] = clusterQueries([row("seo audit", 900, 2), row("seo audit tool", 100, 12)]);
  assert.equal(c.position, 3);
});
test("clusters: empty and junk input never throws", () => {
  assert.deepEqual(clusterQueries([]), []);
  assert.doesNotThrow(() => clusterQueries([row("", 1, 1), row("   ", 1, 1), row("a", 1, 1)]));
});
test("page match: finds the page that covers the topic and ignores weak matches", () => {
  const pages = [{ url: "https://x.com/blog/seo-audit-guide", title: "SEO audit guide", h1: "" }, { url: "https://x.com/about", title: "About us", h1: "" }];
  assert.equal(matchPage("seo audit tool", pages)?.url, "https://x.com/blog/seo-audit-guide");
  assert.equal(matchPage("pizza recipe", pages), null);
  assert.equal(matchPage("anything", []), null);
});
test("strategy: counts, buckets, gaps and quick wins add up", () => {
  const rows = [row("seo audit tool", 500, 5, 10), row("free seo audit", 300, 7, 4), row("seo audit checklist", 200, 9), row("seo audit examples", 100, 25), row("how to fix crawl errors", 400, 2, 80)];
  const pages = [{ url: "https://x.com/seo-audit", title: "SEO audit", h1: "SEO audit" }];
  const s = buildKeywordStrategy(rows, pages, ["acme"]);
  assert.equal(s.totals.queries, 5);
  assert.deepEqual(s.buckets, { strong: 1, strikingDistance: 3, weak: 1 });
  assert.equal(s.lengths.questions, 1);
  assert.equal(s.intents.informational + s.intents.commercial + s.intents.transactional + s.intents.navigational, 5);
  assert.ok(s.contentGaps.some((c) => c.topic === "how to fix crawl errors"), "unmapped topic is a gap");
  assert.ok(!s.contentGaps.some((c) => c.page));
  assert.ok(s.quickWins.every((q) => q.position > 3 && q.position <= 20 && q.impressions >= 50));
  assert.equal(s.clusters.find((c) => c.page)?.role, "pillar");
});
test("csv export neutralises spreadsheet formulas", () => {
  const csv = strategyToCsv(buildKeywordStrategy([row("=cmd|calc seo", 100, 8)], []));
  assert.ok(csv.startsWith("topic,query,"));
  assert.ok(csv.includes("\"'=cmd|calc seo\""));
});
test("brand terms come from the domain and the site name", () => {
  assert.deepEqual(brandTermsFor("www.seostudio.vercel.app", "SEO Studio"), ["seostudio", "seo studio"]);
});

// ---------- route ----------
const { GET } = await import("../../src/app/api/sites/[domain]/keyword-strategy/route.ts");
const call = (q = "", domain = "example.com") => GET(req(`/api/sites/${domain}/keyword-strategy${q}`, { method: "GET" }), ctx(domain));
const seed = (t) => {
  t.collections.google_search_console_reports = [{ startDate: "2026-10-01", endDate: "2026-10-28", rows: [{ keys: ["seo audit tool"], clicks: 10, impressions: 500, position: 5 }, { keys: ["free seo audit"], clicks: 4, impressions: 300, position: 7 }] }];
  t.collections.seo_pages = [{ url: "https://example.com/seo-audit", title: "SEO audit", headings: [{ level: 1, text: "SEO audit tool" }] }];
};
test("strategy route: logged-out visitor gets 401", async () => { setup({ loggedIn: false }); assert.equal((await call()).status, 401); });
test("strategy route: needs report permission and an existing site", async () => {
  setup({ perms: [] }); assert.equal((await call()).status, 404);
  setup(); assert.equal((await call("", "other.com")).status, 404);
});
test("strategy route: no Search Console data gives a clear 404", async () => {
  setup();
  const res = await call();
  assert.equal(res.status, 404);
  assert.match((await json(res)).error, /Search Console/);
});
test("strategy route: returns the strategy as JSON", async () => {
  const t = setup(); seed(t);
  const res = await call();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await json(res);
  assert.equal(body.strategy.totals.queries, 2);
  assert.equal(body.pagesCompared, 1);
  assert.equal(body.strategy.clusters[0].page.url, "https://example.com/seo-audit");
});
test("strategy route: CSV export has safe headers", async () => {
  const t = setup(); seed(t);
  const res = await call("?format=csv");
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /example\.com-keyword-strategy\.csv/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(await res.text(), /^topic,query,intent/);
});
