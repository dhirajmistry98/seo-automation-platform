import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getAiConfig, recordUsage, ensureAiIndexes, safeMode, zeroUsage } from "@/lib/ai/config";
import { isValidModel } from "@/lib/ai/models";
import { geminiGenerate } from "@/lib/ai/gemini";
import { langchainChat } from "@/lib/ai/langchain";
import { retrieveContext, withRagContext } from "@/lib/ai/rag";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { AiGenRequest } from "@/lib/ai/types";

export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const fail = (msg: string, status = 400, extra?: Record<string, string>) =>
  NextResponse.json({ error: msg }, { status, headers: { ...noStore, ...extra } });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);

  const db = (await clientPromise).db();
  const rateLimitResult = await consumeRateLimit(db, "ai:chat", session.user.id, 30, 60_000);
  if (!rateLimitResult.allowed) return fail("Too many messages. Please wait a moment.", 429, { "Retry-After": String(rateLimitResult.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ question?: unknown; mode?: unknown; model?: unknown; domain?: unknown; history?: unknown }>(request, 32_768);
  if (!parsed.ok) return fail("Invalid request body.", parsed.status);

  const question = typeof parsed.value.question === "string" ? parsed.value.question.trim().slice(0, 2000) : "";
  if (!question) return fail("question is required.");

  const history = Array.isArray(parsed.value.history)
    ? parsed.value.history
        .filter((t): t is { role: "user" | "assistant"; content: string } => t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-20)
    : [];

  const config = await getAiConfig(db, session.user.id);
  const mode = safeMode(parsed.value.mode) ?? config.mode;
  const model = isValidModel(parsed.value.model) ? parsed.value.model : config.model;
  const domain = typeof parsed.value.domain === "string" ? parsed.value.domain : undefined;

  // RAG: pull relevant site data to ground the assistant's answer for both modes.
  let ragContext = "";
  if (domain) {
    ragContext = await retrieveContext(db, session.user.id, domain, question).catch(() => "");
  }

  // For raw mode, inject the RAG context into the question so geminiGenerate receives it.
  // For LangChain mode, ragContext is passed as a separate argument and injected by the chain.
  const contextQuestion = ragContext && mode === "raw" ? withRagContext(question, ragContext) : question;
  const context: AiGenRequest["context"] = { question: contextQuestion, history, domain };
  const req: AiGenRequest = { task: "chat", mode, model, context };

  let response;
  try {
    response = mode === "langchain"
      ? await langchainChat(req, ragContext)
      : await geminiGenerate(req);
  } catch (err) {
    const error = err instanceof Error ? err.message : "AI request failed.";
    await ensureAiIndexes(db).catch(() => undefined);
    await recordUsage(db, { userId: session.user.id, task: "chat", mode, model, usage: zeroUsage(), durationMs: 0, success: false, error, createdAt: new Date() }).catch(() => undefined);
    return fail(error, 500);
  }

  await ensureAiIndexes(db).catch(() => undefined);
  await recordUsage(db, { userId: session.user.id, task: "chat", mode, model, usage: response.usage, durationMs: response.durationMs, success: true, createdAt: new Date() }).catch(() => undefined);

  return NextResponse.json({ answer: response.result, model: response.model, mode: response.mode, usage: response.usage }, { headers: noStore });
}
