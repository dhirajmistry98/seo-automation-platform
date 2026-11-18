import test from "node:test";
import assert from "node:assert/strict";
import { assessAnswer, buildAnswerRequest, parseAnswer, pickModel, summarizeAnswers } from "../src/lib/seo/ai-answers.ts";

test("pickModel prefers cheap web-search models from the live list", () => {
  const models = [{ model_name: "gpt-5", reasoning: true, web_search_supported: true }, { model_name: "gpt-4.1-mini-2025-04-14", reasoning: false, web_search_supported: true }, { model_name: "gpt-3.5", web_search_supported: false }];
  assert.deepEqual(pickModel("chat_gpt", models), { name: "gpt-4.1-mini-2025-04-14", webSearch: true });
  assert.equal(pickModel("claude", [{ model_name: "claude-opus-5", web_search_supported: true }, { model_name: "claude-haiku-4-5", web_search_supported: true }]).name, "claude-haiku-4-5");
  assert.deepEqual(pickModel("perplexity", [{ model_name: "sonar" }]), { name: "sonar", webSearch: true });
  assert.equal(pickModel("gemini", []), null);
});

test("requests turn on web search and only send countries where supported", () => {
  const m = { name: "x", webSearch: true };
  assert.equal(buildAnswerRequest("chat_gpt", "q?", m, "IN").web_search_country_iso_code, "IN");
  assert.equal(buildAnswerRequest("claude", "q?", m, "IN").web_search_country_iso_code, undefined);
  assert.equal(buildAnswerRequest("claude", "q?", m, "IN").web_search, true);
  assert.equal(buildAnswerRequest("perplexity", "q?", m, "IN").web_search, undefined);
  assert.equal(buildAnswerRequest("perplexity", "q?", m, "IN").web_search_country_iso_code, "IN");
  assert.equal(buildAnswerRequest("gemini", "q?", { name: "g", webSearch: false }).web_search, undefined);
  assert.equal(buildAnswerRequest("chat_gpt", "a".repeat(900), m).user_prompt.length, 500);
});

test("parseAnswer reads text, annotations (Gemini direct_url) and search results", () => {
  const result = { model_name: "gemini-2.5-flash", money_spent: 0.01,
    items: [{ type: "reasoning", sections: [{ type: "summary_text", text: "thinking" }] }, { type: "message", sections: [{ type: "text", text: "Try SEO Studio.", annotations: [{ title: "Studio", url: "https://redirect.example/x", direct_url: "https://www.seostudio.in/tools" }] }] }],
    search_results: [{ title: "Moz", url: "https://moz.com/learn" }, { title: "dup", url: "https://www.seostudio.in/tools" }] };
  const answer = parseAnswer(result);
  assert.equal(answer.text, "Try SEO Studio.");
  assert.deepEqual(answer.sources.map((s) => s.url), ["https://www.seostudio.in/tools", "https://moz.com/learn"]);
  assert.equal(parseAnswer(undefined).text, "");
});

test("assessAnswer detects brand mentions and citations of the domain only", () => {
  const sources = [{ url: "https://blog.seostudio.in/post" }, { url: "https://moz.com/x" }];
  assert.deepEqual(assessAnswer({ text: "I recommend SEO Studio for audits.", sources }, ["SEO Studio"], "seostudio.in"), { mentioned: true, cited: true, otherDomains: ["moz.com"] });
  assert.equal(assessAnswer({ text: "Use SEO Studios Pro", sources: [] }, ["SEO Studio"], "seostudio.in").mentioned, false, "no partial-word match");
  assert.equal(assessAnswer({ text: "Visit seostudio.in today", sources: [] }, ["Acme"], "seostudio.in").mentioned, true);
  assert.equal(assessAnswer({ text: "x", sources: [{ url: "https://notseostudio.in" }] }, ["Acme"], "seostudio.in").cited, false);
});

test("summarizeAnswers totals per AI and ranks cited domains", () => {
  const rows = [
    { prompt: "a", platform: "chat_gpt", status: "ok", mentioned: true, cited: false, sources: [{ url: "https://moz.com/1" }] },
    { prompt: "a", platform: "claude", status: "ok", mentioned: false, cited: false, sources: [{ url: "https://moz.com/2" }, { url: "https://ahrefs.com" }] },
    { prompt: "a", platform: "gemini", status: "error", error: "x" },
  ];
  const summary = summarizeAnswers(rows);
  assert.equal(summary.answered, 2); assert.equal(summary.mentioned, 1);
  assert.deepEqual(summary.platforms.map((p) => [p.label, p.mentioned, p.failed]), [["ChatGPT", 1, 0], ["Claude", 0, 0], ["Gemini", 0, 1]]);
  assert.deepEqual(summary.topCitedDomains[0], { domain: "moz.com", count: 2 });
});

test("brand sentiment scores only sentences naming the brand and respects negation", async () => {
  const { brandSentiment } = await import("../src/lib/seo/ai-answers.ts");
  assert.equal(brandSentiment("Acme is a trusted and reliable choice. Others are bad.", ["Acme"]), "positive");
  assert.equal(brandSentiment("Acme is not reliable and has many complaints.", ["Acme"]), "negative");
  assert.equal(brandSentiment("Acme sells shoes.", ["Acme"]), "neutral");
  assert.equal(brandSentiment("Nothing about the brand here.", ["Acme"]), null);
});
