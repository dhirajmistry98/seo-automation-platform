/** Single source of truth for dashboard navigation. Icons are looked up by name in the navigation component. */
export type NavIcon = "workspace" | "websites" | "reports" | "seo" | "technical" | "ai" | "plan" | "tools" | "wordpress" | "integrations" | "account";
export type NavItem = { href: string; label: string; icon?: NavIcon; /** Extra path prefixes that keep this item highlighted. */ also?: string[] };
/** A collapsible heading with its own pages underneath. */
export type NavSection = { key: string; label: string; icon: NavIcon; children: NavItem[] };
export type NavEntry = NavItem | NavSection;
export type NavGroup = { key: string; label?: string; entries: NavEntry[] };

export const NAV_GROUPS: NavGroup[] = [
  { key: "main", entries: [
    { href: "/dashboard", label: "Workspace", icon: "workspace" },
    { href: "/dashboard/websites", label: "Websites", icon: "websites" },
    { href: "/dashboard/report", label: "Reports", icon: "reports" },
  ] },
  { key: "growth", label: "SEO & GROWTH", entries: [
    { key: "seo", label: "SEO", icon: "seo", children: [
      { href: "/dashboard/seo-overview", label: "SEO overview" },
      { href: "/dashboard/research", label: "Keyword research" },
      { href: "/dashboard/strategy", label: "Keyword strategy" },
      { href: "/dashboard/rank-a-page", label: "Rank a page" },
      { href: "/dashboard/seo-checker", label: "SEO checker" },
    ] },
    { key: "technical", label: "Technical SEO", icon: "technical", children: [
      { href: "/dashboard/tools/audit", label: "Site audit" },
      { href: "/dashboard/internal-links", label: "Internal links" },
      { href: "/dashboard/tools/pagespeed", label: "PageSpeed" },
    ] },
    { key: "ai", label: "AI & GEO", icon: "ai", children: [
      { href: "/dashboard/ai", label: "AI Studio" },
      { href: "/dashboard/visibility", label: "AI visibility" },
    ] },
    { href: "/dashboard/tools/action-plan", label: "Action plan", icon: "plan" },
    { href: "/dashboard/tools", label: "All SEO tools", icon: "tools" },
  ] },
  { key: "integrations", label: "INTEGRATIONS", entries: [
    { href: "/dashboard/wordpress", label: "WordPress", icon: "wordpress" },
    { href: "/dashboard/integrations", label: "Integrations", icon: "integrations" },
  ] },
];

/** Shown on its own at the bottom of the sidebar. */
export const NAV_ACCOUNT: NavItem = { href: "/dashboard/account", label: "Account", icon: "account" };

export const isSection = (entry: NavEntry): entry is NavSection => "children" in entry;
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.entries.flatMap((entry) => (isSection(entry) ? entry.children : [entry]))), NAV_ACCOUNT];

/** The one nav item that owns this path: the exact match, or else the longest matching prefix. */
export function activeNavHref(pathname: string): string | null {
  if (pathname === "/dashboard") return "/dashboard";
  let best: { href: string; length: number } | null = null;
  for (const item of NAV_ITEMS) {
    if (item.href === "/dashboard") continue;
    for (const prefix of [item.href, ...(item.also ?? [])]) {
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && (!best || prefix.length > best.length)) best = { href: item.href, length: prefix.length };
    }
  }
  return best?.href ?? null;
}
