import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";

export async function GET(_request: Request, context: { params: Promise<{ domain: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "content.edit");
  if (!website) return NextResponse.json({ error: "Website not found or content access is not allowed." }, { status: 404 });
  const posts = await db.collection("wordpress_content").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ syncedAt: -1 }).limit(100).project({ _id: 0, wordpressPostId: 1, title: 1, url: 1, postType: 1, status: 1, meta: 1, syncedAt: 1 }).toArray();
  return NextResponse.json({ posts, syncedAt: posts[0]?.syncedAt || null }, { headers: { "Cache-Control": "no-store" } });
}
