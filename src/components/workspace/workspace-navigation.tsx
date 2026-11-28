"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, FileText, Globe, House, Layers, LayoutGrid, ListChecks, Plug, Search, Settings, Sparkle, type LucideIcon } from "lucide-react";
import { NAV_ACCOUNT, NAV_GROUPS, activeNavHref, isSection, type NavIcon, type NavItem } from "@/lib/dashboard/nav";

/** The WordPress mark: a W in a circle (lucide has no brand icons). */
function WordPressMark({ size = 19 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M5.6 8.5 9.2 17l2.8-7 2.8 7 3.6-8.5" /></svg>;
}

const ICONS: Record<NavIcon, LucideIcon | typeof WordPressMark> = {
  workspace: House, websites: Globe, reports: FileText, seo: Search, technical: Layers, ai: Sparkle, google: BookOpen, plan: ListChecks, tools: LayoutGrid, wordpress: WordPressMark, integrations: Plug, account: Settings,
};
/** Icons drawn in the accent colour; the rest use the text colour. */
const ACCENT = new Set<NavIcon>(["workspace", "seo", "technical", "ai", "google"]);

function NavIconMark({ name }: { name: NavIcon }) {
  const Icon = ICONS[name];
  return <span className={`ws2-nav-icon${ACCENT.has(name) ? " is-accent" : ""}`} aria-hidden="true"><Icon size={19} /></span>;
}

export function WorkspaceNavigation({ siteCount }: { siteCount: number | null }) {
  const active = activeNavHref(usePathname());
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const link = (item: NavItem, className: string) => {
    const current = active === item.href;
    return <Link href={item.href} key={item.href} aria-current={current ? "page" : undefined} className={`${className}${current ? " is-current" : ""}`}>
      {item.icon && <NavIconMark name={item.icon} />}<span className="ws2-nav-text">{item.label}</span>
      {item.href === "/dashboard/websites" && <span className="ws2-nav-count">{siteCount ?? "—"}</span>}
    </Link>;
  };

  return <nav className="ws2-nav" aria-label="Workspace">
    {NAV_GROUPS.map((group) => <div className="ws2-nav-group" key={group.key}>
      {group.label && <p className="ws2-nav-label">{group.label}</p>}
      {group.entries.map((entry) => {
        if (!isSection(entry)) return link(entry, "ws2-nav-link");
        const open = !closed[entry.key];
        const holdsCurrent = entry.children.some((child) => child.href === active);
        return <Fragment key={entry.key}>
          <button type="button" className={`ws2-nav-link ws2-nav-toggle${!open && holdsCurrent ? " is-current" : ""}`} aria-expanded={open} aria-controls={`nav-${entry.key}`} onClick={() => setClosed((state) => ({ ...state, [entry.key]: open }))}>
            <NavIconMark name={entry.icon} /><span className="ws2-nav-text">{entry.label}</span><ChevronDown size={16} className="ws2-nav-chevron" aria-hidden="true" />
          </button>
          <div className="ws2-nav-children" id={`nav-${entry.key}`} hidden={!open}>{entry.children.map((child) => link(child, "ws2-nav-child"))}</div>
        </Fragment>;
      })}
    </div>)}
    {link(NAV_ACCOUNT, "ws2-nav-link ws2-nav-account")}
  </nav>;
}
