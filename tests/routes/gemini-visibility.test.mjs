import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, fakeGemini, json } from "../support/harness.mjs";

const { POST } = await import("../../src/app/api/sites/[domain]/gemini-visibility/route.ts");
const url = "/api/sites/example.com/gemini-visibility";
const post = (body = {}, opts) => POST(req(url, { body, ...opts }), ctx());

test("gemini visibility: no Origin header is refused", async () => {
  setup();
  assert.equal((await post({}, { origin: null })).status, 403);
});
test("gemini visibility: logged-out visitor gets 401", async () => {
  setup({ loggedIn: false });
  assert.equal((await post()).status, 401);
});
test("gemini visibility: needs research permission on the website", async () => {
  setup({ perms: ["reports.read"] });
  assert.equal((await post()).status, 404);
});
test("gemini visibility: rate limit is 3 runs per 10 minutes and returns 429", async () => {
  const t = setup(); t.rate = { allowed: false, retryAfterSeconds: 77 };
  const res = await post();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "77");
  assert.deepEqual([t.rateCalls[0].limit, t.rateCalls[0].windowMs], [3, 600_000]);
});
test("gemini visibility: malformed body is rejected", async () => {
  setup();
  assert.equal((await POST(req(url, { raw: "{{" }), ctx())).status, 400);
});
test("gemini visibility: empty question list falls back to questions built from saved keywords", async () => {
  setup({ site: { primaryKeywords: ["seo audit", "local seo", "rank tracker", "fourth one"] } });
  const calls = fakeGemini({ text: "answer" });
  try {
    const res = await post({ questions: [] });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 3);
    assert.match(JSON.stringify(calls[0].body.contents), /best tools or services for seo audit/);
  } finally { calls.restore(); }
});
test("gemini visibility: no keywords falls back to a brand question", async () => {
  setup({ site: { primaryKeywords: [] } });
  const calls = fakeGemini();
  try {
    await post({});
    assert.equal(calls.length, 1);
    assert.match(JSON.stringify(calls[0].body.contents), /What is Example Co/);
  } finally { calls.restore(); }
});
test("gemini visibility: at most 5 questions, junk and control characters are removed", async () => {
  setup();
  const calls = fakeGemini();
  try {
    const questions = ["short", 42, null, "What is the best SEO audit tool?\u0000", "Second valid question here", "Third valid question here", "Fourth valid question here", "Fifth valid question here", "Sixth valid question here", "Seventh valid question here"];
    await post({ questions });
    assert.equal(calls.length, 5);
    assert.ok(calls.every((c) => !JSON.stringify(c.body).includes("\\u0000")));
    assert.ok(!calls.some((c) => JSON.stringify(c.body).includes("short")));
  } finally { calls.restore(); }
});
test("gemini visibility: a question longer than 200 characters is cut", async () => {
  setup();
  const calls = fakeGemini();
  try {
    await post({ questions: ["q".repeat(900)] });
    assert.ok(!JSON.stringify(calls[0].body.contents).includes("q".repeat(201)));
  } finally { calls.restore(); }
});
test("gemini visibility: sends Google Search grounding and the key in a header, never in the URL", async () => {
  setup();
  let seen;
  const original = globalThis.fetch;
  globalThis.fetch = async (u, init) => { seen = { u: String(u), init }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }), { status: 200 }); };
  try {
    await post({ questions: ["What is the best SEO audit tool?"] });
    assert.ok(!seen.u.includes("test-key-not-real"), "key must not be in the URL");
    assert.equal(seen.init.headers["x-goog-api-key"], "test-key-not-real");
    assert.ok(JSON.parse(seen.init.body).tools.some((t) => "google_search" in t));
  } finally { globalThis.fetch = original; }
});
test("gemini visibility: reports mentioned and cited correctly from grounding sources", async () => {
  setup();
  const calls = fakeGemini({ text: "Example Co is a good option for audits.", grounding: [{ web: { title: "example.com", uri: "https://x" } }, { web: { title: "other.com" } }] });
  try {
    const body = await json(await post({ questions: ["What is the best SEO audit tool?"] }));
    assert.equal(body.results[0].mentioned, true);
    assert.equal(body.results[0].cited, true);
    assert.deepEqual(body.results[0].sources, ["example.com", "other.com"]);
  } finally { calls.restore(); }
});
test("gemini visibility: a look-alike domain is not counted as a citation, and no mention is reported when absent", async () => {
  setup();
  const calls = fakeGemini({ text: "Several vendors exist.", grounding: [{ web: { title: "notexample.org" } }] });
  try {
    const r = (await json(await post({ questions: ["What is the best SEO audit tool?"] }))).results[0];
    assert.equal(r.mentioned, false);
    assert.equal(r.cited, false);
  } finally { calls.restore(); }
});
test("gemini visibility: saves the report and the overview summary", async () => {
  const t = setup();
  const calls = fakeGemini({ text: "Example Co helps.", grounding: [{ web: { title: "example.com" } }] });
  try {
    await post({ questions: ["What is the best SEO audit tool?"] });
    assert.ok(t.inserts.some((i) => i.name === "gemini_visibility_reports"));
    const summary = t.inserts.find((i) => i.name === "ai_answer_reports").doc.summary;
    assert.deepEqual(summary, { answered: 1, mentioned: 1, cited: 1, platforms: [{ label: "Gemini" }] });
  } finally { calls.restore(); }
});
test("gemini visibility: one failing question does not fail the run", async () => {
  setup();
  let n = 0;
  const calls = fakeGemini({ handler: () => (++n === 1 ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Example Co" }] } }] }), { status: 200 })) });
  try {
    const body = await json(await post({ questions: ["First valid question here", "Second valid question here"] }));
    assert.equal(body.results.filter((r) => r.error).length, 1);
    assert.equal(body.results.filter((r) => !r.error).length, 1);
  } finally { calls.restore(); }
});
test("gemini visibility: all questions failing returns 502", async () => {
  setup();
  const calls = fakeGemini({ status: 500 });
  try { assert.equal((await post({ questions: ["First valid question here"] })).status, 502); } finally { calls.restore(); }
});
test("gemini visibility: missing API key returns 503", async () => {
  setup();
  const key = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  try { assert.equal((await post({ questions: ["What is the best SEO audit tool?"] })).status, 503); } finally { process.env.GEMINI_API_KEY = key; }
});
