/**
 * Ingests website data into the RAG document store so the AI assistant can
 * answer grounded questions about a specific site.
 * Accepts audit results, keyword lists, content snippets, or any structured text.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { ingestDocument, listIngestedDomains, deleteDocuments } from "@/lib/ai/rag";
import { ensureAiIndexes } from "@/lib/ai/config";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const noStore = { "Cache-Control": "no-store" };
const fail = (msg: string, status = 400, extra?: Record<string, string>) =>
  NextResponse.json({ error: msg }, { status, headers: { ...noStore, ...extra } });

const ALLOWED_TYPES = ["audit", "keyword", "content", "search_console", "research"] as const;
type DocType = typeof ALLOWED_TYPES[number];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const db = (await clientPromise).db();
  const domains = await listIngestedDomains(db, session.user.id);
  return NextResponse.json({ domains }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);

  const db = (await clientPromise).db();
  const ingestLimit = await consumeRateLimit(db, "ai:ingest", session.user.id, 60, 60_000);
  if (!ingestLimit.allowed) return fail("Too many ingest requests.", 429, { "Retry-After": String(ingestLimit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ domain?: unknown; type?: unknown; content?: unknown; metadata?: unknown }>(request, 65_536);
  if (!parsed.ok) return fail("Invalid request body.", parsed.status);

  const { domain, type, content, metadata } = parsed.value;

  if (typeof domain !== "string" || !domain.trim()) return fail("domain is required.");
  if (!ALLOWED_TYPES.includes(type as DocType)) return fail(`type must be one of: ${ALLOWED_TYPES.join(", ")}.`);
  if (typeof content !== "string" || content.trim().length < 10) return fail("content must be a non-empty string.");

  // Verify the user has access to this website.
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain.trim(), "websites.read").catch(() => ({ website: null, membership: null }));
  if (!site) return fail("Website not found or access denied.", 403);

  await ensureAiIndexes(db).catch(() => undefined);
  await ingestDocument(db, {
    userId: session.user.id,
    domain: domain.trim(),
    type: type as DocType,
    content: content.trim().slice(0, 50_000),
    metadata: (typeof metadata === "object" && metadata !== null ? metadata : {}) as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain")?.trim();
  if (!domain) return fail("domain query parameter is required.");

  const db = (await clientPromise).db();
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "websites.read").catch(() => ({ website: null, membership: null }));
  if (!site) return fail("Website not found or access denied.", 403);

  const deleted = await deleteDocuments(db, session.user.id, domain);
  return NextResponse.json({ deleted }, { headers: noStore });
}
