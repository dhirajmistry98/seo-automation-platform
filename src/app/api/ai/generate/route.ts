import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getAiConfig, recordUsage, ensureAiIndexes, safeTask, safeMode, zeroUsage } from "@/lib/ai/config";
import { isValidModel } from "@/lib/ai/models";
import { geminiGenerate } from "@/lib/ai/gemini";
import { langchainGenerate } from "@/lib/ai/langchain";
import { retrieveContext } from "@/lib/ai/rag";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { AiGenRequest } from "@/lib/ai/types";

export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);

  const db = (await clientPromise).db();
  const { allowed } = await consumeRateLimit(db, "ai:generate", session.user.id, 20, 60_000);
  if (!allowed) return fail("Too many AI requests. Please wait a moment.", 429);

  const parsed = await readJsonLimited<{ task?: unknown; mode?: unknown; model?: unknown; context?: unknown }>(request, 16_384);
  if (!parsed.ok) return fail("Invalid request body.", parsed.status);

  const task = safeTask(parsed.value.task);
  if (!task) return fail("Invalid or missing task.");
  if (task === "chat") return fail("Use /api/ai/chat for conversational requests.");

  const config = await getAiConfig(db, session.user.id);
  const mode = safeMode(parsed.value.mode) ?? config.mode;
  const model = isValidModel(parsed.value.model) ? parsed.value.model : config.model;
  const context = (typeof parsed.value.context === "object" && parsed.value.context !== null ? parsed.value.context : {}) as AiGenRequest["context"];

  const req: AiGenRequest = { task, mode, model, context };

  // RAG: inject relevant stored documents when a domain is provided.
  let ragContext = "";
  if (mode === "langchain" && context.domain) {
    const query = context.keyword || context.title || context.description || task;
    ragContext = await retrieveContext(db, session.user.id, context.domain, query).catch(() => "");
  }

  let response;
  try {
    response = mode === "langchain"
      ? await langchainGenerate(req, ragContext)
      : await geminiGenerate(req);
  } catch (err) {
    const error = err instanceof Error ? err.message : "AI generation failed.";
    await ensureAiIndexes(db).catch(() => undefined);
    await recordUsage(db, { userId: session.user.id, task, mode, model, usage: zeroUsage(), durationMs: 0, success: false, error, createdAt: new Date() }).catch(() => undefined);
    return fail(error, 500);
  }

  await ensureAiIndexes(db).catch(() => undefined);
  await recordUsage(db, { userId: session.user.id, task, mode, model, usage: response.usage, durationMs: response.durationMs, success: true, createdAt: new Date() }).catch(() => undefined);

  return NextResponse.json({ result: response.result, model: response.model, mode: response.mode, usage: response.usage, durationMs: response.durationMs }, { headers: noStore });
}
