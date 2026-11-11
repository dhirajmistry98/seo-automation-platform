import { Agent } from "undici";
import type { AuditedPage } from "./audit";
import { addCrossPageIssues, auditHtml, getPageHealthScore } from "./audit";
import { assertPublicUrl, createPinnedLookup, resolvePublicUrl } from "./url-security";
import { AI_SEARCH_CRAWLERS, robotsHomepagePolicy, type SearchCrawlerAccess } from "./search-access";
export { assertPublicUrl } from "./url-security";

const timeoutMs = 8_000;
const maxResponseBytes = 2_000_000;
const userAgent = "SeoStudioBot/1.0";

export function seoCrawlPageLimit() {
  const configured = Number.parseInt(process.env.SEO_CRAWL_MAX_PAGES || "100", 10);
  return Number.isInteger(configured) ? Math.max(10, Math.min(250, configured)) : 100;
}
export class CrawlCancelledError extends Error {
  constructor() { super("The crawl was cancelled."); this.name = "CrawlCancelledError"; }
}
export type CrawlProgress = { pagesScanned: number; pagesAttempted: number; pagesQueued: number; failedPages: number; skippedByRobots: number; maxPages: number };
type CrawlOptions = { sitemapUrl?: string; robotsUrl?: string; primaryKeywords?: string[]; shouldCancel?: () => boolean | Promise<boolean>; onProgress?: (progress: CrawlProgress) => void | Promise<void> };

function canonicalCrawlUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (/^(utm_.+|gclid|fbclid|msclkid|mc_cid|mc_eid)$/i.test(key)) parsed.searchParams.delete(key);
  parsed.searchParams.sort();
  return parsed.href;
}

async function readLimited(response: Response) {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxResponseBytes) throw new Error("Page is larger than the crawl limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxResponseBytes) { await reader.cancel(); throw new Error("Page is larger than the crawl limit."); }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(joined);
}

