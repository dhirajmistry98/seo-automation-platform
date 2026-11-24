/** Internal link graph analysis over crawled pages. Pure functions: depth, inbound links, orphans and link suggestions. */
import { significantTokens } from "@/lib/seo/keyword-strategy";
import { DEEP_PAGE_DEPTH, EXCESSIVE_LINKS, clickDepths, normalizeInternalUrl } from "@/lib/seo/audit";
export { DEEP_PAGE_DEPTH, EXCESSIVE_LINKS, clickDepths, normalizeInternalUrl };

export type LinkPage = { url: string; title: string; internalLinks: string[]; status?: number };

export type PageLinkStats = { url: string; title: string; depth: number | null; inbound: number; outbound: number };

export function analyzeInternalLinks(pages: LinkPage[]) {
  const depths = clickDepths(pages);
  const keys = new Set(pages.flatMap((page) => { const key = normalizeInternalUrl(page.url); return key ? [key] : []; }));
  const inboundFrom = new Map<string, Set<string>>();
  for (const page of pages) {
    const from = normalizeInternalUrl(page.url);
    if (!from) continue;
    for (const link of page.internalLinks) {
      const to = normalizeInternalUrl(link);
      if (to && to !== from && keys.has(to)) { const set = inboundFrom.get(to) ?? new Set<string>(); set.add(from); inboundFrom.set(to, set); }
    }
  }
  const stats: PageLinkStats[] = pages.map((page) => {
    const key = normalizeInternalUrl(page.url) ?? page.url;
    return { url: page.url, title: page.title, depth: depths.get(key) ?? null, inbound: inboundFrom.get(key)?.size ?? 0, outbound: new Set(page.internalLinks.map(normalizeInternalUrl).filter((link): link is string => !!link && link !== key)).size };
  });
  const root = stats[0];
  const rest = stats.slice(1);
  const bucket = (count: number) => (count === 0 ? "0" : count === 1 ? "1" : count <= 5 ? "2–5" : count <= 20 ? "6–20" : "21+");
  const inboundDistribution = ["0", "1", "2–5", "6–20", "21+"].map((label) => ({ label, value: rest.filter((page) => bucket(page.inbound) === label).length }));
  const maxDepth = Math.max(0, ...stats.map((page) => page.depth ?? 0));
  const depthDistribution = Array.from({ length: Math.min(maxDepth, 8) + 1 }, (_, depth) => ({ label: depth === 0 ? "Home" : `${depth}`, value: stats.filter((page) => page.depth === depth).length }));
  return {
    pages: stats, root,
    orphans: rest.filter((page) => page.inbound === 0),
    deep: stats.filter((page) => page.depth !== null && page.depth > DEEP_PAGE_DEPTH).sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0)),
    excessive: stats.filter((page) => page.outbound > EXCESSIVE_LINKS).sort((a, b) => b.outbound - a.outbound),
    topLinked: [...rest].sort((a, b) => b.inbound - a.inbound).slice(0, 10),
    inboundDistribution, depthDistribution,
    suggestions: suggestLinks(pages, stats),
  };
}

export type LinkSuggestion = { target: { url: string; title: string; inbound: number }; from: Array<{ url: string; title: string }>; anchor: string };

/** For weakly linked pages, find related pages (shared title words) that do not link to them yet. */
export function suggestLinks(pages: LinkPage[], stats: PageLinkStats[]): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];
  const linked = new Map(pages.map((page) => [normalizeInternalUrl(page.url) ?? page.url, new Set(page.internalLinks.map((link) => normalizeInternalUrl(link)).filter(Boolean) as string[])]));
  const tokens = new Map(stats.map((page) => [page.url, new Set(significantTokens(`${page.title} ${new URL(page.url, "https://x").pathname.replace(/[/_-]+/g, " ")}`))]));
  for (const target of stats.slice(1).filter((page) => page.inbound <= 1 && page.title).sort((a, b) => a.inbound - b.inbound).slice(0, 25)) {
    const targetKey = normalizeInternalUrl(target.url) ?? target.url;
    const wanted = tokens.get(target.url) ?? new Set<string>();
    const candidates = stats.filter((source) => source.url !== target.url && source.outbound < 100 && !linked.get(normalizeInternalUrl(source.url) ?? source.url)?.has(targetKey))
      .map((source) => ({ source, score: [...(tokens.get(source.url) ?? [])].filter((token) => wanted.has(token)).length }))
      .filter((item) => item.score >= 1).sort((a, b) => b.score - a.score || b.source.inbound - a.source.inbound).slice(0, 3);
    if (candidates.length) out.push({ target: { url: target.url, title: target.title, inbound: target.inbound }, from: candidates.map(({ source }) => ({ url: source.url, title: source.title })), anchor: target.title.slice(0, 80) });
  }
  return out;
}
