import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";

const { GET, POST } = await import("../../src/app/api/sites/[domain]/ai-visibility/route.ts");
const url = "/api/sites/example.com/ai-visibility";
const post = (body = {}, opts) => POST(req(url, { body, ...opts }), ctx());
const get = () => GET(req(url, { method: "GET" }), ctx());

const KEYS = { OPENAI_API_KEY: "sk-openai-test", ANTHROPIC_API_KEY: "sk-ant-test", PERPLEXITY_API_KEY: "pplx-test", GEMINI_API_KEY: "gem-test", SERPAPI_API_KEY: "serp-test" };
function withKeys(keys, fn) {
  return async () => {
    const saved = {};
    for (const name of Object.keys(KEYS)) { saved[name] = process.env[name]; delete process.env[name]; }
    Object.assign(process.env, keys);
    try { await fn(); } finally { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
  };
}
/** Replaces fetch; `reply(url, init, body)` returns an object (200 JSON) or a Response. Records calls. */
function fakeFetch(reply) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(u), init, body });
    const out = await reply(String(u), init, body);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  };
  calls.restore = () => { globalThis.fetch = original; };
  return calls;
}
const Q = ["What is the best SEO audit tool for small businesses?"];

test("ai visibility: refuses requests without Origin, logged-out users and users without research permission", async () => {
  setup(); assert.equal((await post({}, { origin: null })).status, 403);
  setup({ loggedIn: false }); assert.equal((await post()).status, 401);
  setup({ perms: ["reports.read"] }); assert.equal((await post()).status, 404);
});

test("ai visibility: rate limit is 6 runs per 10 minutes", async () => {
  const t = setup(); t.rate = { allowed: false, retryAfterSeconds: 41 };
  const res = await post();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "41");
  assert.deepEqual([t.rateCalls[0].limit, t.rateCalls[0].windowMs], [6, 600_000]);
});

test("ai visibility: GET reports which engines are connected and never returns key values", withKeys({ OPENAI_API_KEY: KEYS.OPENAI_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, async () => {
  setup();
  const text = await (await get()).text();
  const body = JSON.parse(text);
  const status = Object.fromEntries(body.engines.map((e) => [e.id, e.connected]));
  assert.deepEqual(status, { chatgpt: true, claude: false, perplexity: false, gemini: true, google_ai_overviews: false });
  for (const value of Object.values(KEYS)) assert.ok(!text.includes(value), "no key value may appear in the response");
}));

test("ai visibility: with no engine connected the run returns 503 and makes no outside request", withKeys({}, async () => {
  setup();
  const calls = fakeFetch(() => ({}));
  try { assert.equal((await post({ questions: Q })).status, 503); assert.equal(calls.length, 0); } finally { calls.restore(); }
}));

test("ai visibility: only connected engines are called even if others are requested", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "Example Co is great." } }], citations: [] }));
  try {
    const body = await json(await post({ questions: Q, engines: ["chatgpt", "claude", "perplexity"] }));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://api.perplexity.ai/"));
    assert.deepEqual(body.summary.map((s) => s.engine), ["perplexity"]);
  } finally { calls.restore(); }
}));

test("ai visibility: ChatGPT uses the Responses API with web search and reads url citations", withKeys({ OPENAI_API_KEY: KEYS.OPENAI_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Try Example Co for audits.", annotations: [{ type: "url_citation", url: "https://www.example.com/audit", title: "Example audit" }, { type: "url_citation", url: "https://other.org/x", title: "Other" }] }] }] }));
  try {
    const body = await json(await post({ questions: Q }));
    assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
    assert.equal(calls[0].init.headers.authorization, "Bearer sk-openai-test");
    assert.ok(!calls[0].url.includes("sk-openai-test"));
    assert.ok(calls[0].body.tools.some((t) => t.type === "web_search_preview"));
    const r = body.results[0];
    assert.deepEqual([r.engine, r.answered, r.mentioned, r.cited], ["chatgpt", true, true, true]);
    assert.equal(r.sources.length, 2);
  } finally { calls.restore(); }
}));

test("ai visibility: Claude uses the Messages API with the web search tool and reads citations and search results", withKeys({ ANTHROPIC_API_KEY: KEYS.ANTHROPIC_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ content: [
    { type: "text", text: "Several tools exist. " },
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://shop.example.com/page", title: "Shop" }] },
    { type: "text", text: "Example Co is one.", citations: [{ type: "web_search_result_location", url: "https://blog.other.org/a", title: "Blog" }] },
  ] }));
  try {
    const body = await json(await post({ questions: Q }));
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
    assert.equal(calls[0].init.headers["x-api-key"], "sk-ant-test");
    assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
    assert.ok(calls[0].body.tools.some((t) => t.type === "web_search_20250305"));
    const r = body.results[0];
    assert.equal(r.mentioned, true);
    assert.equal(r.cited, true, "a subdomain of the site counts as a citation");
    assert.equal(r.sources.length, 2);
  } finally { calls.restore(); }
}));

test("ai visibility: Perplexity reads search_results and falls back to citations", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "Options include Example Co." } }], citations: ["https://example.com/", "https://rival.com/"] }));
  try {
    const r = (await json(await post({ questions: Q }))).results[0];
    assert.equal(calls[0].init.headers.authorization, "Bearer pplx-test");
    assert.deepEqual([r.mentioned, r.cited, r.sources.length], [true, true, 2]);
  } finally { calls.restore(); }
}));

