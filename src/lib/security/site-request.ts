import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite, type OrganizationPermission } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const noStore = { "Cache-Control": "no-store" };
export const failure = (error: string, status: number, headers?: Record<string, string>) => Response.json({ error }, { status, headers: { ...noStore, ...headers } });

/** The checks every POST on one website needs: same origin, signed in, allowed on the site, within the rate limit, small JSON body. */
export async function guardSitePost<T extends object>(request: Request, params: Promise<{ domain: string }>, options: { permission: OrganizationPermission; bucket: string; limit: number }) {
  if (!isSameOriginRequest(request)) return { response: sameOriginError() };
  const session = await auth();
  if (!session?.user?.id) return { response: failure("Authentication required.", 401) };
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, options.permission);
  if (!website) return { response: failure("Website not found.", 404) };
  const limit = await consumeRateLimit(db, options.bucket, session.user.id, options.limit, 10 * 60_000);
  if (!limit.allowed) return { response: failure("Too many requests. Please wait a few minutes.", 429, { "Retry-After": String(limit.retryAfterSeconds) }) };
  const parsed = await readJsonLimited<T>(request, 6_144);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return { response: failure("Invalid request.", parsed.ok ? 400 : parsed.status) };
  return { db, domain, website, userId: session.user.id, body: parsed.value as T };
}
