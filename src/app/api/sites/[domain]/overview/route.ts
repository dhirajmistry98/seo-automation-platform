import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { loadSiteOverview } from "@/lib/seo/site-overview-data";

type Context = { params: Promise<{ domain: string }> };

export async function GET(_request: Request, context: Context) {
  const headers = { "Cache-Control": "no-store" };
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404, headers });
  return NextResponse.json({ domain, overview: await loadSiteOverview(db, website) }, { headers });
}
