import test from "node:test";
import assert from "node:assert/strict";
import { researchSource } from "../src/lib/integrations/research-policy.ts";
import { auditHtml } from "../src/lib/seo/audit.ts";
import { analyzeKeywordTargeting } from "../src/lib/seo/keyword-optimizer.ts";

test("unverified websites never reach the paid research provider", () => {
  for (const kind of ["keywords", "questions", "rank"]) {
    assert.equal(researchSource(kind, { paidConfigured: true, verified: false }), "free");
    assert.equal(researchSource(kind, { paidConfigured: false, verified: true }), "free");
  }
  for (const kind of ["backlinks", "competitors", "ai_visibility"]) {
    assert.equal(researchSource(kind, { paidConfigured: true, verified: false }), "blocked");
  }
  assert.equal(researchSource("keywords", { paidConfigured: true, verified: true }), "paid");
});

const page = (title, h1, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><meta name="description" content="Plan and ship ${h1.toLowerCase()} with clear steps your team can follow every week."></head><body><h1>${h1}</h1><h2>Why it matters</h2><p>${body}</p></body></html>`;

test("keyword analyzer rewards a page that targets the keyword", () => {
  const url = "https://example.com/seo-action-plan";
  const good = page("SEO Action Plan: Steps for Teams", "SEO action plan", "An SEO action plan turns findings into tasks. ".repeat(40));
  const bad = page("Welcome to our site", "Hello", "We write about many topics. ".repeat(40));
  const score = (html) => analyzeKeywordTargeting(auditHtml(url, url, 200, html, new Headers()), html, "seo action plan", [], []).score;
  assert.ok(score(good) > score(bad) + 25, `expected targeted page to score clearly higher (${score(good)} vs ${score(bad)})`);
  const result = analyzeKeywordTargeting(auditHtml(url, url, 200, bad, new Headers()), bad, "seo action plan", [], []);
  assert.equal(result.checks.find((check) => check.id === "title").status, "fail");
  assert.ok(result.plan.length > 0 && result.plan[0].impact === "high");
});

test("decorative images are not reported as missing alt text", () => {
  const html = '<html><head><title>Decorative image test page title</title></head><body><h1>Hi</h1><img src="/logo.png" alt="" aria-hidden="true"><img src="/a.png" alt="A chart"></body></html>';
  const audited = auditHtml("https://example.com/", "https://example.com/", 200, html, new Headers());
  assert.ok(!audited.issues.some((issue) => issue.ruleId === "images.alt_missing"));
});
