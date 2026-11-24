import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { loadKeywordStrategy } from "@/lib/seo/keyword-strategy-data";
import { strategyToCsv } from "@/lib/seo/keyword-strategy";

type Context = { params: Promise<{ domain: string }> };

export async function GET(request: Request, context: Context) {
  const headers = { "Cache-Control": "no-store" };
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404, headers });
  const result = await loadKeywordStrategy(db, website);
  if (!result) return NextResponse.json({ error: "No Search Console query data yet. Connect Search Console and load a query report first." }, { status: 404, headers });
  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new Response(strategyToCsv(result.strategy), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${domain}-keyword-strategy.csv"`, "X-Content-Type-Options": "nosniff" } });
  }
  return NextResponse.json(result, { headers });
}
