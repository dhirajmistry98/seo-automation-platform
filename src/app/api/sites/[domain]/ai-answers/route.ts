import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { dataForSeoGet, dataForSeoPost, isDataForSeoConfigured } from "@/lib/integrations/dataforseo";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { AI_PLATFORMS, answerExcerpt, assessAnswer, brandSentiment, buildAnswerRequest, parseAnswer, pickModel, summarizeAnswers, type AiPlatform, type AnswerRow, type ProviderModel } from "@/lib/seo/ai-answers";

// Each live answer can take up to ~2 minutes at the provider; all run in parallel.
export const maxDuration = 300;
type Context = { params: Promise<{ domain: string }> };
const COLLECTION = "ai_answer_reports";
const noStore = { "Cache-Control": "no-store" };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: noStore });
const safeDomain = (value: string) => value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

/** GET: the latest AI answer checks for this website. */
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const domain = safeDomain(decodeURIComponent((await context.params).domain));
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return error("Website not found.", 404);
  const reports = await db.collection(COLLECTION).find({ organizationId: website.organizationId ?? null, websiteDomain: domain }, { projection: { _id: 0, organizationId: 0 } }).sort({ createdAt: -1 }).limit(5).toArray();
  return NextResponse.json({ reports, configured: isDataForSeoConfigured(), verified: Boolean(website.verifiedAt), defaultBrand: String(website.name || "") }, { headers: noStore });
}

/** Current models per platform (DataForSEO /models), cached for a day. */
async function currentModels(db: Db, platform: AiPlatform) {
  const cache = db.collection<{ platform: string; models: ProviderModel[]; expiresAt: Date }>("ai_answer_models");
  const hit = await cache.findOne({ platform, expiresAt: { $gt: new Date() } });
  if (hit) return hit.models;
  const result = await dataForSeoGet(`ai_optimization/${platform}/llm_responses/models`);
  const models = (result.tasks?.[0]?.result ?? []) as ProviderModel[];
  await cache.updateOne({ platform }, { $set: { platform, models, expiresAt: new Date(Date.now() + 86_400_000) } }, { upsert: true });
  return models;
}

/** POST: ask each selected AI assistant each question and record mentions and citations. */
export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return error("Authentication required.", 401);
  const domain = safeDomain(decodeURIComponent((await context.params).domain));
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return error("Website not found.", 404);
  if (!website.verifiedAt) return error("Verify ownership of this website before checking AI answers.", 409);
  if (!isDataForSeoConfigured()) return error("AI answer checks are not configured on this server.", 503);

  const parsed = await readJsonLimited<{ prompts?: unknown; brand?: unknown; platforms?: unknown }>(request, 8_000);
  if (!parsed.ok) return error("Invalid request.", parsed.status);
  const prompts = Array.isArray(parsed.value.prompts) ? [...new Set(parsed.value.prompts.filter((item): item is string => typeof item === "string").map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))] : [];
  if (!prompts.length || prompts.length > 5 || prompts.some((item) => item.length < 8 || item.length > 300)) return error("Enter 1 to 5 questions, each 8 to 300 characters.");
  const brand = typeof parsed.value.brand === "string" ? parsed.value.brand.trim().slice(0, 80) : "";
  if (brand.length < 2) return error("Enter your brand or business name (at least 2 characters).");
  const platforms = (Array.isArray(parsed.value.platforms) ? AI_PLATFORMS.filter((platform) => (parsed.value.platforms as unknown[]).includes(platform)) : [...AI_PLATFORMS]);
  if (!platforms.length) return error("Choose at least one AI assistant.");

  const limit = await consumeRateLimit(db, "ai-answers", `${String(website.organizationId ?? website.ownerId)}:${domain}`, 6, 24 * 60 * 60_000);
  if (!limit.allowed) return error(`This website has used today's 6 AI answer checks. Try again in ${Math.ceil(limit.retryAfterSeconds / 3600)} hours.`, 429);

  const countryIso = String(website.rankTrackingCountryCode || "IN").toUpperCase();
  const models = new Map<AiPlatform, ReturnType<typeof pickModel> | Error>();
  await Promise.all(platforms.map(async (platform) => {
    try { models.set(platform, pickModel(platform, await currentModels(db, platform))); }
    catch (caught) { models.set(platform, caught instanceof Error ? caught : new Error("Model list unavailable.")); }
  }));

  let cost = 0;
  const rows: AnswerRow[] = await Promise.all(platforms.flatMap((platform) => prompts.map(async (prompt): Promise<AnswerRow> => {
    const model = models.get(platform);
    if (!model || model instanceof Error) return { prompt, platform, status: "error", error: model instanceof Error ? model.message : "No model is available for this assistant right now." };
    try {
      const result = await dataForSeoPost(`ai_optimization/${platform}/llm_responses/live`, [buildAnswerRequest(platform, prompt, model, countryIso)]);
      cost += Number(result.cost) || 0;
      const answer = parseAnswer(result.tasks?.[0]?.result?.[0] as Record<string, unknown> | undefined);
      if (!answer.text) return { prompt, platform, status: "error", model: answer.model ?? model.name, error: "The assistant returned an empty answer." };
      const verdict = assessAnswer(answer, [brand], domain);
      return { prompt, platform, status: "ok", model: answer.model ?? model.name, mentioned: verdict.mentioned, cited: verdict.cited, sentiment: verdict.mentioned ? brandSentiment(answer.text, [brand, domain]) : null, excerpt: answerExcerpt(answer.text, [brand, domain]), text: answer.text.slice(0, 6_000), sources: answer.sources };
    } catch (caught) {
      return { prompt, platform, status: "error", model: model.name, error: caught instanceof Error ? caught.message : "The assistant could not answer right now." };
    }
  })));

  const answeredAny = rows.some((row) => row.status === "ok");
  if (!answeredAny) return error(rows[0]?.error || "No AI assistant could answer right now. Please try again later.", 502);
  const report = { organizationId: website.organizationId ?? null, websiteDomain: domain, brand, prompts, platforms, countryIso, rows, summary: summarizeAnswers(rows), providerCostUsd: Math.round(cost * 10_000) / 10_000, createdBy: session.user.id, createdAt: new Date() };
  await db.collection(COLLECTION).insertOne(report);
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, organizationId: website.organizationId ?? null, websiteDomain: domain, action: "seo.ai_answers.requested", prompts: prompts.length, platforms, createdAt: new Date() });
  const { organizationId: _omit, ...publicReport } = report;
  void _omit;
  return NextResponse.json({ report: publicReport }, { status: 201, headers: noStore });
}
