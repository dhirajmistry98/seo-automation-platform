import { connection } from "next/server";
import { SiteDataPage } from "@/components/workspace/site-data-page";
import { GoogleShortcuts } from "@/components/workspace/google-shortcuts";

type Props = { searchParams: Promise<{ site?: string }>; view: "shortcuts" | "settings"; path: string; title: string; description: string };

export async function GoogleSectionPage({ searchParams, view, path, title, description }: Props) {
  await connection();
  const { site } = await searchParams;
  return <SiteDataPage selected={site} path={path} eyebrow="GOOGLE SEARCH" title={title} description={description}>
    {(current) => <GoogleShortcuts key={current.domain} view={view} domain={current.domain} siteUrl={current.url || `https://${current.domain}`} />}
  </SiteDataPage>;
}