async function safeGet(startUrl: string) {
  let url = startUrl;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const validated = await resolvePublicUrl(url);
    const dispatcher = new Agent({ connect: { lookup: createPinnedLookup(validated.url.hostname, validated.addresses) } });
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.8,*/*;q=0.2" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        dispatcher,
      } as RequestInit & { dispatcher: Agent });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        await dispatcher.close();
        if (!location || redirects === 5) return { response, finalUrl: url, body: "" };
        url = new URL(location, url).href;
        continue;
      }
      const body = await readLimited(response);
      await dispatcher.close();
      return { response, finalUrl: url, body };
    } catch (error) {
      await dispatcher.destroy();
      throw error;
    }
  }
  throw new Error("Too many redirects.");
}

export async function fetchPublicHtml(value: string, expectedDomain: string) {
  const start = await assertPublicUrl(value);
  const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
  if (normalizeHost(start.hostname) !== normalizeHost(expectedDomain)) throw new Error("Verification URL must use this website's domain.");
  const result = await safeGet(start.href);
  const final = new URL(result.finalUrl);
  if (normalizeHost(final.hostname) !== normalizeHost(expectedDomain)) throw new Error("The website redirected verification to another domain.");
  if (!result.response.ok || !/text\/html|application\/xhtml\+xml/i.test(result.response.headers.get("content-type") ?? "")) throw new Error("The website did not return a public HTML page.");
  return { html: result.body, finalUrl: result.finalUrl, headers: result.response.headers };
}

function robotsAllows(robots: string, path: string) {
  let active = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") active = value === "*" || /seostudiobot/i.test(value);
    else if (active && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", path: value });
  }
  const matching = rules.filter((rule) => path.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length)[0];
  return !matching || matching.allow;
}

export async function crawlAndAudit(startUrl: string, requestedMaxPages = 25, config: CrawlOptions = {}): Promise<{ pages: AuditedPage[]; skippedByRobots: number; failedPages: number; searchAccess: SearchCrawlerAccess }> {
  const first = await assertPublicUrl(startUrl);
  const origin = first.origin;
  const cap = Math.max(1, Math.min(seoCrawlPageLimit(), Math.floor(requestedMaxPages)));
  let robots = "";
  let robotsStatusCode: number | null = null;
  let robotsAvailable = false;
  let sitemapLocations: string[] = [];
  let crawlDelayMs = 500;
  try {
    const result = await safeGet(config.robotsUrl || `${origin}/robots.txt`);
    robotsStatusCode = result.response.status;
    robotsAvailable = result.response.ok;
    if (result.response.ok) {
      robots = result.body;
      sitemapLocations = [...result.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 5);
      const delay = [...result.body.matchAll(/^\s*crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map((m) => Number(m[1])).find((value) => Number.isFinite(value));
      if (delay !== undefined) crawlDelayMs = Math.max(crawlDelayMs, Math.min(10_000, delay * 1000));
    }
  } catch { /* A missing or unavailable robots file does not prevent crawling. */ }
  let llmsStatus: SearchCrawlerAccess["llmsTxt"]["status"] = "unavailable";
  let llmsStatusCode: number | null = null;
  let llmsBytes: number | null = null;
  try {
    const llms = await safeGet(new URL("/llms.txt", origin).href);
    llmsStatusCode = llms.response.status;
    llmsBytes = new TextEncoder().encode(llms.body).byteLength;
    llmsStatus = llms.response.ok ? "available" : llms.response.status === 404 ? "not_found" : "unavailable";
  } catch { llmsStatus = "unavailable"; }
  const searchAccess: SearchCrawlerAccess = {
    robotsTxt: { available: robotsAvailable, statusCode: robotsStatusCode },
    bots: Object.fromEntries(AI_SEARCH_CRAWLERS.map((name) => [name, robotsAvailable ? robotsHomepagePolicy(robots, name) : "unknown"])) as SearchCrawlerAccess["bots"],
    llmsTxt: { status: llmsStatus, statusCode: llmsStatusCode, bytes: llmsBytes },
  };
  sitemapLocations.unshift(config.sitemapUrl || `${origin}/sitemap.xml`);
  const queue = [canonicalCrawlUrl(first.href)];
  const discovered = new Set(queue);
  const addToQueue = (url: string) => {
    try {
      const canonical = canonicalCrawlUrl(url);
      if (new URL(canonical).origin !== origin || discovered.has(canonical) || discovered.size >= cap * 8) return;
      discovered.add(canonical);
      queue.push(canonical);
    } catch { /* Invalid discovered links are ignored. */ }
  };
  const reportProgress = async (pagesAttempted: number, failedPages: number, skipped: number) => config.onProgress?.({ pagesScanned: pages.length, pagesAttempted, pagesQueued: queue.length, failedPages, skippedByRobots: skipped, maxPages: cap });
  for (const sitemapUrl of sitemapLocations) {
    try {
      const sitemap = await safeGet(sitemapUrl);
      if (sitemap.response.ok) {
        const entries = [...sitemap.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim()).filter((entry) => {
          try { return new URL(entry).origin === origin; } catch { return false; }
        }).slice(0, cap);
        const nested = entries.filter((entry) => /\.xml(?:$|\?)/i.test(entry)).slice(0, 3);
        for (const entry of entries.filter((entry) => !nested.includes(entry))) addToQueue(entry);
        for (const nestedUrl of nested) {
          const nestedMap = await safeGet(nestedUrl);
          if (nestedMap.response.ok) for (const entry of [...nestedMap.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim()).slice(0, cap)) addToQueue(entry);
        }
      }
    } catch { /* Continue with discovered links. */ }
  }
  const visited = new Set<string>();
  const pages: AuditedPage[] = [];
  let skippedByRobots = 0;
  let pagesAttempted = 0;
  let failedPages = 0;
  await reportProgress(pagesAttempted, failedPages, skippedByRobots);
  while (queue.length && pages.length < cap) {
    if (await config.shouldCancel?.()) throw new CrawlCancelledError();
    const url = queue.shift()!;
    let parsed: URL;
    try { parsed = await assertPublicUrl(url); } catch { continue; }
    const canonicalUrl = canonicalCrawlUrl(`${parsed.origin}${parsed.pathname}${parsed.search}`);
    if (visited.has(canonicalUrl) || parsed.origin !== origin) continue;
    visited.add(canonicalUrl);
    if (!robotsAllows(robots, `${parsed.pathname}${parsed.search}`)) { skippedByRobots++; continue; }
    try {
      if (pages.length) await new Promise((resolve) => setTimeout(resolve, crawlDelayMs));
      if (await config.shouldCancel?.()) throw new CrawlCancelledError();
      pagesAttempted++;
      const result = await safeGet(canonicalUrl);
      if (!/text\/html|application\/xhtml\+xml/i.test(result.response.headers.get("content-type") ?? "")) continue;
      const page = auditHtml(canonicalUrl, result.finalUrl, result.response.status, result.body, result.response.headers, { primaryKeywords: config.primaryKeywords });
      pages.push(page);
      for (const link of page.internalLinks) if (queue.length < cap * 4) addToQueue(link);
    } catch (error) {
      if (error instanceof CrawlCancelledError) throw error;
      failedPages++;
      if (pages.length === 0) throw error;
    } finally {
      await reportProgress(pagesAttempted, failedPages, skippedByRobots);
    }
  }
  addCrossPageIssues(pages);
  for (const page of pages) page.healthScore = getPageHealthScore(page);
  return { pages, skippedByRobots, failedPages, searchAccess };
}
