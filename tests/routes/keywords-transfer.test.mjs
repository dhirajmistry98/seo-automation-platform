import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";

const { GET, POST } = await import("../../src/app/api/sites/[domain]/keywords-transfer/route.ts");
const url = "/api/sites/example.com/keywords-transfer";
const post = (body, opts) => POST(req(url, { body, ...opts }), ctx());
const get = (q = "") => GET(req(url + q, { method: "GET" }), ctx());

// ---- export ----
test("export: logged-out visitor gets 401", async () => {
  setup({ loggedIn: false });
  assert.equal((await get()).status, 401);
});
test("export: a website the user cannot read is 404", async () => {
  setup({ perms: [] });
  assert.equal((await get()).status, 404);
});
test("export: unknown website is 404", async () => {
  setup();
  assert.equal((await GET(req("/x", { method: "GET" }), ctx("other.com"))).status, 404);
});
test("export: CSV has the right headers and rows", async () => {
  setup({ site: { primaryKeywords: ["seo audit", "local seo"], competitorDomains: ["rival.com"] } });
  const res = await get();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment; filename="example\.com-keywords\.csv"/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), "type,value\nkeyword,seo audit\nkeyword,local seo\ncompetitor,rival.com\n");
});
test("export: JSON format works", async () => {
  setup({ site: { primaryKeywords: ["a b"], competitorDomains: [] } });
  const res = await get("?format=json");
  assert.match(res.headers.get("content-type"), /application\/json/);
  const body = await json(res);
  assert.deepEqual(body.primaryKeywords, ["a b"]);
  assert.equal(body.domain, "example.com");
});
test("export: spreadsheet formulas in stored values are neutralised", async () => {
  setup({ site: { primaryKeywords: ["ok"], competitorDomains: ["=cmd|calc"] } });
  const text = await (await get()).text();
  assert.ok(text.includes("competitor,'=cmd|calc"), text);
});
test("export: non-string stored values are ignored, not crashed on", async () => {
  setup({ site: { primaryKeywords: ["ok", 5, null, { x: 1 }], competitorDomains: "nope" } });
  assert.equal(await (await get()).text(), "type,value\nkeyword,ok\n");
});

// ---- import ----
test("import: no Origin header is refused (403)", async () => {
  setup();
  assert.equal((await post({ text: "a b", mode: "preview" }, { origin: null })).status, 403);
});
test("import: logged-out visitor gets 401", async () => {
  setup({ loggedIn: false });
  assert.equal((await post({ text: "a b" })).status, 401);
});
test("import: read-only member cannot import (404)", async () => {
  setup({ perms: ["reports.read"] });
  assert.equal((await post({ text: "kw one", mode: "apply" })).status, 404);
});
test("import: rate limit returns 429", async () => {
  const t = setup(); t.rate = { allowed: false, retryAfterSeconds: 9 };
  assert.equal((await post({ text: "kw one" })).status, 429);
});
test("import: malformed and oversized bodies are rejected", async () => {
  setup();
  assert.equal((await POST(req(url, { raw: "nope" }), ctx())).status, 400);
  assert.equal((await post({ text: "x".repeat(150_000) })).status, 413);
});
test("import: input with no keywords is a 400 with guidance", async () => {
  setup();
  for (const text of ["", "   ", "{bad json", "[]", "x"]) {
    const res = await post({ text, mode: "preview" });
    assert.equal(res.status, 400, JSON.stringify(text));
  }
});
test("import: preview shows what would change and writes nothing", async () => {
  const t = setup({ site: { primaryKeywords: ["seo audit"] } });
  const res = await post({ text: "seo audit\nnew one\nnew two", mode: "preview" });
  assert.equal(res.status, 200);
  const { preview } = await json(res);
  assert.deepEqual(preview, { found: 3, toAdd: ["new one", "new two"], duplicates: 1, overLimit: 0, existing: 1 });
  assert.equal(t.updates.length, 0);
});
test("import: apply saves merged keywords and writes an audit log", async () => {
  const t = setup({ site: { primaryKeywords: ["seo audit"] } });
  const res = await post({ text: "seo audit\nnew one", mode: "apply" });
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).applied, { added: 1, total: 2 });
  assert.deepEqual(t.updates[0].update.$set.primaryKeywords, ["seo audit", "new one"]);
  assert.equal(t.updates[0].update.$set.updatedBy, "user-1");
  assert.equal(t.inserts.find((i) => i.name === "audit_logs").doc.action, "website.keywords.imported");
});
test("import: only the 30 keyword limit is enforced", async () => {
  const t = setup({ site: { primaryKeywords: Array.from({ length: 29 }, (_, i) => `kw${i}`) } });
  const res = await post({ text: "extra one\nextra two\nextra three", mode: "apply" });
  assert.deepEqual((await json(res)).applied, { added: 1, total: 30 });
  assert.equal(t.updates[0].update.$set.primaryKeywords.length, 30);
});
test("import: nothing new to add is a 400 on apply", async () => {
  const t = setup({ site: { primaryKeywords: ["a b"] } });
  assert.equal((await post({ text: "a b", mode: "apply" })).status, 400);
  assert.equal(t.updates.length, 0);
});
test("import: unknown mode never writes (treated as preview)", async () => {
  const t = setup();
  const res = await post({ text: "kw one", mode: "drop table" });
  assert.equal(res.status, 200);
  assert.equal(t.updates.length, 0);
});
test("import: hostile content is cleaned before it is stored", async () => {
  const t = setup({ site: { primaryKeywords: [] } });
  await post({ text: "=HYPERLINK(\"http://evil\")\n\u0000bad\u0007word\n<script>alert(1)</script>", mode: "apply" });
  const saved = t.updates[0].update.$set.primaryKeywords;
  assert.ok(saved.every((k) => !/^[=+\-@]/.test(k) && !/[\u0000-\u001f]/.test(k)), JSON.stringify(saved));
  assert.ok(saved.every((k) => k.length <= 80));
});
test("import: website that matched nothing returns 404 and no audit log", async () => {
  const t = setup(); t.matched = 0;
  assert.equal((await post({ text: "kw one", mode: "apply" })).status, 404);
  assert.ok(!t.inserts.some((i) => i.name === "audit_logs"));
});
test("import: Search Console CSV and JSON formats are understood", async () => {
  setup({ site: { primaryKeywords: [] } });
  const csv = await post({ text: "Top queries,Clicks,Impressions\nseo tool,5,100\nlocal seo,2,50", mode: "preview" });
  assert.equal((await json(csv)).preview.found, 2);
  const j = await post({ text: JSON.stringify({ primaryKeywords: ["k one", "k two", "k three"] }), mode: "preview" });
  assert.equal((await json(j)).preview.found, 3);
});
