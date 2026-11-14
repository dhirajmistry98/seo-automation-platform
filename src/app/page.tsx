import type { Metadata } from "next";
import { connection } from "next/server";
import { auth } from "@/auth";
import { HomePageContent, SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";
import { JsonLd } from "@/components/blog/blog-chrome";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const title = "SEO STUDIO — SEO Automation Platform";
const description = "Analyze, optimize and automate your website SEO with one connected ecosystem: a central SEO Application and a dedicated WordPress SEO Plugin.";

export const metadata: Metadata = {
  title,
  description,
  // Website ownership verification for this site inside SEO Studio.
  other: { "seo-studio-verification": "c04b5e0d85d7402b9af099c69318c8bb743df175c3209d00" },
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
      {/* Identifies the organization and site for search engines and AI assistants (GEO). */}
      {siteUrl && <JsonLd data={[
        { "@context": "https://schema.org", "@type": "Organization", "@id": `${siteUrl}/#organization`, name: "SEO STUDIO", url: siteUrl, logo: `${siteUrl}/seo-studio-icon.png`, description },
        { "@context": "https://schema.org", "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "SEO STUDIO", url: siteUrl, description, publisher: { "@id": `${siteUrl}/#organization` } },
      ]} />}
    </>
  );
}
