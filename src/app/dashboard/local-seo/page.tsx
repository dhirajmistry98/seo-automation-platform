import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { LocalSeoPanel } from "@/components/workspace/local-seo-panel";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/local-seo" eyebrow="LOCAL SEO" title="Local business check" description="Check that your business name, address and phone are consistent and marked up for search engines.">
    {(current) => {
      const saved = current.businessNap;
      return <LocalSeoPanel key={current.domain} domain={current.domain} saved={{ name: saved?.name ?? current.name ?? "", address: saved?.address ?? "", phone: saved?.phone ?? "" }} />;
    }}
  </SiteDataPage>;
}
