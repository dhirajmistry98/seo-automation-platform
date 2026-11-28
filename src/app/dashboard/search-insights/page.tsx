import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { SearchInsightsPanel } from "@/components/workspace/search-insights-panel";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/search-insights" eyebrow="GOOGLE SEARCH CONSOLE" title="Position tracking" description="Positions, winners and losers, content decay, low click-through, brand traffic, landing pages and real-visitor speed.">
    {(current) => <SearchInsightsPanel key={current.domain} domain={current.domain} />}
  </SiteDataPage>;
}
