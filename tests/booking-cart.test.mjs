import test from "node:test";
import assert from "node:assert/strict";
import { isResponseOverdue, parseUsageRights, respondByFrom, summarizeCart, RESPONSE_WINDOW_HOURS } from "../src/lib/marketplace/booking-cart.ts";
import { ageShares, averageViews, breakdownCounts, topShares } from "../src/lib/marketplace/instagram-analytics.ts";

test("cart groups packages by creator with totals", () => {
  const p = (creatorId, title, pricePaise) => ({ itemId: `${creatorId}-${title}`, creatorId, creatorName: creatorId, packageIndex: 0, title, pricePaise, deliveryDays: 7 });
  const cart = summarizeCart([p("a", "Reel", 500000), p("b", "Story", 200000), p("a", "Post", 300000)]);
  assert.equal(cart.creatorCount, 2); assert.equal(cart.packageCount, 3); assert.equal(cart.totalPaise, 1000000);
  assert.equal(cart.creators.find((g) => g.creatorId === "a").subtotalPaise, 800000);
});

test("requests expire after the response window", () => {
  const sent = new Date("2026-11-16T10:00:00Z"); const respondBy = respondByFrom(sent);
  assert.equal(respondBy.getTime() - sent.getTime(), RESPONSE_WINDOW_HOURS * 3_600_000);
  assert.equal(isResponseOverdue({ status: "invited", respondBy }, new Date(respondBy.getTime() - 1)), false);
  assert.equal(isResponseOverdue({ status: "invited", respondBy }, respondBy), true);
  assert.equal(isResponseOverdue({ status: "accepted", respondBy }, respondBy), false);
  assert.equal(isResponseOverdue({ status: "invited" }, new Date()), false, "old requests without a deadline never expire");
  assert.equal(parseUsageRights("90_days"), "90_days"); assert.equal(parseUsageRights("forever"), "none");
});

test("audience analytics from Meta follower_demographics", () => {
  const response = { data: [{ total_value: { breakdowns: [{ dimension_keys: ["timeframe", "country"], results: [{ dimension_values: ["THIS_MONTH", "IN"], value: 710 }, { dimension_values: ["THIS_MONTH", "US"], value: 50 }, { dimension_values: ["THIS_MONTH", "GB"], value: 20 }, { dimension_values: ["THIS_MONTH", "AE"], value: 120 }, { dimension_values: ["THIS_MONTH", "CA"], value: 100 }] }] } }] };
  const shares = topShares(breakdownCounts(response));
  assert.deepEqual(shares.map((s) => s.key), ["IN", "AE", "CA", "Other"]);
  assert.equal(shares.reduce((sum, s) => sum + s.percent, 0), 100);
  const ages = ageShares(new Map([["25-34", 56], ["18-24", 20], ["35-44", 18], ["13-17", 3], ["45-54", 3]]));
  assert.equal(ages.length, 7); assert.equal(ages[2].key, "25-34"); assert.equal(ages[2].percent, 56); assert.equal(ages[6].percent, 0);
  assert.equal(averageViews([4000, 4400, NaN]), 4200); assert.equal(averageViews([]), null);
  assert.deepEqual(topShares(new Map()), []);
});
