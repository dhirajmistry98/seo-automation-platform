import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { getAiConfig, saveAiConfig } from "@/lib/ai/config";
import { isValidModel } from "@/lib/ai/models";
import { geminiTestConnection } from "@/lib/ai/gemini";
import { langchainTestConnection } from "@/lib/ai/langchain";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const db = (await clientPromise).db();
  const config = await getAiConfig(db, session.user.id);
  return NextResponse.json({ config }, { headers: noStore });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = await readJsonLimited<{ mode?: unknown; model?: unknown; testConnection?: unknown }>(request, 1024);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid request body." }, { status: parsed.status });

  const { mode, model, testConnection } = parsed.value;
  const patch: { mode?: "raw" | "langchain"; model?: string } = {};
  if (mode === "raw" || mode === "langchain") patch.mode = mode;
  if (isValidModel(model)) patch.model = model;

  const db = (await clientPromise).db();
  const config = await saveAiConfig(db, session.user.id, patch);

  let status: { ok: boolean; error?: string } | undefined;
  if (testConnection) {
    status = config.mode === "langchain"
      ? await langchainTestConnection(config.model)
      : await geminiTestConnection(config.model);
  }

  return NextResponse.json({ config, ...(status ? { connectionStatus: status } : {}) }, { headers: noStore });
}
