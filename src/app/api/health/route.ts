import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const t0 = Date.now();
    await client.db().command({ ping: 1 });
    const latencyMs = Date.now() - t0;
    return Response.json({ status: "ok", timestamp: new Date().toISOString(), database: { latencyMs } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json({ status: "unavailable", timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
