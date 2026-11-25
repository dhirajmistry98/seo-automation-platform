import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { defaultQuestions } from "@/lib/ai/gemini-visibility";
import { ENGINES, engineConnected, isEngineId, type EngineId } from "@/lib/ai/visibility/engines";
import { MAX_QUESTIONS, runVisibilityCheck, shareOfVoice, summarize } from "@/lib/ai/visibility/check";

export const maxDuration = 60;
type Context = { params: Promise<{ domain: string }> };
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra?: Record<string, unknown>, headers?: Record<string, string>) => NextResponse.json({ error, ...extra }, { status, headers: { ...noStore, ...headers } });
const engineStatus = () => ENGINES.map((engine) => ({ id: engine.id, label: engine.label, provider: engine.provider, connected: engineConnected(engine), setup: `Add ${engine.envKey} to the server environment` }));

function cleanQuestions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((q): q is string => typeof q === "string").map((q) => q.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200)).filter((q) => q.length >= 8).slice(0, MAX_QUESTIONS)
    : [];
}

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return fail("Website not found.", 404);
  const runs = await db.collection("ai_visibility_runs").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ createdAt: -1 }).limit(12).project({ createdAt: 1, summary: 1, questionCount: 1 }).toArray();
  return NextResponse.json({
    engines: engineStatus(),
    prompts: Array.isArray(website.aiPrompts) ? website.aiPrompts.filter((q: unknown): q is string => typeof q === "string").slice(0, MAX_QUESTIONS) : [],
    competitors: Array.isArray(website.competitorDomains) ? website.competitorDomains.filter((c: unknown): c is string => typeof c === "string").slice(0, 20) : [],
    history: runs.map((run) => ({ createdAt: run.createdAt, summary: run.summary, questionCount: run.questionCount })),
  }, { headers: noStore });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return fail("Website not found, or you don't have permission to run research.", 404);

  const limit = await consumeRateLimit(db, "ai-visibility", session.user.id, 6, 10 * 60_000);
  if (!limit.allowed) return fail("You can run this check 6 times every 10 minutes. Please wait.", 429, undefined, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ questions?: unknown; engines?: unknown; savePrompts?: unknown }>(request, 8_192);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const connected = ENGINES.filter(engineConnected).map((engine) => engine.id);
  const requested = Array.isArray(parsed.value.engines) ? parsed.value.engines.filter(isEngineId) : connected;
  const engines = [...new Set(requested)].filter((id): id is EngineId => connected.includes(id));
  if (!engines.length) return fail(requested.length ? "None of the selected AI engines is connected." : "No AI engine is connected yet.", 503, { engines: engineStatus() });

  const brand = typeof website.name === "string" && website.name.trim() ? website.name.trim().slice(0, 100) : domain;
  const keywords = Array.isArray(website.primaryKeywords) ? website.primaryKeywords.filter((k: unknown): k is string => typeof k === "string") : [];
  const competitors = Array.isArray(website.competitorDomains) ? website.competitorDomains.filter((c: unknown): c is string => typeof c === "string").slice(0, 20) : [];
  const asked = cleanQuestions(parsed.value.questions);
  const saved = cleanQuestions(website.aiPrompts);
  const questions = asked.length ? asked : saved.length ? saved : defaultQuestions(keywords, brand);

  const results = await runVisibilityCheck({ engines, questions, brand, domain, competitors });
  if (results.every((row) => !row.answered)) {
    const reasons = [...new Set(results.map((row) => row.error).filter((e): e is string => Boolean(e)))].slice(0, 5);
    return fail("None of the selected AI engines could answer right now.", 502, { reasons });
  }

  const summary = summarize(results);
  const voice = shareOfVoice(results, domain);
  const now = new Date();
  await db.collection("ai_visibility_runs").insertOne({ organizationId: website.organizationId, websiteDomain: domain, userId: session.user.id, brand, createdAt: now, questionCount: questions.length, summary, results }).catch(() => undefined);
  // Same shape the dashboard overview already reads, so its AI card shows the latest multi-engine check.
  const answered = results.filter((row) => row.answered);
  await db.collection("ai_answer_reports").insertOne({ organizationId: website.organizationId, websiteDomain: domain, brand, createdAt: now, summary: { answered: answered.length, mentioned: answered.filter((row) => row.mentioned).length, cited: answered.filter((row) => row.cited).length, platforms: summary.filter((item) => item.answered).map((item) => ({ label: item.label })) } }).catch(() => undefined);
  if (parsed.value.savePrompts === true && asked.length) await db.collection("websites").updateOne({ _id: website._id }, { $set: { aiPrompts: asked } }).catch(() => undefined);
  return NextResponse.json({ results, summary, shareOfVoice: voice, brand, checkedAt: now.toISOString() }, { headers: noStore });
}
