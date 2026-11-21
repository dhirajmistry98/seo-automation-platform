import clientPromise from "@/lib/mongodb";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f]{40}$/.test(key)) return new Response("Not found", { status: 404 });
  const db = (await clientPromise).db();
  const file = await db.collection("mp_media_cache").findOne({ _id: key as never }, { projection: { contentType: 1, data: 1 } });
  if (!file?.data) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(file.data.buffer);
  return new Response(bytes, {
    headers: {
      "Content-Type": String(file.contentType || "image/jpeg"),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
