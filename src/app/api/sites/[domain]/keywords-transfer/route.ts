import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { MAX_IMPORT_CHARS, keywordsToCsv, mergeKeywords, parseKeywords } from "@/lib/keyword-transfer";

type Context = { params: Promise<{ domain: string }> };
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra?: Record<string, string>) => NextResponse.json({ error }, { status, headers: { ...noStore, ...extra } });
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Export: ?format=csv (default) or json. Only the user's own site, only keywords and competitors. */
export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return fail("Website not found.", 404);
  const keywords = strings(website.primaryKeywords);
  const competitors = strings(website.competitorDomains);
  const safeName = domain.replace(/[^a-z0-9.-]/g, "_");
  if (new URL(request.url).searchParams.get("format") === "json") {
    return new NextResponse(JSON.stringify({ domain, primaryKeywords: keywords, competitorDomains: competitors, exportedAt: new Date().toISOString() }, null, 2), { headers: { ...noStore, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${safeName}-keywords.json"` } });
  }
  return new NextResponse(keywordsToCsv(keywords, competitors), { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}-keywords.csv"`, "X-Content-Type-Options": "nosniff" } });
}

/** Import: mode "preview" shows what would change; mode "apply" saves it. */
export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.manage");
  if (!website) return fail("Website not found, or you don't have permission to change it.", 404);

  const limit = await consumeRateLimit(db, "keywords-transfer", session.user.id, 20, 60_000);
  if (!limit.allowed) return fail("Too many requests. Please wait a moment.", 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = await readJsonLimited<{ text?: unknown; mode?: unknown }>(request, MAX_IMPORT_CHARS + 2_000);
  if (!parsed.ok) return fail(parsed.status === 413 ? "That file is too large." : "Invalid request.", parsed.status);
  const text = typeof parsed.value.text === "string" ? parsed.value.text : "";
  const incoming = parseKeywords(text);
  if (!incoming.length) return fail("No keywords were found. Use a CSV with one keyword per row, or JSON like [\"keyword one\", \"keyword two\"].", 400);

  const existing = strings(website.primaryKeywords);
  const { toAdd, duplicates, overLimit } = mergeKeywords(existing, incoming);
  const summary = { found: incoming.length, toAdd, duplicates: duplicates.length, overLimit: overLimit.length, existing: existing.length };
  if (parsed.value.mode !== "apply") return NextResponse.json({ preview: summary }, { headers: noStore });
  if (!toAdd.length) return fail("Nothing new to add.", 400);

  const result = await db.collection("websites").updateOne({ _id: website._id, domain }, { $set: { primaryKeywords: [...existing, ...toAdd], updatedBy: session.user.id, updatedAt: new Date() } });
  if (!result.matchedCount) return fail("Website not found.", 404);
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, action: "website.keywords.imported", added: toAdd.length, createdAt: new Date() }).catch(() => undefined);
  return NextResponse.json({ applied: { added: toAdd.length, total: existing.length + toAdd.length } }, { headers: noStore });
}
