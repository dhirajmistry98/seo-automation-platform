import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";
import { analyzeInternalLinks, clickDepths, normalizeInternalUrl, suggestLinks } from "../../src/lib/seo/internal-links.ts";
import { addCrossPageIssues } from "../../src/lib/seo/audit.ts";

const B = "https://x.com";
const page = (path, links = [], title = path) => ({ url: B + path, finalUrl: B + path, status: 200, title, description: "d " + path, canonical: B + path, robots: "", headings: [], wordCount: 300, internalLinks: links.map((l) => B + l), externalLinks: [], images: [], structuredData: [], hreflang: [], issues: [], searchSignals: undefined });

test("normalize: strips hash and trailing slash, rejects junk", () => {
  assert.equal(normalizeInternalUrl("https://x.com/a/#top"), "https://x.com/a");
  assert.equal(normalizeInternalUrl("https://x.com/"), "https://x.com/");
  assert.equal(normalizeInternalUrl("not a url"), null);
});
test("click depth: breadth-first from the first page, unreachable pages are absent", () => {
  const d = clickDepths([page("/", ["/a"]), page("/a", ["/b"]), page("/b", ["/c"]), page("/c"), page("/lonely")]);
  assert.deepEqual([...d.values()], [0, 1, 2, 3]);
  assert.equal(d.has("https://x.com/lonely"), false);
});
test("click depth: loops terminate", () => {
  assert.doesNotThrow(() => clickDepths([page("/", ["/a"]), page("/a", ["/", "/a"])]));
});
test("analysis: orphans, inbound counts, deep pages and distributions", () => {
  const pages = [page("/", ["/a", "/b"]), page("/a", ["/b", "/c"]), page("/b", ["/c"]), page("/c", ["/d"]), page("/d", ["/e"]), page("/e"), page("/orphan")];
  const a = analyzeInternalLinks(pages);
  assert.deepEqual(a.orphans.map((p) => p.url), [B + "/orphan"]);
  assert.equal(a.pages.find((p) => p.url === B + "/b").inbound, 2);
  assert.equal(a.pages.find((p) => p.url === B + "/c").inbound, 2);
  assert.deepEqual(a.deep.map((p) => [p.url.slice(B.length), p.depth]), [["/e", 4]]);
  assert.equal(a.inboundDistribution.reduce((s, b) => s + b.value, 0), 6, "every non-home page is in exactly one bucket");
  assert.equal(a.depthDistribution[0].label, "Home");
  assert.equal(a.topLinked[0].inbound, 2);
});
test("analysis: self links never count; outbound includes uncrawled targets, inbound only crawled pages", () => {
  const a = analyzeInternalLinks([page("/", ["/", "/a", "/missing"]), page("/a", ["/a"])]);
  assert.equal(a.pages[0].outbound, 2, "/a and /missing, not itself");
  assert.equal(a.pages[1].inbound, 1, "only the home page links to /a");
  assert.equal(a.pages[1].outbound, 0, "a self link is not outbound");
  assert.equal(a.pages.length, 2, "uncrawled pages are not in the graph");
});
test("suggestions: related pages that do not link yet are proposed, existing links are not", () => {
  const pages = [page("/", ["/seo-audit-guide", "/pricing"], "Home"), page("/seo-audit-guide", [], "SEO audit guide"), page("/blog/seo-audit-checklist", ["/pricing"], "SEO audit checklist"), page("/pricing", [], "Pricing")];
  const a = analyzeInternalLinks(pages);
  const s = a.suggestions.find((x) => x.target.url.endsWith("/blog/seo-audit-checklist"));
  assert.ok(s, "the unlinked checklist page gets a suggestion");
  assert.ok(s.from.some((f) => f.url.endsWith("/seo-audit-guide")));
  assert.ok(!s.from.some((f) => f.url.endsWith("/pricing")));
  assert.equal(s.anchor, "SEO audit checklist");
  const none = suggestLinks(pages.slice(0, 1), analyzeInternalLinks(pages.slice(0, 1)).pages);
  assert.deepEqual(none, []);
});
test("audit rules: deep pages, excessive links and URL structure are flagged on real page shapes", () => {
  const chain = [page("/", ["/a"]), page("/a", ["/b"]), page("/b", ["/c"]), page("/c", ["/d"]), page("/d", [])];
  const many = page("/hub", Array.from({ length: 160 }, (_, i) => `/p${i}`));
  const url = [page("/Bad_Path"), page("/ok?a=1&b=2&c=3"), page("/" + "x".repeat(130))];
  const pages = [...chain, many, ...url];
  pages[0].internalLinks.push(B + "/hub", B + "/Bad_Path", B + "/ok?a=1&b=2&c=3", B + "/" + "x".repeat(130));
  addCrossPageIssues(pages);
  const ids = (p) => p.issues.map((i) => i.ruleId);
  assert.ok(ids(pages[4]).includes("internal.deep_page"), "depth 4 page");
  assert.ok(!ids(pages[3]).includes("internal.deep_page"), "depth 3 is fine");
  assert.ok(ids(many).includes("internal.excessive_links"));
  assert.ok(ids(url[0]).includes("technical.url_format"));
  assert.ok(ids(url[1]).includes("technical.url_parameters"));
  assert.ok(ids(url[2]).includes("technical.url_long"));
  assert.ok(!ids(pages[0]).some((id) => /deep|url_/.test(id)), "the home page is clean");
});
test("audit rules: existing checks still run (duplicate titles, orphans, broken links)", () => {
  const a = page("/", ["/b", "/gone"], "Same"), b = page("/b", [], "Same"), gone = { ...page("/gone"), status: 404 }, lonely = page("/lonely");
  addCrossPageIssues([a, b, gone, lonely]);
  assert.ok(b.issues.some((i) => i.ruleId === "metadata.title_duplicate"));
  assert.ok(a.issues.some((i) => i.ruleId === "internal.broken_link"));
  assert.ok(lonely.issues.some((i) => i.ruleId === "internal.not_linked_from_crawl"));
});

// ---------- route ----------
const { GET } = await import("../../src/app/api/sites/[domain]/internal-links/route.ts");
const call = (domain = "example.com") => GET(req(`/api/sites/${domain}/internal-links`, { method: "GET" }), ctx(domain));
test("internal-links route: auth, permission and missing crawl are handled", async () => {
  setup({ loggedIn: false }); assert.equal((await call()).status, 401);
  setup({ perms: [] }); assert.equal((await call()).status, 404);
  setup(); const res = await call(); assert.equal(res.status, 404); assert.match((await json(res)).error, /audit/i);
});
test("internal-links route: analyses the latest crawl", async () => {
  const t = setup();
  t.collections.seo_audits = [{ auditId: "a1", completedAt: new Date() }];
  t.collections.seo_pages = [{ url: B + "/", title: "Home", internalLinks: [B + "/a"], status: 200 }, { url: B + "/a", title: "A", internalLinks: [], status: 200 }, { url: B + "/orphan", title: "O", internalLinks: [], status: 200 }];
  const res = await call();
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.pageCount, 3);
  assert.deepEqual(body.analysis.orphans.map((p) => p.url), [B + "/orphan"]);
});
