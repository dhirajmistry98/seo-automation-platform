export type AiMode = "raw" | "langchain";

export type AiTask =
  | "seo-titles"
  | "meta-description"
  | "keywords"
  | "content-optimize"
  | "audit-summary"
  | "report-narrative"
  | "chat";

export interface AiConfig {
  userId: string;
  mode: AiMode;
  model: string;
  updatedAt: Date;
}

export interface AiGenContext {
  domain?: string;
  url?: string;
  title?: string;
  description?: string;
  keyword?: string;
  content?: string;
  auditData?: unknown;
  reportData?: unknown;
  question?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AiGenRequest {
  task: AiTask;
  mode?: AiMode;
  model?: string;
  context: AiGenContext;
}

export interface AiUsageMeta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiGenResponse {
  result: string;
  model: string;
  mode: AiMode;
  usage: AiUsageMeta;
  durationMs: number;
}

export interface AiUsageRecord {
  userId: string;
  task: AiTask;
  mode: AiMode;
  model: string;
  usage: AiUsageMeta;
  durationMs: number;
  success: boolean;
  error?: string;
  createdAt: Date;
}

export interface RagDocument {
  userId: string;
  domain: string;
  type: "audit" | "keyword" | "content" | "search_console" | "research";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
