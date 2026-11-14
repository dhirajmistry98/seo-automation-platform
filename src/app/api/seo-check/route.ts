import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { crawlAndAudit } from "@/lib/seo/crawler";
import { getPageHealthScore } from "@/lib/seo/audit";
import { analyzeSearchVisibility } from "@/lib/seo/search-visibility";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const fail = (message: string, status = 400, headers: Record<string, string> = {}) => NextResponse.json({ error: message }, { status, headers: { ...noStore, ...headers } });

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 2048);
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/** Collect @type values from the page's JSON-LD blocks. */
function schemaTypes(blocks: string[]) {
  const types = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    (Array.isArray(type) ? type : [type]).forEach((item) => { if (typeof item === "string") types.add(item); });
    if (record["@graph"]) visit(record["@graph"]);
  };
  for (const block of blocks) { try { visit(JSON.parse(block)); } catch { /* invalid JSON-LD is reported as an issue */ } }
  return [...types].slice(0, 12);
}

/** Live single-page SEO and AI-search readiness check for signed-in workspace members. Every result is fetched now. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Sign in to use the SEO checker.", 401);
  const parsed = await readJsonLimited<{ url?: unknown }>(request, 4_096);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const url = normalizeUrl(parsed.value.url);
  if (!url) return fail("Enter a valid page address, for example example.com.");

  const db = (await clientPromise).db();
  const limit = await consumeRateLimit(db, "seo-check-user", session.user.id, 30, 60 * 60_000);
  if (!limit.allowed) return fail(`You have run 30 checks this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`, 429, { "Retry-After": String(limit.retryAfterSeconds) });

  try {
    const started = Date.now();
    const crawl = await crawlAndAudit(url, 1);
    const elapsedMs = Date.now() - started;
    const page = crawl.pages[0];
    if (!page) return fail("That page could not be read. Check that it is public, returns HTML and is not blocked by robots.txt.", 422);
    const health = getPageHealthScore(page);
    const visibility = analyzeSearchVisibility([page], crawl.searchAccess);
    const severityOrder = { critical: 0, warning: 1, notice: 2 } as const;
    const h1 = page.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
    return NextResponse.json({
      url: page.url,
      finalUrl: page.finalUrl,
      checkedAt: new Date().toISOString(),
      elapsedMs,
      score: health.score,
      facts: {
        status: page.status,
        title: page.title || null,
        titleLength: page.title?.length ?? 0,
        description: page.description || null,
        descriptionLength: page.description?.length ?? 0,
        canonical: page.canonical || null,
        robots: page.robots || null,
        h1,
        headingCounts: { h1: h1.length, h2: page.headings.filter((heading) => heading.level === 2).length, h3: page.headings.filter((heading) => heading.level === 3).length },
        wordCount: page.wordCount,
        internalLinks: page.internalLinks.length,
        externalLinks: page.externalLinks.length,
        images: page.images.length,
        imagesMissingAlt: page.images.filter((image) => !image.decorative && (image.alt === null || !image.alt.trim())).length,
        schemaTypes: schemaTypes(page.structuredData),
        hreflang: page.hreflang.length,
        cms: page.cmsDetection?.name ?? null,
      },
      issues: [...page.issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).map(({ ruleId, title, severity, recommendation, evidence }) => ({ ruleId, title, severity, recommendation, evidence })),
      counts: { critical: page.issues.filter((item) => item.severity === "critical").length, warning: page.issues.filter((item) => item.severity === "warning").length, notice: page.issues.filter((item) => item.severity === "notice").length },
      ai: { scores: visibility.scores, recommendations: visibility.recommendations.slice(0, 6), bots: crawl.searchAccess.bots, robotsTxt: crawl.searchAccess.robotsTxt.available, llmsTxt: crawl.searchAccess.llmsTxt.status },
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/private|public|blocked|not allowed|resolve/i.test(message)) return fail("That address is not a public website that can be checked.", 422);
    return fail("The website could not be reached. Check the address and try again.", 502);
  }
}
