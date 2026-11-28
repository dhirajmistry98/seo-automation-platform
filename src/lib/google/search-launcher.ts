/** Opens one search in Google and in AI answer engines, plus the headline figure about Google's search volume. */
export type Engine = { id: string; label: string; use: string; url: (query: string, country: string) => string };

const q = encodeURIComponent;
const google = (extra: string) => (query: string, country: string) => `https://www.google.com/search?q=${q(query)}${extra}${country ? `&gl=${q(country)}` : ""}`;

export const ENGINE_GROUPS: Array<{ title: string; engines: Engine[] }> = [
  { title: "Google", engines: [
    { id: "google", label: "Google results", use: "The normal results page.", url: google("") },
    { id: "web", label: "Links only", use: "Google’s Web filter: plain links.", url: google("&udm=14") },
    { id: "ai-mode", label: "AI Mode", use: "Google’s AI answer, where available.", url: google("&udm=50") },
    { id: "images", label: "Images", use: "Image results.", url: google("&udm=2") },
    { id: "videos", label: "Videos", use: "Video results.", url: google("&udm=7") },
    { id: "news", label: "News", use: "News results.", url: google("&tbm=nws") },
    { id: "trends", label: "Trends", use: "Interest over time.", url: (query, country) => `https://trends.google.com/trends/explore?q=${q(query)}${country ? `&geo=${q(country.toUpperCase())}` : ""}` },
  ] },
  { title: "AI answers and other search engines", engines: [
    { id: "chatgpt", label: "ChatGPT", use: "See which sources it links to.", url: (query) => `https://chatgpt.com/?q=${q(query)}&hints=search` },
    { id: "perplexity", label: "Perplexity", use: "An answer with its sources.", url: (query) => `https://www.perplexity.ai/search?q=${q(query)}` },
    { id: "claude", label: "Claude", use: "Opens with your question filled in.", url: (query) => `https://claude.ai/new?q=${q(query)}` },
    { id: "bing", label: "Bing", use: "Microsoft’s search results.", url: (query, country) => `https://www.bing.com/search?q=${q(query)}${country ? `&cc=${q(country)}` : ""}` },
  ] },
];

/** Google said in March 2025 that it sees more than this many searches a year. The daily and per-second figures are our division. */
export const YEARLY_SEARCHES = 5_000_000_000_000;
export const SEARCH_SOURCE = "https://searchengineland.com/google-5-trillion-searches-per-year-452928";
export const SEARCH_STATS = [
  { value: "5 trillion+", label: "Google searches a year" },
  { value: `${(YEARLY_SEARCHES / 365 / 1e9).toFixed(1)} billion`, label: "about this many a day" },
  { value: (Math.floor(YEARLY_SEARCHES / 365 / 86_400 / 1000) * 1000).toLocaleString("en-US") + "+", label: "about this many each second" },
];

/** The text to search: trimmed, length-limited and optionally restricted to one website. */
export function searchText(query: string, domain = "") {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 300);
  return text && domain ? `${text} site:${domain}` : text;
}
