import { connection } from "next/server";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isDataForSeoConfigured } from "@/lib/integrations/dataforseo";
import { ResearchWorkbench } from "@/components/workspace/research-workbench";
import { AuthorityIndexCard, type AuthoritySnapshot } from "@/components/workspace/authority-index-card";
import { getWebsiteSeoTarget } from "@/lib/seo/target";

export const instant = false;

export default async function WebsiteResearchPage({ params }: { params: Promise<{ domain: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "reports.read");
  if (!website) notFound();
  const reports = await db.collection("seo_research_reports").find({ organizationId: website.organizationId, websiteDomain: domain }, { projection: { organizationId: 0 } }).sort({ fetchedAt: -1 }).limit(20).toArray();
  const authorityRecords = await db.collection("seo_authority_scores")
    .find({ organizationId: website.organizationId, websiteDomain: domain })
    .sort({ calculatedAt: -1 }).limit(12)
    .project({ _id: 0, score: 1, confidence: 1, version: 1, calculatedAt: 1, components: 1, inputs: 1 })
    .toArray();
  const authorityHistory = authorityRecords.map((item) => ({
    score: Number(item.score), confidence: Number(item.confidence), version: String(item.version),
    calculatedAt: item.calculatedAt instanceof Date ? item.calculatedAt.toISOString() : String(item.calculatedAt),
    components: item.components as AuthoritySnapshot["components"], inputs: item.inputs as AuthoritySnapshot["inputs"],
  }));
  const history = reports.map((report) => ({
    _id: String(report._id),
    kind: report.kind as "keywords" | "rank" | "backlinks" | "competitors",
    competitorDomain: typeof report.competitorDomain === "string" ? report.competitorDomain : undefined,
    query: String(report.query || ""),
    locationCode: Number(report.locationCode || 2840),
    locationName: typeof report.locationName === "string" ? report.locationName : undefined,
    countryCode: typeof report.countryCode === "string" ? report.countryCode : undefined,
    countryName: typeof report.countryName === "string" ? report.countryName : undefined,
    countryLocationCode: Number.isSafeInteger(report.countryLocationCode) ? Number(report.countryLocationCode) : undefined,
    languageCode: String(report.languageCode || "en"),
    device: report.device === "mobile" ? "mobile" as const : report.device === "desktop" ? "desktop" as const : undefined,
    source: report.source === "scheduled" ? "scheduled" : "manual",
    result: Array.isArray(report.result) ? report.result as Array<Record<string, unknown>> : [],
    fetchedAt: report.fetchedAt instanceof Date ? report.fetchedAt.toISOString() : String(report.fetchedAt),
  }));
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> SEARCH INTELLIGENCE</p><h1>{website.name || domain}</h1><p>Keyword, organic position, and backlink research for {domain}.</p></div><Link href="/dashboard/research" className="workspace-outline-link"><ArrowLeft size={15} /> All websites</Link></header>
    <AuthorityIndexCard domain={domain} initialHistory={authorityHistory} />
    <ResearchWorkbench domain={domain} verified={Boolean(website.verifiedAt)} configured={isDataForSeoConfigured()} competitorDomains={Array.isArray(website.competitorDomains) ? website.competitorDomains.filter((item): item is string => typeof item === "string") : []} initialHistory={history} initialTarget={getWebsiteSeoTarget(website as unknown as Parameters<typeof getWebsiteSeoTarget>[0])} />
  </>;
}
