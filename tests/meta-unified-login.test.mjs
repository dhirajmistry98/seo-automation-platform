import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const env = { META_INSTAGRAM_APP_ID: "1009658331419155", META_INSTAGRAM_APP_SECRET: "s".repeat(32), META_GRAPH_API_VERSION: "v25.0", NEXT_PUBLIC_APP_URL: "https://app.example.com", META_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
const withEnv = async (extra, fn) => { const saved = {}; for (const [k, v] of Object.entries({ ...env, ...extra })) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; } try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };

test("Unified Login URL uses the Meta app ID, config ID, redirect and state", async () => {
  const { unifiedLoginUrl, metaConfig } = await import("../src/lib/marketplace/meta.ts");
  await withEnv({ META_INSTAGRAM_CONFIG_ID: "123456789012" }, () => {
    const url = unifiedLoginUrl("state-1");
    assert.equal(url.origin + url.pathname, "https://www.facebook.com/dialog/oauth");
    assert.equal(url.searchParams.get("client_id"), "1009658331419155");
    assert.equal(url.searchParams.get("config_id"), "123456789012");
    assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.com/api/marketplace/meta/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "state-1");
  });
  await withEnv({ META_INSTAGRAM_CONFIG_ID: undefined }, () => { assert.equal(metaConfig().configId, ""); assert.throws(() => unifiedLoginUrl("s")); });
  await withEnv({ META_INSTAGRAM_CONFIG_ID: "abc" }, () => assert.throws(() => metaConfig(), /numeric/));
});

test("Unified Login exchange, assigned accounts and profile use graph.facebook.com", async () => {
  const meta = await import("../src/lib/marketplace/meta.ts");
  const calls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    const body = url.includes("/oauth/access_token") ? { access_token: "SUAT" }
      : url.includes("/assigned_instagram_accounts") ? { data: [{ id: "17841400000000001", username: "riya.creates" }, { id: "bad" }] }
      : { id: "17841400000000001", username: "riya.creates", followers_count: 850, media_count: 40, profile_picture_url: "https://scontent.cdninstagram.com/p.jpg" };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    await withEnv({ META_INSTAGRAM_CONFIG_ID: "123456789012" }, async () => {
      const exchange = await meta.exchangeUnifiedCode("CODE");
      assert.equal(exchange.token, "SUAT");
      assert.ok(exchange.expiresAt.getTime() > Date.now() + 365 * 86_400_000, "system-user token treated as non-expiring");
      assert.deepEqual(await meta.listAssignedInstagramAccounts("SUAT"), [{ id: "17841400000000001", username: "riya.creates" }]);
      const profile = await meta.fetchInstagramProfile("SUAT", { api: "facebook", id: "17841400000000001" });
      assert.equal(profile.followers_count, 850);
    });
    assert.ok(calls[0].startsWith("https://graph.facebook.com/v25.0/oauth/access_token?") && calls[0].includes("client_id=1009658331419155") && calls[0].includes("code=CODE"));
    assert.ok(calls[1].startsWith("https://graph.facebook.com/v25.0/me/assigned_instagram_accounts"));
    assert.ok(calls[2].startsWith("https://graph.facebook.com/v25.0/17841400000000001?") && !calls[2].includes("account_type"));
  } finally { globalThis.fetch = realFetch; }
});
