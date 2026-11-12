import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { processNextCrawlJob } from "@/lib/seo/crawl-worker";

export const maxDuration = 300;
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

async function run(request: Request) {
  if (!authorized(request)) return json({ error: "A valid CRON_SECRET bearer token is required." }, 401);
  const db = (await clientPromise).db();
  return json(await processNextCrawlJob(db));
}

export async function POST(request: Request) { return run(request); }
export async function GET(request: Request) { return run(request); }
