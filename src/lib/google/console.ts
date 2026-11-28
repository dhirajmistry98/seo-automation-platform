/**
 * Shortcuts into Google Search Console and Google's other search tools.
 * Console links open the signed-in user's own account; SEO Studio never sees what is shown there.
 */
export type PropertyType = "domain" | "prefix";
export const CONSOLE = "https://search.google.com/search-console";

/** The id Search Console uses for a property: "sc-domain:example.com" or the full address ending in "/". */
export function propertyId(type: PropertyType, domain: string, siteUrl?: string) {
  if (type === "domain") return `sc-domain:${domain.toLowerCase().replace(/^www\./, "")}`;
  try { return new URL(siteUrl || `https://${domain}`).origin + "/"; } catch { return `https://${domain}/`; }
}
export const consoleUrl = (path: string, property: string) => `${CONSOLE}${path ? `/${path}` : ""}?resource_id=${encodeURIComponent(property)}`;

export type Shortcut = { label: string; use: string; path: string };
export const SHORTCUT_GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  { title: "Overview and performance", items: [
    { label: "Overview", use: "A summary of clicks, indexing and problems.", path: "" },
    { label: "Search results performance", use: "Queries, pages, countries, devices, clicks and position.", path: "performance/search-analytics" },
    { label: "Discover performance", use: "Shown only when your site gets enough Discover traffic.", path: "performance/discover" },
    { label: "Google News performance", use: "Shown only when your site appears in Google News.", path: "performance/google-news" },
  ] },
  { title: "Indexing", items: [
    { label: "URL inspection", use: "Check one page and request indexing.", path: "inspect" },
    { label: "Pages (indexing)", use: "Which pages are indexed, and why others are not.", path: "index" },
    { label: "Video pages", use: "Indexing of pages that have videos.", path: "video-index" },
    { label: "Sitemaps", use: "Submit sitemaps and see read errors.", path: "sitemaps" },
    { label: "Removals", use: "Temporarily hide a page from results.", path: "removals" },
  ] },
  { title: "Experience", items: [
    { label: "Core Web Vitals", use: "Real-visitor speed and stability.", path: "core-web-vitals" },
    { label: "HTTPS", use: "Pages indexed without HTTPS.", path: "https" },
  ] },
  { title: "Security, penalties and links", items: [
    { label: "Manual actions", use: "Penalties applied by Google reviewers.", path: "manual-actions" },
    { label: "Security issues", use: "Hacked content, malware and deceptive pages.", path: "security-issues" },
    { label: "Links", use: "Top linking sites, linked pages and internal links.", path: "links" },
  ] },
  { title: "Settings", items: [
    { label: "Settings", use: "Ownership, associations, change of address and export.", path: "settings" },
    { label: "Users and permissions", use: "Add or remove people.", path: "users" },
    { label: "Ownership verification", use: "See and add verification methods.", path: "ownership" },
    { label: "Crawl stats", use: "How often Google crawls your site.", path: "settings/crawl-stats" },
    { label: "robots.txt report", use: "The robots.txt files Google fetched.", path: "settings/robots-txt" },
  ] },
];

export type Tool = { label: string; use: string; url: (domain: string, siteUrl: string) => string };
export const GOOGLE_TOOLS: Tool[] = [
  { label: "Rich Results Test", use: "See which rich results a page can get.", url: (_d, u) => `https://search.google.com/test/rich-results?url=${encodeURIComponent(u)}` },
  { label: "PageSpeed Insights", use: "Speed on phone and desktop.", url: (_d, u) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(u)}` },
  { label: "Schema Markup Validator", use: "Check any structured data (schema.org).", url: (_d, u) => `https://validator.schema.org/#url=${encodeURIComponent(u)}` },
  { label: "Google Trends", use: "Interest in a topic over time.", url: () => "https://trends.google.com/trends/" },
  { label: "Google Analytics", use: "What visitors do on your site.", url: () => "https://analytics.google.com/" },
  { label: "Google Tag Manager", use: "Manage tracking tags.", url: () => "https://tagmanager.google.com/" },
  { label: "Business Profile", use: "Your listing on Search and Maps.", url: () => "https://business.google.com/" },
  { label: "Merchant Center", use: "Product listings for shops.", url: () => "https://merchants.google.com/" },
  { label: "Keyword Planner", use: "Keyword ideas (needs a Google Ads account).", url: () => "https://ads.google.com/home/tools/keyword-planner/" },
  { label: "Search Status Dashboard", use: "Ranking updates and Google outages.", url: () => "https://status.search.google.com/summary" },
  { label: "Disavow links tool", use: "Advanced: read the guide before using it.", url: () => `${CONSOLE}/disavow-links` },
  { label: "Search Central community", use: "Ask questions in Google’s help forum.", url: () => "https://support.google.com/webmasters/community" },
];

