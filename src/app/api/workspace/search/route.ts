import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceData } from "@/lib/workspace-data";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type Row = { keys?: string[]; clicks?: number; impressions?: number; position?: number };
type Report = { websiteDomain: string; dimension: string; rows?: Row[] };

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ websites: [], keywords: [] }, { headers: noStore });

  const workspace = await getWorkspaceData(session.user.id);
  if (!workspace.available || !workspace.db) return NextResponse.json({ websites: [], keywords: [] }, { headers: noStore });
  const limit = await consumeRateLimit(workspace.db, "workspace-search", session.user.id, 120, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many searches. Try again shortly." }, { status: 429, headers: noStore });

  const websites = workspace.websites
    .filter((site) => `${site.domain} ${site.name || ""}`.toLowerCase().includes(q))
    .slice(0, 4)
    .map((site) => ({ domain: site.domain, name: site.name || site.domain, verified: Boolean(site.verifiedAt) }));

  const domains = workspace.websites.map((site) => site.domain);
  const reports = domains.length ? await workspace.db.collection<Report>("google_search_console_reports")
    .find({ organizationId: { $in: workspace.organizationIds }, websiteDomain: { $in: domains }, dimension: "query" })
    .sort({ generatedAt: -1 }).limit(5).project<Report>({ websiteDomain: 1, dimension: 1, rows: 1 }).toArray() : [];

  const seen = new Set<string>();
  const keywords = reports.flatMap((report) => (report.rows || []).flatMap((row) => {
    const keyword = row.keys?.[0];
    if (!keyword || !keyword.toLowerCase().includes(q) || seen.has(keyword.toLowerCase())) return [];
    seen.add(keyword.toLowerCase());
    return [{ keyword, domain: report.websiteDomain, clicks: Number(row.clicks) || 0, position: Number(row.position) || 0 }];
  })).sort((a, b) => b.clicks - a.clicks).slice(0, 4);

  return NextResponse.json({ websites, keywords }, { headers: noStore });
}
