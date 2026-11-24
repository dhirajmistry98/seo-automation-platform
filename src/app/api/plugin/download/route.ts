import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createZip } from "@/lib/zip";

// Fixed list: the download can only ever contain these plugin files.
const PLUGIN_FILES = ["seo-studio.php", "readme.txt"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to download the plugin." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const root = path.join(process.cwd(), "wordpress-plugin", "seo-studio");
    const entries = await Promise.all(PLUGIN_FILES.map(async (file) => ({ name: `seo-studio/${file}`, data: await readFile(path.join(root, file)) })));
    return new NextResponse(new Uint8Array(createZip(entries)), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="seo-studio-connector.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("plugin download failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "The plugin file is unavailable right now." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
