export const AUTHORITY_INDEX_VERSION = "authority-v1";

export const AUTHORITY_WEIGHTS = {
  backlinkStrength: 30,
  organicVisibility: 25,
  topicalCoverage: 15,
  linkProfileQuality: 15,
  technicalTrust: 15,
} as const;

type AuthorityInput = {
  backlinks?: Record<string, unknown> | null;
  searchQueries?: Array<Record<string, unknown>> | null;
  pages?: Array<Record<string, unknown>> | null;
  primaryKeywords?: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const logarithmic = (value: number, reference: number) => clamp(100 * Math.log1p(value) / Math.log1p(reference));

export function calculateAuthorityIndex(input: AuthorityInput) {
  const missing: string[] = [];
  const backlinks = input.backlinks;
  const rows = input.searchQueries;
  const pages = input.pages;
  const referringDomains = backlinks ? count(backlinks.referring_domains) : null;
  const referringIps = backlinks ? count(backlinks.referring_ips) : null;
  const spamScore = backlinks ? count(backlinks.backlinks_spam_score) : null;
  if (referringDomains === null) missing.push("DataForSEO backlink summary");
  if (!rows?.length || !rows.some((row) => count(row.clicks) !== null)) missing.push("Google Search Console query report with clicks");
  if (!pages?.length) missing.push("completed website crawl");

  const primaryKeywords = [...new Set((input.primaryKeywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  if (!primaryKeywords.length) missing.push("primary keywords in website settings");
  if (referringIps === null && spamScore === null) missing.push("link profile quality signals");

  const backlinkStrength = referringDomains === null ? null : logarithmic(referringDomains, 10_000);
  const clicks = rows?.some((row) => count(row.clicks) !== null)
    ? rows.reduce((total, row) => total + (count(row.clicks) ?? 0), 0)
    : null;
  const organicVisibility = clicks === null ? null : logarithmic(clicks, 100_000);
  const queries = rows?.flatMap((row) => Array.isArray(row.keys) && typeof row.keys[0] === "string" ? [row.keys[0].toLowerCase()] : []) ?? [];
  const topicalCoverage = rows?.length && primaryKeywords.length
    ? clamp(100 * primaryKeywords.filter((keyword) => queries.some((query) => query.includes(keyword))).length / primaryKeywords.length)
    : null;
  const ipDiversity = referringDomains !== null && referringIps !== null && referringDomains > 0
    ? clamp(100 * Math.min(1, referringIps / referringDomains))
    : referringDomains === 0 && referringIps === 0 ? 0 : null;
  const boundedSpamScore = spamScore === null ? null : clamp(100 - spamScore);
  const linkProfileQuality = ipDiversity !== null && boundedSpamScore !== null
    ? clamp((ipDiversity + boundedSpamScore) / 2)
    : ipDiversity ?? boundedSpamScore;
  const technicalTrust = pages?.length
    ? clamp(100 * pages.filter((page) => {
      const status = count(page.status);
      const url = typeof page.finalUrl === "string" ? page.finalUrl : page.url;
      return typeof url === "string" && url.startsWith("https://") && status !== null && status >= 200 && status < 400 && !/\bnoindex\b/i.test(String(page.robots ?? ""));
    }).length / pages.length)
    : null;

  const components = { backlinkStrength, organicVisibility, topicalCoverage, linkProfileQuality, technicalTrust };
  const observed = (Object.keys(AUTHORITY_WEIGHTS) as Array<keyof typeof AUTHORITY_WEIGHTS>)
    .filter((key) => components[key] !== null);
  const observedWeight = observed.reduce((total, key) => total + AUTHORITY_WEIGHTS[key], 0);
  const score = missing.length === 0
    ? clamp(observed.reduce((total, key) => total + (components[key] ?? 0) * AUTHORITY_WEIGHTS[key], 0) / observedWeight)
    : null;
  return {
    version: AUTHORITY_INDEX_VERSION,
    score,
    confidence: clamp(observedWeight * (rows?.length ? Math.min(1, rows.length / 25) : 0) * (pages?.length ? Math.min(1, pages.length / 5) : 0)),
    components,
    missing,
    inputs: { referringDomains, referringIps, backlinksSpamScore: spamScore, searchQueryRows: rows?.length ?? 0, searchClicks: clicks, crawledPages: pages?.length ?? 0, primaryKeywords: primaryKeywords.length },
  };
}
