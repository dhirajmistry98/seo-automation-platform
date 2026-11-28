import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";
import * as t from "../../src/lib/seo/toolbox.ts";
import * as s from "../../src/lib/seo/toolbox-server.ts";
const { POST } = await import("../../src/app/api/sites/[domain]/technical/route.ts");
const call = (body, opts) => POST(req("/api/sites/example.com/technical", { body, ...opts }), ctx());
const D = "example.com", O = "https://example.com";

const web = (routes) => async (url) => { const hit = routes[url]; if (hit instanceof Error) throw hit; const { status = 200, body = "", finalUrl = url, headers = {} } = hit ?? { status: 404 }; return { response: new Response(null, { status, headers }), finalUrl, body }; };
const fakeDb = (collections) => ({ collection: (name) => { const rows = collections[name] ?? []; const cursor = (list) => ({ sort: () => cursor(list), limit: () => cursor(list), project: () => cursor(list), toArray: async () => list }); return { find: (filter) => cursor(rows.filter((r) => !filter?.auditId || r.auditId === filter.auditId)), findOne: async () => rows[0] ?? null }; } });
const make = (routes, collections = {}) => ({ db: fakeDb(collections), get: web(routes), domain: D, origin: O, scope: { organizationId: "o", websiteDomain: D }, deadline: Date.now() + 5000 });

