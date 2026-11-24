import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { loadInternalLinks } from "@/lib/seo/internal-links-data";

type Context = { params: Promise<{ domain: string }> };

export async function GET(_request: Request, context: Context) {
  const headers = { "Cache-Control": "no-store" };
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404, headers });
  const result = await loadInternalLinks(db, website);
  if (!result) return NextResponse.json({ error: "No crawl data yet. Run a site audit first." }, { status: 404, headers });
  return NextResponse.json(result, { headers });
}
