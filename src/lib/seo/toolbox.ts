/** Technical SEO checks as pure functions. Safe to import in the browser and on the server. */

export const sameSite = (value: string, domain: string) => {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/^www\./, ""), root = domain.toLowerCase().replace(/^www\./, "");
    return (url.protocol === "https:" || url.protocol === "http:") && (host === root || host.endsWith(`.${root}`));
  } catch { return false; }
};
export const comparableUrl = (value: string) => value.trim().replace(/#.*$/, "").replace(/^http:/, "https:").replace(/\/\/www\./, "//").replace(/\/+$/, "").toLowerCase();
const unescapeXml = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* ── robots.txt (matching follows Google's rules: most specific user-agent group, longest rule wins, Allow wins ties) ── */
type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string; line: number }> };
export function parseRobots(text: string) {
  const groups: Group[] = [], sitemaps: string[] = [], problems: string[] = [];
  let group: Group | null = null, expectingAgents = false;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) { problems.push(`Line ${index + 1} is not a "name: value" rule.`); return; }
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === "user-agent") {
      if (!group || !expectingAgents) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase()); expectingAgents = true;
    } else if (key === "allow" || key === "disallow") {
      expectingAgents = false;
      if (!group) { problems.push(`Line ${index + 1}: rule appears before any User-agent, so it is ignored.`); return; }
      if (value && !value.startsWith("/") && !value.startsWith("*")) problems.push(`Line ${index + 1}: path should start with "/".`);
      if (value) group.rules.push({ allow: key === "allow", path: value, line: index + 1 });
    } else if (key === "sitemap") sitemaps.push(value);
    else if (!["crawl-delay", "host", "clean-param"].includes(key)) problems.push(`Line ${index + 1}: "${match[1]}" is not a recognised rule.`);
  });
  return { groups: groups as Group[], sitemaps, problems };
}
const ruleRegex = (path: string) => new RegExp("^" + path.replace(/\$$/, "").split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (path.endsWith("$") ? "$" : ""));
export function testRobots(text: string, agent: string, path: string) {
  const { groups } = parseRobots(text);
  const name = agent.toLowerCase();
  const score = (group: Group) => Math.max(0, ...group.agents.map((item) => (item !== "*" && name.startsWith(item) ? item.length + 1 : item === "*" ? 1 : 0)));
  const best = Math.max(0, ...groups.map(score));
  const rules = best ? groups.filter((group) => score(group) === best).flatMap((group) => group.rules) : [];
  const target = path.startsWith("/") ? path : `/${path}`;
  const hits = rules.filter((rule) => ruleRegex(rule.path).test(target)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  const rule = hits[0] ?? null;
  return { allowed: rule ? rule.allow : true, rule: rule ? `${rule.allow ? "Allow" : "Disallow"}: ${rule.path} (line ${rule.line})` : null };
}
export function buildRobots(input: { blocked: string[]; blockAi: boolean; sitemap: string }) {
  const clean = input.blocked.map((item) => item.trim()).filter(Boolean).map((item) => (item.startsWith("/") ? item : `/${item}`));
  const lines = ["User-agent: *", ...(clean.length ? clean.map((item) => `Disallow: ${item}`) : ["Disallow:"])];
  if (input.blockAi) lines.push("", ...["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"].map((bot) => `User-agent: ${bot}`), "Disallow: /");
  if (input.sitemap.trim()) lines.push("", `Sitemap: ${input.sitemap.trim()}`);
  return lines.join("\n") + "\n";
}

/* ── Sitemaps ── */
export function parseSitemap(xml: string) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const valid = isIndex || /<urlset[\s>]/i.test(xml);
  const entries = [...xml.matchAll(/<(url|sitemap)[\s>]([\s\S]*?)<\/\1>/gi)].flatMap((match) => {
    const loc = match[2].match(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/i)?.[1]?.trim();
    return loc ? [{ loc: unescapeXml(loc), lastmod: match[2].match(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/i)?.[1] ?? null }] : [];
  });
  return { valid, isIndex, entries };
}
export function sitemapProblems(entries: Array<{ loc: string; lastmod: string | null }>, domain: string) {
  const seen = new Set<string>(); let duplicates = 0;
  for (const entry of entries) { const key = comparableUrl(entry.loc); if (seen.has(key)) duplicates += 1; seen.add(key); }
  const count = (test: (entry: { loc: string; lastmod: string | null }) => boolean) => entries.filter(test).length;
  return [
    { title: "Duplicate URLs", count: duplicates },
    { title: "URLs on another domain or invalid", count: count((e) => !sameSite(e.loc, domain)) },
    { title: "URLs using http instead of https", count: count((e) => e.loc.startsWith("http:")) },
    { title: "Invalid last-modified dates", count: count((e) => e.lastmod !== null && (!/^\d{4}-\d{2}-\d{2}/.test(e.lastmod) || Number.isNaN(Date.parse(e.lastmod)))) },
    { title: "Last-modified dates in the future", count: count((e) => e.lastmod !== null && Date.parse(e.lastmod) > Date.now() + 86_400_000) },
  ];
}
export type CrawlPage = { url: string; finalUrl?: string; status: number; robots?: string; canonical?: string; internalLinks?: string[] };
export const indexablePages = (pages: CrawlPage[]) => pages.filter((page) => page.status === 200 && !/noindex/i.test(page.robots ?? "")
  && (!page.finalUrl || comparableUrl(page.finalUrl) === comparableUrl(page.url)) && (!page.canonical || comparableUrl(page.canonical) === comparableUrl(page.url)));
