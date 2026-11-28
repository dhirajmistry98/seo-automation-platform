/**
 * Search Console settings and the links into them.
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
