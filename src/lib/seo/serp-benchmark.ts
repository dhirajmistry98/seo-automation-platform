/**
 * "Compare with Google's top results" for Rank a page: the live Google top 10 for a keyword, where the user's
 * site ranks, how the user's page compares with the top-ranking pages, and the topics those pages cover that the
 * user's page does not. Pure functions; the route does the network calls.
 */
import type { AuditedPage } from "./audit.ts";
import { meaningfulTokens, visiblePageText } from "./keyword-optimizer.ts";

export type SerpResult = { rank: number; url: string; domain: string; title: string };
export type PageProfile = { words: number; sections: number; keywordUses: number; keywordInTitle: boolean; keywordInH1: boolean; schema: string[]; images: number };
export type Benchmark = {
  yours: PageProfile;
  top: { pages: number; words: number; sections: number; keywordUses: number; keywordInTitle: number; keywordInH1: number; schema: string[] };
  gaps: Array<{ id: string; title: string; fix: string; impact: "high" | "medium" | "low" }>;
  missingTopics: string[];
};

/** Function words and vague words that make poor topic suggestions on their own or inside a two-word phrase. */
const FILLER = new Set("about above after again also always among another because been before being below between both but came can cannot could did does doing done down during each either else even ever every few from further get gets getting give given goes going got had has have having here how however into its itself just keep know known last least less let like likely made make makes making many may might more most much must need needs never new next now off often once one only onto other others our ours out over own per put rather really same say says see seen should since some something still such sure take than that the their them then there these they thing things this those though through thus too took toward under until upon use used uses using very want wants was way ways well were what whatever when where whether which while who whom whose why will with within without would yes yet you your yours".split(" "));
const isTopic = (term: string) => term.split(" ").every((word) => word.length > 2 && !FILLER.has(word) && !/^\d+$/.test(word));

/** Schema.org types from the page's JSON-LD blocks (handles arrays and @graph). */
export function schemaTypes(blocks: string[]) {
  const types = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const type = node["@type"];
    for (const item of Array.isArray(type) ? type : [type]) if (typeof item === "string" && /^[A-Za-z]{2,60}$/.test(item)) types.add(item);
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const block of blocks) {
    if (/^[A-Za-z]{2,60}$/.test(block)) { types.add(block); continue; }
    try { visit(JSON.parse(block)); } catch { /* not JSON */ }
  }
  return [...types].slice(0, 12);
}

const bareHost = (value: string) => value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

/** Organic results from a DataForSEO SERP task, plus the first position held by the user's domain. */
export function parseSerp(items: Array<Record<string, unknown>>, domain: string) {
  const own = bareHost(domain);
  const organic: SerpResult[] = [];
  for (const item of items) {
    if (item.type !== "organic" || typeof item.url !== "string") continue;
    let host = typeof item.domain === "string" ? item.domain : "";
    try { host = host || new URL(item.url).hostname; } catch { continue; }
    const rank = Number(item.rank_group ?? item.rank_absolute);
    if (!Number.isSafeInteger(rank) || rank < 1) continue;
    organic.push({ rank, url: item.url, domain: bareHost(host), title: typeof item.title === "string" ? item.title.slice(0, 200) : "" });
  }
  organic.sort((a, b) => a.rank - b.rank);
  const isOwn = (result: SerpResult) => result.domain === own || result.domain.endsWith(`.${own}`);
  const yours = organic.find(isOwn) ?? null;
  return { organic, top10: organic.slice(0, 10), yours, competitors: organic.filter((result) => !isOwn(result)) };
}

function countPhrase(text: string, keyword: string) {
  const haystack = ` ${meaningfulTokens(text).join(" ")} `;
  const phrase = meaningfulTokens(keyword).join(" ");
  if (!phrase) return 0;
  let count = 0; let index = haystack.indexOf(` ${phrase} `);
  while (index !== -1) { count += 1; index = haystack.indexOf(` ${phrase} `, index + phrase.length + 1); }
  return count;
}
const containsAll = (text: string, keyword: string) => { const words = new Set(meaningfulTokens(text)); const wanted = meaningfulTokens(keyword); return wanted.length > 0 && wanted.every((word) => words.has(word)); };

export function pageProfile(page: AuditedPage, html: string, keyword: string): PageProfile {
  const text = visiblePageText(html);
  const h1 = page.headings.filter((heading) => heading.level === 1).map((heading) => heading.text).join(" ");
  return {
    words: page.wordCount,
    sections: page.headings.filter((heading) => heading.level === 2).length,
    keywordUses: countPhrase(text, keyword),
    keywordInTitle: containsAll(page.title || "", keyword),
    keywordInH1: containsAll(h1, keyword),
    schema: schemaTypes(page.structuredData),
    images: page.images.length,
  };
}

