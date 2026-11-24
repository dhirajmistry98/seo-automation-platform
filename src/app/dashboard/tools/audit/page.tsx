import { connection } from "next/server";
import { SiteToolPage } from "@/components/workspace/site-tool-page";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteToolPage section="audit" path="/dashboard/tools/audit" eyebrow="TECHNICAL SEO" title="Technical site audit" description="Crawl your verified pages for metadata, indexability, schema, errors and internal-link problems, then review every issue." selectedSite={typeof site === "string" ? site.toLowerCase() : undefined} />;
}
