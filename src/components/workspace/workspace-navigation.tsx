"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, FileBarChart, Globe2, LockKeyhole, Radar, ScanSearch, Search, Settings2, Target } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: Activity, match: (path: string) => path === "/dashboard" },
  { href: "/dashboard/websites", label: "Websites", icon: Globe2, match: (path: string) => path.startsWith("/dashboard/websites") },
  { href: "/dashboard/tools", label: "SEO tools", icon: Boxes, match: (path: string) => path.startsWith("/dashboard/tools") },
  { href: "/dashboard/rank-a-page", label: "Rank a page", icon: Target, match: (path: string) => path.startsWith("/dashboard/rank-a-page") },
  { href: "/dashboard/seo-checker", label: "SEO checker", icon: ScanSearch, match: (path: string) => path.startsWith("/dashboard/seo-checker") },
  { href: "/dashboard/research", label: "Research", icon: Search, match: (path: string) => path.startsWith("/dashboard/research") },
  { href: "/dashboard/visibility", label: "Visibility", icon: Radar, match: (path: string) => path.startsWith("/dashboard/visibility") },
  { href: "/dashboard/report", label: "Reports", icon: FileBarChart, match: (path: string) => path.startsWith("/dashboard/report") },
  { href: "/dashboard/integrations", label: "Integrations", icon: LockKeyhole, match: (path: string) => path.startsWith("/dashboard/integrations") },
  { href: "/dashboard/account", label: "Account", icon: Settings2, match: (path: string) => path.startsWith("/dashboard/account") },
];

export function WorkspaceNavigation({ siteCount }: { siteCount: number | null }) {
  const pathname = usePathname();
  return <nav className="workspace-sidebar" aria-label="Workspace">
    <p className="workspace-sidebar-label">WORKSPACE</p>
    {links.map(({ href, label, icon: Icon, match }) => <Link href={href} key={href} aria-current={match(pathname) ? "page" : undefined} className={match(pathname) ? "is-current" : ""}>
      <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === "Websites" && <span className="workspace-nav-count">{siteCount ?? "—"}</span>}
    </Link>)}
  </nav>;
}
