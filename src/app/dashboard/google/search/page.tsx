import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { SearchLauncher } from "@/components/workspace/search-launcher";
import { SEARCH_SOURCE, SEARCH_STATS } from "@/lib/google/search-launcher";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/google/search" eyebrow="GOOGLE SEARCH" title="Search launcher" description="Run one search across Google and AI answer engines, and see who gets linked.">
    {(current) => <>
      <div className="ggl-stats">{SEARCH_STATS.map((stat) => <article key={stat.label}><strong>{stat.value}</strong><small>{stat.label}</small></article>)}</div>
      <p className="ggl-source">Google reported more than 5 trillion searches a year in March 2025 (<a href={SEARCH_SOURCE} target="_blank" rel="noopener noreferrer">Search Engine Land</a>). Daily and per-second figures are that number divided out. Good SEO basics also help with Google’s AI features; other AI engines may choose sources differently.</p>
      <SearchLauncher key={current.domain} domain={current.domain} />
    </>}
  </SiteDataPage>;
}
