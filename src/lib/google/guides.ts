/** Official Google pages linked from the Search checklist. Summaries are ours; the linked page is the authority. */
export type Guide = { title: string; summary: string; url: string };
const D = "https://developers.google.com/search/docs/";
const H = "https://support.google.com/webmasters/answer/";
const g = (title: string, url: string, summary: string): Guide => ({ title, url, summary });

export const GUIDES: Guide[] = [
  g("Helpful, people-first content", D + "fundamentals/creating-helpful-content", "Questions for judging your own content."),
  g("Spam policies", D + "essentials/spam-policies", "Practices that can lower or remove a site in results."),
  g("robots.txt introduction", D + "crawling-indexing/robots/intro", "What robots.txt can and cannot do."),
  g("Block indexing with noindex", D + "crawling-indexing/block-indexing", "Keep a page out of results."),
  g("Build and submit a sitemap", D + "crawling-indexing/sitemaps/build-sitemap", "Formats, limits and submission."),
  g("Set a canonical", D + "crawling-indexing/consolidate-duplicate-urls", "Methods for choosing your preferred address."),
  g("Redirects", D + "crawling-indexing/301-redirects", "Which redirect to use and how Google treats it."),
  g("Crawlable links", D + "crawling-indexing/links-crawlable", "Links Google can follow, and good link text."),
  g("JavaScript SEO", D + "crawling-indexing/javascript/javascript-seo-basics", "How Google processes JavaScript pages."),
  g("Mobile-first indexing", D + "crawling-indexing/mobile/mobile-sites-mobile-first-indexing", "Google indexes the phone version of your site."),
  g("Title links", D + "appearance/title-link", "Influence the clickable headline."),
  g("Snippets and descriptions", D + "appearance/snippet", "Influence the text under the headline."),
  g("Images", D + "appearance/google-images", "Image SEO best practices."),
  g("General guidelines", D + "appearance/structured-data/sd-policies", "Rules for staying eligible."),
  g("Page experience", D + "appearance/page-experience", "What makes a page pleasant to use."),
  g("Core Web Vitals", D + "appearance/core-web-vitals", "Loading, response and visual stability."),
  g("About Search Console", H + "9128668", "What the service does."),
  g("How to use Search Console", D + "monitor-debug/search-console-start", "A practical introduction."),
  g("Performance report", H + "7576553", "Clicks, impressions, CTR and position."),
  g("Page indexing report", H + "7440203", "Reasons pages are not indexed."),
  g("Manual actions", H + "9044175", "What each penalty means and how to appeal."),
  g("Security issues", H + "9044101", "Fix hacked or harmful content."),
  g("Search Console with Analytics", D + "monitor-debug/google-analytics-search-console", "Read the two data sets together."),
  g("Documentation updates", "https://developers.google.com/search/updates", "What changed in Google’s guidance."),
];