export function buildSitemap(urls: string[]) {
  const unique = [...new Map(urls.map((url) => [comparableUrl(url), url])).values()].slice(0, 50_000);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
}
/** Pages known from the sitemap or Search Console that no crawled page links to. The home page is never an orphan. */
export function orphanPages(pages: CrawlPage[], sitemap: string[], search: string[], domain: string) {
  const linked = new Set(pages.flatMap((page) => (page.internalLinks ?? []).map(comparableUrl)));
  const crawled = new Set(pages.map((page) => comparableUrl(page.url)));
  const sources = new Map<string, { url: string; from: Set<string> }>();
  const add = (url: string, from: string) => { if (!sameSite(url, domain)) return; const key = comparableUrl(url); const item = sources.get(key) ?? { url, from: new Set<string>() }; item.from.add(from); sources.set(key, item); };
  sitemap.forEach((url) => add(url, "Sitemap")); search.forEach((url) => add(url, "Search Console"));
  return [...sources].filter(([key]) => !linked.has(key) && new URL(key).pathname !== "/")
    .map(([key, item]) => ({ url: item.url, foundIn: [...item.from].join(", "), crawled: crawled.has(key) })).slice(0, 500);
}

/* ── Page text, readability, duplicates ── */
export function pageText(html: string) {
  const body = html.replace(/<(script|style|noscript|template|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  return body.replace(/<head\b[\s\S]*?<\/head>/i, " ").replace(/<\/(p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, ". ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;|&rsquo;/gi, "'").replace(/\s+/g, " ").replace(/(\s*\.){2,}/g, ".").trim();
}
const syllables = (word: string) => { const w = word.toLowerCase().replace(/[^a-z]/g, ""); if (w.length <= 3) return w ? 1 : 0; return (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g) ?? []).length || 1; };
const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
export function readability(text: string, keyword = "") {
  const words = tokens(text);
  const sentences = text.split(/[.!?]+(?:\s|$)/).map((item) => tokens(item).length).filter((length) => length > 0);
  if (!words.length || !sentences.length) return null;
  const perSentence = words.length / sentences.length;
  const ease = 206.835 - 1.015 * perSentence - 84.6 * (words.reduce((sum, word) => sum + syllables(word), 0) / words.length);
  const phrase = tokens(keyword);
  let uses = 0;
  if (phrase.length) for (let i = 0; i <= words.length - phrase.length; i += 1) if (phrase.every((part, j) => words[i + j] === part)) uses += 1;
  const frequency = new Map<string, number>();
  for (const word of words) if (word.length > 3) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  return {
    words: words.length, sentences: sentences.length, wordsPerSentence: Math.round(perSentence * 10) / 10, longSentences: sentences.filter((length) => length > 25).length,
    readingEase: Math.max(0, Math.min(100, Math.round(ease))),
    keyword: phrase.length ? { uses, density: Math.round((uses * phrase.length * 1000) / words.length) / 10, inFirst100: ` ${words.slice(0, 100).join(" ")} `.includes(` ${phrase.join(" ")} `) } : null,
    topWords: [...frequency].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count })),
  };
}
function shingles(text: string) { const words = tokens(text), set = new Set<string>(); for (let i = 0; i + 5 <= words.length; i += 1) set.add(words.slice(i, i + 5).join(" ")); return set; }
/** Pairs of pages whose five-word sequences overlap heavily. Very short pages are skipped. */
export function duplicatePairs(pages: Array<{ url: string; text: string }>, threshold = 0.6) {
  const sets = pages.map((page) => ({ url: page.url, set: shingles(page.text) })).filter((page) => page.set.size >= 40);
  const pairs: Array<{ a: string; b: string; similarity: number }> = [];
  for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) {
    let shared = 0;
    for (const item of sets[i].set) if (sets[j].set.has(item)) shared += 1;
    const similarity = shared / (sets[i].set.size + sets[j].set.size - shared);
    if (similarity >= threshold) pairs.push({ a: sets[i].url, b: sets[j].url, similarity: Math.round(similarity * 100) });
  }
  return { compared: sets.length, pairs: pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 100) };
}

