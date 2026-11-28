/** Technical tools that read the website or the saved crawl. `get` is the SSRF-safe fetcher, passed in so it can be tested. */
import type { Db } from "mongodb";
import { buildSitemap, comparableUrl, compareCrawls, duplicatePairs, indexablePages, orphanPages, pageImages, pageMeta, pageText, parseRobots, parseSitemap, readability, sameSite, securityHeaders, sitemapProblems, validateStructuredData, type CrawlPage } from "./toolbox";

export type Get = (url: string) => Promise<{ response: Response; finalUrl: string; body: string }>;
export type Context = { db: Db; get: Get; domain: string; origin: string; scope: { organizationId: unknown; websiteDomain: string }; sitemapUrl?: string; deadline: number };
/** An error whose message is safe to show to the user. */
export class ToolError extends Error {}

/** Runs work a few at a time and stops starting new items when time is nearly up. */
async function pooled<T, R>(items: T[], deadline: number, work: (item: T) => Promise<R>, size = 6) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length && Date.now() < deadline) results.push(await work(items[next++]));
  }));
  return { results, skipped: items.length - results.length };
}

export async function checkUrl(get: Get, url: string) {
  try {
    const { response, finalUrl } = await get(url);
    const status = response.status;
    // Many sites refuse automated visitors; that is not proof the link is broken.
    const state = [401, 403, 429, 999].includes(status) ? "blocked" : status >= 400 ? "broken" : status >= 300 || comparableUrl(finalUrl) !== comparableUrl(url) ? "redirect" : "ok";
    return { url, status, finalUrl, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/larger than/i.test(message)) return { url, status: null, finalUrl: url, state: "too large to check" };
    return { url, status: null, finalUrl: url, state: /public|resolve|private/i.test(message) ? "not checked" : "unreachable" };
  }
}

async function latestPages(context: Context, auditId?: string) {
  const audit = auditId ? { auditId } : await context.db.collection("seo_audits").findOne({ ...context.scope, status: "completed" }, { sort: { completedAt: -1 }, projection: { auditId: 1 } });
  if (!audit) throw new ToolError("Run a site audit first. This tool uses its crawled pages.");
  const pages = await context.db.collection("seo_pages").find({ ...context.scope, auditId: audit.auditId }).limit(500)
    .project({ _id: 0, url: 1, finalUrl: 1, status: 1, robots: 1, canonical: 1, internalLinks: 1, externalLinks: 1, issues: 1 }).toArray();
  return pages as unknown as Array<CrawlPage & { externalLinks?: string[]; issues?: Array<{ ruleId: string; title: string }> }>;
}

async function html(context: Context, url: string) {
  if (!sameSite(url, context.domain)) throw new ToolError(`Enter a page on ${context.domain}.`);
  const result = await context.get(url).catch(() => { throw new ToolError("That page could not be read."); });
  if (!result.response.ok) throw new ToolError(`The page returned ${result.response.status}.`);
  return result;
}

async function readSitemap(context: Context) {
  let start = context.sitemapUrl && sameSite(context.sitemapUrl, context.domain) ? context.sitemapUrl : "";
  if (!start) {
    const robots = await context.get(`${context.origin}/robots.txt`).catch(() => null);
    start = (robots?.response.ok ? parseRobots(robots.body).sitemaps.find((url) => sameSite(url, context.domain)) : "") || `${context.origin}/sitemap.xml`;
  }
  const first = await context.get(start).catch(() => null);
  if (!first?.response.ok) throw new ToolError(`No sitemap could be read at ${start}.`);
  const root = parseSitemap(first.body);
  if (!root.valid) throw new ToolError(`${start} is not an XML sitemap.`);
  if (!root.isIndex) return { url: start, files: 1, unreadable: 0, entries: root.entries };
  const children = root.entries.map((entry) => entry.loc).filter((url) => sameSite(url, context.domain)).slice(0, 25);
  const { results } = await pooled(children, context.deadline, async (url) => { const child = await context.get(url).catch(() => null); return child?.response.ok ? parseSitemap(child.body).entries : null; });
  return { url: start, files: 1 + results.length, unreadable: results.filter((item) => item === null).length + (root.entries.length - children.length), entries: results.flatMap((item) => item ?? []) };
}

export async function sitemapReport(context: Context) {
  const sitemap = await readSitemap(context);
  const pages = await latestPages(context).catch(() => []);
  const listed = new Set(sitemap.entries.map((entry) => comparableUrl(entry.loc)));
  const crawled = new Set(pages.map((page) => comparableUrl(page.url)));
  const sample = await pooled(sitemap.entries.map((e) => e.loc).filter((url) => sameSite(url, context.domain)).slice(0, 40), context.deadline, (url) => checkUrl(context.get, url));
  return {
    sitemap: sitemap.url, files: sitemap.files, unreadable: sitemap.unreadable, total: sitemap.entries.length,
    problems: sitemapProblems(sitemap.entries, context.domain), hasCrawl: pages.length > 0,
    missingFromSitemap: indexablePages(pages).filter((page) => !listed.has(comparableUrl(page.url))).map((page) => page.url).slice(0, 200),
    notCrawled: pages.length ? sitemap.entries.map((e) => e.loc).filter((url) => !crawled.has(comparableUrl(url))).slice(0, 200) : [],
    checked: sample.results.length, badUrls: sample.results.filter((item) => item.state !== "ok"),
  };
}

