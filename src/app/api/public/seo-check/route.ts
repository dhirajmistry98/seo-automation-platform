import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { crawlAndAudit } from "@/lib/seo/crawler";
import { getPageHealthScore } from "@/lib/seo/audit";
import { analyzeSearchVisibility } from "@/lib/seo/search-visibility";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readJsonLimited, requestClientIp } from "@/lib/security/request";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const CACHE_MS = 30 * 60_000;
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

let indexesReady: Promise<unknown> | undefined;

/** Free, no-sign-up single-page SEO and AI-search readiness check (public lead magnet). */
export async function POST(request: Request) {
  const parsed = await readJsonLimited<{ url?: unknown }>(request, 4_096);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const url = normalizeUrl(parsed.value.url);
  if (!url) return fail("Enter a valid website address, for example example.com.");

  const db = (await clientPromise).db();
  const checks = db.collection("public_seo_checks");
  indexesReady ??= Promise.all([
    checks.createIndex({ url: 1 }, { unique: true, name: "public_check_url" }),
    checks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "public_check_expiry" }),
  ]).catch((error) => { indexesReady = undefined; throw error; });
  await indexesReady;

  const cached = await checks.findOne({ url, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, result: 1 } });
  if (cached?.result) return NextResponse.json({ ...cached.result, cached: true }, { headers: noStore });

  // Per-visitor limit when the trusted proxy IP header is configured, plus a global ceiling so a burst
  // of anonymous checks cannot exhaust the crawler.
  const ip = requestClientIp(request);
  if (ip !== "unknown") {
    const visitor = await consumeRateLimit(db, "public-seo-check-ip", ip, 10, 60 * 60_000);
    if (!visitor.allowed) return fail("You have reached the free check limit. Create a free account for full site audits.", 429, { "Retry-After": String(visitor.retryAfterSeconds) });
  }
  const global = await consumeRateLimit(db, "public-seo-check-global", "all", 600, 60 * 60_000);
  if (!global.allowed) return fail("The free checker is busy right now. Please try again in a few minutes.", 429, { "Retry-After": String(global.retryAfterSeconds) });

  try {
    const crawl = await crawlAndAudit(url, 1);
    const page = crawl.pages[0];
    if (!page) return fail("We could not read that page. Check that it is public and returns HTML.", 422);
    const health = getPageHealthScore(page);
    const visibility = analyzeSearchVisibility([page], crawl.searchAccess);
    const severityOrder = { critical: 0, warning: 1, notice: 2 } as const;
    const result = {
      url: page.url,
      checkedAt: new Date().toISOString(),
      title: page.title ?? null,
      score: health.score,
      issues: [...page.issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).map(({ ruleId, title, severity, recommendation, evidence }) => ({ ruleId, title, severity, recommendation, evidence })),
      counts: { critical: page.issues.filter((item) => item.severity === "critical").length, warning: page.issues.filter((item) => item.severity === "warning").length, notice: page.issues.filter((item) => item.severity === "notice").length },
      ai: { scores: visibility.scores, recommendations: visibility.recommendations.slice(0, 6), bots: crawl.searchAccess.bots, llmsTxt: crawl.searchAccess.llmsTxt.status },
    };
    await checks.updateOne({ url }, { $set: { url, result, expiresAt: new Date(Date.now() + CACHE_MS) } }, { upsert: true });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/private|public|blocked|not allowed|resolve/i.test(message)) return fail("That address is not a public website we can check.", 422);
    return fail("We could not reach that website. Check the address and try again.", 502);
  }
}
