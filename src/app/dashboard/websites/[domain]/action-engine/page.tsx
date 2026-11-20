import { connection } from "next/server";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, TrendingUp, ChevronRight, Search } from "lucide-react";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { searchConsoleContext } from "@/lib/integrations/free-research";

export const instant = false;

function gscRange() {
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - 87 * 86_400_000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

const SEVERITY_WEIGHT = { critical: 3, warning: 2, notice: 1 } as const;

const RULE_LABELS: Record<string, string> = {
  "metadata.title_missing": "Missing page title",
  "metadata.title_duplicate": "Duplicate page titles",
  "metadata.description_missing": "Missing meta description",
  "metadata.description_duplicate": "Duplicate meta descriptions",
  "metadata.h1_missing": "Missing H1 heading",
  "metadata.h1_multiple": "Multiple H1 headings",
  "content.thin": "Thin content",
  "content.keyword_missing": "Pages missing target keywords",
  "internal.broken_link": "Broken internal links",
  "internal.not_linked_from_crawl": "Orphaned pages",
  "internal.redirecting_link": "Links pointing to redirects",
  "image.alt_missing": "Images missing alt text",
  "image.oversized": "Oversized images",
  "canonical.missing": "Missing canonical tags",
  "canonical.incorrect": "Incorrect canonical tags",
  "hreflang.return_missing": "Missing hreflang return tags",
  "structured.missing": "Missing structured data",
  "performance.slow": "Slow page load",
  "security.https_missing": "Pages not using HTTPS",
  "robots.blocked": "Pages blocked by robots.txt",
  "sitemap.missing": "Pages missing from sitemap",
};

function safePath(url: string) {
  try { return new URL(url).pathname || "/"; } catch { return url.slice(0, 60); }
}

export default async function ActionEnginePage({ params }: { params: Promise<{ domain: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) notFound();

  const issues = await db.collection("seo_issues")
    .find({ organizationId: website.organizationId, websiteDomain: domain, status: "open" })
    .project({ ruleId: 1, severity: 1, pageUrl: 1, recommendation: 1 })
    .toArray();

  const pageImpressions = new Map<string, number>();
  let gscConnected = false;

  if (issues.length > 0) {
    try {
      const gscCtx = await searchConsoleContext(db, website.organizationId, domain);
      if (gscCtx) {
        const { startDate, endDate } = gscRange();
        const response = await fetch(
          `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscCtx.property)}/searchAnalytics/query`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${gscCtx.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              startDate,
              endDate,
              dimensions: ["page"],
              rowLimit: 25_000,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (response.ok) {
          const payload = await response.json() as { rows?: Array<{ keys?: string[]; impressions?: number }> };
          for (const row of payload.rows ?? []) {
            const url = row.keys?.[0];
            if (url) pageImpressions.set(url, row.impressions ?? 0);
          }
          gscConnected = pageImpressions.size > 0;
        }
      }
    } catch {}
  }

  type Action = {
    ruleId: string;
    ruleLabel: string;
    severity: string;
    count: number;
    totalImpressions: number;
    score: number;
    samplePages: Array<{ url: string; impressions: number }>;
    recommendation: string;
  };

  const groups = new Map<string, Action>();
  for (const issue of issues) {
    const ruleId = String(issue.ruleId ?? "unknown");
    const severity = String(issue.severity ?? "notice");
    const pageUrl = String(issue.pageUrl ?? "");
    const impressions = pageImpressions.get(pageUrl) ?? 0;
    const weight = SEVERITY_WEIGHT[severity as keyof typeof SEVERITY_WEIGHT] ?? 1;

    if (!groups.has(ruleId)) {
      groups.set(ruleId, {
        ruleId,
        ruleLabel: RULE_LABELS[ruleId] ?? ruleId,
        severity,
        count: 0,
        totalImpressions: 0,
        score: 0,
        samplePages: [],
        recommendation: String(issue.recommendation ?? ""),
      });
    }
    const g = groups.get(ruleId)!;
    g.count++;
    g.totalImpressions += impressions;
    g.score += weight * Math.max(impressions, 10);
    if (g.samplePages.length < 3) g.samplePages.push({ url: pageUrl, impressions });
  }

  const actions = [...groups.values()].sort((a, b) => b.score - a.score);

  return (
    <div className="website-settings-page">
      <section className="website-settings-card action-engine-card">
        <Link href={`/dashboard/websites/${encodeURIComponent(domain)}`} className="website-settings-back">
          <ArrowLeft size={14} /> Back to website
        </Link>
        <p className="workspace-eyebrow">ACTION ENGINE</p>
        <h1>Prioritised SEO fixes</h1>
        <p className="website-settings-intro">
          {issues.length} open {issues.length === 1 ? "issue" : "issues"} ranked by estimated traffic impact.
          {gscConnected
            ? " Pages with more Search Console impressions are scored higher. Data: last 90 days."
            : " Connect Search Console to rank fixes by traffic impact."}
        </p>

        {!issues.length ? (
          <div className="action-engine-empty">
            <TrendingUp size={28} />
            <strong>No open issues</strong>
            <p>Run a site audit to discover optimisation opportunities.</p>
          </div>
        ) : (
          <div className="action-engine-list">
            {actions.map((action) => (
              <div key={action.ruleId} className={`action-engine-item action-engine-item--${action.severity}`}>
                <div className="action-engine-header">
                  <span className={`action-engine-badge action-engine-badge--${action.severity}`}>{action.severity}</span>
                  <strong className="action-engine-rule">{action.ruleLabel}</strong>
                  <span className="action-engine-count">{action.count} {action.count === 1 ? "page" : "pages"}</span>
                  {gscConnected && action.totalImpressions > 0 && (
                    <span className="action-engine-imp">{action.totalImpressions.toLocaleString()} impressions at risk</span>
                  )}
                </div>
                {action.recommendation && <p className="action-engine-rec">{action.recommendation}</p>}
                <div className="action-engine-pages">
                  {action.samplePages.map((page) => (
                    <a key={page.url} href={page.url} target="_blank" rel="noopener noreferrer" className="action-engine-page-link" title={page.url}>
                      {safePath(page.url)}{page.impressions > 0 ? ` · ${page.impressions.toLocaleString()} impr.` : ""}
                    </a>
                  ))}
                  {action.count > 3 && <span className="action-engine-more">+{action.count - 3} more</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="action-engine-footer">
          <Link href={`/dashboard/research/${encodeURIComponent(domain)}`} className="website-settings-back">
            <Search size={12} /> Research tools
          </Link>
          <Link href={`/dashboard/websites/${encodeURIComponent(domain)}/diagnose`} className="website-settings-back">
            Root-cause detective <ChevronRight size={12} />
          </Link>
        </div>
      </section>
    </div>
  );
}
