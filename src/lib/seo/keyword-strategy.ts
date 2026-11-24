/**
 * Keyword strategy built only from data the website already owns: Search Console queries and crawled pages.
 * Pure functions, no network. Estimates are labelled as estimates; nothing here is search volume or difficulty.
 */
export type QueryRow = { query: string; clicks: number; impressions: number; position: number };
export type PageRow = { url: string; title: string; h1: string };
export type Intent = "informational" | "commercial" | "transactional" | "navigational";

const STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why", "with", "your", "you", "best", "vs"]);
const QUESTION_START = /^(who|what|when|where|why|how|which|can|does|do|is|are|should|will|could|would)\b/;
const TRANSACTIONAL = /\b(buy|price|pricing|cost|cheap|cheapest|discount|coupon|deal|order|purchase|hire|quote|book|booking|download|free trial|subscribe|near me)\b/;
const COMMERCIAL = /\b(best|top|review|reviews|compare|comparison|vs|versus|alternative|alternatives|tools?|software|services?|agency|company|companies|provider)\b/;
const INFORMATIONAL = /\b(what|how|why|guide|tutorial|tips|ideas|examples?|meaning|definition|learn|checklist|steps|explained)\b/;
const NAVIGATIONAL = /\b(login|log in|sign in|signin|sign up|contact|support|careers|dashboard)\b/;

export function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Significant, lightly-stemmed words of a phrase. Used for clustering and page matching. */
export function significantTokens(value: string): string[] {
  return [...new Set(normalizeQuery(value).split(" ").filter((word) => word.length > 1 && !STOPWORDS.has(word)).map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word)))];
}

export function isQuestion(query: string) {
  const text = normalizeQuery(query);
  return QUESTION_START.test(text) || query.includes("?");
}

export function lengthClass(query: string): "short" | "long-tail" {
  return normalizeQuery(query).split(" ").filter(Boolean).length >= 3 ? "long-tail" : "short";
}

/** Rule-based intent. `brandTerms` are the site's own names; queries containing them are navigational. */
export function classifyIntent(query: string, brandTerms: string[] = []): Intent {
  const text = normalizeQuery(query);
  if (brandTerms.some((term) => term.length > 2 && text.includes(term)) || NAVIGATIONAL.test(text)) return "navigational";
  if (TRANSACTIONAL.test(text)) return "transactional";
  if (COMMERCIAL.test(text)) return "commercial";
  if (INFORMATIONAL.test(text) || isQuestion(text)) return "informational";
  return "informational";
}

/** Typical organic click-through rate by position. An industry-style average, so any use of it is an estimate. */
export function expectedCtr(position: number) {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.11;
  if (position <= 4) return 0.08;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.035;
  if (position <= 20) return 0.01;
  return 0.003;
}

/** Estimated extra monthly clicks if the query moved to position 3. Zero when already there. */
export function opportunityScore(row: QueryRow) {
  if (row.position <= 3 || row.impressions <= 0) return 0;
  return Math.max(0, Math.round(row.impressions * expectedCtr(3) - row.clicks));
}

export type Cluster = { topic: string; queries: QueryRow[]; clicks: number; impressions: number; position: number; opportunity: number; intent: Intent };

/** Groups queries that share most of their significant words, largest demand first. */
export function clusterQueries(rows: QueryRow[], brandTerms: string[] = []): Cluster[] {
  const groups: Array<{ tokens: Set<string>; rows: QueryRow[] }> = [];
  for (const row of [...rows].sort((a, b) => b.impressions - a.impressions)) {
    const tokens = new Set(significantTokens(row.query));
    let best: (typeof groups)[number] | null = null;
    let bestRatio = 0;
    for (const group of groups) {
      const shared = [...tokens].filter((token) => group.tokens.has(token)).length;
      const ratio = tokens.size && group.tokens.size ? shared / Math.min(tokens.size, group.tokens.size) : 0;
      if (shared >= 1 && ratio >= 0.5 && ratio > bestRatio) { best = group; bestRatio = ratio; }
    }
    if (best) best.rows.push(row);
    else groups.push({ tokens, rows: [row] });
  }
  return groups.map(({ rows: members }) => {
    const impressions = members.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = members.reduce((sum, row) => sum + row.clicks, 0);
    const position = impressions ? members.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0;
    return { topic: members[0].query, queries: members, clicks, impressions, position: Math.round(position * 10) / 10, opportunity: members.reduce((sum, row) => sum + opportunityScore(row), 0), intent: classifyIntent(members[0].query, brandTerms) };
  }).sort((a, b) => b.impressions - a.impressions);
}

export type PageMatch = { url: string; title: string; score: number };

