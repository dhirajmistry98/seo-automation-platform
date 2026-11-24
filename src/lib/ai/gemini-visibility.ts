/**
 * Gemini visibility snapshot: asks Gemini (with Google Search grounding) the questions customers ask,
 * then records whether the brand is mentioned in the answer and whether the website is cited as a source.
 * It is a point-in-time observation, not a ranking guarantee.
 */
export type VisibilityResult = {
  question: string;
  mentioned: boolean;
  cited: boolean;
  sources: string[];
  snippet: string;
  error?: string;
};

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; groundingMetadata?: { groundingChunks?: GroundingChunk[] } }>;
  error?: { message?: string };
};

export function normalizeDomain(value: string) {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

export function defaultQuestions(keywords: string[], brand: string): string[] {
  const base = keywords.slice(0, 3).map((keyword) => `What are the best tools or services for ${keyword}?`);
  return base.length ? base : [`What is ${brand} and what does it do?`];
}

export function evaluateAnswer(text: string, chunks: GroundingChunk[], brand: string, domain: string) {
  const lower = text.toLowerCase();
  const host = normalizeDomain(domain);
  const brandName = brand.trim().toLowerCase();
  const mentioned = (brandName.length >= 3 && lower.includes(brandName)) || lower.includes(host);
  const sources = chunks.flatMap((chunk) => (chunk.web?.title ? [chunk.web.title.toLowerCase()] : []));
  const cited = sources.some((title) => title.includes(host));
  return { mentioned, cited, sources: [...new Set(sources)].slice(0, 6) };
}

async function askOne(question: string, brand: string, domain: string): Promise<VisibilityResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("not-configured");
  const model = process.env.GEMINI_VISIBILITY_MODEL || "gemini-2.5-flash";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) return { question, mentioned: false, cited: false, sources: [], snippet: "", error: `Gemini returned ${response.status}.` };
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    const verdict = evaluateAnswer(text, candidate?.groundingMetadata?.groundingChunks || [], brand, domain);
    return { question, ...verdict, snippet: text.slice(0, 320) };
  } catch {
    return { question, mentioned: false, cited: false, sources: [], snippet: "", error: "Gemini did not respond in time." };
  }
}

export async function checkGeminiVisibility(questions: string[], brand: string, domain: string): Promise<VisibilityResult[]> {
  return Promise.all(questions.map((question) => askOne(question, brand, domain)));
}
