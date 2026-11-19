import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getUsageStats } from "@/lib/ai/config";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? "30")));

  const db = (await clientPromise).db();
  const stats = await getUsageStats(db, session.user.id, days);
  return NextResponse.json(stats, { headers: noStore });
}
