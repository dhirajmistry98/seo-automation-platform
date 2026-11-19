import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { GEMINI_MODELS } from "@/lib/ai/models";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ models: GEMINI_MODELS }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
