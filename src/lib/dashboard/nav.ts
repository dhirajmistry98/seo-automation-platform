/** Single source of truth for dashboard navigation. Icons are looked up by name in the navigation component. */
export type NavIcon = "overview" | "websites" | "seo-overview" | "reports" | "research" | "strategy" | "rank" | "ai" | "audit" | "links" | "speed" | "plan" | "checker" | "visibility" | "tools" | "wordpress" | "integrations" | "account";
export type NavItem = { href: string; label: string; icon: NavIcon; /** Extra path prefixes that keep this item highlighted. */ also?: string[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: "WORKSPACE", items: [
    { href: "/dashboard", label: "Overview", icon: "overview" },
    { href: "/dashboard/websites", label: "Websites", icon: "websites" },
  ] },
  { label: "PERFORMANCE", items: [
    { href: "/dashboard/seo-overview", label: "SEO overview", icon: "seo-overview" },
    { href: "/dashboard/report", label: "Reports", icon: "reports" },
  ] },
  { label: "KEYWORDS & CONTENT", items: [
    { href: "/dashboard/research", label: "Keyword research", icon: "research" },
    { href: "/dashboard/strategy", label: "Keyword strategy", icon: "strategy" },
    { href: "/dashboard/rank-a-page", label: "Rank a page", icon: "rank" },
    { href: "/dashboard/ai", label: "AI Studio", icon: "ai" },
  ] },
  { label: "TECHNICAL SEO", items: [
    { href: "/dashboard/tools/audit", label: "Site audit", icon: "audit" },
    { href: "/dashboard/internal-links", label: "Internal links", icon: "links" },
    { href: "/dashboard/tools/pagespeed", label: "PageSpeed", icon: "speed" },
    { href: "/dashboard/tools/action-plan", label: "Action plan", icon: "plan" },
    { href: "/dashboard/seo-checker", label: "SEO checker", icon: "checker" },
  ] },
  { label: "AI SEARCH", items: [
    { href: "/dashboard/visibility", label: "AI visibility", icon: "visibility" },
  ] },
  { label: "TOOLKIT", items: [
    { href: "/dashboard/tools", label: "All SEO tools", icon: "tools" },
  ] },
  { label: "CONNECT", items: [
    { href: "/dashboard/wordpress", label: "WordPress", icon: "wordpress" },
    { href: "/dashboard/integrations", label: "Integrations", icon: "integrations" },
    { href: "/dashboard/account", label: "Account", icon: "account" },
  ] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

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
