import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { PROMPTS, PROMPT_GROUPS } from "../../src/lib/google/prompts.ts";
import { PROMPT_NOTES, PROMPT_TOOLS } from "../../src/lib/google/prompt-help.ts";

test("prompts: all 70, numbered in order, in 10 groups", () => {
  assert.deepEqual(PROMPTS.map((p) => p.n), Array.from({ length: 70 }, (_, i) => i + 1));
  assert.equal(PROMPT_GROUPS.length, 10);
  assert.deepEqual([...new Set(PROMPTS.map((p) => p.group))], PROMPT_GROUPS);
});
test("prompts: each has a unique title and a complete prompt, with no stray headings", () => {
  assert.equal(new Set(PROMPTS.map((p) => p.title)).size, 70);
  for (const p of PROMPTS) {
    assert.ok(p.prompt.length > 100, String(p.n));
    assert.ok(!/Prompt to copy|- Data:|- Goal:|\d+\. .+ hacks$/m.test(p.prompt), String(p.n));
  }
});
test("prompts: notes and tool links point at real prompts and pages", () => {
  const numbers = new Set(PROMPTS.map((p) => p.n));
  for (const n of [...Object.keys(PROMPT_NOTES), ...Object.keys(PROMPT_TOOLS)]) assert.ok(numbers.has(Number(n)), n);
  for (const tool of Object.values(PROMPT_TOOLS)) assert.ok(existsSync(`src/app${tool.href}/page.tsx`), tool.href);
});
