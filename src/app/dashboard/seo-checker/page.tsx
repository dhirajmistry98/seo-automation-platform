import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SeoChecker } from "@/components/workspace/seo-checker";
import { getWorkspaceData } from "@/lib/workspace-data";

export const instant = false;

export default async function SeoCheckerPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const websites = workspace.websites
    .map((site) => ({ domain: String(site.domain), url: typeof site.url === "string" && site.url ? site.url : `https://${site.domain}` }))
    .slice(0, 12);
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> CHECK ANY PAGE</p><h1>SEO checker</h1><p>Fetch any public page right now and see its SEO health, on-page details, issues and AI search readiness.</p></div></header>
    <section className="workspace-section"><SeoChecker websites={websites} /></section>
  </>;
}