const search = (query: string, extra = "") => `https://www.google.com/search?q=${encodeURIComponent(query)}${extra}`;
export const SEARCH_CHECKS = (domain: string) => [
  { label: "Pages Google shows for your site", query: `site:${domain}`, url: search(`site:${domain}`) },
  { label: "PDF files on your site", query: `site:${domain} filetype:pdf`, url: search(`site:${domain} filetype:pdf`) },
  { label: "Pages with a word in the title", query: `site:${domain} intitle:contact`, url: search(`site:${domain} intitle:contact`) },
  { label: "Addresses containing a word", query: `site:${domain} inurl:blog`, url: search(`site:${domain} inurl:blog`) },
  { label: "Mentions of your domain elsewhere", query: `"${domain}" -site:${domain}`, url: search(`"${domain}" -site:${domain}`) },
  { label: "Your images in Google Images", query: `site:${domain}`, url: search(`site:${domain}`, "&udm=2") },
];

export type Setting = { name: string; what: string; steps: string[]; caution?: string; path: string; guide?: string };
const HELP = "https://support.google.com/webmasters/answer/";
const DOCS = "https://developers.google.com/search/docs/";
export const SETTINGS: Setting[] = [
  { name: "Add a property", what: "A Domain property covers every protocol and subdomain. A URL-prefix property covers only addresses that start with it.", steps: ["Open the property selector at the top left.", "Choose Add property.", "Pick Domain (recommended) or URL prefix and verify it."], path: "", guide: HELP + "34592" },
  { name: "Verify ownership", what: "Proves you own the site. A Domain property needs a DNS record; URL-prefix also allows an HTML file, meta tag, Google Analytics or Tag Manager.", steps: ["Open Settings → Ownership verification.", "Choose a method and follow Google’s instructions.", "Keep the record or file in place afterwards."], caution: "Removing the verification record or file removes access. Add a second method as a backup.", path: "ownership", guide: HELP + "9008080" },
  { name: "Users and permissions", what: "Owners control everything, full users can view data and take most actions, restricted users can mostly only view.", steps: ["Open Settings → Users and permissions.", "Add the person’s Google account.", "Give the lowest role that lets them do their work."], caution: "Review the list when an agency or employee leaves.", path: "users", guide: HELP + "7687615" },
  { name: "Submit a sitemap", what: "Tells Google which pages you want found. One file holds up to 50,000 addresses or 50 MB uncompressed.", steps: ["Open Sitemaps.", "Enter the sitemap address and submit.", "Check that the status shows success."], path: "sitemaps", guide: HELP + "7451001" },
  { name: "Request indexing", what: "Ask Google to crawl a new or changed page. There is a daily limit and no guarantee of indexing.", steps: ["Inspect the page address.", "Use Test live URL and fix any problem.", "Choose Request indexing."], path: "inspect", guide: DOCS + "crawling-indexing/ask-google-to-recrawl" },
  { name: "Temporary removals", what: "Hides an address from results for about six months.", steps: ["Open Removals.", "Choose New request.", "Also delete the page or add noindex to remove it for good."], caution: "This does not delete the page from Google’s index permanently.", path: "removals", guide: HELP + "9689846" },
  { name: "Change of address", what: "Use when moving to a new domain.", steps: ["Verify both old and new properties.", "Set permanent (301) redirects from every old page.", "In the old property open Settings → Change of address."], caution: "Not for moving from http to https, or between www and non-www on the same domain.", path: "settings", guide: HELP + "9370220" },
  { name: "Associations", what: "Link Search Console to other Google services such as Analytics.", steps: ["Open Settings → Associations.", "Choose Associate and pick the service.", "Approve the request in the other service if asked."], path: "settings", guide: DOCS + "monitor-debug/google-analytics-search-console" },
  { name: "Bulk data export", what: "Sends performance data to BigQuery every day. Google Cloud charges may apply.", steps: ["Create a Google Cloud project.", "Open Settings → Bulk data export.", "Enter the project details and confirm."], path: "settings", guide: HELP + "12918484" },
  { name: "Export a report", what: "Download report tables to Sheets, Excel or CSV. Performance data is kept for 16 months, so save what you need longer.", steps: ["Open the report.", "Choose Export at the top right.", "Pick the format."], path: "performance/search-analytics", guide: HELP + "12919797" },
  { name: "robots.txt", what: "Controls what crawlers may fetch. It does not keep a page out of results; use noindex for that.", steps: ["Open Settings → robots.txt.", "Check the file was fetched without errors.", "Request a recrawl after changing it."], caution: "A wrong rule can block your whole site.", path: "settings/robots-txt", guide: DOCS + "crawling-indexing/robots/intro" },
  { name: "Crawl stats", what: "Requests, response codes and response time from Googlebot. Available for domain properties and root-level properties.", steps: ["Open Settings → Crawl stats.", "Look for server errors and slow responses."], path: "settings/crawl-stats", guide: HELP + "9679690" },
  { name: "Fix a manual action", what: "A reviewer found a breach of Google’s spam policies.", steps: ["Read the affected pages and reason.", "Fix every instance.", "Choose Request review and explain what you changed."], path: "manual-actions", guide: HELP + "9044175" },
  { name: "Fix a security issue", what: "Google detected hacked or harmful content.", steps: ["Take the harmful content down and close the way in.", "Check the whole site, not only the examples.", "Request a review."], path: "security-issues", guide: HELP + "9044101" },
];
