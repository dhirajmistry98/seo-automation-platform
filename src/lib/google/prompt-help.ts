/** What to know before using a prompt, and the SEO Studio tool that gives the same data. Keyed by prompt number. */
const PAIRS = "Search Console’s CSV export lists queries and pages separately. To see which page appears for a search, filter the report to one page (or one query) at a time and export that.";
export const PROMPT_NOTES: Record<number, string> = {
  1: "The query export holds at most the top 1,000 searches. Also give the assistant a list of your pages, or it has to guess what you already cover.",
  2: PAIRS, 3: PAIRS, 6: PAIRS, 7: PAIRS, 9: PAIRS,
  10: "Search Console keeps 16 months of performance data. For longer periods you need exports you saved earlier or the bulk data export.",
  19: "Remove names, phone numbers, emails and other personal details before you share anything.",
  46: "Remove personal details from reviews before you share them.",
  70: "Share only business figures you are allowed to share, without customer details.",
};

type Tool = { label: string; href: string };
const insights: Tool = { label: "Position tracking", href: "/dashboard/search-insights" };
const toolkit: Tool = { label: "Technical toolkit", href: "/dashboard/technical-tools" };
const links: Tool = { label: "Internal links", href: "/dashboard/internal-links" };
const audit: Tool = { label: "Site audit", href: "/dashboard/tools/audit" };
const gaps: Tool = { label: "Content gap finder", href: "/dashboard/content-gaps" };
const speed: Tool = { label: "PageSpeed", href: "/dashboard/tools/pagespeed" };
const local: Tool = { label: "Local SEO", href: "/dashboard/local-seo" };
const strategy: Tool = { label: "Keyword strategy", href: "/dashboard/strategy" };
const ai: Tool = { label: "AI visibility", href: "/dashboard/visibility" };
export const PROMPT_TOOLS: Record<number, Tool> = {
  1: gaps, 2: strategy, 3: insights, 4: insights, 5: insights, 8: insights, 11: insights, 15: insights, 18: toolkit,
  29: { label: "Search Console shortcuts", href: "/dashboard/google" }, 30: audit, 31: toolkit, 32: toolkit, 33: audit, 34: audit, 35: speed, 36: links, 37: toolkit, 38: toolkit,
  39: links, 40: links, 41: links, 42: strategy, 43: local, 44: local, 49: ai, 55: insights, 56: toolkit, 59: insights, 60: audit, 62: toolkit, 63: insights,
  64: { label: "Action plan", href: "/dashboard/tools/action-plan" }, 67: insights,
};

export const EXPORTS = [
  { tool: "Google Search Console", data: "Queries, Pages, Indexing, CTR, Positions", use: "Rankings, keyword opportunities, content gaps" },
  { tool: "Google Analytics 4", data: "Landing pages, organic traffic, engagement, conversions", use: "—" },
];
