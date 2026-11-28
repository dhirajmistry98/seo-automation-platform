import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { GOOGLE_TOOLS, SEARCH_CHECKS, SETTINGS, SHORTCUT_GROUPS, consoleUrl, propertyId } from "../../src/lib/google/console.ts";
import { GUIDE_GROUPS } from "../../src/lib/google/guides.ts";
import { CHECK_GROUPS } from "../../src/lib/google/checklist.ts";

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
test("google: every link is an official https address, without duplicates", () => {
  const guides = GUIDE_GROUPS.flatMap((group) => group.guides);
  assert.ok(guides.length >= 80, String(guides.length));
  unique(guides.map((g) => g.url)); unique(guides.map((g) => g.title));
  for (const guide of guides) { official(guide.url); assert.ok(guide.summary.length > 5); }
  for (const tool of GOOGLE_TOOLS) official(tool.url("example.com", "https://example.com/?q=a&b=1"));
  for (const item of SEARCH_CHECKS("example.com")) { official(item.url); assert.match(item.query, /example\.com/); }
  for (const setting of SETTINGS) { if (setting.guide) official(setting.guide); assert.ok(setting.steps.length); }
});
test("google: shortcuts and settings are unique", () => {
  unique(SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.path));
  unique(SETTINGS.map((s) => s.name));
});
test("google: checklist ids are unique and every tool link has a page", () => {
  const checks = CHECK_GROUPS.flatMap((g) => g.checks);
  unique(checks.map((c) => c.id));
  for (const check of checks) { official(check.guide); if (check.tool) assert.ok(existsSync(`src/app${check.tool.href}/page.tsx`), check.tool.href); }
});
