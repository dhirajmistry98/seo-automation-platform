import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditOverview, classifyPage } from "../src/lib/seo/audit-overview.ts";

const issue = (ruleId, severity = "warning") => ({ ruleId, title: ruleId, severity });
const page = (url, status, issues = [], finalUrl) => ({ url, finalUrl, status, issues });
const counts = { critical: 1, warning: 2, notice: 3 };

test("audit overview: pages are classified broken, redirect, issues or healthy in that order", () => {
  assert.equal(classifyPage(page("https://a.com/x", 404, [issue("technical.http_error", "critical")])), "broken");
  assert.equal(classifyPage(page("https://a.com/old", 200, [issue("metadata.title_short")], "https://a.com/new")), "redirect");
  assert.equal(classifyPage(page("https://a.com/", 200, [], "https://a.com")), "healthy", "a trailing slash alone is not a redirect");
  assert.equal(classifyPage(page("https://a.com/p", 200, [issue("metadata.title_short")])), "issues");
});

test("audit overview: breakdown counts pages and carries robots-blocked URLs", () => {
  const pages = [page("https://a.com/", 200), page("https://a.com/b", 500, [issue("technical.http_error", "critical")]), page("https://a.com/c", 200, [issue("headings.h1_missing")])];
  const { breakdown, total } = buildAuditOverview({ pages, skippedByRobots: 4, counts });
  assert.equal(total, 3);
  assert.deepEqual(breakdown, { healthy: 1, issues: 1, broken: 1, redirect: 0, blocked: 4 });
});

test("audit overview: a theme score is the share of pages without an issue in that theme", () => {
  const pages = [
    page("https://a.com/1", 200, [issue("technical.https_missing", "critical")]),
    page("https://a.com/2", 200), page("https://a.com/3", 200), page("https://a.com/4", 200),
  ];
  const themes = Object.fromEntries(buildAuditOverview({ pages, counts }).themes.map((t) => [t.key, t]));
  assert.equal(themes.https.percent, 75);
  assert.equal(themes.https.pagesWithIssues, 1);
  assert.equal(themes.international.percent, 100);
});

test("audit overview: each rule belongs to exactly one theme", () => {
  const pages = [page("https://a.com/", 200, [issue("technical.https_missing"), issue("hreflang.return_missing"), issue("schema.jsonld_invalid"), issue("metadata.og_image_missing"), issue("internal.broken_link"), issue("technical.noindex"), issue("headings.h1_missing"), issue("content.thin")])];
  const themes = buildAuditOverview({ pages, counts }).themes;
  assert.equal(themes.reduce((sum, t) => sum + t.pagesWithIssues, 0), 7, "one page with 8 rules touches 7 themes (the two markup rules share one)");
  assert.equal(themes.find((t) => t.key === "markup").pagesWithIssues, 1);
});

test("audit overview: no pages gives no scores rather than a fake 100", () => {
  const out = buildAuditOverview({ pages: [], counts });
  assert.equal(out.total, 0);
  assert.ok(out.themes.every((t) => t.percent === null));
});

test("audit overview: top issues are sorted by severity then pages affected, counting each page once", () => {
  const pages = [
    page("https://a.com/1", 200, [issue("metadata.title_short", "notice"), issue("metadata.title_short", "notice"), issue("technical.mixed_content", "critical")]),
    page("https://a.com/2", 200, [issue("metadata.title_short", "notice")]),
    page("https://a.com/3", 200, [issue("headings.h1_missing", "warning")]),
  ];
  const top = buildAuditOverview({ pages, counts }).topIssues;
  assert.deepEqual(top.map((t) => [t.ruleId, t.pages]), [["technical.mixed_content", 1], ["headings.h1_missing", 1], ["metadata.title_short", 2]]);
});

test("audit overview: deltas compare with the previous crawl and are absent without one", () => {
  assert.equal(buildAuditOverview({ pages: [], counts }).deltas, null);
  assert.deepEqual(buildAuditOverview({ pages: [], counts, previous: { critical: 4, warning: 2, notice: 0 } }).deltas, { critical: -3, warning: 0, notice: 3 });
});
