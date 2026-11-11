import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite, hasOrganizationPermission } from "@/lib/organizations";
import { SearchVisibilityReportCard } from "@/components/workspace/search-visibility-report";
import type { SearchVisibilityReport } from "@/lib/seo/search-visibility";

export const instant = false;

type Snapshot = SearchVisibilityReport & { sourceAuditId: string; sourceAuditCompletedAt: string; calculatedAt: string };

export default async function WebsiteVisibilityPage({ params }: { params: Promise<{ domain: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website, membership } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) notFound();
  const [saved, audit] = await Promise.all([
    db.collection("seo_visibility_reports").find({ organizationId: website.organizationId, websiteDomain: domain }).sort({ calculatedAt: -1 }).limit(12).toArray(),
    db.collection("seo_audits").findOne({ organizationId: website.organizationId, websiteDomain: domain, status: "completed" }, { sort: { completedAt: -1 }, projection: { auditId: 1, completedAt: 1 } }),
  ]);
  const history: Snapshot[] = saved.map((item) => ({
    version: String(item.version), pageCount: Number(item.pageCount), scores: item.scores as Snapshot["scores"], dimensions: item.dimensions as Snapshot["dimensions"], recommendations: Array.isArray(item.recommendations) ? item.recommendations as string[] : [], limitations: Array.isArray(item.limitations) ? item.limitations as string[] : [], crawlerAccess: item.crawlerAccess as Snapshot["crawlerAccess"], sourceAuditId: String(item.sourceAuditId), sourceAuditCompletedAt: item.sourceAuditCompletedAt instanceof Date ? item.sourceAuditCompletedAt.toISOString() : String(item.sourceAuditCompletedAt), calculatedAt: item.calculatedAt instanceof Date ? item.calculatedAt.toISOString() : String(item.calculatedAt),
  }));
  const role = membership?.role ?? (website.ownerId === session.user.id ? "owner" : null);
  const canRun = hasOrganizationPermission(role, "research.run");
  return <SearchVisibilityReportCard domain={domain} initialReports={history} hasCrawl={Boolean(audit)} canRun={canRun} />;
}
