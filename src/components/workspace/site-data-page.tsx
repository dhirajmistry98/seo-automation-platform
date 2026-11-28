import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SiteSwitcher } from "@/components/workspace/site-switcher";
import { getWorkspaceData } from "@/lib/workspace-data";

type Site = Awaited<ReturnType<typeof getWorkspaceData>>["websites"][number];
type Props = { selected?: string; path: string; eyebrow: string; title: string; description: string; children: (site: Site) => ReactNode };

/** A page about one of the user's websites: heading, website picker, then the content for that website. */
export async function SiteDataPage({ selected, path, eyebrow, title, description, children }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const site = workspace.websites.find((item) => item.domain === selected) ?? workspace.websites[0];
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> {eyebrow}</p><h1>{title}</h1><p>{description}</p></div></header>
    {!workspace.available && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute.</div>}
    {site ? <section className="workspace-section"><SiteSwitcher sites={workspace.websites} current={site.domain} path={path} />{children(site)}</section>
      : <section className="workspace-section"><div className="workspace-site-empty"><div><strong>Add a website first</strong><p><Link href="/dashboard/websites">Go to Websites</Link></p></div></div></section>}
  </>;
}
