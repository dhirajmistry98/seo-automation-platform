import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { askAssistant, cleanHistory } from "@/lib/ai/site-assistant";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra?: Record<string, string>) => NextResponse.json({ error }, { status, headers: { ...headers, ...extra } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Sign in to use the assistant.", 401);

  const db = (await clientPromise).db();
  const limit = await consumeRateLimit(db, "assistant", session.user.id, 20, 60_000);
  if (!limit.allowed) return fail("Too many questions. Please wait a moment.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ question?: unknown; history?: unknown }>(request, 16_384);
  if (!parsed.ok) return fail("Invalid request.", parsed.status);
  const question = typeof parsed.value.question === "string" ? parsed.value.question.trim().slice(0, 600) : "";
  if (!question) return fail("Please type a question.", 400);

  try {
    const { answer } = await askAssistant(question, cleanHistory(parsed.value.history));
    if (!answer) return fail("No answer was returned. Please try again.", 502);
    return NextResponse.json({ answer }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === "not-configured") return fail("The assistant is not configured yet.", 503);
    console.error("assistant failed", error instanceof Error ? error.message : "unknown");
    return fail("The assistant is unavailable right now. Please try again shortly.", 502);
  }
}
