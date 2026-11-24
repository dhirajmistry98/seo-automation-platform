import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";

const { GET, POST } = await import("../../src/app/api/sites/[domain]/research/route.ts");
const url = "/api/sites/example.com/research";
const post = (body, opts) => POST(req(url, { body, ...opts }), ctx());

test("research: no Origin header is refused", async () => {
  setup();
  assert.equal((await post({ kind: "keywords", keywords: ["a b"] }, { origin: null })).status, 403);
});
test("research: logged-out visitor gets 401 on POST and GET", async () => {
  setup({ loggedIn: false });
  assert.equal((await post({ kind: "keywords", keywords: ["a b"] })).status, 401);
  assert.equal((await GET(req(url, { method: "GET" }), ctx())).status, 401);
});
test("research: needs research permission; history needs reports permission", async () => {
  setup({ perms: ["reports.read"] });
  assert.equal((await post({ kind: "keywords", keywords: ["a b"] })).status, 404);
  assert.equal((await GET(req(url, { method: "GET" }), ctx())).status, 200);
  setup({ perms: ["research.run"] });
  assert.equal((await GET(req(url, { method: "GET" }), ctx())).status, 404);
});
test("research: removed paid report kinds are rejected", async () => {
  setup();
  for (const kind of ["backlinks", "competitors", "ai_visibility", "local_grid", "keyword_magic", "domain_overview", "share_of_voice", "paid_keywords", "", undefined, 5, "__proto__"]) {
    assert.equal((await post({ kind })).status, 400, String(kind));
  }
});
test("research: malformed or oversized body is rejected", async () => {
  setup();
  assert.equal((await POST(req(url, { raw: "][" }), ctx())).status, 400);
  assert.equal((await post({ kind: "keywords", keywords: ["x".repeat(20_000)] })).status, 413);
});
test("research: unverified site can run keyword reports but not positions", async () => {
  setup({ site: { verifiedAt: undefined } });
  assert.equal((await post({ kind: "keywords", keywords: ["seo audit"] })).status, 200);
  const rank = await post({ kind: "rank", keywords: ["seo audit"] });
  assert.equal(rank.status, 409);
  assert.match((await json(rank)).error, /Verify ownership/);
});
test("research: keyword input is validated", async () => {
  setup();
  for (const keywords of [[], ["  "], undefined, "seo", [123], ["k".repeat(121)]]) assert.equal((await post({ kind: "keywords", keywords })).status, 400, JSON.stringify(keywords));
});
test("research: more than 25 keywords are trimmed, duplicates removed", async () => {
  const t = setup();
  let received;
  t.free.keywords = async (_db, _o, _d, keywords) => { received = keywords; return { items: [], searchConsoleConnected: false }; };
  await post({ kind: "keywords", keywords: [...Array.from({ length: 40 }, (_, i) => `kw ${i}`), "kw 0"] });
  assert.equal(received.length, 25);
  assert.equal(new Set(received).size, 25);
});
test("research: keyword report is saved, logged, and includes a notice", async () => {
  const t = setup();
  const res = await post({ kind: "keywords", keywords: ["seo audit"], countryCode: "us", languageCode: "en" });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.match(body.requestNotice, /autocomplete/i);
  assert.equal(body.report.kind, "keywords");
  assert.equal(body.report.organizationId, undefined, "internal ids are not exposed");
  assert.equal(t.inserts.find((i) => i.name === "seo_research_reports").doc.countryCode, "US");
  assert.equal(t.inserts.find((i) => i.name === "audit_logs").doc.action, "seo.research.requested");
  assert.equal(t.inserts.find((i) => i.name === "seo_research_reports").doc.providerCostUsd, 0);
});
test("research: invalid country or language input falls back to the website's settings", async () => {
  const t = setup({ site: { rankTrackingCountryCode: "IN", rankTrackingLanguageCode: "hi" } });
  await post({ kind: "keywords", keywords: ["a b"], countryCode: "../../etc", languageCode: "<script>" });
  const doc = t.inserts.find((i) => i.name === "seo_research_reports").doc;
  assert.equal(doc.countryCode, "IN");
  assert.equal(doc.languageCode, "hi");
});
test("research: question report needs one topic phrase", async () => {
  setup();
  assert.equal((await post({ kind: "questions", keywords: [] })).status, 400);
  assert.equal((await post({ kind: "questions", keywords: ["t".repeat(121)] })).status, 400);
  const ok = await post({ kind: "questions", keywords: ["home solar"] });
  assert.equal(ok.status, 200);
  assert.equal((await json(ok)).report.result[0].keyword, "what is home solar");
});
test("research: Search Console reports explain how to connect when it is missing", async () => {
  setup();
  for (const kind of ["rank", "quick_wins", "cannibalization"]) {
    const res = await post({ kind, keywords: ["seo audit"] });
    assert.equal(res.status, 409, kind);
    assert.match((await json(res)).error, /Search Console/);
  }
});
test("research: rank report uses Search Console rows", async () => {
  const t = setup();
  t.free.rank = async () => [{ keyword: "seo audit", rank_group: 4.2, url: "https://example.com/", title: "x" }];
  const res = await post({ kind: "rank", keywords: ["seo audit"] });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).report.result[0].rank_group, 4.2);
});
test("research: quick wins and cannibalization return saved reports with notices", async () => {
  const t = setup();
  t.free.quick = async () => ({ items: [{ keyword: "k", position: 6 }], total: 1 });
  t.free.cannibal = async () => ({ items: [{ keyword: "k", impressions: 100, clicks: 1, pages: [] }] });
  const quick = await json(await post({ kind: "quick_wins" }));
  assert.match(quick.requestNotice, /Found 1 keyword /);
  const can = await json(await post({ kind: "cannibalization" }));
  assert.match(can.requestNotice, /at least 10%/);
});
test("research: Search Console errors surface as 502 without leaking internals", async () => {
  const t = setup();
  t.free.quick = async () => ({ error: "Search Console returned an error." });
  assert.equal((await post({ kind: "quick_wins" })).status, 502);
  t.free.keywords = async () => { throw new Error("mongodb://user:password@host exploded"); };
  const res = await post({ kind: "keywords", keywords: ["a b"] });
  assert.equal(res.status, 502);
  assert.ok(!JSON.stringify(await json(res)).includes("password"));
});
test("research: hourly limit per website returns 429", async () => {
  const t = setup(); t.rate = { allowed: false, retryAfterSeconds: 120 };
  const res = await post({ kind: "keywords", keywords: ["a b"] });
  assert.equal(res.status, 429);
  assert.equal(t.rateCalls[0].scope, "seo-research");
  assert.equal(t.rateCalls[0].limit, 20);
});
