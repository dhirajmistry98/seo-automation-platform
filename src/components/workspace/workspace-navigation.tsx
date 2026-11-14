"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, Globe2, LockKeyhole, Search, Settings2, Sparkles, ScanSearch } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: Activity, match: (path: string) => path === "/dashboard" },
  { href: "/dashboard/websites", label: "Websites", icon: Globe2, match: (path: string) => path.startsWith("/dashboard/websites") },
  { href: "/dashboard/tools", label: "SEO tools", icon: Boxes, match: (path: string) => path.startsWith("/dashboard/tools") },
  { href: "/dashboard/seo-checker", label: "SEO checker", icon: ScanSearch, match: (path: string) => path.startsWith("/dashboard/seo-checker") },
  { href: "/dashboard/research", label: "Research", icon: Search, match: (path: string) => path.startsWith("/dashboard/research") },
  { href: "/dashboard/visibility", label: "Visibility", icon: Sparkles, match: (path: string) => path.startsWith("/dashboard/visibility") },
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
