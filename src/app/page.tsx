import type { Metadata } from "next";
import { connection } from "next/server";
import { auth } from "@/auth";
import { HomePageContent, SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const title = "SEO STUDIO — SEO Automation Platform";
const description = "Analyze, optimize and automate your website SEO with one connected ecosystem: a central SEO Application and a dedicated WordPress SEO Plugin.";

export const metadata: Metadata = {
  title,
  description,
  ...(siteUrl ? {
    metadataBase: new URL(siteUrl),
    alternates: { canonical: "/" },
    openGraph: { type: "website", url: "/", title, description, siteName: "SEO STUDIO" },
  } : {
    openGraph: { type: "website", title, description, siteName: "SEO STUDIO" },
  }),
};

export const instant = false;

export default async function HomePage() {
  await connection();
  const session = await auth();
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader currentUser={session?.user ? { name: session.user.name, email: session.user.email } : null} />
      <main id="main-content">
        <HomePageContent />
      </main>
      <SiteFooter />
    </>
  );
}
