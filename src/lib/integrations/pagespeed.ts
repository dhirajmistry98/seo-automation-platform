import { readTextLimited } from "@/lib/security/request";

export type PageSpeedStrategy = "mobile" | "desktop";
type PageSpeedAudit = { id?: string; title?: string; score?: number | null; displayValue?: string; numericValue?: number; details?: { type?: string; overallSavingsMs?: number } };
type PageSpeedResponse = {
  error?: { message?: string };
  lighthouseResult?: { categories?: Record<string, { score?: number | null }>; audits?: Record<string, PageSpeedAudit>; fetchTime?: string; lighthouseVersion?: string };
  loadingExperience?: { metrics?: Record<string, unknown>; initial_url?: string };
  originLoadingExperience?: { metrics?: Record<string, unknown> };
};

export async function runPageSpeed(url: string, strategy: PageSpeedStrategy) {
  const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) endpoint.searchParams.append("category", category);
  if (process.env.GOOGLE_PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.GOOGLE_PAGESPEED_API_KEY);
  const response = await fetch(endpoint, { redirect: "manual", signal: AbortSignal.timeout(80_000), cache: "no-store" });
  const text = await readTextLimited(response, 8_000_000);
  let data: PageSpeedResponse;
  try { data = JSON.parse(text) as PageSpeedResponse; } catch { throw new Error("Google PageSpeed returned an invalid response."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Google PageSpeed returned an invalid response.");
  if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message.slice(0, 500) : `Google PageSpeed returned HTTP ${response.status}.`);
  const result = data.lighthouseResult;
  if (!result?.categories) throw new Error("PageSpeed did not return a Lighthouse report for this page.");
  const categories = Object.fromEntries(Object.entries(result.categories).map(([key, value]) => {
    const score = (value as { score?: number | null }).score;
    return [key, typeof score === "number" && Number.isFinite(score) ? Math.round(score * 100) : null];
  }));
  const audits = result.audits ?? {};
  const labMetrics = Object.fromEntries(["first-contentful-paint", "largest-contentful-paint", "cumulative-layout-shift", "interaction-to-next-paint", "speed-index", "total-blocking-time", "server-response-time"].flatMap((id) => {
    const audit = audits[id];
    return audit ? [[id, { displayValue: audit.displayValue ?? null, numericValue: audit.numericValue ?? null }]] : [];
  }));
  const fieldMetrics = data.loadingExperience?.metrics ?? null;
  const auditValues = Object.values(audits);
  const opportunities = auditValues.filter((item) => item.details?.type === "opportunity" && typeof item.score === "number" && item.score < 0.9)
    .sort((a, b) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0)).slice(0, 10)
    .map((item) => ({ id: item.id ?? "", title: item.title ?? "", displayValue: item.displayValue ?? null, savingsMs: item.details?.overallSavingsMs ?? null }));
  return {
    categories, labMetrics, fieldMetrics,
    fieldDataStatus: fieldMetrics && Object.keys(fieldMetrics).length ? "available" : "not_available",
    fieldDataUrl: data.loadingExperience?.initial_url ?? null,
    originFieldMetrics: data.originLoadingExperience?.metrics ?? null,
    opportunities,
    source: "google_pagespeed_insights_v5",
    fetchTime: result.fetchTime ?? null,
    lighthouseVersion: result.lighthouseVersion ?? null,
  };
}