/* ── Structured data ── */
const REQUIRED: Record<string, { required: string[]; recommended: string[] }> = {
  Article: { required: [], recommended: ["headline", "image", "datePublished", "author"] }, BlogPosting: { required: [], recommended: ["headline", "image", "datePublished", "author"] }, NewsArticle: { required: [], recommended: ["headline", "image", "datePublished", "author"] },
  Product: { required: ["name", "offers|review|aggregateRating"], recommended: ["image", "description", "brand"] }, FAQPage: { required: ["mainEntity"], recommended: [] }, BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  Event: { required: ["name", "startDate", "location"], recommended: ["endDate", "description", "image"] }, LocalBusiness: { required: ["name", "address"], recommended: ["telephone", "openingHoursSpecification|openingHours", "geo"] },
  Organization: { required: [], recommended: ["name", "url", "logo", "sameAs"] }, JobPosting: { required: ["title", "description", "datePosted", "hiringOrganization"], recommended: ["jobLocation", "baseSalary", "validThrough"] },
  Recipe: { required: ["name", "image"], recommended: ["recipeIngredient", "recipeInstructions"] }, VideoObject: { required: ["name", "thumbnailUrl", "uploadDate"], recommended: ["description", "duration"] }, Review: { required: ["itemReviewed", "author", "reviewRating"], recommended: ["datePublished"] },
};
export function validateStructuredData(html: string) {
  const items: Array<{ type: string; missing: string[]; suggested: string[]; checked: boolean }> = [];
  let blocks = 0, invalid = 0;
  const add = (node: unknown, nested: boolean) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.slice(0, 100).forEach((child) => add(child, nested)); return; }
    const item = node as Record<string, unknown>;
    if (item["@graph"]) add(item["@graph"], false);
    const type = [item["@type"]].flat().find((name): name is string => typeof name === "string");
    if (!type || nested) return;
    const rules = REQUIRED[type];
    const has = (field: string) => field.split("|").some((name) => item[name] !== undefined && item[name] !== "" && !(Array.isArray(item[name]) && !(item[name] as unknown[]).length));
    items.push({ type, checked: Boolean(rules), missing: (rules?.required ?? []).filter((f) => !has(f)).map((f) => f.replace(/\|/g, " or ")), suggested: (rules?.recommended ?? []).filter((f) => !has(f)).map((f) => f.replace(/\|/g, " or ")) });
  };
  for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    blocks += 1;
    try { add(JSON.parse(body.trim()), false); } catch { invalid += 1; }
  }
  return { blocks, invalid, items };
}

