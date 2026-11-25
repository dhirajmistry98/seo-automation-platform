import { ENGINES, EngineError, engineById, type EngineId, type Source } from "./engines";

export type CheckResult = {
  engine: EngineId;
  question: string;
  answered: boolean;
  mentioned: boolean;
  cited: boolean;
  sources: Source[];
  snippet: string;
  competitors: string[];
  error?: string;
};

export const MAX_QUESTIONS = 5;

export function normalizeHost(value: string) {
  return value.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the text names the domain (exactly) or its leading label as a whole word (4+ letters, to avoid generic words). */
export function namesDomain(text: string, domain: string) {
  const host = normalizeHost(domain);
  if (!host) return false;
  const lower = text.toLowerCase();
  if (lower.includes(host)) return true;
  const label = host.split(".")[0];
  return label.length >= 4 && new RegExp(`(^|[^a-z0-9])${escapeRegex(label)}($|[^a-z0-9])`).test(lower);
}

export function sourceMatchesDomain(source: Source, domain: string) {
  const host = normalizeHost(domain);
  if (!host) return false;
  try {
    const sourceHost = new URL(source.url).hostname.toLowerCase().replace(/^www\./, "");
    if (sourceHost === host || sourceHost.endsWith(`.${host}`)) return true;
  } catch { /* fall through to the title */ }
  // Gemini names its sources by bare domain (its URLs are redirects), so accept a title that is exactly the domain or a subdomain of it.
  const title = normalizeHost(source.title);
  return title === host || title.endsWith(`.${host}`);
}

export function evaluateAnswer(text: string, sources: Source[], brand: string, domain: string, competitors: string[]) {
  const lower = text.toLowerCase();
  const brandName = brand.trim().toLowerCase();
  const mentioned = (brandName.length >= 3 && lower.includes(brandName)) || lower.includes(normalizeHost(domain));
  const cited = sources.some((source) => sourceMatchesDomain(source, domain));
  const found = competitors.map(normalizeHost).filter((host) => host && host !== normalizeHost(domain) && (namesDomain(text, host) || sources.some((source) => sourceMatchesDomain(source, host))));
  return { mentioned, cited, competitors: [...new Set(found)] };
}

async function askOne(engineId: EngineId, question: string, brand: string, domain: string, competitors: string[]): Promise<CheckResult> {
  const blank = { engine: engineId, question, answered: false, mentioned: false, cited: false, sources: [], snippet: "", competitors: [] };
  try {
    const answer = await engineById(engineId).ask(question);
    if (!answer.text) return { ...blank, error: "The engine returned an empty answer." };
    return { engine: engineId, question, answered: true, ...evaluateAnswer(answer.text, answer.sources, brand, domain, competitors), sources: answer.sources, snippet: answer.text.slice(0, 400) };
  } catch (error) {
    if (!(error instanceof EngineError)) console.error("ai-visibility engine failed", engineId, error instanceof Error ? error.message : "unknown");
    return { ...blank, error: error instanceof EngineError ? error.message : "The engine could not answer right now." };
  }
}

export async function runVisibilityCheck(input: { engines: EngineId[]; questions: string[]; brand: string; domain: string; competitors: string[] }) {
  const jobs = input.engines.flatMap((engine) => input.questions.map((question) => askOne(engine, question, input.brand, input.domain, input.competitors)));
  return Promise.all(jobs);
}

export type EngineSummary = { engine: EngineId; label: string; asked: number; answered: number; mentioned: number; cited: number };

export function summarize(results: CheckResult[]): EngineSummary[] {
  return ENGINES.flatMap((engine) => {
    const rows = results.filter((row) => row.engine === engine.id);
    if (!rows.length) return [];
    const answered = rows.filter((row) => row.answered);
    return [{ engine: engine.id, label: engine.label, asked: rows.length, answered: answered.length, mentioned: answered.filter((row) => row.mentioned).length, cited: answered.filter((row) => row.cited).length }];
  });
}

/** Mentions of the brand and each competitor across all answered results (share of voice). */
export function shareOfVoice(results: CheckResult[], domain: string) {
  const answered = results.filter((row) => row.answered);
  const counts = new Map<string, number>();
  const own = normalizeHost(domain);
  counts.set(own, answered.filter((row) => row.mentioned).length);
  for (const row of answered) for (const host of row.competitors) counts.set(host, (counts.get(host) || 0) + 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return { answered: answered.length, rows: [...counts].map(([host, mentions]) => ({ host, mentions, percent: total ? Math.round((mentions / total) * 100) : 0, isYou: host === own })).sort((a, b) => b.mentions - a.mentions) };
}
