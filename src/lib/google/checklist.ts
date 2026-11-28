import { GUIDES } from "./guides";

export type Check = { id: string; text: string; guide: string; tool?: { label: string; href: string } };
const guide = (title: string) => {
  const found = GUIDES.find((item) => item.title === title);
  if (!found) throw new Error(`Unknown guide: ${title}`);
  return found.url;
};
const check = (id: string, text: string, title: string, tool?: Check["tool"]): Check => ({ id, text, guide: guide(title), tool });
const toolkit = { label: "Technical toolkit", href: "/dashboard/technical-tools" };

export const CHECK_GROUPS: Array<{ title: string; checks: Check[] }> = [
  { title: "Set up", checks: [
    check("property", "Add the website to Search Console as a Domain property and verify it.", "About Search Console"),
    check("connect", "Connect Search Console to SEO Studio.", "How to use Search Console", { label: "Integrations", href: "/dashboard/integrations" }),
    check("sitemap", "Create a sitemap and submit it.", "Build and submit a sitemap", toolkit),
    check("analytics", "Set up Google Analytics and link it.", "Search Console with Analytics"),
  ] },
  { title: "Can Google find and index it?", checks: [
    check("robots", "robots.txt does not block important pages.", "robots.txt introduction", toolkit),
    check("noindex", "No important page carries noindex.", "Block indexing with noindex", { label: "Site audit", href: "/dashboard/tools/audit" }),
    check("rendering", "Inner pages contain their text and links before JavaScript runs.", "JavaScript SEO", { label: "Server rendering check", href: "/dashboard/technical-tools" }),
    check("https", "Every page loads over HTTPS.", "Page experience"),
    check("canonical", "Canonical addresses point to your real domain.", "Set a canonical", toolkit),
    check("redirects", "Moved pages use permanent redirects.", "Redirects"),
    check("indexing", "Review the Page indexing report for unexpected exclusions.", "Page indexing report"),
    check("links", "Every important page is linked from another page.", "Crawlable links", { label: "Internal links", href: "/dashboard/internal-links" }),
  ] },
  { title: "Content and appearance", checks: [
    check("titles", "Each page has a clear, unique title.", "Title links", { label: "Site audit", href: "/dashboard/tools/audit" }),
    check("descriptions", "Important pages have useful descriptions.", "Snippets and descriptions"),
    check("helpful", "Content is written for people and adds something of its own.", "Helpful, people-first content"),
    check("spam", "Nothing on the site breaks the spam policies.", "Spam policies"),
    check("images", "Images have descriptive alt text and sensible file sizes.", "Images", toolkit),
    check("schema", "Structured data is valid and matches what visitors see.", "General guidelines", toolkit),
  ] },
  { title: "Experience and safety", checks: [
    check("mobile", "The phone version has the same content as desktop.", "Mobile-first indexing"),
    check("vitals", "Core Web Vitals are good: LCP 2.5 s, INP 200 ms, CLS 0.1 or better.", "Core Web Vitals", { label: "PageSpeed", href: "/dashboard/tools/pagespeed" }),
    check("manual", "No manual actions are listed.", "Manual actions"),
    check("security", "No security issues are listed.", "Security issues"),
  ] },
  { title: "Every month", checks: [
    check("performance", "Compare clicks and queries with the previous period.", "Performance report", { label: "Position tracking", href: "/dashboard/search-insights" }),
    check("gaps", "Look for searches you appear for but have no page about.", "Performance report", { label: "Content gap finder", href: "/dashboard/content-gaps" }),
    check("users", "Remove users who no longer need access.", "About Search Console"),
    check("updates", "Read Google’s documentation updates.", "Documentation updates"),
  ] },
];
