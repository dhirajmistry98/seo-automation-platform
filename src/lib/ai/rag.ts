/**
 * RAG document store backed by MongoDB text search.
 * Stores website data (audits, keywords, content) as searchable documents and
 * retrieves the most relevant chunks to inject as context into AI prompts.
 * Does not require MongoDB Atlas Vector Search.
 */
import type { Db } from "mongodb";
import type { RagDocument } from "./types";
import { truncate } from "./config";

export async function ingestDocument(
  db: Db,
  doc: Omit<RagDocument, "createdAt">,
): Promise<void> {
  await db.collection("ai_documents").updateOne(
    { userId: doc.userId, domain: doc.domain, type: doc.type },
    { $set: { ...doc, createdAt: new Date() } },
    { upsert: true },
  );
}

export async function retrieveContext(
  db: Db,
  userId: string,
  domain: string,
  query: string,
  maxChars = 2000,
): Promise<string> {
  if (!query.trim()) return "";

  // MongoDB text search over ingested documents for this user + domain.
  const results = await db
    .collection<RagDocument>("ai_documents")
    .find(
      { userId, domain, $text: { $search: query } },
      { projection: { score: { $meta: "textScore" }, content: 1, type: 1 } },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(5)
    .toArray();

  if (!results.length) return "";

  const chunks = results.map((r) => `[${r.type}]\n${truncate(r.content, 400)}`);
  return truncate(chunks.join("\n\n"), maxChars);
}

export async function listIngestedDomains(db: Db, userId: string): Promise<string[]> {
  const docs = await db
    .collection<RagDocument>("ai_documents")
    .distinct("domain", { userId });
  return docs.filter((d): d is string => typeof d === "string");
}

export async function deleteDocuments(db: Db, userId: string, domain: string): Promise<number> {
  const result = await db.collection("ai_documents").deleteMany({ userId, domain });
  return result.deletedCount ?? 0;
}

/** Build a context-augmented prompt for RAG-enabled chat. */
export function withRagContext(prompt: string, context: string): string {
  if (!context.trim()) return prompt;
  return `Use the following website data as context when answering. Only reference information present in this data — do not fabricate metrics.\n\n--- CONTEXT ---\n${context}\n--- END CONTEXT ---\n\n${prompt}`;
}
