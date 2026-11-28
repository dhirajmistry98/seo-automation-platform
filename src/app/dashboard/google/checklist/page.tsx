import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { GoogleChecklist } from "@/components/workspace/google-checklist";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path="/dashboard/google/checklist" eyebrow="GOOGLE SEARCH" title="Google Search checklist" description="Work through the essentials for each website, with the matching guide and tool.">
    {(current) => <GoogleChecklist key={current.domain} domain={current.domain} />}
  </SiteDataPage>;
}
