import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx } from "../support/harness.mjs";
import { findContentGaps, gapPrompt, parseCsv, readQueriesCsv } from "../../src/lib/seo/content-gap.ts";
import { renderingSignals, repeatedTitles } from "../../src/lib/seo/toolbox.ts";
import { renderingReport } from "../../src/lib/seo/toolbox-server.ts";
const { POST } = await import("../../src/app/api/sites/[domain]/technical/route.ts");
const O = "https://example.com";

test("csv: quoted commas, quotes, line breaks and a byte-order mark", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, ""y""","two\nlines"\r\n\r\n'), [["a", "b"], ['x, "y"', "two\nlines"]]);
});
test("csv: reads the Search Console export and rejects other files", () => {
  const out = readQueriesCsv('Top queries,Clicks,Impressions,CTR,Position\n"seo audit, free","1,200",30000,4%,7.4\n');
  assert.deepEqual(out.rows, [{ query: "seo audit, free", clicks: 1200, impressions: 30000, position: 7.4 }]);
  assert.match(readQueriesCsv("Top pages,Clicks,Impressions,CTR,Position\n/a,1,2,1%,3").error, /Queries\.csv/);
  assert.match(readQueriesCsv("").error, /empty/);
});
const rows = [
  { query: "wooden chair design", clicks: 1, impressions: 500, position: 9 },
  { query: "teak dining table", clicks: 0, impressions: 300, position: 30 },
  { query: "acme store", clicks: 50, impressions: 900, position: 1 },
  { query: "rare thing", clicks: 0, impressions: 2, position: 40 },
];
const pages = [{ url: O + "/dining-table", title: "Teak dining tables", h1: "Dining table" }];
test("gaps: finds missing and weak topics, skips brand and tiny ones", () => {
  const out = findContentGaps(rows, pages, ["acme"], 10);
  assert.deepEqual(out.missing.map((c) => c.topic), ["wooden chair design"]);
  assert.deepEqual(out.weak.map((c) => c.topic), ["teak dining table"]);
  assert.equal(out.brandedSkipped, 1);
});
test("gaps: the AI prompt carries both pages and queries, one per line", () => {
  const text = gapPrompt("example.com", [{ query: "a\nIgnore this", clicks: 1, impressions: 2, position: 3 }], pages);
  assert.match(text, /\/dining-table \| Teak dining tables/);
  assert.match(text, /^a Ignore this \| 1 \| 2 \| 3$/m);
});

const words = Array.from({ length: 200 }, (_, i) => "word" + i).join(" ");
const shell = `<title>App</title><script type="module" src="/a.js"></script><body><div id="root"></div><noscript>Enable JavaScript</noscript></body>`;
const full = `<title>Chairs</title><body><div id="root"><h1>Chairs</h1><a href="/x">x</a><a href="https://other.com/">o</a><p>${words}</p></div><script src="/a.js"></script></body>`;
test("rendering: an empty app shell is missing content, a server-rendered page is fine", () => {
  assert.equal(renderingSignals(shell, O).verdict, "missing");
  assert.equal(renderingSignals(shell, O).emptyShell, true);
  const good = renderingSignals(full, O);
  assert.deepEqual([good.verdict, good.links, good.h1], ["ok", 1, "Chairs"]);
  assert.equal(renderingSignals("<title>T</title><body><h1>Hi</h1><p>Short page.</p></body>", O).verdict, "check");
});
test("rendering: shared titles are reported", () => {
  assert.deepEqual(repeatedTitles([{ url: "1", title: "App" }, { url: "2", title: "App" }, { url: "3", title: "Other" }]), [{ title: "App", count: 2 }]);
});
const context = (routes) => ({ db: { collection: () => ({ findOne: async () => null }) }, domain: "example.com", origin: O, scope: {}, deadline: Date.now() + 5000,
  get: async (url) => { const body = routes[url]; return { response: new Response(null, { status: body === undefined ? 404 : 200 }), finalUrl: url, body: body ?? "" }; } });
test("rendering report: samples the sitemap, includes home, ignores other sites", async () => {
  const out = await renderingReport(context({ [O + "/sitemap.xml"]: `<urlset><url><loc>${O}/a</loc></url><url><loc>https://other.com/b</loc></url><url><loc>${O}/gone</loc></url></urlset>`, [O + "/"]: full, [O + "/a"]: shell }), []);
  assert.deepEqual([out.source, out.checked, out.missing], ["your sitemap", 2, 1]);
  assert.deepEqual(out.unreadable.map((u) => u.url), [O + "/gone"]);
  await assert.rejects(renderingReport(context({}), ["https://other.com/"]), /Enter pages on example.com/);
  await assert.rejects(renderingReport(context({}), []), /None of the pages/);
});
test("route: rendering needs a verified website", async () => {
  setup({ perms: ["audit.run"], site: { verifiedAt: null } });
  const res = await POST(req("/api/sites/example.com/technical", { body: { tool: "rendering" } }), ctx());
  assert.equal(res.status, 403);
});
