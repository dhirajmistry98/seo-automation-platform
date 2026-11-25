/**
 * AI answer engines SEO Studio can ask. Each engine is a real provider API with web search enabled and is
 * only "connected" when its own server-side key is set. Nothing here is simulated.
 */
export type EngineId = "chatgpt" | "claude" | "perplexity" | "gemini" | "google_ai_overviews";
export type Source = { title: string; url: string };
export type EngineAnswer = { text: string; sources: Source[] };
export type EngineDef = {
  id: EngineId;
  label: string;
  envKey: string;
  provider: string;
  ask: (question: string) => Promise<EngineAnswer>;
};

/** Error whose message is safe to show to users. */
export class EngineError extends Error {}

const TIMEOUT_MS = 45_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown, provider: string) {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new EngineError(`${provider} did not respond in time.`);
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 401 || response.status === 403) throw new EngineError(`${provider} rejected the API key. Check the key and its permissions.`);
  if (response.status === 429) throw new EngineError(`${provider} rate limit or quota reached. Try again later.`);
  if (!response.ok) throw new EngineError(`${provider} returned an error (${response.status}).`);
  return data;
}

function cleanSource(title: unknown, url: unknown): Source | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { title: typeof title === "string" && title.trim() ? title.trim().slice(0, 160) : parsed.hostname, url: parsed.toString().slice(0, 500) };
  } catch { return null; }
}

function uniqueSources(items: Array<Source | null>) {
  const seen = new Set<string>();
  return items.flatMap((item) => (item && !seen.has(item.url) ? (seen.add(item.url), [item]) : [])).slice(0, 10);
}

const asArray = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : []);

async function askChatGpt(question: string): Promise<EngineAnswer> {
  const data = await postJson("https://api.openai.com/v1/responses", { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
    model: process.env.OPENAI_VISIBILITY_MODEL || "gpt-4o-mini",
    input: question,
    tools: [{ type: "web_search_preview" }],
    max_output_tokens: 1200,
  }, "OpenAI");
  const parts = asArray(data.output).filter((item) => item.type === "message").flatMap((item) => asArray(item.content));
  const text = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("").trim();
  const sources = uniqueSources(parts.flatMap((part) => asArray(part.annotations)).filter((a) => a.type === "url_citation").map((a) => cleanSource(a.title, a.url)));
  return { text, sources };
}

async function askClaude(question: string): Promise<EngineAnswer> {
  const data = await postJson("https://api.anthropic.com/v1/messages", { "x-api-key": String(process.env.ANTHROPIC_API_KEY), "anthropic-version": "2023-06-01" }, {
    model: process.env.ANTHROPIC_VISIBILITY_MODEL || "claude-haiku-5-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: question }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
  }, "Anthropic");
  const blocks = asArray(data.content);
  const text = blocks.filter((block) => block.type === "text").map((block) => (typeof block.text === "string" ? block.text : "")).join("").trim();
  const cited = blocks.filter((block) => block.type === "text").flatMap((block) => asArray(block.citations)).map((c) => cleanSource(c.title, c.url));
  const searched = blocks.filter((block) => block.type === "web_search_tool_result").flatMap((block) => asArray(block.content)).map((r) => cleanSource(r.title, r.url));
  return { text, sources: uniqueSources([...cited, ...searched]) };
}

