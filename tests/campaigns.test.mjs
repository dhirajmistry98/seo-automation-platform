import test from "node:test";
import assert from "node:assert/strict";
import { meetsFollowerMinimum, parseCampaign, parseProposedPrice } from "../src/lib/marketplace/campaigns.ts";

const now = new Date("2026-11-16T00:00:00Z");
const base = { title: "Monsoon launch", brief: "Show our new raincoat on a rainy Mumbai commute.", deliverables: ["1 Reel", "2 Stories"], targetAudience: "Commuters 20-35", category: "fashion", location: "Mumbai, Maharashtra", compensation: "paid", budgetPaise: 500000, creatorsWanted: 3, minFollowers: 1000, deadline: "2026-12-01" };

test("parseCampaign accepts a complete paid campaign and normalises the category", () => {
  const result = parseCampaign(base, now);
  assert.ok("value" in result, JSON.stringify(result));
  assert.equal(result.value.category, "Fashion");
  assert.equal(result.value.creatorsWanted, 3);
  assert.equal(result.value.productValuePaise, 0);
});

test("gifted campaigns need no budget; paid ones do", () => {
  const gifted = parseCampaign({ ...base, compensation: "gifted", budgetPaise: undefined, productValuePaise: 150000 }, now);
  assert.ok("value" in gifted); assert.equal(gifted.value.budgetPaise, 0); assert.equal(gifted.value.productValuePaise, 150000);
  assert.match(parseCampaign({ ...base, budgetPaise: 0 }, now).error, /budget per creator/);
});

test("parseCampaign explains the first problem", () => {
  assert.match(parseCampaign({ ...base, category: "Cars" }, now).error, /category/);
  assert.match(parseCampaign({ ...base, deadline: "2026-11-01" }, now).error, /deadline/);
  assert.match(parseCampaign({ ...base, creatorsWanted: 0 }, now).error, /Creators needed/);
  assert.match(parseCampaign({ ...base, deliverables: [] }, now).error, /deliverable/);
  assert.ok("value" in parseCampaign({ ...base, location: "" }, now), "empty location means anywhere");
});

test("follower minimum and proposed price rules", () => {
  assert.equal(meetsFollowerMinimum({ minFollowers: 1000 }, 999), false);
  assert.equal(meetsFollowerMinimum({ minFollowers: 1000 }, 1000), true);
  assert.equal(meetsFollowerMinimum({}, undefined), true);
  assert.deepEqual(parseProposedPrice(undefined, 500000), { value: null });
  assert.deepEqual(parseProposedPrice(400000, 500000), { value: 400000 });
  assert.match(parseProposedPrice(600000, 500000).error, /above/);
});
