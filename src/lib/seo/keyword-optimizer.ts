import type { AuditedPage } from "@/lib/seo/audit";

/**
 * On-page keyword optimization: how well one live page targets one keyword, with prioritized fixes.
 * First-party analysis of the page's HTML; it cannot see competitors' pages or Google's ranking signals
 * such as backlinks, so the score measures on-page readiness, not a guaranteed position.
 */

export type KeywordCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  impact: "high" | "medium" | "low";
  detail: string;
  fix: string;
};

const STOPWORDS = new Set(["a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "by", "with", "is", "are", "my", "your", "best", "top", "how", "what", "why"]);

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const tokens = (value: string) => normalize(value).split(" ").filter(Boolean);
const meaningful = (value: string) => tokens(value).filter((token) => !STOPWORDS.has(token));

function visibleText(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact phrase match, or every meaningful keyword word present (any order). */
function matchLevel(text: string, keyword: string): "exact" | "partial" | "none" {
  const haystack = ` ${normalize(text)} `;
  const phrase = normalize(keyword);
  if (phrase && haystack.includes(` ${phrase} `)) return "exact";
  const words = meaningful(keyword);
  if (words.length && words.every((word) => haystack.includes(` ${word} `) || haystack.includes(` ${word}s `))) return "partial";
  return "none";
}

function countPhrase(text: string, keyword: string) {
  const haystack = ` ${normalize(text)} `;
  const phrase = ` ${normalize(keyword)} `;
  if (phrase.trim() === "") return 0;
  let count = 0;
  for (let index = haystack.indexOf(phrase); index !== -1; index = haystack.indexOf(phrase, index + 1)) count++;
  return count;
}

export function analyzeKeywordTargeting(page: AuditedPage, html: string, keyword: string, relatedSearches: string[], questions: string[]) {
  const checks: KeywordCheck[] = [];
  const add = (check: KeywordCheck) => checks.push(check);
  const body = visibleText(html);
  const bodyWords = tokens(body);
  const h1s = page.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const h2s = page.headings.filter((heading) => heading.level === 2 || heading.level === 3).map((heading) => heading.text);
  const slug = (() => { try { return decodeURIComponent(new URL(page.finalUrl || page.url).pathname).replace(/[-_/]+/g, " "); } catch { return ""; } })();

  // Blockers first: a page Google cannot index cannot rank for anything.
  const blockers = page.issues.filter((issue) => issue.severity === "critical" || issue.ruleId === "technical.noindex");
  add(blockers.length
    ? { id: "indexable", label: "Google can index the page", status: "fail", impact: "high", detail: blockers.map((issue) => issue.title).join("; "), fix: "Fix these blocking problems first. Nothing else matters until Google can index the page." }
    : { id: "indexable", label: "Google can index the page", status: "pass", impact: "high", detail: `HTTP ${page.status}, no noindex or critical blockers found.`, fix: "" });

  const titleMatch = matchLevel(page.title, keyword);
  const titleStart = normalize(page.title).indexOf(normalize(keyword));
  add(titleMatch === "exact" && titleStart >= 0 && titleStart <= 20
    ? { id: "title", label: "Keyword at the start of the title", status: "pass", impact: "high", detail: `“${page.title}”`, fix: "" }
    : titleMatch !== "none"
      ? { id: "title", label: "Keyword at the start of the title", status: "warn", impact: "high", detail: `The title contains the keyword words, but not as the exact phrase near the start: “${page.title}”.`, fix: `Rewrite the title to start with “${keyword}”, followed by a clear benefit, in 50–60 characters.` }
      : { id: "title", label: "Keyword at the start of the title", status: "fail", impact: "high", detail: page.title ? `“${page.title}” does not mention the keyword.` : "The page has no title.", fix: `Write a title that starts with “${keyword}”, in 50–60 characters. The title is the strongest on-page signal.` });

  const titleLength = page.title.length;
  add(titleLength >= 30 && titleLength <= 60
    ? { id: "title_length", label: "Title length", status: "pass", impact: "medium", detail: `${titleLength} characters.`, fix: "" }
    : { id: "title_length", label: "Title length", status: "warn", impact: "medium", detail: `${titleLength} characters.`, fix: titleLength > 60 ? "Shorten the title to 60 characters or less so Google shows all of it." : "Make the title more descriptive (30–60 characters)." });

  const h1Match = h1s.map((text) => matchLevel(text, keyword));
  add(h1s.length === 0
    ? { id: "h1", label: "Keyword in the main heading (H1)", status: "fail", impact: "high", detail: "The page has no H1 heading.", fix: `Add one H1 that includes “${keyword}”.` }
    : h1Match.includes("exact")
      ? { id: "h1", label: "Keyword in the main heading (H1)", status: h1s.length > 1 ? "warn" : "pass", impact: "high", detail: `H1: “${h1s[0]}”${h1s.length > 1 ? ` (and ${h1s.length - 1} more H1)` : ""}.`, fix: h1s.length > 1 ? "Keep a single H1 per page." : "" }
      : { id: "h1", label: "Keyword in the main heading (H1)", status: h1Match.includes("partial") ? "warn" : "fail", impact: "high", detail: `H1: “${h1s[0]}”.`, fix: `Rewrite the H1 to include “${keyword}” naturally.` });

  const descriptionMatch = matchLevel(page.description, keyword);
  const descriptionLength = page.description.trim().length;
  add(!descriptionLength
    ? { id: "description", label: "Keyword in the meta description", status: "fail", impact: "medium", detail: "No meta description.", fix: `Write a 120–160 character description that includes “${keyword}” and a reason to click.` }
    : descriptionMatch === "none"
      ? { id: "description", label: "Keyword in the meta description", status: "warn", impact: "medium", detail: `“${page.description.slice(0, 160)}”`, fix: `Include “${keyword}” in the meta description. Google bolds matching words, which raises clicks.` }
      : { id: "description", label: "Keyword in the meta description", status: descriptionLength > 160 || descriptionLength < 70 ? "warn" : "pass", impact: "medium", detail: `${descriptionLength} characters.`, fix: descriptionLength > 160 ? "Shorten to 160 characters or less." : descriptionLength < 70 ? "Expand to 120–160 characters." : "" });

  const subheadingHit = h2s.some((text) => matchLevel(text, keyword) !== "none");
  add(subheadingHit
    ? { id: "subheadings", label: "Keyword in a subheading (H2/H3)", status: "pass", impact: "medium", detail: `${h2s.length} subheadings, at least one mentions the keyword.`, fix: "" }
    : { id: "subheadings", label: "Keyword in a subheading (H2/H3)", status: h2s.length ? "warn" : "fail", impact: "medium", detail: h2s.length ? `${h2s.length} subheadings, none mention the keyword.` : "No H2 or H3 subheadings.", fix: `Break the content into sections with H2 headings, and use “${keyword}” or a close variant in at least one.` });

  const slugMatch = matchLevel(slug, keyword);
  const isHome = slug.trim() === "";
  add(isHome || slugMatch !== "none"
    ? { id: "url", label: "Keyword in the URL", status: "pass", impact: "low", detail: isHome ? "Homepage URL." : `URL path: ${slug.trim()}`, fix: "" }
    : { id: "url", label: "Keyword in the URL", status: "warn", impact: "low", detail: `URL path: ${slug.trim()}`, fix: `For a new page, use a short URL with the keyword, e.g. /${meaningful(keyword).join("-")}. Do not change an established URL without a 301 redirect.` });

  const first100 = bodyWords.slice(0, 100).join(" ");
  const introMatch = matchLevel(first100, keyword);
  add(introMatch === "exact"
    ? { id: "intro", label: "Keyword in the first 100 words", status: "pass", impact: "medium", detail: "The opening text uses the exact keyword.", fix: "" }
    : { id: "intro", label: "Keyword in the first 100 words", status: "warn", impact: "medium", detail: introMatch === "partial" ? "The opening text has the keyword's words, but not the exact phrase." : "The keyword does not appear in the opening text.", fix: `Use “${keyword}” in the first paragraph so readers and Google see the topic straight away.` });

  const exactCount = countPhrase(body, keyword);
  const density = bodyWords.length ? (exactCount * tokens(keyword).length * 100) / bodyWords.length : 0;
  add(exactCount === 0
    ? { id: "usage", label: "Keyword used in the content", status: "fail", impact: "high", detail: "The exact phrase does not appear in the body text.", fix: `Use “${keyword}” naturally a few times in the body, plus close variations.` }
    : density > 3
      ? { id: "usage", label: "Keyword used in the content", status: "warn", impact: "medium", detail: `${exactCount} times (${density.toFixed(1)}% of words), which may read as keyword stuffing.`, fix: "Reduce repetition. Use synonyms and related phrases instead." }
      : { id: "usage", label: "Keyword used in the content", status: "pass", impact: "high", detail: `${exactCount} times (${density.toFixed(1)}% of words).`, fix: "" });

  add(page.wordCount >= 800
    ? { id: "depth", label: "Content depth", status: "pass", impact: "high", detail: `${page.wordCount.toLocaleString()} words.`, fix: "" }
    : { id: "depth", label: "Content depth", status: page.wordCount >= 400 ? "warn" : "fail", impact: "high", detail: `${page.wordCount.toLocaleString()} words.`, fix: "Pages that rank for competitive keywords usually cover the topic fully. Expand with the related topics and questions below (aim for 800+ useful words, not filler)." });

  // Related searches from Google autocomplete: subtopics the page does not cover yet.
  const pageTokens = new Set(bodyWords.concat(tokens(page.title), ...page.headings.map((heading) => tokens(heading.text))));
  const keywordTokens = new Set(meaningful(keyword));
  const missingTopics = relatedSearches
    .map((search) => ({ search, extra: meaningful(search).filter((token) => !keywordTokens.has(token)) }))
    .filter((item) => item.extra.length && item.extra.some((token) => !pageTokens.has(token)))
    .map((item) => item.search)
    .slice(0, 10);
  const coveredCount = relatedSearches.length - missingTopics.length;
  add(!relatedSearches.length
    ? { id: "topics", label: "Covers related searches", status: "warn", impact: "medium", detail: "Google returned no related searches for this keyword.", fix: "" }
    : missingTopics.length <= Math.floor(relatedSearches.length / 3)
      ? { id: "topics", label: "Covers related searches", status: "pass", impact: "medium", detail: `Covers ${coveredCount} of ${relatedSearches.length} related searches.`, fix: "" }
      : { id: "topics", label: "Covers related searches", status: "warn", impact: "high", detail: `Covers ${coveredCount} of ${relatedSearches.length} related searches people type into Google.`, fix: "Add sections that answer the related searches listed below. Topic coverage is one of the strongest ways to outrank thin pages." });

  const unansweredQuestions = questions.filter((question) => meaningful(question).filter((token) => !keywordTokens.has(token)).some((token) => !pageTokens.has(token))).slice(0, 8);
  const hasFaq = page.searchSignals?.hasFaqSchema || page.headings.some((heading) => /\?$/.test(heading.text.trim()));
  add(!questions.length
    ? { id: "questions", label: "Answers questions people ask", status: "pass", impact: "low", detail: "Google returned no common questions for this keyword.", fix: "" }
    : hasFaq && unansweredQuestions.length < questions.length
    ? { id: "questions", label: "Answers questions people ask", status: "pass", impact: "medium", detail: "The page has question headings or FAQ markup.", fix: "" }
    : { id: "questions", label: "Answers questions people ask", status: "warn", impact: "medium", detail: questions.length ? `${questions.length} common questions found; the page has no FAQ section.` : "No question headings found.", fix: "Add an FAQ section with short, direct answers to the questions below. This also helps Google AI Overviews and AI assistants quote you." });

  const informative = page.images.filter((image) => !image.decorative);
  add(!informative.length
    ? { id: "images", label: "Images with descriptive alt text", status: "warn", impact: "low", detail: "No content images.", fix: "Add at least one relevant image (diagram, screenshot or photo) with descriptive alt text." }
    : informative.some((image) => image.alt && matchLevel(image.alt, keyword) !== "none")
      ? { id: "images", label: "Images with descriptive alt text", status: "pass", impact: "low", detail: `${informative.length} images; at least one alt text mentions the keyword.`, fix: "" }
      : { id: "images", label: "Images with descriptive alt text", status: "warn", impact: "low", detail: `${informative.length} images; none of the alt text mentions the keyword.`, fix: `Describe the main image with alt text that naturally includes “${keyword}”.` });

  add(page.internalLinks.length >= 3
    ? { id: "internal_links", label: "Internal links", status: "pass", impact: "medium", detail: `${page.internalLinks.length} links to other pages on the site.`, fix: "" }
    : { id: "internal_links", label: "Internal links", status: "warn", impact: "medium", detail: `${page.internalLinks.length} internal links.`, fix: `Link to this page from other relevant pages on your site using anchor text like “${keyword}”, and link out from it to related pages.` });

  add(page.structuredData.length
    ? { id: "schema", label: "Structured data", status: "pass", impact: "low", detail: `${page.structuredData.length} JSON-LD block(s).`, fix: "" }
    : { id: "schema", label: "Structured data", status: "warn", impact: "low", detail: "No structured data.", fix: "Add JSON-LD that describes the page (Article, Product, Service, LocalBusiness or FAQPage, whichever is true)." });

  const weight = { high: 3, medium: 2, low: 1 } as const;
  const earned = checks.reduce((sum, check) => sum + weight[check.impact] * (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0), 0);
  const total = checks.reduce((sum, check) => sum + weight[check.impact], 0);
  const score = Math.round((earned / total) * 100);
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const plan = checks
    .filter((check) => check.status !== "pass" && check.fix)
    .sort((a, b) => order[a.status] - order[b.status] || weight[b.impact] - weight[a.impact])
    .map((check) => ({ step: check.label, fix: check.fix, impact: check.impact }));
  return { score, checks, plan, missingTopics, unansweredQuestions, wordCount: page.wordCount, keywordCount: exactCount };
}

/** Shared with the Google top-results benchmark. */
export const meaningfulTokens = meaningful;
export const visiblePageText = visibleText;