test("sameSite accepts the domain and subdomains only", () => {
  assert.ok(t.sameSite("https://www.example.com/a", D) && t.sameSite("http://blog.example.com", D));
  for (const bad of ["https://notexample.com", "https://example.com.evil.net", "ftp://example.com", "nonsense"]) assert.ok(!t.sameSite(bad, D), bad);
});
test("robots: longest rule wins, allow wins ties, specific agent beats *, wildcards work", () => {
  const file = "User-agent: *\nDisallow: /shop\nAllow: /shop/public\nDisallow: /*.pdf$\n\nUser-agent: GPTBot\nDisallow: /";
  assert.equal(t.testRobots(file, "Googlebot", "/shop/x").allowed, false);
  assert.equal(t.testRobots(file, "Googlebot", "/shop/public/x").allowed, true);
  assert.equal(t.testRobots(file, "Googlebot", "/a/file.pdf").allowed, false);
  assert.equal(t.testRobots(file, "Googlebot", "/a/file.pdf?x").allowed, true);
  assert.equal(t.testRobots(file, "GPTBot", "/").allowed, false);
  assert.equal(t.testRobots("User-agent: *\nDisallow: /a\nAllow: /a", "x", "/a").allowed, true);
  assert.equal(t.parseRobots("Disallow: /x\nbanana").problems.length, 2);
  assert.match(t.buildRobots({ blocked: ["admin"], blockAi: true, sitemap: "https://a.com/s.xml" }), /Disallow: \/admin[\s\S]*User-agent: GPTBot[\s\S]*Sitemap:/);
});
test("sitemap: parses entries, unescapes, and finds problems", () => {
  const parsed = t.parseSitemap(`<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc><lastmod>bad</lastmod></url><url><loc>http://other.com/</loc></url></urlset>`);
  assert.equal(parsed.entries[0].loc, "https://example.com/a?x=1&y=2");
  const found = Object.fromEntries(t.sitemapProblems(parsed.entries, D).map((p) => [p.title, p.count]));
  assert.equal(found["URLs on another domain or invalid"], 1);
  assert.equal(found["Invalid last-modified dates"], 1);
  assert.equal(t.parseSitemap("<html></html>").valid, false);
});
test("sitemap generator keeps only indexable pages and escapes XML", () => {
  const pages = [{ url: O + "/a?x=1&y=2", status: 200 }, { url: O + "/n", status: 200, robots: "noindex" }, { url: O + "/c", status: 200, canonical: O + "/other" }, { url: O + "/404", status: 404 }];
  const xml = t.buildSitemap(t.indexablePages(pages).map((p) => p.url));
  assert.match(xml, /a\?x=1&amp;y=2/); assert.equal((xml.match(/<url>/g) || []).length, 1);
});
test("orphans: unlinked pages from sitemap or search, never the home page or other sites", () => {
  const out = t.orphanPages([{ url: O + "/", status: 200, internalLinks: [O + "/linked"] }], [O + "/", O + "/linked", O + "/lost", "https://other.com/x"], [O + "/lost/", O + "/gsc"], D);
  assert.deepEqual(out.map((o) => [o.url, o.foundIn]), [[O + "/lost", "Sitemap, Search Console"], [O + "/gsc", "Search Console"]]);
});
test("readability counts words, long sentences and keyword use", () => {
  const out = t.readability("The cat sat. SEO audit tools help. " + "word ".repeat(30) + ". Run an SEO audit.", "seo audit");
  assert.equal(out.keyword.uses, 2); assert.equal(out.longSentences, 1); assert.ok(out.readingEase >= 0 && out.readingEase <= 100);
  assert.equal(t.readability(""), null);
});
test("duplicates: near-identical pages pair up, different and short pages do not", () => {
  const base = Array.from({ length: 80 }, (_, i) => "alpha" + i).join(" "), other = Array.from({ length: 80 }, (_, i) => "beta" + i).join(" ");
  const out = t.duplicatePairs([{ url: "1", text: base }, { url: "2", text: base + " extra" }, { url: "3", text: other }, { url: "4", text: "short" }]);
  assert.equal(out.compared, 3); assert.deepEqual(out.pairs.map((p) => [p.a, p.b]), [["1", "2"]]);
});
test("structured data: reports missing required fields and broken JSON", () => {
  const out = t.validateStructuredData(`<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"x"},{"@type":"Event","name":"e","startDate":"2026-01-01","location":"L"}]}</script><script type="application/ld+json">{bad</script>`);
  assert.deepEqual([out.blocks, out.invalid], [2, 1]);
  assert.deepEqual(out.items.map((i) => [i.type, i.missing]), [["Product", ["offers or review or aggregateRating"]], ["Event", []]]);
});
test("meta, images and security headers", () => {
  assert.equal(t.pageMeta(`<title> Hi </title><meta content="d" name="description"><meta property="og:image" content="/i.png">`).description, "d");
  const images = t.pageImages(`<img src="/a.jpg"><img src="b.webp" alt="" width="1" height="1">`, O + "/p/");
  assert.deepEqual(images[0].problems, ["no alt attribute", "no width and height", "older format (jpg)"]);
  assert.deepEqual(images[1].problems, []);
  const weak = t.securityHeaders(new Headers({ "content-security-policy": "frame-ancestors 'none'" }), O);
  assert.equal(weak.rows.find((r) => r.name.startsWith("Content-Security")).ok, false);
  assert.equal(weak.rows.find((r) => r.name === "Clickjacking protection").ok, true);
});
test("compare crawls: new, fixed, persisting; a page not re-crawled is not 'fixed'", () => {
  const issue = (ruleId) => ({ ruleId, title: ruleId });
  const out = t.compareCrawls([{ url: "/a", issues: [issue("new"), issue("stays")] }], [{ url: "/a", issues: [issue("stays"), issue("gone")] }, { url: "/b", issues: [issue("x")] }]);
  assert.deepEqual([out.added.map((i) => i.title), out.fixed.map((i) => i.title), out.persisting, out.missingPages], [["new"], ["gone"], 1, ["/b"]]);
});
test("logs: counts bot visits and their errors only", () => {
  const out = t.analyseLog(`1.1.1.1 - - [01/Jan/2026] "GET /a HTTP/1.1" 200 12 "-" "Mozilla Googlebot/2.1"\n1.1.1.1 - - [01/Jan/2026] "GET /x HTTP/1.1" 404 1 "-" "GPTBot"\n2.2.2.2 - - [x] "GET /h HTTP/1.1" 200 1 "-" "Chrome"\njunk`);
  assert.deepEqual([out.lines, out.parsed], [4, 3]);
  assert.deepEqual(out.bots.map((b) => [b.name, b.hits, b.errors]), [["Googlebot", 1, 0], ["GPTBot", 1, 1]]);
});
test("url check: blocked is not broken; redirects, failures and private hosts are labelled", async () => {
  const get = web({ a: { status: 403 }, b: { status: 500 }, c: { finalUrl: "https://c2" }, d: new Error("The site resolves to a private address"), e: new Error("socket"), f: new Error("Page is larger than the crawl limit.") });
  const states = await Promise.all(["a", "b", "c", "d", "e", "f"].map(async (u) => (await s.checkUrl(get, u)).state));
  assert.deepEqual(states, ["blocked", "broken", "redirect", "not checked", "unreachable", "too large to check"]);
});
test("sitemap report follows robots.txt and an index file, and compares with the crawl", async () => {
  const c = make({ [O + "/robots.txt"]: { body: `Sitemap: ${O}/index.xml` }, [O + "/index.xml"]: { body: `<sitemapindex><sitemap><loc>${O}/s1.xml</loc></sitemap></sitemapindex>` }, [O + "/s1.xml"]: { body: `<urlset><url><loc>${O}/ok</loc></url><url><loc>${O}/dead</loc></url></urlset>` }, [O + "/ok"]: {} },
    { seo_audits: [{ auditId: "1" }], seo_pages: [{ auditId: "1", url: O + "/ok", status: 200 }, { auditId: "1", url: O + "/hidden", status: 200 }] });
  const out = await s.sitemapReport(c);
  assert.deepEqual([out.total, out.files, out.missingFromSitemap, out.notCrawled], [2, 2, [O + "/hidden"], [O + "/dead"]]);
  assert.deepEqual(out.badUrls.map((b) => b.url), [O + "/dead"]);
});
test("tools explain what is missing", async () => {
  await assert.rejects(s.generateSitemap(make({})), /Run a site audit first/);
  await assert.rejects(s.compareReport(make({}, { seo_audits: [{ auditId: "1" }] })), /Two completed/);
  await assert.rejects(s.pageReport(make({}), "https://other.com/", ""), /Enter a page on example.com/);
});
test("external links and images report problems", async () => {
  const links = await s.externalLinkReport(make({ "https://ok.com/": {}, "https://bad.com/": { status: 404 } }, { seo_audits: [{ auditId: "1" }], seo_pages: [{ auditId: "1", url: O, status: 200, externalLinks: ["https://ok.com/", "https://bad.com/"] }] }));
  assert.deepEqual(links.problems.map((p) => [p.url, p.on]), [["https://bad.com/", [O]]]);
  const images = await s.imageReport(make({ [O + "/"]: { body: `<img src="/big.webp" alt="a" width="1" height="1">` }, [O + "/big.webp"]: { headers: { "content-length": "900000" } } }), O + "/");
  assert.deepEqual(images.images[0].problems, ["larger than 200 KB"]);
});
test("route: security checks, verified site and unknown tool", async () => {
  setup({ perms: ["audit.run"] }); assert.equal((await call({ tool: "bulk" }, { origin: null })).status, 403);
  setup({ loggedIn: false }); assert.equal((await call({ tool: "bulk" })).status, 401);
  setup({ perms: ["reports.read"] }); assert.equal((await call({ tool: "bulk" })).status, 404);
  setup({ perms: ["audit.run"], site: { verifiedAt: null } }); assert.equal((await call({ tool: "bulk" })).status, 403);
  setup({ perms: ["audit.run"] }); assert.equal((await call({ tool: "nope" })).status, 400);
  setup({ perms: ["audit.run"] }); assert.equal((await call({ tool: "bulk", urls: [] })).status, 409);
});
test("route: IndexNow needs a key, then creates a 32-character one", async () => {
  setup({ perms: ["audit.run"] }); assert.equal((await call({ tool: "indexnow-submit", urls: [O + "/a"] })).status, 409);
  const w = setup({ perms: ["audit.run"] });
  const out = await json(await call({ tool: "indexnow-key" }));
  assert.match(out.key, /^[0-9a-f]{32}$/); assert.equal(out.fileUrl, `${O}/${out.key}.txt`);
  assert.equal(w.updates[0].update.$set.indexNowKey, out.key);
  setup({ perms: ["audit.run"], site: { indexNowKey: "abc" } }); assert.equal((await call({ tool: "indexnow-submit", urls: ["https://other.com/a"] })).status, 400);
});
