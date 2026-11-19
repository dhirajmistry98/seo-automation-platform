import { GoogleGenerativeAI } from "@google/generative-ai";
import { estimateCost, DEFAULT_MODEL } from "./models";
import { buildPrompt, SYSTEM_PROMPT, taskOutputTokens, taskTemperature } from "./prompts";
import type { AiGenRequest, AiGenResponse, AiUsageMeta } from "./types";

function client(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  return new GoogleGenerativeAI(key);
}

function extractUsage(usageMetadata: Record<string, unknown> | undefined, modelId: string): AiUsageMeta {
  const promptTokens = Number(usageMetadata?.promptTokenCount ?? 0);
  const completionTokens = Number(usageMetadata?.candidatesTokenCount ?? 0);
  const totalTokens = Number(usageMetadata?.totalTokenCount ?? 0) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens, estimatedCostUsd: estimateCost(modelId, promptTokens, completionTokens) };
}

export async function geminiGenerate(req: AiGenRequest): Promise<AiGenResponse> {
  const start = Date.now();
  const modelId = req.model ?? DEFAULT_MODEL;
  const task = req.task;
  const ctx = req.context;

  const genAI = client();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: taskOutputTokens(task),
      temperature: taskTemperature(task),
    },
  });

  const prompt = buildPrompt(task, ctx);

  if (task === "chat" && ctx.history?.length) {
    const chat = model.startChat({
      history: ctx.history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
    });
    const result = await chat.sendMessage(prompt);
    const resp = result.response;
    const usage = extractUsage(resp.usageMetadata as Record<string, unknown> | undefined, modelId);
    return { result: resp.text(), model: modelId, mode: "raw", usage, durationMs: Date.now() - start };
  }

  const result = await model.generateContent(prompt);
  const resp = result.response;
  const usage = extractUsage(resp.usageMetadata as Record<string, unknown> | undefined, modelId);
  return { result: resp.text(), model: modelId, mode: "raw", usage, durationMs: Date.now() - start };
}

export async function geminiTestConnection(modelId = DEFAULT_MODEL): Promise<{ ok: boolean; error?: string }> {
  try {
    const genAI = client();
    const model = genAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent("Reply with the single word: connected");
    const text = result.response.text().toLowerCase();
    if (!text.includes("connected")) throw new Error("Unexpected response.");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
