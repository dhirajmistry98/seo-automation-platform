import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { checkGeminiVisibility, defaultQuestions } from "@/lib/ai/gemini-visibility";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 60;
type Context = { params: Promise<{ domain: string }> };
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra?: Record<string, string>) => NextResponse.json({ error }, { status, headers: { ...noStore, ...extra } });

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "research.run");
  if (!website) return fail("Website not found, or you don't have permission to run research.", 404);

  const limit = await consumeRateLimit(db, "gemini-visibility", session.user.id, 3, 10 * 60_000);
  if (!limit.allowed) return fail("You can run this check 3 times every 10 minutes. Please wait.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ questions?: unknown }>(request, 8_192);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const brand = typeof website.name === "string" && website.name.trim() ? website.name.trim().slice(0, 100) : domain;
  const keywords = Array.isArray(website.primaryKeywords) ? website.primaryKeywords.filter((k: unknown): k is string => typeof k === "string") : [];
  const asked = Array.isArray(parsed.value.questions)
    ? parsed.value.questions.filter((q): q is string => typeof q === "string").map((q) => q.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200)).filter((q) => q.length >= 8).slice(0, 5)
    : [];
  const questions = asked.length ? asked : defaultQuestions(keywords, brand);

  try {
    const results = await checkGeminiVisibility(questions, brand, domain);
    if (results.every((r) => r.error)) return fail("Gemini could not answer right now. Please try again shortly.", 502);
    await db.collection("gemini_visibility_reports").insertOne({ organizationId: website.organizationId, websiteDomain: domain, userId: session.user.id, results, createdAt: new Date() }).catch(() => undefined);
    // Same shape the dashboard overview already reads, so its AI visibility card shows the latest Gemini check.
    const answered = results.filter((r) => !r.error);
    await db.collection("ai_answer_reports").insertOne({ organizationId: website.organizationId, websiteDomain: domain, brand, createdAt: new Date(), summary: { answered: answered.length, mentioned: answered.filter((r) => r.mentioned).length, cited: answered.filter((r) => r.cited).length, platforms: [{ label: "Gemini" }] } }).catch(() => undefined);
    return NextResponse.json({ results, brand, checkedAt: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "not-configured") return fail("Gemini is not configured yet.", 503);
    console.error("gemini-visibility failed", error instanceof Error ? error.message : "unknown");
    return fail("The check is unavailable right now. Please try again shortly.", 502);
  }
}
