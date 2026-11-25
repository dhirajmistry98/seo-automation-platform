/**
 * Site audit overview. Pure functions over the pages and issues the crawler already stored.
 * A theme score is the share of crawled pages that have no issue in that area, so every number can be explained.
 */
export type Severity = "critical" | "warning" | "notice";
export type PageLite = { url: string; finalUrl?: string; status: number; issues: Array<{ ruleId: string; title: string; severity: Severity }> };
export type Counts = { critical: number; warning: number; notice: number };

const THEMES = [
  { key: "https", label: "HTTPS", matches: (id: string) => id === "technical.https_missing" || id === "technical.mixed_content" },
  { key: "international", label: "International SEO", matches: (id: string) => id.startsWith("hreflang.") || id === "metadata.language_missing" },
  { key: "internalLinking", label: "Internal linking", matches: (id: string) => id.startsWith("internal.") },
  { key: "markup", label: "Markup", matches: (id: string) => id.startsWith("schema.") || id.startsWith("metadata.og_") || id === "metadata.twitter_card_missing" },
  { key: "crawlability", label: "Crawlability", matches: (id: string) => id.startsWith("technical.") },
  { key: "onPage", label: "On-page SEO", matches: (id: string) => id.startsWith("metadata.") || id.startsWith("headings.") || id.startsWith("images.") },
  { key: "content", label: "Content", matches: (id: string) => id.startsWith("content.") },
] as const;

export type ThemeScore = { key: string; label: string; percent: number | null; pagesWithIssues: number };

function trimmed(url: string) {
  return url.trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
}

export function classifyPage(page: PageLite): "broken" | "redirect" | "issues" | "healthy" {
  if (page.status >= 400 || page.status === 0) return "broken";
  if (page.finalUrl && trimmed(page.finalUrl) !== trimmed(page.url)) return "redirect";
  return page.issues.length ? "issues" : "healthy";
}

export function buildAuditOverview(input: { pages: PageLite[]; skippedByRobots?: number; previous?: Counts | null; counts: Counts }) {
  const { pages } = input;
  const total = pages.length;
  const breakdown = { healthy: 0, issues: 0, broken: 0, redirect: 0, blocked: Math.max(0, input.skippedByRobots ?? 0) };
  for (const page of pages) breakdown[classifyPage(page)] += 1;

  const themes: ThemeScore[] = THEMES.map((theme) => {
    const claimed = (id: string) => THEMES.find((candidate) => candidate.matches(id))?.key === theme.key;
    const withIssues = pages.filter((page) => page.issues.some((issue) => claimed(issue.ruleId))).length;
    return { key: theme.key, label: theme.label, percent: total ? Math.round(((total - withIssues) / total) * 100) : null, pagesWithIssues: withIssues };
  });

  const byRule = new Map<string, { ruleId: string; title: string; severity: Severity; pages: Set<string> }>();
  for (const page of pages) for (const issue of page.issues) {
    const entry = byRule.get(issue.ruleId) ?? { ruleId: issue.ruleId, title: issue.title, severity: issue.severity, pages: new Set<string>() };
    entry.pages.add(page.url);
    byRule.set(issue.ruleId, entry);
  }
  const order: Record<Severity, number> = { critical: 0, warning: 1, notice: 2 };
  const topIssues = [...byRule.values()].map((entry) => ({ ruleId: entry.ruleId, title: entry.title, severity: entry.severity, pages: entry.pages.size }))
    .sort((a, b) => order[a.severity] - order[b.severity] || b.pages - a.pages).slice(0, 10);

  const deltas = input.previous ? { critical: input.counts.critical - input.previous.critical, warning: input.counts.warning - input.previous.warning, notice: input.counts.notice - input.previous.notice } : null;
  return { total, breakdown, themes, topIssues, deltas };
}
