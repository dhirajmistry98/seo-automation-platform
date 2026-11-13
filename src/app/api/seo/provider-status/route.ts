import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DATAFORSEO_DASHBOARD_URL, getDataForSeoAccountStatus } from "@/lib/integrations/dataforseo";

/** DataForSEO account health for the research screen. `?fresh=1` re-checks after the user fixes their account. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const status = await getDataForSeoAccountStatus(fresh);
  return NextResponse.json({ ...status, actionUrl: DATAFORSEO_DASHBOARD_URL }, { headers: { "Cache-Control": "no-store" } });
}
