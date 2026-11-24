import test from "node:test";
import assert from "node:assert/strict";
import { findCannibalization, reportCsv } from "../src/lib/integrations/research-utils.ts";
import { cleanKeyword, keywordsToCsv, mergeKeywords, parseKeywords } from "../src/lib/keyword-transfer.ts";
import { createZip } from "../src/lib/zip.ts";

test("cannibalization needs two pages that each get at least 10% of a query's impressions", () => {
  const rows = findCannibalization([
    { keys: ["seo audit", "https://example.com/a"], impressions: 60, clicks: 3, position: 5 },
    { keys: ["seo audit", "https://example.com/b"], impressions: 40, clicks: 1, position: 8 },
    { keys: ["rank tracker", "https://example.com/c"], impressions: 95 },
    { keys: ["rank tracker", "https://example.com/d"], impressions: 5 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyword, "seo audit");
  assert.deepEqual(rows[0].pages.map((page) => page.share), [60, 40]);
});

test("CSV export escapes quotes and neutralises spreadsheet formulas", () => {
  const csv = reportCsv([{ keyword: "=HYPERLINK(\"x\")", volume: 10 }, { keyword: "a, b", extra: { n: 1 } }]);
  const [header, first, second] = csv.split("\r\n");
  assert.equal(header, "keyword,volume,extra");
  assert.equal(first, "\"'=HYPERLINK(\"\"x\"\")\",10,");
  assert.equal(second, "\"a, b\",,\"{\"\"n\"\":1}\"");
});

test("keyword import reads plain lines, Search Console CSV and JSON, and de-duplicates", () => {
  assert.deepEqual(parseKeywords("seo audit\nlocal seo\nSEO Audit"), ["seo audit", "local seo"]);
  assert.deepEqual(parseKeywords("Top queries,Clicks\nseo tool,10\n\"a, b\",1"), ["seo tool", "a, b"]);
  assert.equal(parseKeywords('["x one","y two"]').length, 2);
  assert.equal(parseKeywords('{"primaryKeywords":["x one"]}').length, 1);
  assert.equal(parseKeywords("{bad").length, 0);
});

test("keyword import strips spreadsheet-formula prefixes and control characters", () => {
  assert.equal(cleanKeyword("=1+1 evil"), "1+1 evil");
  assert.equal(cleanKeyword("\u0000ok\u0007 word"), "ok word");
});

test("keyword export round-trips and the 30 keyword limit is enforced", () => {
  assert.deepEqual(parseKeywords(keywordsToCsv(["seo tool", "local seo"], ["rival.com"])), ["seo tool", "local seo"]);
  const existing = Array.from({ length: 28 }, (_, i) => `kw${i}`);
  const merged = mergeKeywords(existing, ["kw1", "new1", "new2", "new3"]);
  assert.equal(merged.toAdd.length, 2);
  assert.equal(merged.duplicates.length, 1);
  assert.equal(merged.overLimit.length, 1);
});

test("plugin zip contains the files under a seo-studio folder", () => {
  const zip = createZip([{ name: "seo-studio/a.php", data: Buffer.from("<?php //") }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("seo-studio/a.php")));
});
