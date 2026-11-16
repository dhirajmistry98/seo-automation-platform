import test from "node:test";
import assert from "node:assert/strict";

const response = (status, url, body = "") => { const r = new Response(body, { status }); Object.defineProperty(r, "url", { value: url }); return r; };

test("a 401 from the app API sends the person to sign in and back", async () => {
  const assigned = [];
  globalThis.window = { location: { href: "https://app.test/influencer-marketing/creator?x=1", origin: "https://app.test", pathname: "/influencer-marketing/creator", search: "?x=1", assign: (url) => assigned.push(url) }, setTimeout: (fn) => fn() };
  try {
    const { readJson } = await import("../src/lib/read-json.ts?case=api");
    // Not our API (third-party 401): normal error, no redirect.
    assert.match((await readJson(response(401, "https://other.test/api/x", "{\"error\":\"nope\"}"))).error, /nope/);
    // Auth endpoints never redirect.
    await readJson(response(401, "https://app.test/api/auth/session", "{}"));
    assert.equal(assigned.length, 0);
    const result = await readJson(response(401, "https://app.test/api/marketplace/v1/influencers", "{\"error\":\"Authentication required.\"}"));
    assert.match(result.error, /session has ended/);
    assert.deepEqual(assigned, ["/login?callbackUrl=%2Finfluencer-marketing%2Fcreator%3Fx%3D1"]);
    // Only once per page load.
    await readJson(response(401, "https://app.test/api/marketplace/v1/me", "{}"));
    assert.equal(assigned.length, 1);
  } finally { delete globalThis.window; }
});

test("no redirect from the login page or outside the browser", async () => {
  const { readJson } = await import("../src/lib/read-json.ts?case=server");
  assert.match((await readJson(response(401, "https://app.test/api/x", "{\"error\":\"Authentication required.\"}"))).error, /Authentication required/);
  const assigned = [];
  globalThis.window = { location: { href: "https://app.test/login", origin: "https://app.test", pathname: "/login", search: "", assign: (url) => assigned.push(url) }, setTimeout: (fn) => fn() };
  try {
    const { readJson: onLogin } = await import("../src/lib/read-json.ts?case=login");
    await onLogin(response(401, "https://app.test/api/auth/email-otp/request", "{}"));
    await onLogin(response(401, "https://app.test/api/marketplace/v1/me", "{}"));
    assert.equal(assigned.length, 0);
  } finally { delete globalThis.window; }
});
