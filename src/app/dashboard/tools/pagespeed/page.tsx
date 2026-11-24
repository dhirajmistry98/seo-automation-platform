import { connection } from "next/server";
import { SiteToolPage } from "@/components/workspace/site-tool-page";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteToolPage section="pagespeed" path="/dashboard/tools/pagespeed" eyebrow="PERFORMANCE" title="PageSpeed reports" description="Run Google Lighthouse for any page on your verified website: mobile or desktop scores, load metrics and the fixes that save the most time." selectedSite={typeof site === "string" ? site.toLowerCase() : undefined} />;
}
