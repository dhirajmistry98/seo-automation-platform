import test from "node:test";
import assert from "node:assert/strict";
import { ENGINE_GROUPS, SEARCH_STATS, searchText } from "../../src/lib/google/search-launcher.ts";

const engines = ENGINE_GROUPS.flatMap((group) => group.engines);
test("launcher: every engine encodes the search and uses https", () => {
  assert.equal(new Set(engines.map((e) => e.id)).size, engines.length);
  for (const engine of engines) {
    const url = new URL(engine.url("a & b #1?", "in"));
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("q"), "a & b #1?", engine.id);
  }
});
test("launcher: country is added only when chosen, and links-only uses Google's Web filter", () => {
  const web = engines.find((e) => e.id === "web");
  assert.equal(new URL(web.url("x", "")).searchParams.has("gl"), false);
  assert.equal(new URL(web.url("x", "in")).searchParams.get("gl"), "in");
  assert.equal(new URL(web.url("x", "")).searchParams.get("udm"), "14");
});
test("launcher: search text is cleaned and can be limited to one website", () => {
  assert.equal(searchText("  teak\n chair ", "example.com"), "teak chair site:example.com");
  assert.equal(searchText("   ", "example.com"), "");
  assert.equal(searchText("a".repeat(400)).length, 300);
});
test("launcher: the three figures follow from 5 trillion a year", () => {
  assert.deepEqual(SEARCH_STATS.map((s) => s.value), ["5 trillion+", "13.7 billion", "158,000+"]);
});
