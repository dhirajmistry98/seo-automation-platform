import type { Db } from "mongodb";
import { brandTermsFor, buildKeywordStrategy, type PageRow, type QueryRow } from "@/lib/seo/keyword-strategy";

type Site = { organizationId?: unknown; domain?: unknown; name?: unknown; [key: string]: unknown };
type StoredReport = { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }>; generatedAt?: Date; startDate?: string; endDate?: string };

/** Loads the newest Search Console query report and the crawled pages, then builds the strategy. Null when no report exists yet. */
export async function loadKeywordStrategy(db: Db, site: Site) {
  const domain = String(site.domain ?? "").toLowerCase();
  const scope = { organizationId: site.organizationId, websiteDomain: domain };
  const [reports, pages] = await Promise.all([
    db.collection<StoredReport>("google_search_console_reports").find({ ...scope, dimension: "query" } as never).sort({ generatedAt: -1 }).limit(1).toArray(),
    db.collection("seo_pages").find(scope, { projection: { url: 1, title: 1, headings: 1 } }).sort({ crawledAt: -1 }).limit(300).toArray(),
  ]);
  const report = reports[0];
  if (!report?.rows?.length) return null;
  const rows: QueryRow[] = report.rows.flatMap((row) => row.keys?.[0] ? [{ query: String(row.keys[0]).slice(0, 160), clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, position: Number(row.position) || 0 }] : []);
  const seen = new Set<string>();
  const pageRows: PageRow[] = pages.flatMap((page) => {
    const url = String(page.url || "");
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const headings = Array.isArray(page.headings) ? page.headings as Array<{ level?: number; text?: string }> : [];
    return [{ url, title: String(page.title || "").slice(0, 200), h1: String(headings.find((heading) => heading.level === 1)?.text || "").slice(0, 200) }];
  });
  return { strategy: buildKeywordStrategy(rows, pageRows, brandTermsFor(domain, typeof site.name === "string" ? site.name : undefined)), pagesCompared: pageRows.length, generatedAt: report.generatedAt ?? null, startDate: report.startDate ?? null, endDate: report.endDate ?? null };
}
