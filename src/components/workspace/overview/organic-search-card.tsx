import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { SearchTrendChart } from "@/components/workspace/search-trend-chart";
import { OverviewSearchRefresh } from "@/components/workspace/overview-search-refresh";
import type { OverviewData } from "@/lib/dashboard/overview";
import { metric, reportTime, reportDateTime } from "@/lib/dashboard/overview";

export function OrganicSearchCard({ data }: { data: OverviewData }) {
  const { latestSearchReport, dateReport, organicClicks, organicImpressions, organicPositionWeight, organicPositionImpressions, organicCtr, clicksChange, trendRows } = data;
  return (<article className="workspace-insight-card workspace-organic-card">
        <header><div><p className="workspace-eyebrow"><BarChart3 size={13} /> ORGANIC SEARCH</p><h2>Organic Search Performance</h2><p>Latest saved Google Search Console report</p></div><Link href="/dashboard/integrations" aria-label="Open Search Console reports">Open</Link></header>
        {latestSearchReport ? <>
          <div className="workspace-insight-source"><strong>{latestSearchReport.websiteDomain}</strong><span>{latestSearchReport.startDate} – {latestSearchReport.endDate}</span><time dateTime={reportDateTime(latestSearchReport.generatedAt)}>{reportTime(latestSearchReport.generatedAt)}</time></div>
          <dl className="workspace-organic-metrics">
            <div><dt>Clicks</dt><dd>{metric(organicClicks)}</dd><small>{clicksChange === null ? "No comparison baseline" : `${clicksChange >= 0 ? "+" : ""}${clicksChange.toFixed(1)}% vs prior period`}</small></div>
            <div><dt>Impressions</dt><dd>{metric(organicImpressions)}</dd><small>Search appearances</small></div>
            <div><dt>Average position</dt><dd>{organicPositionImpressions ? (organicPositionWeight / organicPositionImpressions).toFixed(1) : "—"}</dd><small>Lower is a stronger position</small></div>
            <div><dt>Click-through rate</dt><dd>{organicImpressions ? `${organicCtr.toFixed(1)}%` : "—"}</dd><small>Clicks ÷ impressions</small></div>
          </dl>
          {trendRows.length > 1 && <SearchTrendChart rows={trendRows} />}
          {trendRows.length < 2 && !dateReport && <p className="workspace-insight-note">This saved report uses the “{latestSearchReport.dimension}” dimension. Run a date-based report to see a daily trend.</p>}
          <OverviewSearchRefresh domain={latestSearchReport.websiteDomain} property={latestSearchReport.property} startDate={latestSearchReport.startDate} endDate={latestSearchReport.endDate} dimension={latestSearchReport.dimension} />
        </> : <div className="workspace-insight-empty"><span><BarChart3 size={18} /></span><div><strong>No organic search report yet</strong><p>Connect Search Console for a verified site, then run a report to load actual clicks, impressions and position.</p><Link href="/dashboard/integrations">Connect or run a report <ArrowRight size={13} /></Link></div></div>}
        <p className="workspace-insight-footnote">Search Console data is refreshed when a report is run and may be delayed by Google; it is not minute-by-minute analytics.</p>
      </article>);
}
