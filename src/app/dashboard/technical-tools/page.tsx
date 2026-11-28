import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { TechnicalToolkit } from "@/components/workspace/technical-toolkit";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/technical-tools" eyebrow="TECHNICAL SEO" title="Technical toolkit" description="Sitemaps, robots.txt, links, duplicates, crawl changes, page checks, images, server logs and IndexNow.">
    {(current) => current.verifiedAt
      ? <TechnicalToolkit key={current.domain} domain={current.domain} siteUrl={current.url || `https://${current.domain}`} />
      : <div className="workspace-alert" role="status">Verify ownership of {current.domain} in Websites to use these tools.</div>}
  </SiteDataPage>;
}
