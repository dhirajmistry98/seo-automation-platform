import Link from "next/link";
import { ArrowRight, ClipboardList, Globe2, HeartPulse, Link2 } from "lucide-react";
import type { OverviewData } from "@/lib/dashboard/overview";

export function KpiCards({ data }: { data: OverviewData }) {
  const { websites, openTaskCount, connectedCount, latestAudit } = data;
  const kpis = [
    { href: "/dashboard/websites", icon: Globe2, label: "WEBSITES", value: websites.length, note: websites.length ? "In your workspace" : "Add your first website" },
    { href: "/dashboard/tools", icon: HeartPulse, label: "SEO HEALTH", value: latestAudit?.score ?? "—", note: latestAudit ? "Latest completed audit" : "Available after an audit" },
    { href: "/dashboard/tools", icon: ClipboardList, label: "OPEN TASKS", value: openTaskCount, note: openTaskCount ? "Need attention" : "No open tasks" },
    { href: "/dashboard/integrations", icon: Link2, label: "CONNECTED SOURCES", value: connectedCount || "—", note: connectedCount ? "Google data connections" : "Connect a reporting source" },
  ];
  return (<section className="workspace-kpis workspace-kpis-icons" aria-label="Workspace summary">
      {kpis.map(({ href, icon: Icon, label, value, note }) => <Link href={href} key={label} className="workspace-kpi-card">
        <span className="workspace-kpi-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="workspace-kpi-body"><span>{label}</span><strong>{value}</strong><small>{note}</small></span>
        <ArrowRight size={15} className="workspace-kpi-arrow" aria-hidden="true" />
      </Link>)}
    </section>);
}
