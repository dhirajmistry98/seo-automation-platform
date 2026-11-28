import test from "node:test";
import assert from "node:assert/strict";
import { setup, req, ctx, json } from "../support/harness.mjs";
import { brandSplit, contentDecay, dailyTrend, distribution, landingPages, lowCtr, movements, totals, trackedKeywords } from "../../src/lib/seo/search-insights.ts";
import { addressMatch, checkPage, extractBusinesses, localFindings, samePhone, phoneInText } from "../../src/lib/seo/local-check.ts";
import { parseCruxHistory } from "../../src/lib/integrations/crux.ts";

const insights = (await import("../../src/app/api/sites/[domain]/search-insights/route.ts")).POST;
const field = (await import("../../src/app/api/sites/[domain]/field-data/route.ts")).POST;
const local = (await import("../../src/app/api/sites/[domain]/local-seo/route.ts")).POST;
const call = (handler, body = {}, opts) => handler(req("/api/sites/example.com/x", { body, ...opts }), ctx());
const m = (key, clicks, impressions, position) => ({ key, clicks, impressions, position });
const fake = (reply) => { const calls = [], original = globalThis.fetch; globalThis.fetch = async (u, init = {}) => { const body = init.body ? JSON.parse(init.body) : null; calls.push({ url: String(u), init, body }); const out = reply(String(u), body); return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 }); }; calls.restore = () => { globalThis.fetch = original; }; return calls; };

test("insights: totals weight position by impressions, and no data gives no position", () => {
  assert.equal(totals([m("a", 1, 90, 2), m("b", 0, 10, 12)]).position, 3);
  assert.equal(totals([]).position, null);
});
test("insights: distribution buckets positions", () => {
  assert.deepEqual(distribution([m("a", 0, 1, 1), m("b", 0, 1, 8), m("c", 0, 1, 20), m("d", 0, 1, 30), m("e", 0, 1, 99)]).map((b) => b.count), [1, 1, 1, 1, 1]);
});
test("insights: winners moved up, losers moved down, thin queries are ignored", () => {
  const out = movements([m("up", 1, 50, 3), m("down", 1, 50, 9), m("thin", 0, 2, 1), m("new", 0, 20, 5)], [m("up", 1, 50, 8), m("down", 1, 50, 4), m("thin", 0, 2, 40), m("gone", 0, 20, 5)]);
  assert.deepEqual([out.winners.map((x) => [x.query, x.change]), out.losers.map((x) => [x.query, x.change])], [[["up", 5]], [["down", -5]]]);
  assert.deepEqual([out.newQueries, out.lostQueries], [1, 1]);
});
test("insights: tracked keywords match case-insensitively and show missing as null", () => {
  const rows = trackedKeywords(["SEO Audit", "nothing"], [m("seo audit", 2, 10, 4.26)], []);
  assert.deepEqual(rows.map((r) => [r.position, r.previous]), [[4.3, null], [null, null]]);
});
test("insights: daily trend groups by date in order", () => {
  const days = dailyTrend([{ keys: ["2026-01-02", "a"], clicks: 1, impressions: 10, position: 1 }, { keys: ["2026-01-01", "a"], clicks: 2, impressions: 10, position: 3 }]);
  assert.deepEqual(days.map((d) => [d.date, d.clicks]), [["2026-01-01", 2], ["2026-01-02", 1]]);
});
test("insights: content decay lists pages that lost clicks, including vanished pages", () => {
  const out = contentDecay([m("/a", 40, 100, 5), m("/b", 95, 100, 5)], [m("/a", 100, 100, 3), m("/b", 100, 100, 3), m("/c", 20, 50, 2), m("/tiny", 3, 9, 2)]);
  assert.deepEqual(out.map((p) => [p.page, p.drop]), [["/a", 60], ["/c", 100]]);
});
test("insights: low click-through only flags page-one queries with enough impressions", () => {
  const out = lowCtr([m("weak", 1, 1000, 2), m("fine", 200, 1000, 2), m("page two", 0, 1000, 15), m("rare", 0, 10, 1)]);
  assert.deepEqual(out.map((r) => r.query), ["weak"]);
  assert.ok(out[0].missed > 100);
});
test("insights: brand queries are split from the rest", () => {
  const out = brandSplit([m("acme shoes", 5, 10, 1), m("running shoes", 2, 100, 9)], "acme.com", "Acme");
  assert.deepEqual([out.brand.clicks, out.nonBrand.clicks], [5, 2]);
});
test("insights: landing pages join Search Console and GA4 by path", () => {
  const rows = landingPages([m("https://a.com/shop/", 9, 90, 3), m("https://a.com/x", 1, 5, 7)], [{ dimensionValues: [{ value: "/shop" }], metricValues: [{ value: "3" }, { value: "12" }, { value: "6" }, { value: "0.5" }, { value: "2" }] }]);
  assert.deepEqual(rows[0].analytics, { sessions: 12, engagementRate: 50, conversions: 2 });
  assert.equal(rows[1].analytics, null);
});

