import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SETTINGS, consoleUrl, propertyId } from "../../src/lib/google/console.ts";
import { TIPS, TIP_TOPICS } from "../../src/lib/google/tips.ts";

const unique = (list) => assert.equal(new Set(list).size, list.length, "duplicate entry");
const official = (url) => { const { protocol, hostname } = new URL(url); assert.equal(protocol, "https:", url); assert.match(hostname, /(^|\.)(google\.com|web\.dev|schema\.org|googleusercontent\.com)$/, url); };

test("google: property ids match Search Console's two property types", () => {
  assert.equal(propertyId("domain", "WWW.Example.com"), "sc-domain:example.com");
  assert.equal(propertyId("prefix", "example.com", "https://www.example.com/shop?a=1"), "https://www.example.com/");
  assert.equal(propertyId("prefix", "example.com", "not a url"), "https://example.com/");
});
test("google: console links carry the encoded property", () => {
  assert.equal(consoleUrl("sitemaps", "sc-domain:example.com"), "https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aexample.com");
  assert.equal(consoleUrl("", "https://a.com/"), "https://search.google.com/search-console?resource_id=https%3A%2F%2Fa.com%2F");
});
test("google: settings are unique, with steps and official guide links", () => {
  unique(SETTINGS.map((s) => s.name));
  for (const setting of SETTINGS) { if (setting.guide) official(setting.guide); assert.ok(setting.steps.length); }
});
test("tips: each has steps and cautions, and every tool link has a page", () => {
  unique(TIPS.map((t) => t.id)); unique(TIPS.map((t) => t.title));
  assert.equal(TIPS.length, 11);
  for (const topic of TIP_TOPICS) assert.ok(TIPS.some((tip) => tip.topic === topic), topic);
  for (const tip of TIPS) { assert.ok(tip.steps.length && tip.check.length, tip.id); for (const tool of tip.tools) assert.ok(existsSync(`src/app${tool.href}/page.tsx`), tool.href); }
});
