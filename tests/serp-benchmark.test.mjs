import test from "node:test";
import assert from "node:assert/strict";
import { auditHtml } from "../src/lib/seo/audit.ts";
import { benchmarkPage, missingTopics, pageProfile, parseSerp } from "../src/lib/seo/serp-benchmark.ts";

test("parseSerp keeps organic results in rank order and finds your domain", () => {
  const items = [
    { type: "featured_snippet", url: "https://x.com/a", rank_group: 1 },
    { type: "organic", url: "https://www.rival.in/seo", domain: "www.rival.in", title: "SEO Mumbai", rank_group: 2 },
    { type: "organic", url: "https://blog.example.com/seo", domain: "blog.example.com", title: "Ours", rank_group: 7 },
    { type: "organic", url: "https://other.com/", domain: "other.com", title: "Other", rank_group: 1 },
    { type: "organic", url: "not a url", rank_group: 3 },
  ];
  const result = parseSerp(items, "www.example.com");
  assert.deepEqual(result.top10.map((item) => item.rank), [1, 2, 7]);
  assert.equal(result.yours?.rank, 7);
  assert.deepEqual(result.competitors.map((item) => item.domain), ["other.com", "rival.in"]);
  assert.equal(parseSerp(items, "absent.com").yours, null);
});

const page = (title, h1, sections, body, schema = "") => `<!doctype html><html lang="en"><head><title>${title}</title>${schema}</head><body><h1>${h1}</h1>${sections.map((s) => `<h2>${s}</h2><p>${body}</p>`).join("")}</body></html>`;
const audit = (html) => auditHtml("https://a.com/p", "https://a.com/p", 200, html, new Headers());

test("benchmark flags real gaps against the top pages", () => {
  const keyword = "seo services in mumbai";
  const long = "Our SEO services in Mumbai include local citations, technical audits, keyword research and monthly reporting for growing businesses. ".repeat(30);
  const faq = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>';
  const competitors = [1, 2, 3].map((n) => page(`SEO Services in Mumbai ${n}`, "SEO services in Mumbai", ["Local citations", "Technical audits", "Pricing", "Case studies"], long + " google business profile optimisation and pricing packages.", faq));
  const mine = page("Welcome", "Hello", ["About"], "We help companies grow online. ".repeat(20));
  const profiles = competitors.map((html) => pageProfile(audit(html), html, keyword));
  const yours = pageProfile(audit(mine), mine, keyword);
  assert.ok(profiles[0].keywordInTitle && profiles[0].keywordInH1 && profiles[0].keywordUses > 5);
  assert.equal(yours.keywordInTitle, false);
  const topics = missingTopics(mine, competitors, keyword);
  assert.ok(topics.some((term) => /citations|business profile|pricing/.test(term)), topics.join(", "));
  assert.ok(!topics.includes("seo") && !topics.includes("mumbai"), "keyword words are not reported as topics");
  const result = benchmarkPage(yours, profiles, topics, keyword);
  const ids = result.gaps.map((gap) => gap.id);
  for (const id of ["serp_depth", "serp_sections", "serp_title", "serp_h1", "serp_topics"]) assert.ok(ids.includes(id), `${id} in ${ids}`);
  assert.equal(result.top.pages, 3);
});

test("a page that matches the top pages gets no depth/title gaps", () => {
  const keyword = "cold brew coffee";
  const body = "Cold brew coffee is steeped for hours; here is how to make cold brew coffee at home with ratios and timing. ".repeat(25);
  const html = page("Cold Brew Coffee Guide", "Cold brew coffee", ["Ratio", "Steeping", "Serving"], body);
  const profile = pageProfile(audit(html), html, keyword);
  const result = benchmarkPage(profile, [profile, profile, profile], [], keyword);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(benchmarkPage(profile, [], [], keyword).gaps, []);
});

test("schemaTypes reads @type from JSON-LD blocks, arrays and @graph", async () => {
  const { schemaTypes } = await import("../src/lib/seo/serp-benchmark.ts");
  assert.deepEqual(schemaTypes(['[{"@type":"Organization"},{"@type":"WebSite"}]', '{"@graph":[{"@type":["LocalBusiness","ProfessionalService"]}]}', "FAQPage", "not json"]), ["Organization", "WebSite", "LocalBusiness", "ProfessionalService", "FAQPage"]);
});

test("topic suggestions skip filler phrases", async () => {
  const { missingTopics: topics } = await import("../src/lib/seo/serp-benchmark.ts");
  const rival = "<p>Fix duplicate content from old pages that search engines can index. Duplicate content hurts. Write high quality pages.</p>";
  const result = topics("<p>Hello world.</p>", [rival, rival, rival], "seo");
  assert.ok(result.includes("duplicate content"), result.join(", "));
  assert.ok(!result.some((term) => /\b(from|that|can)\b/.test(term)), result.join(", "));
});