/* ── Page meta, images, headers ── */
const attribute = (tag: string, name: string) => { const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null; };
export function pageMeta(html: string) {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => { const tag = metas.find((item) => (attribute(item, "name") ?? attribute(item, "property"))?.toLowerCase() === key); return tag ? attribute(tag, "content") ?? "" : ""; };
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  return { title, description: meta("description"), ogTitle: meta("og:title"), ogDescription: meta("og:description"), ogImage: meta("og:image"), h1: (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}
export function pageImages(html: string, base: string) {
  return (html.match(/<img\b[^>]*>/gi) ?? []).slice(0, 200).flatMap((tag, index) => {
    const source = attribute(tag, "src") || attribute(tag, "data-src");
    if (!source || source.startsWith("data:")) return [];
    let url: string; try { url = new URL(source, base).href; } catch { return []; }
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    const problems = [
      ...(attribute(tag, "alt") === null ? ["no alt attribute"] : []),
      ...(attribute(tag, "width") === null || attribute(tag, "height") === null ? ["no width and height"] : []),
      ...(index > 2 && attribute(tag, "loading")?.toLowerCase() !== "lazy" ? ["not lazy-loaded"] : []),
      ...(["jpg", "jpeg", "png", "gif", "bmp"].includes(extension) ? [`older format (${extension})`] : []),
    ];
    return [{ url, problems }];
  });
}
export function securityHeaders(headers: Headers, url: string) {
  const get = (name: string) => headers.get(name);
  const csp = get("content-security-policy") ?? "";
  const rows = [
    { name: "HTTPS", ok: url.startsWith("https:"), value: url.startsWith("https:") ? "Yes" : "No", fix: "Serve the site over HTTPS." },
    { name: "Strict-Transport-Security", ok: /max-age=\s*[1-9]\d{6,}/i.test(get("strict-transport-security") ?? ""), value: get("strict-transport-security"), fix: "Send max-age of at least 31536000." },
    { name: "Content-Security-Policy (script rules)", ok: /(^|;)\s*(script-src|default-src)\s/i.test(csp), value: csp || null, fix: "Add script-src or default-src to limit where scripts load from." },
    { name: "X-Content-Type-Options", ok: get("x-content-type-options")?.toLowerCase() === "nosniff", value: get("x-content-type-options"), fix: "Send nosniff." },
    { name: "Clickjacking protection", ok: Boolean(get("x-frame-options")) || /frame-ancestors/i.test(csp), value: get("x-frame-options") ?? (/frame-ancestors/i.test(csp) ? "frame-ancestors" : null), fix: "Send X-Frame-Options or frame-ancestors." },
    { name: "Referrer-Policy", ok: Boolean(get("referrer-policy")), value: get("referrer-policy"), fix: "Send strict-origin-when-cross-origin." },
    { name: "Permissions-Policy", ok: Boolean(get("permissions-policy")), value: get("permissions-policy"), fix: "Turn off browser features you do not use." },
  ];
  return { rows, score: Math.round((rows.filter((row) => row.ok).length / rows.length) * 100) };
}

/* ── Crawl comparison ── */
type IssuePage = { url: string; issues?: Array<{ ruleId: string; title: string }> };
export function compareCrawls(current: IssuePage[], previous: IssuePage[]) {
  const keyed = (pages: IssuePage[]) => new Map(pages.flatMap((page) => (page.issues ?? []).map((issue) => [`${comparableUrl(page.url)}|${issue.ruleId}`, { url: page.url, title: issue.title }] as const)));
  const now = keyed(current), before = keyed(previous);
  const urls = (pages: IssuePage[]) => new Map(pages.map((page) => [comparableUrl(page.url), page.url]));
  const nowUrls = urls(current), beforeUrls = urls(previous);
  const only = <T,>(a: Map<string, T>, b: Map<string, T>) => [...a].filter(([key]) => !b.has(key)).map(([, value]) => value);
  // An issue on a page missing from the newer crawl is not "fixed": the page simply was not checked.
  const fixed = [...before].filter(([key]) => !now.has(key) && nowUrls.has(key.split("|")[0])).map(([, value]) => value);
  return { added: only(now, before).slice(0, 300), fixed: fixed.slice(0, 300), persisting: [...now.keys()].filter((key) => before.has(key)).length, newPages: only(nowUrls, beforeUrls).slice(0, 300), missingPages: only(beforeUrls, nowUrls).slice(0, 300) };
}

/* ── Server logs ── */
const BOTS = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Applebot", "YandexBot", "DuckDuckBot", "Baiduspider", "AhrefsBot", "SemrushBot", "meta-externalagent"];
export function analyseLog(text: string) {
  const bots = new Map<string, { hits: number; errors: number }>(), paths = new Map<string, number>(), errors = new Map<string, number>();
  let lines = 0, parsed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    lines += 1;
    const match = line.match(/"(?:GET|HEAD|POST|PUT|DELETE|OPTIONS|PATCH) (\S+)[^"]*" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/);
    if (!match) continue;
    parsed += 1;
    const [, path, status, agent = ""] = match;
    const bot = BOTS.find((name) => agent.toLowerCase().includes(name.toLowerCase()));
    if (!bot) continue;
    const row = bots.get(bot) ?? { hits: 0, errors: 0 };
    row.hits += 1; paths.set(path, (paths.get(path) ?? 0) + 1);
    if (Number(status) >= 400) { row.errors += 1; const key = `${status} ${path}`; errors.set(key, (errors.get(key) ?? 0) + 1); }
    bots.set(bot, row);
  }
  const top = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, count]) => ({ key, count }));
  return { lines, parsed, bots: [...bots].map(([name, row]) => ({ name, ...row })).sort((a, b) => b.hits - a.hits), paths: top(paths), errors: top(errors) };
}