/** Best existing page for a topic, by shared words in the URL, title and H1. Null when nothing is close. */
export function matchPage(topic: string, pages: PageRow[]): PageMatch | null {
  const wanted = significantTokens(topic);
  if (!wanted.length) return null;
  let best: PageMatch | null = null;
  for (const page of pages) {
    const have = new Set(significantTokens(`${decodeURIComponentSafe(page.url)} ${page.title} ${page.h1}`));
    const score = wanted.filter((token) => have.has(token)).length / wanted.length;
    if (score >= 0.5 && (!best || score > best.score)) best = { url: page.url, title: page.title, score: Math.round(score * 100) / 100 };
  }
  return best;
}
function decodeURIComponentSafe(value: string) { try { return decodeURIComponent(value).replace(/[/_-]+/g, " "); } catch { return value; } }

export type StrategyCluster = Cluster & { page: PageMatch | null; role: "pillar" | "subtopic" | "standalone"; plan: string };

export type KeywordStrategy = {
  totals: { queries: number; clicks: number; impressions: number; clusters: number };
  intents: Record<Intent, number>;
  lengths: { short: number; longTail: number; questions: number };
  branded: { branded: number; nonBranded: number };
  buckets: { strong: number; strikingDistance: number; weak: number };
  clusters: StrategyCluster[];
  contentGaps: StrategyCluster[];
  quickWins: Array<QueryRow & { opportunity: number; page: PageMatch | null }>;
};

export function buildKeywordStrategy(rows: QueryRow[], pages: PageRow[], brandTerms: string[] = []): KeywordStrategy {
  const clean = rows.filter((row) => row.query && Number.isFinite(row.impressions));
  const clusters: StrategyCluster[] = clusterQueries(clean, brandTerms).map((cluster) => {
    const page = matchPage(cluster.topic, pages);
    const role = cluster.queries.length >= 4 ? "pillar" : cluster.queries.length >= 2 ? "subtopic" : "standalone";
    const plan = !page
      ? `No page targets "${cluster.topic}". Create a ${role === "pillar" ? "pillar page" : "dedicated page"} and cover ${cluster.queries.length} related search${cluster.queries.length === 1 ? "" : "es"}.`
      : cluster.position > 10
        ? `Strengthen ${page.url}: it is the closest match but ranks around position ${cluster.position}. Add the missing related terms and internal links.`
        : `Keep ${page.url} as the target page and add a section for any related query that is still missing.`;
    return { ...cluster, page, role, plan };
  });
  const intents: Record<Intent, number> = { informational: 0, commercial: 0, transactional: 0, navigational: 0 };
  let short = 0, longTail = 0, questions = 0, branded = 0;
  const buckets = { strong: 0, strikingDistance: 0, weak: 0 };
  for (const row of clean) {
    intents[classifyIntent(row.query, brandTerms)] += 1;
    if (lengthClass(row.query) === "short") short += 1; else longTail += 1;
    if (isQuestion(row.query)) questions += 1;
    const text = normalizeQuery(row.query);
    if (brandTerms.some((term) => term.length > 2 && text.includes(term))) branded += 1;
    if (row.position <= 3) buckets.strong += 1; else if (row.position <= 20) buckets.strikingDistance += 1; else buckets.weak += 1;
  }
  return {
    totals: { queries: clean.length, clicks: clean.reduce((sum, row) => sum + row.clicks, 0), impressions: clean.reduce((sum, row) => sum + row.impressions, 0), clusters: clusters.length },
    intents, lengths: { short, longTail, questions }, branded: { branded, nonBranded: clean.length - branded }, buckets,
    clusters: clusters.slice(0, 60),
    contentGaps: clusters.filter((cluster) => !cluster.page && cluster.impressions >= 20).slice(0, 25),
    quickWins: clean.filter((row) => row.position > 3 && row.position <= 20 && row.impressions >= 50).map((row) => ({ ...row, opportunity: opportunityScore(row), page: matchPage(row.query, pages) })).sort((a, b) => b.opportunity - a.opportunity).slice(0, 25),
  };
}

/** Site names that count as "branded": the domain without its TLD and the saved site name, lower-cased. */
export function brandTermsFor(domain: string, name?: string) {
  const root = domain.toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
  return [...new Set([root, normalizeQuery(name || "")].filter((term) => term.length > 2))];
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function strategyToCsv(strategy: KeywordStrategy) {
  const lines = ["topic,query,intent,clicks,impressions,position,estimated_extra_clicks,role,target_page"];
  for (const cluster of strategy.clusters) for (const row of cluster.queries) lines.push([cluster.topic, row.query, classifyIntent(row.query), row.clicks, row.impressions, Math.round(row.position * 10) / 10, opportunityScore(row), cluster.role, cluster.page?.url ?? ""].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
