import type { Db } from "mongodb";
import { buildAuditOverview, type Counts, type PageLite } from "@/lib/seo/audit-overview";

type Site = { organizationId: unknown; domain: string };
type AuditDoc = { auditId: string; score?: number; issueCounts?: Counts; pageCount?: number; completedAt?: Date; skippedByRobots?: number };

const validCounts = (value: unknown): value is Counts => !!value && typeof value === "object" && ["critical", "warning", "notice"].every((key) => Number.isFinite((value as Record<string, unknown>)[key]));

/** Latest completed crawl, the one before it, and the stored pages, shaped for the audit overview. Null until a crawl has finished. */
export async function loadAuditOverview(db: Db, site: Site) {
  const scope = { organizationId: site.organizationId, websiteDomain: site.domain } as never;
  const audits = await db.collection<AuditDoc>("seo_audits").find({ ...(scope as object), status: "completed" } as never)
    .sort({ completedAt: -1 }).limit(10).project<AuditDoc>({ auditId: 1, score: 1, issueCounts: 1, pageCount: 1, completedAt: 1, skippedByRobots: 1 }).toArray();
  const latest = audits[0];
  if (!latest || typeof latest.score !== "number" || !validCounts(latest.issueCounts)) return null;
  const [pages, speeds] = await Promise.all([
    db.collection("seo_pages").find({ ...(scope as object), auditId: latest.auditId } as never).limit(500).project({ _id: 0, url: 1, finalUrl: 1, status: 1, issues: 1 }).toArray(),
    db.collection("pagespeed_results").find(scope).sort({ retrievedAt: -1 }).limit(10).project({ strategy: 1, categories: 1, retrievedAt: 1 }).toArray(),
  ]);
  const lite: PageLite[] = pages.map((page) => ({
    url: String(page.url), finalUrl: typeof page.finalUrl === "string" ? page.finalUrl : undefined, status: Number(page.status) || 0,
    issues: Array.isArray(page.issues) ? page.issues.flatMap((item: Record<string, unknown>) => typeof item.ruleId === "string" ? [{ ruleId: item.ruleId, title: String(item.title || item.ruleId), severity: (["critical", "warning", "notice"].includes(String(item.severity)) ? item.severity : "notice") as PageLite["issues"][number]["severity"] }] : []) : [],
  }));
  const previous = audits[1] && validCounts(audits[1].issueCounts) ? audits[1].issueCounts : null;
  const speed = (strategy: string) => {
    const row = speeds.find((item) => item.strategy === strategy) as { categories?: { performance?: number | null } } | undefined;
    return typeof row?.categories?.performance === "number" ? row.categories.performance : null;
  };
  return {
    score: latest.score, counts: latest.issueCounts, completedAt: latest.completedAt ?? null, pageCount: Number(latest.pageCount) || lite.length,
    pagesSampled: lite.length, previousScore: typeof audits[1]?.score === "number" ? audits[1].score : null,
    history: audits.filter((audit) => typeof audit.score === "number" && audit.completedAt).reverse().map((audit) => ({ date: audit.completedAt as Date, score: audit.score as number })),
    speed: { mobile: speed("mobile"), desktop: speed("desktop") },
    overview: buildAuditOverview({ pages: lite, skippedByRobots: latest.skippedByRobots, previous, counts: latest.issueCounts }),
  };
}
