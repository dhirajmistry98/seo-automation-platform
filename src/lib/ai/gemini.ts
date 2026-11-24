import { GoogleGenerativeAI } from "@google/generative-ai";
import { estimateCost, DEFAULT_MODEL, FALLBACK_MODEL } from "./models";
import { buildPrompt, SYSTEM_PROMPT, taskOutputTokens, taskTemperature } from "./prompts";
import type { AiGenRequest, AiGenResponse, AiUsageMeta } from "./types";

/** Temporary Google overload (503). Checked before the generic "fetch" network message, which it also contains. */
function isOverloaded(msg: string) {
  return /\b503\b|high demand|overloaded|UNAVAILABLE/i.test(msg);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (isOverloaded(msg)) return "The AI model is very busy right now. Please try again in a moment, or pick another model in AI Studio settings.";
  if (msg.includes("no longer available") || msg.includes("404")) {
    return "The selected AI model is no longer available. Go to AI Studio → Config and choose a different model.";
  }
  if (msg.includes("API key") || msg.includes("API_KEY") || msg.includes("403")) {
    return "Invalid API key. Check your GEMINI_API_KEY in settings.";
  }
  if (msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return "AI quota exceeded. Please wait a moment and try again, or check your Google AI Studio usage limits.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
    return "Could not reach the AI service. Check your internet connection and try again.";
  }
  if (msg.includes("safety") || msg.includes("SAFETY")) {
    return "The request was blocked by the AI safety filter. Try rephrasing your input.";
  }
  return "AI generation failed. Please try again or switch to a different model in AI Studio settings.";
}

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

async function geminiGenerateOnce(req: AiGenRequest): Promise<AiGenResponse> {
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
    try {
      const result = await chat.sendMessage(prompt);
      const resp = result.response;
      const usage = extractUsage(resp.usageMetadata as Record<string, unknown> | undefined, modelId);
      return { result: resp.text(), model: modelId, mode: "raw", usage, durationMs: Date.now() - start };
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  }

  try {
    const result = await model.generateContent(prompt);
    const resp = result.response;
    const usage = extractUsage(resp.usageMetadata as Record<string, unknown> | undefined, modelId);
    return { result: resp.text(), model: modelId, mode: "raw", usage, durationMs: Date.now() - start };
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function geminiGenerate(req: AiGenRequest): Promise<AiGenResponse> {
  try {
    return await geminiGenerateOnce(req);
  } catch (err) {
    const chosen = req.model ?? DEFAULT_MODEL;
    const raw = err instanceof Error ? err.message : "";
    // friendlyError already turned the cause into text; retry once on a stable model when it was overload or retirement.
    if (chosen !== FALLBACK_MODEL && /very busy|no longer available/i.test(raw)) return geminiGenerateOnce({ ...req, model: FALLBACK_MODEL });
    throw err;
  }
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
    return { ok: false, error: friendlyError(err) };
  }
}
