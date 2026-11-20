export interface GeminiModel {
  id: string;
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
  maxOutputTokens: number;
  recommended?: boolean;
  preview?: boolean;
}

export const GEMINI_MODELS: GeminiModel[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputPerMillion: 0.15, outputPerMillion: 0.60, maxOutputTokens: 8192, recommended: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPerMillion: 1.25, outputPerMillion: 10.00, maxOutputTokens: 8192 },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", inputPerMillion: 0.10, outputPerMillion: 0.40, maxOutputTokens: 8192 },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", inputPerMillion: 0.075, outputPerMillion: 0.30, maxOutputTokens: 8192 },
];

export const DEFAULT_MODEL = "gemini-2.5-flash";

export function findModel(id: string): GeminiModel {
  return GEMINI_MODELS.find((m) => m.id === id) ?? GEMINI_MODELS[0];
}

export function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const m = findModel(modelId);
  return (promptTokens / 1_000_000) * m.inputPerMillion + (completionTokens / 1_000_000) * m.outputPerMillion;
}

export function isValidModel(id: unknown): id is string {
  return typeof id === "string" && GEMINI_MODELS.some((m) => m.id === id);
}