async function askPerplexity(question: string): Promise<EngineAnswer> {
  const data = await postJson("https://api.perplexity.ai/chat/completions", { authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` }, {
    model: process.env.PERPLEXITY_VISIBILITY_MODEL || "sonar",
    messages: [{ role: "user", content: question }],
    max_tokens: 1200,
  }, "Perplexity");
  const message = asArray(data.choices)[0]?.message as { content?: unknown } | undefined;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  const results = asArray(data.search_results).map((r) => cleanSource(r.title, r.url));
  const urls = Array.isArray(data.citations) ? (data.citations as unknown[]).map((url) => cleanSource(undefined, url)) : [];
  return { text, sources: uniqueSources([...results, ...urls]) };
}

async function askGemini(question: string): Promise<EngineAnswer> {
  const model = process.env.GEMINI_VISIBILITY_MODEL || "gemini-2.5-flash";
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": String(process.env.GEMINI_API_KEY) }, {
    contents: [{ role: "user", parts: [{ text: question }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
  }, "Gemini");
  const candidate = asArray(data.candidates)[0] as { content?: { parts?: Array<{ text?: string }> }; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } } | undefined;
  const text = (candidate?.content?.parts || []).map((part) => part.text || "").join("").trim();
  const sources = uniqueSources((candidate?.groundingMetadata?.groundingChunks || []).map((chunk) => cleanSource(chunk.web?.title, chunk.web?.uri)));
  return { text, sources };
}

async function serpApi(params: Record<string, string>) {
  const url = new URL("https://serpapi.com/search.json");
  for (const [key, value] of Object.entries({ ...params, api_key: String(process.env.SERPAPI_API_KEY) })) url.searchParams.set(key, value);
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }); } catch { throw new EngineError("SerpApi did not respond in time."); }
  if (response.status === 401 || response.status === 403) throw new EngineError("SerpApi rejected the API key.");
  if (response.status === 429) throw new EngineError("SerpApi quota reached. Try again later.");
  if (!response.ok) throw new EngineError(`SerpApi returned an error (${response.status}).`);
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function overviewText(blocks: Record<string, unknown>[]): string {
  return blocks.flatMap((block) => [typeof block.snippet === "string" ? block.snippet : "", ...asArray(block.list).map((item) => (typeof item.snippet === "string" ? item.snippet : ""))]).filter(Boolean).join("\n").trim();
}

async function askGoogleOverview(question: string): Promise<EngineAnswer> {
  const gl = process.env.AI_VISIBILITY_COUNTRY || "in";
  let data = await serpApi({ engine: "google", q: question, gl, hl: "en" });
  let overview = (data.ai_overview && typeof data.ai_overview === "object" ? data.ai_overview : null) as Record<string, unknown> | null;
  // Google sometimes returns only a token; the overview itself is a second request.
  if (overview && typeof overview.page_token === "string" && !asArray(overview.text_blocks).length) {
    data = await serpApi({ engine: "google_ai_overview", page_token: overview.page_token });
    overview = (data.ai_overview && typeof data.ai_overview === "object" ? data.ai_overview : null) as Record<string, unknown> | null;
  }
  if (!overview) throw new EngineError("Google did not show an AI Overview for this question.");
  const text = overviewText(asArray(overview.text_blocks));
  const sources = uniqueSources(asArray(overview.references).map((ref) => cleanSource(ref.title, ref.link)));
  if (!text) throw new EngineError("Google did not show an AI Overview for this question.");
  return { text, sources };
}

export const ENGINES: EngineDef[] = [
  { id: "chatgpt", label: "ChatGPT", envKey: "OPENAI_API_KEY", provider: "OpenAI", ask: askChatGpt },
  { id: "claude", label: "Claude", envKey: "ANTHROPIC_API_KEY", provider: "Anthropic", ask: askClaude },
  { id: "perplexity", label: "Perplexity", envKey: "PERPLEXITY_API_KEY", provider: "Perplexity", ask: askPerplexity },
  { id: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY", provider: "Google", ask: askGemini },
  { id: "google_ai_overviews", label: "Google AI Overviews", envKey: "SERPAPI_API_KEY", provider: "SerpApi", ask: askGoogleOverview },
];

export const isEngineId = (value: unknown): value is EngineId => ENGINES.some((engine) => engine.id === value);
export const engineConnected = (engine: EngineDef) => Boolean(process.env[engine.envKey]?.trim());
export const engineById = (id: EngineId) => ENGINES.find((engine) => engine.id === id)!;
