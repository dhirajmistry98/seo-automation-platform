/**
 * "Check AI answers": ask ChatGPT, Claude, Gemini and Perplexity the questions customers ask (via DataForSEO
 * LLM Responses) and record whether the brand is mentioned and the website cited. Pure helpers; the route
 * performs the provider calls.
 */
export const AI_PLATFORMS = ["chat_gpt", "claude", "gemini", "perplexity"] as const;
export type AiPlatform = (typeof AI_PLATFORMS)[number];
export const AI_PLATFORM_LABEL: Record<AiPlatform, string> = { chat_gpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity" };

/** Preferred models, cheapest capable first; matched as substrings against the provider's current model list. */
const MODEL_PREFERENCE: Record<AiPlatform, string[]> = {
  chat_gpt: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o", "gpt-5-mini"],
  claude: ["haiku", "sonnet"],
  gemini: ["flash", "pro"],
  perplexity: ["sonar"],
};

export type ProviderModel = { model_name?: unknown; reasoning?: unknown; web_search_supported?: unknown };

/** Picks a current model that can search the web, preferring cheaper non-reasoning models. */
export function pickModel(platform: AiPlatform, models: ProviderModel[]) {
  const usable = models.filter((model): model is ProviderModel & { model_name: string } => typeof model.model_name === "string" && model.model_name.length > 0);
  const searching = usable.filter((model) => platform === "perplexity" || model.web_search_supported === true);
  const pool = searching.length ? searching : usable;
  for (const preferred of MODEL_PREFERENCE[platform]) {
    const match = pool.find((model) => model.model_name.toLowerCase().includes(preferred) && model.reasoning !== true) ?? pool.find((model) => model.model_name.toLowerCase().includes(preferred));
    if (match) return { name: match.model_name, webSearch: platform === "perplexity" || match.web_search_supported === true };
  }
  const fallback = pool.find((model) => model.reasoning !== true) ?? pool[0];
  return fallback ? { name: fallback.model_name, webSearch: platform === "perplexity" || fallback.web_search_supported === true } : null;
}

/** Request body for one LLM Responses Live task. */
export function buildAnswerRequest(platform: AiPlatform, prompt: string, model: { name: string; webSearch: boolean }, countryIso?: string) {
  const base: Record<string, unknown> = { user_prompt: prompt.slice(0, 500), model_name: model.name, max_output_tokens: 1200 };
  const country = countryIso && /^[A-Z]{2}$/.test(countryIso) ? countryIso : undefined;
  if (platform === "perplexity") return { ...base, ...(country ? { web_search_country_iso_code: country } : {}) };
  if (!model.webSearch) return base;
  // ChatGPT accepts any country; Claude only a fixed list, so it is not sent there; Gemini has no country field.
  return { ...base, web_search: true, ...(platform === "chat_gpt" && country ? { web_search_country_iso_code: country } : {}) };
}

type Section = { type?: unknown; text?: unknown; annotations?: unknown };
type Item = { type?: unknown; sections?: unknown };

/** Answer text and cited sources from an LLM Responses result. */
export function parseAnswer(result: Record<string, unknown> | undefined) {
  const items = Array.isArray(result?.items) ? result.items as Item[] : [];
  const texts: string[] = [];
  const sources = new Map<string, { url: string; title: string }>();
  const addSource = (raw: Record<string, unknown>) => {
    const url = typeof raw.direct_url === "string" && raw.direct_url ? raw.direct_url : typeof raw.url === "string" ? raw.url : "";
    if (!/^https?:\/\//i.test(url) || sources.has(url)) return;
    sources.set(url, { url, title: typeof raw.title === "string" ? raw.title.slice(0, 200) : "" });
  };
  for (const item of items) {
    if (item.type !== "message" && item.type !== undefined) continue;
    for (const section of Array.isArray(item.sections) ? item.sections as Section[] : []) {
      if (typeof section.text === "string" && (section.type === "text" || section.type === undefined)) texts.push(section.text);
      if (Array.isArray(section.annotations)) for (const annotation of section.annotations) if (annotation && typeof annotation === "object") addSource(annotation as Record<string, unknown>);
    }
  }
  for (const entry of Array.isArray(result?.search_results) ? result.search_results : []) if (entry && typeof entry === "object") addSource(entry as Record<string, unknown>);
  return { text: texts.join("\n\n").trim(), sources: [...sources.values()].slice(0, 30), model: typeof result?.model_name === "string" ? result.model_name : null, cost: Number(result?.money_spent) || 0 };
}

const host = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the answer names the brand (or domain) and whether it cites the website as a source. */
export function assessAnswer(answer: { text: string; sources: Array<{ url: string }> }, brandNames: string[], domain: string) {
  const own = domain.toLowerCase().replace(/^www\./, "");
  const names = [...new Set([...brandNames.map((name) => name.trim()).filter((name) => name.length >= 2), own])];
  const mentioned = names.some((name) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}($|[^\\p{L}\\p{N}])`, "iu").test(answer.text));
  const isOwn = (url: string) => { const value = host(url); return value === own || value.endsWith(`.${own}`); };
  const cited = answer.sources.some((source) => isOwn(source.url));
  const otherDomains = [...new Set(answer.sources.map((source) => host(source.url)).filter((value) => value && value !== own && !value.endsWith(`.${own}`)))];
  return { mentioned, cited, otherDomains };
}

export type BrandSentiment = "positive" | "neutral" | "negative";

const POSITIVE_WORDS = ["best", "leading", "trusted", "reliable", "recommended", "recommend", "excellent", "great", "popular", "top", "affordable", "easy", "quality", "reputable", "strong", "good", "praised", "loved", "award", "award-winning", "innovative", "efficient", "helpful", "favorite", "favourite", "standout", "well-known", "renowned", "secure", "fast", "value"];
const NEGATIVE_WORDS = ["avoid", "poor", "bad", "complaints", "complaint", "expensive", "scam", "slow", "unreliable", "worse", "worst", "issues", "problems", "lawsuit", "criticized", "criticised", "limited", "lacks", "lacking", "outdated", "overpriced", "negative", "disappointing", "difficult", "confusing", "risky", "fraud", "fake", "unresponsive", "downside", "downsides", "drawback", "drawbacks", "weak"];
const NEGATIONS = new Set(["not", "no", "never", "isn't", "aren't", "wasn't", "don't", "doesn't", "hardly", "without"]);

/**
 * Word-based estimate of how an AI answer talks about the brand: scores only the sentences that name it,
 * flipping a word after a negation ("not reliable"). Returns null when the brand is not named.
 */
export function brandSentiment(text: string, brandNames: string[]): BrandSentiment | null {
  const names = brandNames.map((name) => name.trim().toLowerCase()).filter((name) => name.length >= 2);
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => names.some((name) => sentence.toLowerCase().includes(name)));
  if (!sentences.length) return null;
  let score = 0;
  for (const sentence of sentences) {
    const words = sentence.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || [];
    words.forEach((word, index) => {
      const value = POSITIVE_WORDS.includes(word) ? 1 : NEGATIVE_WORDS.includes(word) ? -1 : 0;
      if (!value) return;
      const negated = words.slice(Math.max(0, index - 3), index).some((before) => NEGATIONS.has(before));
      score += negated ? -value : value;
    });
  }
  return score >= 2 ? "positive" : score <= -1 ? "negative" : "neutral";
}

export type AnswerRow = { prompt: string; platform: AiPlatform; status: "ok" | "error"; model?: string | null; mentioned?: boolean; cited?: boolean; sentiment?: BrandSentiment | null; excerpt?: string; text?: string; sources?: Array<{ url: string; title: string }>; error?: string };

/** Per-AI totals and the domains AI assistants cite most often instead of the website. */
export function summarizeAnswers(rows: AnswerRow[]) {
  const platforms = AI_PLATFORMS.map((platform) => {
    const done = rows.filter((row) => row.platform === platform && row.status === "ok");
    return { platform, label: AI_PLATFORM_LABEL[platform], answered: done.length, failed: rows.filter((row) => row.platform === platform && row.status === "error").length, mentioned: done.filter((row) => row.mentioned).length, cited: done.filter((row) => row.cited).length };
  }).filter((item) => item.answered + item.failed > 0);
  const counts = new Map<string, number>();
  for (const row of rows) for (const source of row.sources ?? []) { const value = host(source.url); if (value) counts.set(value, (counts.get(value) || 0) + 1); }
  const answered = rows.filter((row) => row.status === "ok");
  return {
    answered: answered.length,
    mentioned: answered.filter((row) => row.mentioned).length,
    cited: answered.filter((row) => row.cited).length,
    sentiment: {
      positive: answered.filter((row) => row.mentioned && row.sentiment === "positive").length,
      neutral: answered.filter((row) => row.mentioned && row.sentiment === "neutral").length,
      negative: answered.filter((row) => row.mentioned && row.sentiment === "negative").length,
    },
    platforms,
    topCitedDomains: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({ domain, count })),
  };
}

/** Short excerpt around the first brand mention, or the start of the answer. */
export function answerExcerpt(text: string, brandNames: string[], length = 260) {
  const lower = text.toLowerCase();
  const index = brandNames.map((name) => lower.indexOf(name.toLowerCase())).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + length).replace(/\s+/g, " ").trim()}${start + length < text.length ? "…" : ""}`;
}
