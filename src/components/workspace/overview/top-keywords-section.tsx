import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { TopKeywordsTable } from "@/components/workspace/top-keywords-table";
import type { OverviewData } from "@/lib/dashboard/overview";

export function TopKeywordsSection({ data }: { data: OverviewData }) {
  const { queryReport } = data;
  return (<section className="workspace-section ws2-keywords" aria-labelledby="top-keywords-title">
      <div className="workspace-section-heading"><div><h2 id="top-keywords-title">Top Keywords</h2><p>{queryReport ? `${queryReport.websiteDomain} · ${queryReport.startDate} – ${queryReport.endDate}` : "Real queries from Google Search Console"}</p></div></div>
      {queryReport?.rows?.length ? <TopKeywordsTable domain={queryReport.websiteDomain} rows={queryReport.rows.filter((row) => row.keys?.[0]).map((row) => ({ keyword: row.keys![0], clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, ctr: Number(row.ctr) || 0, position: Number(row.position) || 0 }))} /> : <div className="workspace-insight-empty"><span><Search size={18} /></span><div><strong>No keyword report yet</strong><p>Run a Search Console report by “query” to see the keywords your site actually ranks for.</p><Link href="/dashboard/integrations">Run a keyword report <ArrowRight size={13} /></Link></div></div>}
    </section>);
}