test("ai visibility: Gemini sends Search grounding with the key in a header, never the URL", withKeys({ GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ candidates: [{ content: { parts: [{ text: "Example Co helps." }] }, groundingMetadata: { groundingChunks: [{ web: { title: "example.com", uri: "https://vertex.example/redirect" } }] } }] }));
  try {
    const r = (await json(await post({ questions: Q }))).results[0];
    assert.ok(!calls[0].url.includes("gem-test"));
    assert.equal(calls[0].init.headers["x-goog-api-key"], "gem-test");
    assert.ok(calls[0].body.tools.some((t) => "google_search" in t));
    assert.deepEqual([r.mentioned, r.cited], [true, true]);
  } finally { calls.restore(); }
}));

test("ai visibility: Google AI Overviews follows the page token, then reads text and references", withKeys({ SERPAPI_API_KEY: KEYS.SERPAPI_API_KEY }, async () => {
  setup();
  const calls = fakeFetch((u) => u.includes("engine=google_ai_overview")
    ? { ai_overview: { text_blocks: [{ type: "paragraph", snippet: "Example Co is often recommended." }, { type: "list", list: [{ snippet: "Rival is another option." }] }], references: [{ title: "Example", link: "https://example.com/seo" }] } }
    : { ai_overview: { page_token: "tok123" } });
  try {
    const r = (await json(await post({ questions: Q }))).results[0];
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.includes("page_token=tok123"));
    assert.deepEqual([r.engine, r.answered, r.mentioned, r.cited], ["google_ai_overviews", true, true, true]);
  } finally { calls.restore(); }
}));

test("ai visibility: a question with no Google AI Overview is reported as not answered, not as a miss", withKeys({ SERPAPI_API_KEY: KEYS.SERPAPI_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ organic_results: [] }));
  try {
    const res = await post({ questions: Q });
    assert.equal(res.status, 502);
    assert.match((await json(res)).reasons[0], /did not show an AI Overview/);
  } finally { calls.restore(); }
}));

test("ai visibility: look-alike domains are not citations and absent brands are not mentions", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "Several vendors exist." } }], citations: ["https://notexample.org/", "https://example.com.evil.net/"] }));
  try {
    const r = (await json(await post({ questions: Q }))).results[0];
    assert.deepEqual([r.mentioned, r.cited], [false, false]);
  } finally { calls.restore(); }
}));

test("ai visibility: competitor mentions give a share of voice", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup({ site: { competitorDomains: ["rival.com", "other.io"] } });
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "Rival and Example Co both work; rival.com is cheaper." } }], citations: [] }));
  try {
    const body = await json(await post({ questions: Q }));
    assert.deepEqual(body.results[0].competitors, ["rival.com"]);
    const hosts = Object.fromEntries(body.shareOfVoice.rows.map((row) => [row.host, row.mentions]));
    assert.deepEqual(hosts, { "example.com": 1, "rival.com": 1 });
    assert.equal(body.shareOfVoice.rows.reduce((sum, row) => sum + row.percent, 0), 100);
  } finally { calls.restore(); }
}));

test("ai visibility: one engine failing does not fail the run and its error leaks nothing", withKeys({ OPENAI_API_KEY: KEYS.OPENAI_API_KEY, PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup();
  const calls = fakeFetch((u) => u.includes("openai") ? new Response(JSON.stringify({ error: { message: "bad key sk-openai-test" } }), { status: 401 }) : { choices: [{ message: { content: "Example Co." } }], citations: [] });
  try {
    const text = await (await post({ questions: Q })).text();
    const body = JSON.parse(text);
    assert.equal(body.results.find((r) => r.engine === "chatgpt").answered, false);
    assert.equal(body.results.find((r) => r.engine === "perplexity").answered, true);
    assert.match(body.results.find((r) => r.engine === "chatgpt").error, /rejected the API key/);
    assert.ok(!text.includes("sk-openai-test"));
  } finally { calls.restore(); }
}));

test("ai visibility: every engine failing returns 502 with reasons", withKeys({ ANTHROPIC_API_KEY: KEYS.ANTHROPIC_API_KEY }, async () => {
  setup();
  const calls = fakeFetch(() => new Response("{}", { status: 429 }));
  try {
    const res = await post({ questions: Q });
    assert.equal(res.status, 502);
    assert.match((await json(res)).reasons[0], /rate limit or quota/);
  } finally { calls.restore(); }
}));

test("ai visibility: saves the run, the overview summary with real platform names, and optionally the prompts", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  const t = setup();
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "Example Co." } }], citations: ["https://example.com/"] }));
  try {
    await post({ questions: Q, savePrompts: true });
    const run = t.inserts.find((i) => i.name === "ai_visibility_runs").doc;
    assert.equal(run.websiteDomain, "example.com");
    assert.deepEqual(t.inserts.find((i) => i.name === "ai_answer_reports").doc.summary, { answered: 1, mentioned: 1, cited: 1, platforms: [{ label: "Perplexity" }] });
    assert.deepEqual(t.updates.find((u) => u.name === "websites").update.$set.aiPrompts, Q);
  } finally { calls.restore(); }
}));

test("ai visibility: no questions falls back to saved prompts; questions are cleaned and capped at 5", withKeys({ PERPLEXITY_API_KEY: KEYS.PERPLEXITY_API_KEY }, async () => {
  setup({ site: { aiPrompts: ["What does Example Co offer for audits?"] } });
  const calls = fakeFetch(() => ({ choices: [{ message: { content: "ok" } }], citations: [] }));
  try {
    await post({});
    assert.match(JSON.stringify(calls[0].body.messages), /What does Example Co offer for audits/);
    calls.length = 0;
    await post({ questions: ["short", 9, "A valid question number one?\u0000", "A valid question number two?", "A valid question number three", "A valid question number four", "A valid question number five", "A valid question number six"] });
    assert.equal(calls.length, 5);
    assert.ok(calls.every((c) => !JSON.stringify(c.body).includes("\\u0000")));
  } finally { calls.restore(); }
}));
