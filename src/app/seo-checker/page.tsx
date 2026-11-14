import type { Metadata } from "next";
import { connection } from "next/server";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";
import { SeoChecker } from "@/components/marketing/seo-checker";
import "./seo-checker.css";

export const metadata: Metadata = {
  title: "Free SEO Checker & AI Search Readiness Test | SEO STUDIO",
  description: "Check any page for free: SEO health score, technical issues, and GEO, AEO and LLMO readiness for AI search. No sign-up needed.",
  alternates: { canonical: "/seo-checker" },
};

export const instant = false;

export default async function SeoCheckerPage() {
  await connection();
  const session = await auth();
  return (
    <>
      <SiteHeader currentUser={session?.user ? { name: session.user.name, email: session.user.email } : null} />
      <main className="seo-checker-page">
        <div className="seo-checker-hero">
          <p className="seo-checker-eyebrow">FREE TOOL</p>
          <h1>Free SEO Checker &amp; AI Search Readiness Test</h1>
          <p>See your SEO health score, the issues holding a page back, and whether ChatGPT, Claude, Perplexity and Google AI can read and cite your site.</p>
        </div>
        <SeoChecker />
      </main>
      <SiteFooter />
    </>
  );
}
