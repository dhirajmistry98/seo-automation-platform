import { reset } from "./stubs/state.cjs";

export const ORIGIN = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
process.env.GEMINI_API_KEY = "test-key-not-real";

/** A fresh fake world with a logged-in user and one website the user fully controls. */
export function setup({ loggedIn = true, perms = ["reports.read", "research.run", "websites.manage"], site = {} } = {}) {
  const t = reset();
  if (loggedIn) t.session = { user: { id: "user-1", email: "tester@example.test", name: "Tester" } };
  t.sites["example.com"] = { _id: "site-1", domain: "example.com", organizationId: "org-1", name: "Example Co", primaryKeywords: ["seo audit"], competitorDomains: [], verifiedAt: new Date(), ...site };
  perms.forEach((p) => t.perms.add(p));
  return t;
}

export const ctx = (domain = "example.com") => ({ params: Promise.resolve({ domain }) });

/** Builds a request the way a browser would send it. Pass origin:null to send none. */
export function req(url, { method = "POST", body, origin = ORIGIN, raw, headers = {} } = {}) {
  const h = { "content-type": "application/json", ...headers };
  if (origin) h.origin = origin;
  return new Request("http://localhost:3000" + url, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
}

/** Replaces fetch with a recorder that answers like Gemini. Returns the recorded calls. */
export function fakeGemini({ text = "Answer text.", status = 200, grounding = [], handler } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ url: String(url), body });
    if (handler) return handler(String(url), body);
    if (status !== 200) return new Response(JSON.stringify({ error: { message: "boom secret-detail" } }), { status });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: grounding } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  calls.restore = () => { globalThis.fetch = original; };
  return calls;
}

export const json = async (res) => res.json();
