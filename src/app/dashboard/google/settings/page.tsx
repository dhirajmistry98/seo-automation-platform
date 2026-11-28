import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { GoogleSettings } from "@/components/workspace/google-settings";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/google/settings" eyebrow="GOOGLE SEARCH" title="Search Console settings" description="What each setting does, the steps to change it and what to be careful about.">
    {(current) => <GoogleSettings key={current.domain} domain={current.domain} siteUrl={current.url || `https://${current.domain}`} />}
  </SiteDataPage>;
}