test("insights route: security checks and not-connected message", async () => {
  setup(); assert.equal((await call(insights, {}, { origin: null })).status, 403);
  setup({ loggedIn: false }); assert.equal((await call(insights)).status, 401);
  setup({ perms: [] }); assert.equal((await call(insights)).status, 404);
  const t = setup(); t.rate = { allowed: false, retryAfterSeconds: 9 }; assert.equal((await call(insights)).status, 429);
  setup(); const res = await call(insights); assert.equal(res.status, 409); assert.match((await json(res)).error, /not connected/);
});
test("insights route: sends country and device filters, ignores junk, and returns each report", async () => {
  const t = setup(); t.free.lookup = async () => ({ status: "ok", context: { accessToken: "tok", property: "sc-domain:example.com" } });
  const calls = fake((u, body) => ({ rows: [{ keys: body.dimensions.length === 2 ? ["2026-01-01", "seo audit"] : ["seo audit"], clicks: 3, impressions: 30, position: 4 }] }));
  try {
    const out = await json(await call(insights, { days: 90, country: "IND", device: "MOBILE" }));
    assert.equal(calls.length, 6);
    assert.deepEqual(calls[0].body.dimensionFilterGroups[0].filters.map((f) => f.expression), ["ind", "MOBILE"]);
    assert.equal(calls.find((c) => c.body.dimensions[0] === "country").body.dimensionFilterGroups, undefined);
    assert.equal(out.tracked[0].position, 4);
    assert.equal(out.filters.days, 90);
    calls.length = 0;
    await call(insights, { days: 5000, country: "x'; drop", device: "WATCH" });
    assert.equal(calls[0].body.dimensionFilterGroups, undefined);
  } finally { calls.restore(); }
});
test("insights route: a Google error is passed on as 502", async () => {
  const t = setup(); t.free.lookup = async () => ({ status: "ok", context: { accessToken: "tok", property: "p" } });
  const calls = fake(() => new Response("{}", { status: 403 }));
  try { assert.equal((await call(insights)).status, 502); } finally { calls.restore(); }
});

test("field data: parses history, skips gaps and rates the latest value", () => {
  const out = parseCruxHistory({ record: { collectionPeriods: [{ lastDate: { year: 2026, month: 1, day: 5 } }, { lastDate: { year: 2026, month: 1, day: 12 } }], metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [null, 3000] } }, cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.05", "0.30"] } } } } });
  assert.deepEqual([out[0].latest, out[0].rating, out[0].points.length], [3000, "needs improvement", 1]);
  assert.equal(out[1].latest, null);
  assert.equal(out[2].rating, "poor");
});
test("field data route: key in header, 404 explained, 403 tells how to fix", async () => {
  const saved = process.env.GOOGLE_PAGESPEED_API_KEY;
  try {
    delete process.env.GOOGLE_PAGESPEED_API_KEY; setup(); assert.equal((await call(field)).status, 503);
    process.env.GOOGLE_PAGESPEED_API_KEY = "crux-test-key"; setup();
    let calls = fake(() => new Response("{}", { status: 404 }));
    const res = await call(field); calls.restore();
    assert.equal(res.status, 200); assert.match((await json(res)).message, /no field data/);
    assert.ok(!calls[0].url.includes("crux-test-key")); assert.equal(calls[0].init.headers["x-goog-api-key"], "crux-test-key");
    setup(); calls = fake(() => new Response("{}", { status: 403 }));
    const denied = await call(field); calls.restore(); assert.match((await json(denied)).error, /Chrome UX Report API/);
  } finally { if (saved === undefined) delete process.env.GOOGLE_PAGESPEED_API_KEY; else process.env.GOOGLE_PAGESPEED_API_KEY = saved; }
});

const NAP = { name: "Asha Dental", address: "12 MG Road, Pune 411001", phone: "+91 98765 43210" };
const page = `<p>Asha Dental, 12 MG Road, Pune 411001. Call 098765-43210</p><script type="application/ld+json">{"@graph":[{"@type":"Dentist","name":"Asha Dental","telephone":"+919876543210","address":{"@type":"PostalAddress","streetAddress":"12 MG Road","addressLocality":"Pune","postalCode":"411001"},"openingHours":"Mo-Sa 09:00-18:00","geo":{"latitude":1}}]}</script>`;
test("local: phones and addresses match despite formatting", () => {
  assert.ok(samePhone("098765 43210", "+91-98765-43210"));
  assert.ok(!samePhone("12345", "12345"));
  assert.ok(phoneInText("ring (098765) 43210 today", NAP.phone));
  assert.equal(addressMatch("Pune 411001, MG Road 12", NAP.address), 100);
});
test("local: reads business schema inside @graph and scores a correct page 100", () => {
  assert.equal(extractBusinesses(page).businesses[0].type, "Dentist");
  assert.equal(localFindings([{ url: "u", ...checkPage(page, NAP) }]).score, 100);
});
test("local: a wrong phone and broken JSON-LD are reported", () => {
  const bad = page.replace("+919876543210", "+911111111111") + `<script type="application/ld+json">{oops</script>`;
  const failed = localFindings([{ url: "u", ...checkPage(bad, NAP) }]).findings.filter((f) => !f.ok).map((f) => f.title);
  assert.deepEqual(failed, ["Structured data phone matches", "No broken structured data blocks"]);
});
test("local route: needs a verified site and complete details", async () => {
  setup({ perms: ["audit.run"], site: { verifiedAt: null } }); assert.equal((await call(local, NAP)).status, 403);
  setup({ perms: ["audit.run"] }); assert.equal((await call(local, { name: "x" })).status, 400);
  setup(); assert.equal((await call(local, NAP)).status, 404);
});
