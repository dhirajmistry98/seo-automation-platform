import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import type { OverviewData } from "@/lib/dashboard/overview";
import { metric, reportTime, scoreValue } from "@/lib/dashboard/overview";

export function AiVisibilityCard({ data }: { data: OverviewData }) {
  const { websites, latestAiReport, latestAnswers, latestReadinessReport, aiResultCount, aiPercent } = data;
  return (<article className="workspace-insight-card workspace-ai-card">
        <header><div><p className="workspace-eyebrow"><Radar size={13} /> GEO · AEO · LLMO</p><h2>AI Visibility</h2><p>Provider mentions and crawl-based readiness</p></div><Link href="/dashboard/research" aria-label="Open AI visibility research">Open</Link></header>
        <div className="workspace-ai-ring" style={{ "--ai-pct": aiPercent ?? 0 } as CSSProperties} role="img" aria-label={aiPercent === null ? "AI visibility: not checked yet" : `AI visibility ${aiPercent}%`}><div><strong>{aiPercent === null ? "—" : `${aiPercent}%`}</strong><small>{latestAnswers ? "of AI answers mention you" : "AI Visibility"}</small></div></div>
        {latestAnswers ? <div className="workspace-ai-mentions"><span className="workspace-ai-icon"><Radar size={18} /></span><div><strong>{latestAnswers.summary.mentioned}/{latestAnswers.summary.answered}</strong><p>AI answers mention “{latestAnswers.brand}” · {latestAnswers.summary.cited} cite {latestAnswers.websiteDomain}</p><small>{latestAnswers.summary.platforms.map((item) => item.label).join(", ")} · {reportTime(latestAnswers.createdAt)}</small><Link href={`/dashboard/visibility/${encodeURIComponent(latestAnswers.websiteDomain)}#ai-answers`}>Check AI answers again <ArrowRight size={13} /></Link></div></div> : latestAiReport ? <div className="workspace-ai-mentions"><span className="workspace-ai-icon"><Radar size={18} /></span><div><strong>{metric(aiResultCount)}</strong><p>matching rows in the latest {latestAiReport.platform === "chat_gpt" ? "ChatGPT" : "Google AI Overviews"} provider report</p><small>{latestAiReport.websiteDomain} · {latestAiReport.countryName || latestAiReport.locationName || "saved market"} · {reportTime(latestAiReport.fetchedAt)}</small></div></div> : <div className="workspace-insight-empty workspace-ai-empty"><span><Radar size={18} /></span><div><strong>No AI answers checked yet</strong><p>Ask the AI engines you connect your customers’ questions and see whether they mention or cite you.</p><Link href={websites[0] ? `/dashboard/visibility/${encodeURIComponent(websites[0].domain)}#ai-answers` : "/dashboard/visibility"}>Check AI answers <ArrowRight size={13} /></Link></div></div>}
        <div className="workspace-readiness-heading"><strong>Latest crawl-based readiness</strong>{latestReadinessReport && <small>{latestReadinessReport.websiteDomain} · {reportTime(latestReadinessReport.calculatedAt)}</small>}</div>
        <div className="workspace-readiness-list">{(["geo", "aeo", "llmo"] as const).map((key) => {
          const score = scoreValue(latestReadinessReport?.scores?.[key]);
          return <div key={key}><span>{key.toUpperCase()}</span><div className="workspace-readiness-track"><i style={{ width: `${score ?? 0}%` }} /></div><strong>{score === null ? "—" : `${score}%`}</strong></div>;
        })}</div>
        <div className="workspace-ai-actions"><Link href="/dashboard/research">Run a new AI mentions report <ArrowRight size={13} /></Link><Link href="/dashboard/visibility">Open readiness details</Link></div>
        <p className="workspace-insight-footnote">Readiness scores inspect the latest crawl’s structure and metadata. They are not measured rankings, citations or answers in AI products.</p>
      </article>);
}
