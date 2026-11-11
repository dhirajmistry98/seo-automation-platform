import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };
type DeleteBody = { confirmation?: unknown };

const siteCollections = [
  "seo_audits",
  "seo_pages",
  "seo_issues",
  "seo_issue_history",
  "seo_scores",
  "seo_authority_scores",
  "seo_visibility_reports",
  "seo_tasks",
  "seo_task_history",
  "pagespeed_results",
  "seo_research_reports",
  "integration_status",
  "google_oauth_states",
  "google_connections",
  "google_search_console_reports",
  "google_analytics_reports",
  "google_merchant_reports",
  "google_business_profile_reports",
  "wordpress_content",
  "wordpress_sync_history",
  "notifications",
  "audit_logs",
];

export async function DELETE(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let domain: string;
  try { domain = decodeURIComponent((await context.params).domain).toLowerCase(); }
  catch { return NextResponse.json({ error: "Invalid website domain." }, { status: 400 }); }
  const parsed = await readJsonLimited<DeleteBody>(request, 512);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid deletion confirmation." }, { status: parsed.status });

  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.manage");
  if (!website) return NextResponse.json({ error: "Website not found or website management is not allowed." }, { status: 404 });
  const requiredPhrase = `DELETE ${domain.toUpperCase()}`;
  if (parsed.value.confirmation !== requiredPhrase) return NextResponse.json({ error: `Type ${requiredPhrase} exactly to confirm website deletion.` }, { status: 400 });

  const ownerId = typeof website.ownerId === "string" ? website.ownerId : session.user.id;
  const ownership = website.organizationId
    ? { $or: [{ organizationId: website.organizationId }, { organizationId: { $exists: false }, ownerId }] }
    : { ownerId };
  const removed: Record<string, number> = {};
  for (const name of siteCollections) {
    const key = name === "google_connections" || name === "google_oauth_states" ? "domain" : "websiteDomain";
    const result = await db.collection(name).deleteMany({ [key]: domain, ...ownership });
    removed[name] = result.deletedCount;
  }
  const deleted = await db.collection("websites").deleteOne({ _id: website._id, domain });
  if (!deleted.deletedCount) return NextResponse.json({ error: "Website was already removed." }, { status: 404 });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, organizationId: website.organizationId, websiteDomain: domain, actorId: session.user.id, action: "website.deleted", removed, createdAt: new Date() });
  return NextResponse.json({ deleted: true, domain, removed });
}
