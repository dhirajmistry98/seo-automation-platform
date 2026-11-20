import type { Db } from "mongodb";
import { DEFAULT_MODEL } from "./models";
import type { AiConfig, AiMode, AiTask, AiUsageMeta, AiUsageRecord } from "./types";

const globalForAiIndexes = globalThis as typeof globalThis & { aiIndexesPromise?: Promise<void> };

export async function getAiConfig(db: Db, userId: string): Promise<AiConfig> {
  const doc = await db.collection("ai_config").findOne({ userId });
  return {
    userId,
    mode: (doc?.mode as AiMode) || "raw",
    model: typeof doc?.model === "string" ? doc.model : DEFAULT_MODEL,
    updatedAt: doc?.updatedAt instanceof Date ? doc.updatedAt : new Date(0),
  };
}

export async function saveAiConfig(db: Db, userId: string, patch: Partial<Pick<AiConfig, "mode" | "model">>): Promise<AiConfig> {
  const now = new Date();
  await db.collection("ai_config").updateOne(
    { userId },
    { $set: { ...patch, userId, updatedAt: now } },
    { upsert: true },
  );
  return getAiConfig(db, userId);
}

export async function recordUsage(db: Db, record: AiUsageRecord): Promise<void> {
  await db.collection("ai_usage").insertOne(record);
}

export async function getUsageStats(db: Db, userId: string, limitDays = 30) {
  const since = new Date(Date.now() - limitDays * 86_400_000);
  const rows = await db
    .collection<AiUsageRecord>("ai_usage")
    .find({ userId, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const totalTokens = rows.reduce((s, r) => s + (r.usage?.totalTokens ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.usage?.estimatedCostUsd ?? 0), 0);
  const byTask: Record<string, number> = {};
  for (const r of rows) byTask[r.task] = (byTask[r.task] ?? 0) + 1;

  return {
    totalRequests: rows.length,
    successCount: rows.filter((r) => r.success).length,
    totalTokens,
    totalCostUsd: totalCost,
    byTask,
    recent: rows.slice(0, 20).map((r) => ({
      task: r.task,
      mode: r.mode,
      model: r.model,
      tokens: r.usage?.totalTokens ?? 0,
      costUsd: r.usage?.estimatedCostUsd ?? 0,
      durationMs: r.durationMs,
      success: r.success,
      error: r.error,
      createdAt: r.createdAt,
    })),
  };
}

export async function ensureAiIndexes(db: Db): Promise<void> {
  if (!globalForAiIndexes.aiIndexesPromise) {
    globalForAiIndexes.aiIndexesPromise = Promise.all([
      db.collection("ai_usage").createIndex({ userId: 1, createdAt: -1 }, { name: "ai_usage_user_time" }),
      db.collection("ai_usage").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400, name: "ai_usage_ttl" }),
      db.collection("ai_config").createIndex({ userId: 1 }, { unique: true, name: "ai_config_user" }),
      db.collection("ai_documents").createIndex({ userId: 1, domain: 1, type: 1 }, { name: "ai_docs_lookup" }),
      db.collection("ai_documents").createIndex({ content: "text" }, { name: "ai_docs_text" }),
    ]).then(() => undefined).catch((err) => { globalForAiIndexes.aiIndexesPromise = undefined; throw err; });
  }
  await globalForAiIndexes.aiIndexesPromise;
}

export function truncate(value: unknown, maxChars: number): string {
  const str = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return str.length > maxChars ? str.slice(0, maxChars) + "…" : str;
}

export function safeTask(value: unknown): AiTask | null {
  const valid: AiTask[] = ["seo-titles", "meta-description", "keywords", "content-optimize", "audit-summary", "report-narrative", "chat"];
  return valid.includes(value as AiTask) ? (value as AiTask) : null;
}

export function safeMode(value: unknown): AiMode | null {
  return value === "raw" || value === "langchain" ? value : null;
}

export function zeroUsage(): AiUsageMeta {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}
