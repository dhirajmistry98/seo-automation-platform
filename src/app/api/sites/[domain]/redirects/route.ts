import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { listRedirects, upsertRedirect, deleteRedirect, validateRedirectRule, normalizeRedirectPath } from "@/lib/seo/redirects";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ domain: string }> };

const noStore = { "Cache-Control": "no-store" };
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status, headers: noStore });

export async function GET(_req: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const { domain: rawDomain } = await context.params;
  const domain = decodeURIComponent(rawDomain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.read").catch(() => ({ website: null }));
  if (!website) return fail("Website not found.", 404);
  const redirects = await listRedirects(db, session.user.id, domain);
  return NextResponse.json({ redirects }, { headers: noStore });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const { domain: rawDomain } = await context.params;
  const domain = decodeURIComponent(rawDomain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.manage").catch(() => ({ website: null }));
  if (!website) return fail("Website not found or access denied.", 403);

  const limit = await consumeRateLimit(db, "redirects:write", session.user.id, 120, 60_000);
  if (!limit.allowed) return fail("Too many requests.", 429);

  const parsed = await readJsonLimited<{ source?: unknown; destination?: unknown; type?: unknown; note?: unknown }>(request, 4_096);
  if (!parsed.ok) return fail("Invalid request body.", parsed.status);
  const { source: rawSource, destination: rawDest, type, note } = parsed.value;

  const source = normalizeRedirectPath(typeof rawSource === "string" ? rawSource : "");
  const destination = typeof rawDest === "string" ? rawDest.trim() : "";
  const redirectType = type === "302" ? "302" : "301";
  const noteStr = typeof note === "string" ? note.trim().slice(0, 200) : "";

  const error = validateRedirectRule(source, destination);
  if (error) return fail(error);

  await upsertRedirect(db, session.user.id, domain, { source, destination, type: redirectType, note: noteStr });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return fail("Authentication required.", 401);
  const { domain: rawDomain } = await context.params;
  const domain = decodeURIComponent(rawDomain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.manage").catch(() => ({ website: null }));
  if (!website) return fail("Website not found or access denied.", 403);

  const url = new URL(request.url);
  const source = url.searchParams.get("source")?.trim();
  if (!source) return fail("source query parameter is required.");

  await deleteRedirect(db, session.user.id, domain, source);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
