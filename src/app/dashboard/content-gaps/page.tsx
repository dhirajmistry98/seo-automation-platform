import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { ContentGapFinder } from "@/components/workspace/content-gap-finder";
import clientPromise from "@/lib/mongodb";
import { brandTermsFor } from "@/lib/seo/keyword-strategy";
import { loadCrawledPages } from "@/lib/seo/keyword-strategy-data";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/content-gaps" eyebrow="CONTENT" title="Content gap finder" description="Find searches you already appear for but have no page about.">
    {async (current) => {
      const pages = await loadCrawledPages((await clientPromise).db(), current).catch(() => []);
      return <ContentGapFinder key={current.domain} domain={current.domain} brandTerms={brandTermsFor(current.domain, current.name)} pages={pages} />;
    }}
  </SiteDataPage>;
}