/** Words and two-word phrases used by most top pages but never by the user's page (excluding the keyword itself). */
export function missingTopics(yourHtml: string, competitorHtml: string[], keyword: string, limit = 12) {
  if (competitorHtml.length < 2) return [];
  const keywordWords = new Set(meaningfulTokens(keyword));
  const terms = (html: string) => {
    const words = meaningfulTokens(visiblePageText(html));
    const set = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      if (!keywordWords.has(words[i]) && isTopic(words[i])) set.add(words[i]);
      const pair = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : "";
      if (pair && isTopic(pair) && !(keywordWords.has(words[i]) && keywordWords.has(words[i + 1]))) set.add(pair);
    }
    return set;
  };
  const yours = terms(yourHtml);
  const counts = new Map<string, number>();
  for (const html of competitorHtml) for (const term of terms(html)) counts.set(term, (counts.get(term) || 0) + 1);
  const threshold = Math.max(2, Math.ceil(competitorHtml.length * 0.67));
  const candidates = [...counts].filter(([term, count]) => count >= threshold && !yours.has(term));
  // Prefer phrases (more specific), then by how many top pages use them.
  candidates.sort((a, b) => b[1] - a[1] || (b[0].includes(" ") ? 1 : 0) - (a[0].includes(" ") ? 1 : 0) || a[0].localeCompare(b[0]));
  const picked: string[] = [];
  for (const [term] of candidates) {
    if (picked.some((existing) => existing.includes(term) || term.includes(existing))) continue;
    picked.push(term);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function benchmarkPage(yours: PageProfile, competitors: PageProfile[], topics: string[], keyword: string): Benchmark {
  const top = {
    pages: competitors.length,
    words: median(competitors.map((item) => item.words)),
    sections: median(competitors.map((item) => item.sections)),
    keywordUses: median(competitors.map((item) => item.keywordUses)),
    keywordInTitle: competitors.filter((item) => item.keywordInTitle).length,
    keywordInH1: competitors.filter((item) => item.keywordInH1).length,
    schema: [...new Set(competitors.flatMap((item) => item.schema))].filter((type) => competitors.filter((item) => item.schema.includes(type)).length >= Math.max(2, Math.ceil(competitors.length / 2))).slice(0, 6),
  };
  const gaps: Benchmark["gaps"] = [];
  if (!competitors.length) return { yours, top, gaps, missingTopics: topics };
  if (top.words > 0 && yours.words < top.words * 0.7) gaps.push({ id: "serp_depth", impact: "high", title: "Your page is shorter than the pages Google ranks", fix: `The top pages use about ${top.words.toLocaleString("en-IN")} words; yours has ${yours.words.toLocaleString("en-IN")}. Add useful depth (examples, steps, prices, FAQs), not filler.` });
  if (top.sections > 0 && yours.sections < Math.max(1, Math.round(top.sections * 0.6))) gaps.push({ id: "serp_sections", impact: "medium", title: "Fewer sections than the top pages", fix: `The top pages have about ${top.sections} H2 sections; yours has ${yours.sections}. Cover each sub-topic in its own section.` });
  if (top.keywordInTitle >= Math.ceil(top.pages / 2) && !yours.keywordInTitle) gaps.push({ id: "serp_title", impact: "high", title: "Top pages put the keyword in the title", fix: `${top.keywordInTitle} of ${top.pages} top pages include “${keyword}” in the title; yours does not.` });
  if (top.keywordInH1 >= Math.ceil(top.pages / 2) && !yours.keywordInH1) gaps.push({ id: "serp_h1", impact: "medium", title: "Top pages put the keyword in the H1", fix: `${top.keywordInH1} of ${top.pages} top pages use “${keyword}” in the main heading; yours does not.` });
  const missingSchema = top.schema.filter((type) => !yours.schema.includes(type));
  if (missingSchema.length) gaps.push({ id: "serp_schema", impact: "low", title: "Structured data the top pages use", fix: `Most top pages add ${missingSchema.join(", ")} structured data; your page does not.` });
  if (topics.length) gaps.push({ id: "serp_topics", impact: "high", title: "Topics the top pages cover that you don't", fix: `Most top-ranking pages mention: ${topics.slice(0, 8).join(", ")}. Cover the relevant ones on your page.` });
  return { yours, top, gaps, missingTopics: topics };
}
