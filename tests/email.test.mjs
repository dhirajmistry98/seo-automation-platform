import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_SENDER_NAME, sendTransactionalEmail, usableResendSender } from "../src/lib/email.ts";

const message = { to: "person@example-shop.com", subject: "123456 is your SEO Studio sign-in code", text: "Code 123456", html: "<p>Code 123456</p>" };

function withEnv(values, run) {
  const keys = ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "GMAIL_USER", "GMAIL_APP_PASSWORD"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
}

test("Resend sender must be an address on a real domain, not a placeholder", () => {
  assert.equal(usableResendSender("SEO Studio <login@mail.seostudio.in>"), "login@mail.seostudio.in");
  assert.equal(usableResendSender("login@seostudio.in"), "login@seostudio.in");
  assert.equal(usableResendSender("RankPilot <sign-in@example.com>"), null);
  assert.equal(usableResendSender("sign-in@mail.example.org"), null);
  assert.equal(usableResendSender("noreply@localhost"), null);
  assert.equal(usableResendSender("not an address"), null);
  assert.equal(usableResendSender(undefined), null);
});

test("sign-in email goes through Resend first, with the brand as the sender name", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
  try {
    // Gmail is configured too, but must not be used while Resend delivers.
    const sent = await withEnv({ RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "RankPilot <login@mail.seostudio.in>", GMAIL_USER: "someone@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh" }, () => sendTransactionalEmail(message));
    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].body.from, `${EMAIL_SENDER_NAME} <login@mail.seostudio.in>`);
    assert.ok(calls[0].body.text && calls[0].body.html, "sends both a text and an HTML part");
  } finally { globalThis.fetch = realFetch; }
});

test("a placeholder sender never reaches Resend, and a Resend failure is reported", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  const realError = console.error; const realWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    globalThis.fetch = async () => { calls += 1; return new Response("{}", { status: 200 }); };
    assert.equal(await withEnv({ RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "RankPilot <sign-in@example.com>" }, () => sendTransactionalEmail(message)), false);
    assert.equal(calls, 0);
    globalThis.fetch = async () => { calls += 1; return new Response("domain not verified", { status: 403 }); };
    assert.equal(await withEnv({ RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "login@mail.seostudio.in" }, () => sendTransactionalEmail(message)), false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = realFetch; console.error = realError; console.warn = realWarn; }
});
