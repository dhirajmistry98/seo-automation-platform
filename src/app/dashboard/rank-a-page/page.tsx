import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { KeywordOptimizer } from "@/components/workspace/keyword-optimizer";
import { getWorkspaceData } from "@/lib/workspace-data";

export const instant = false;

export default async function RankAPagePage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const websites = workspace.websites
    .map((site) => ({ domain: String(site.domain), url: typeof site.url === "string" && site.url ? site.url : `https://${site.domain}` }))
    .slice(0, 12);
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> KEYWORD OPTIMIZATION</p><h1>Rank a page</h1><p>Enter a page and the keyword you want it to rank for. Get your current Google position, what is missing on the page, and a step-by-step plan to move up.</p></div></header>
    <section className="workspace-section"><KeywordOptimizer websites={websites} /></section>
  </>;
}
