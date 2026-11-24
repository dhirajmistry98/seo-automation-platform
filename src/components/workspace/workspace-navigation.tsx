"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BotMessageSquare, Boxes, FileBarChart, FileSearch, Gauge, Globe2, ListTodo, LockKeyhole, Network, PlugZap, Radar, ScanSearch, Search, Settings2, Target, Waypoints, type LucideIcon } from "lucide-react";
import { NAV_GROUPS, activeNavHref, type NavIcon } from "@/lib/dashboard/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: Activity, websites: Globe2, "seo-overview": BarChart3, reports: FileBarChart, research: Search, strategy: Waypoints, rank: Target, ai: BotMessageSquare,
  audit: FileSearch, links: Network, speed: Gauge, plan: ListTodo, checker: ScanSearch, visibility: Radar, tools: Boxes, wordpress: PlugZap, integrations: LockKeyhole, account: Settings2,
};

export function WorkspaceNavigation({ siteCount }: { siteCount: number | null }) {
  const active = activeNavHref(usePathname());
  return <nav className="workspace-sidebar" aria-label="Workspace">
    {NAV_GROUPS.map((group) => <Fragment key={group.label}>
      <p className="workspace-sidebar-label">{group.label}</p>
      {group.items.map(({ href, label, icon }) => { const Icon = ICONS[icon]; const current = active === href; return <Link href={href} key={href} aria-current={current ? "page" : undefined} className={current ? "is-current" : ""}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{href === "/dashboard/websites" && <span className="workspace-nav-count">{siteCount ?? "—"}</span>}
      </Link>; })}
    </Fragment>)}
  </nav>;
}