export async function generateSitemap(context: Context) {
  const urls = indexablePages(await latestPages(context)).map((page) => page.url).filter((url) => sameSite(url, context.domain));
  if (!urls.length) throw new ToolError("The last crawl found no indexable pages.");
  return { count: urls.length, xml: buildSitemap(urls) };
}

export async function orphanReport(context: Context) {
  const pages = await latestPages(context);
  const sitemap = await readSitemap(context).then((result) => result.entries.map((entry) => entry.loc)).catch(() => []);
  const report = await context.db.collection("google_search_console_reports").findOne({ ...context.scope, dimension: "page" }, { sort: { generatedAt: -1 }, projection: { rows: 1 } });
  const search = Array.isArray(report?.rows) ? (report.rows as Array<{ keys?: string[] }>).flatMap((row) => (row.keys?.[0] ? [row.keys[0]] : [])) : [];
  if (!sitemap.length && !search.length) throw new ToolError("Add a sitemap or save a Search Console page report to find orphan pages.");
  return { sitemapUrls: sitemap.length, searchUrls: search.length, crawledPages: pages.length, orphans: orphanPages(pages, sitemap, search, context.domain) };
}

export async function externalLinkReport(context: Context) {
  const pages = await latestPages(context);
  const links = new Map<string, string[]>();
  for (const page of pages) for (const link of page.externalLinks ?? []) if (/^https?:\/\//i.test(link)) links.set(link, [...(links.get(link) ?? []), page.url]);
  const { results, skipped } = await pooled([...links.keys()].slice(0, 80), context.deadline, (url) => checkUrl(context.get, url));
  return { found: links.size, checked: results.length, notChecked: links.size - results.length, timedOut: skipped, problems: results.filter((item) => item.state !== "ok").map((item) => ({ ...item, on: (links.get(item.url) ?? []).slice(0, 3) })) };
}

export async function bulkReport(context: Context, urls: string[]) {
  const list = [...new Set(urls)].filter((url) => /^https?:\/\//i.test(url)).slice(0, 50);
  if (!list.length) throw new ToolError("Enter at least one full address starting with http:// or https://.");
  const { results, skipped } = await pooled(list, context.deadline, (url) => checkUrl(context.get, url));
  return { results, skipped };
}

export async function duplicateReport(context: Context) {
  const urls = indexablePages(await latestPages(context)).map((page) => page.url).filter((url) => sameSite(url, context.domain)).slice(0, 40);
  const { results } = await pooled(urls, context.deadline, async (url) => { const page = await context.get(url).catch(() => null); return page?.response.ok ? { url, text: pageText(page.body) } : null; });
  return { pages: urls.length, ...duplicatePairs(results.filter((item): item is { url: string; text: string } => item !== null)) };
}

export async function compareReport(context: Context) {
  const audits = await context.db.collection("seo_audits").find({ ...context.scope, status: "completed" }).sort({ completedAt: -1 }).limit(2).project({ auditId: 1, completedAt: 1, score: 1 }).toArray();
  if (audits.length < 2) throw new ToolError("Two completed site audits are needed to compare.");
  const [now, before] = await Promise.all([latestPages(context, String(audits[0].auditId)), latestPages(context, String(audits[1].auditId))]);
  return { current: { date: audits[0].completedAt, score: audits[0].score }, previous: { date: audits[1].completedAt, score: audits[1].score }, ...compareCrawls(now, before) };
}

export async function pageReport(context: Context, url: string, keyword: string) {
  const page = await html(context, url);
  const meta = pageMeta(page.body);
  const text = pageText(page.body);
  return { url: page.finalUrl, keyword, meta, readability: readability(text, keyword), structured: validateStructuredData(page.body), security: securityHeaders(page.response.headers, page.finalUrl) };
}

export async function imageReport(context: Context, url: string) {
  const page = await html(context, url);
  const images = pageImages(page.body, page.finalUrl);
  const { results } = await pooled(images.slice(0, 40), context.deadline, async (image) => {
    try {
      const { response } = await context.get(image.url);
      const bytes = Number(response.headers.get("content-length")) || null;
      return { ...image, status: response.status, kilobytes: bytes ? Math.round(bytes / 1024) : null, problems: [...image.problems, ...(response.status >= 400 ? ["image does not load"] : []), ...(bytes && bytes > 200 * 1024 ? ["larger than 200 KB"] : [])] };
    } catch (error) {
      const large = error instanceof Error && /larger than/i.test(error.message);
      return { ...image, status: null, kilobytes: null, problems: [...image.problems, large ? "very large file" : "could not be checked"] };
    }
  });
  return { url: page.finalUrl, total: images.length, checked: results.length, images: results.sort((a, b) => b.problems.length - a.problems.length) };
}

export async function robotsFile(context: Context) {
  const result = await context.get(`${context.origin}/robots.txt`).catch(() => null);
  if (!result?.response.ok) throw new ToolError("No robots.txt could be read on this website.");
  return { text: result.body.slice(0, 100_000), ...parseRobots(result.body) };
}
