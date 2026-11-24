import { connection } from "next/server";
import { SiteToolPage } from "@/components/workspace/site-tool-page";

export const instant = false;

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await connection();
  const { site } = await searchParams;
  return <SiteToolPage section="plan" path="/dashboard/tools/action-plan" eyebrow="ACTION PLAN" title="SEO action plan" description="Turn audit findings into tasks with an assignee, a due date and a status, and track them until they are done." selectedSite={typeof site === "string" ? site.toLowerCase() : undefined} />;
}
