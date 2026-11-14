import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Check,
  Globe2,
  MapPin,
  Search,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Practical Guide | SEO STUDIO",
  alternates: { canonical: "/guide" },
  description: "A clear first-time guide to SEO Studio: website audits, search visibility, local SEO, AI search readiness, WordPress and creator collaborations.",
};

export const instant = false;

const guideContents = [
  ["how-it-works", "How SEO Studio works"],
  ["offerings", "What the platform offers"],
  ["grow-rankings", "Grow search visibility"],
  ["local-ai-search", "Local and AI search"],
  ["influencer-marketing", "Brand and creator collaborations"],
  ["first-steps", "Your first steps"],
] as const;

const offerings = [
  { icon: SearchCheck, title: "SEO audits and issue tracking", text: "Crawl a verified site to review technical health, page metadata, content structure, links and opportunities. Findings are tied to the latest crawl." },
  { icon: Search, title: "Keyword and market research", text: "Explore search demand, local rank checks, competitor context and backlinks where a connected provider supports the selected market." },
  { icon: Globe2, title: "GEO, AEO and LLMO readiness", text: "Review crawl-based signals that help search engines and answer systems understand a site. Provider-backed AI mention reports are separate snapshots." },
  { icon: Blocks, title: "WordPress SEO workflow", text: "Manage supported metadata and technical settings through the plugin, with an approval step and a change history." },
  { icon: BarChart3, title: "Performance and reporting", text: "Bring authorized search and performance data together with audits and research. Each report should show its source, date and coverage." },
  { icon: UsersRound, title: "Expert services and creator partnerships", text: "Find scoped help for SEO, local search, GEO, AEO, LLMO and WordPress, or build brand–influencer collaborations through reviewed profiles." },
];

const growthSteps = [
  { title: "Make the site reachable", text: "Verify ownership, make important pages crawlable, and fix blocking technical issues such as broken links, redirects and indexability problems." },
  { title: "Match pages to real searches", text: "Choose the market and language, research search intent, then make each important page useful for one clear audience need." },
  { title: "Improve the page itself", text: "Write distinct titles and descriptions, use clear headings, answer the topic thoroughly, add descriptive image text and link related pages together." },
  { title: "Build trust and local relevance", text: "Keep business details consistent, publish evidence of expertise, earn relevant mentions and maintain accurate local profiles where they apply." },
  { title: "Measure, learn and repeat", text: "Compare impressions, clicks, queries, rankings and technical checks over time. Prioritize changes using evidence instead of chasing one score." },
];

const firstSteps = [
  { title: "Create your account and workspace", text: "Use the account you want associated with your websites, reports or marketplace profile.", href: "/login", action: "Create or sign in" },
  { title: "Add and verify your website", text: "Confirm domain ownership before crawling so the audit is connected to a site you control.", href: "/login?callbackUrl=%2Fdashboard%2Fwebsites", action: "Set up a website" },
  { title: "Choose a market and language", text: "Select the country, city or region and language you want to research. Provider coverage varies by location.", href: "/login?callbackUrl=%2Fdashboard%2Fresearch", action: "Set a target market" },
  { title: "Run an audit and review the evidence", text: "Start with technical and on-page checks, then turn useful findings into tasks you can prioritize.", href: "/login?callbackUrl=%2Fdashboard%2Ftools", action: "Open SEO tools" },
  { title: "Connect data only when you need it", text: "Authorize a listed integration to see its reports. Live metrics are not displayed until an authorized source returns data.", href: "/login?callbackUrl=%2Fdashboard%2Fintegrations", action: "Review integrations" },
];

function GuideChapter({
  id,
  number,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="marketing-guide-chapter">
      <div className="marketing-guide-chapter-heading">
        <span className="marketing-guide-chapter-number">{number}</span>
        <div>
          <p className="marketing-guide-kicker">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="marketing-guide-chapter-intro">{intro}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function GuidePage() {
  await connection();
  const session = await auth();

  return (
    <>
      <a href="#guide-main" className="skip-link">Skip to guide</a>
      <SiteHeader currentUser={session?.user ? { name: session.user.name, email: session.user.email } : null} />
      <main id="guide-main" className="marketing-guide">
        <section className="marketing-guide-hero">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <p className="marketing-guide-eyebrow"><span aria-hidden="true" /> FIRST-TIME USER GUIDE</p>
            <h1>Search growth, with a plan you can follow.</h1>
            <p className="marketing-guide-lede">Learn how SEO Studio works, what the platform offers, how to build toward better search visibility, and how brands and creators can collaborate.</p>
            <div className="marketing-guide-hero-actions">
              <Link href="#first-steps" className="button-primary">Start with the first steps <ArrowRight size={15} aria-hidden="true" /></Link>
              <Link href="/#home" className="marketing-guide-text-link">Back to SEO Studio</Link>
            </div>
            <p className="marketing-guide-public-note"><ShieldCheck size={15} aria-hidden="true" /> This guide is public. You can read it before creating an account.</p>
          </div>
        </section>

        <div className="marketing-guide-layout mx-auto max-w-7xl px-5 sm:px-8">
          <aside className="marketing-guide-toc">
            <p>IN THIS GUIDE</p>
            <nav aria-label="Guide sections">
              {guideContents.map(([id, label], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{label}</a>)}
            </nav>
          </aside>

          <div className="marketing-guide-content">
            <GuideChapter id="how-it-works" number="01" eyebrow="The workflow" title="How SEO Studio works" intro="Start with evidence from a website you control. Move from diagnosis to prioritized work, then measure what changed.">
              <ol className="marketing-guide-step-list">
                <li><span>01</span><div><h3>Connect a website</h3><p>Add the domain and verify ownership before the platform crawls it.</p></div></li>
                <li><span>02</span><div><h3>Set a goal and target market</h3><p>Choose the country, city or region, language and search goals that matter to your business.</p></div></li>
                <li><span>03</span><div><h3>Collect signals</h3><p>Run an audit and connect authorized sources when you need their specific reports.</p></div></li>
                <li><span>04</span><div><h3>Review, improve and measure</h3><p>Prioritize evidence-backed tasks, approve supported changes, and revisit the results over time.</p></div></li>
              </ol>
            </GuideChapter>

            <GuideChapter id="offerings" number="02" eyebrow="What we offer" title="One workspace for search and growth work" intro="Use the areas that fit your goals. Live metrics and provider reports depend on an available integration, account authorization and market coverage.">
              <div className="marketing-guide-offering-grid">
                {offerings.map(({ icon: Icon, title, text }) => <article key={title}>
                  <span className="marketing-guide-offering-icon"><Icon size={17} aria-hidden="true" /></span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                </article>)}
              </div>
              <p className="marketing-guide-callout"><span><Check size={15} aria-hidden="true" /></span> Check the Integrations page for current connection status. SEO Studio labels a source as connected only after authorization and a successful response.</p>
            </GuideChapter>

            <GuideChapter id="grow-rankings" number="03" eyebrow="A practical SEO plan" title="How to work toward stronger rankings" intro="Search visibility grows from a combination of technical access, relevant pages, trust and consistent measurement. No platform can guarantee a top position.">
              <ol className="marketing-guide-growth-list">
                {growthSteps.map(({ title, text }, index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
              </ol>
              <p className="marketing-guide-callout"><span><Sparkles size={15} aria-hidden="true" /></span> Treat every score as a way to organize work, not as a promise of rankings, traffic or AI citations.</p>
            </GuideChapter>

            <GuideChapter id="local-ai-search" number="04" eyebrow="Local and AI search" title="Choose where you want to be found" intro="The platform supports location-aware research for markets around the world when a connected data provider covers the selected place and language.">
              <div className="marketing-guide-two-column">
                <article><MapPin size={19} aria-hidden="true" /><h3>Local SEO</h3><p>Pick the country, city or region that reflects your customers. Review local intent, landing pages, business information and location-specific results. Coverage and granularity vary by provider.</p></article>
                <article><Waypoints size={19} aria-hidden="true" /><h3>GEO, AEO and LLMO</h3><p>Make pages easier to crawl, understand and cite: answer real questions clearly, use well-structured content and keep facts consistent. Crawl checks describe technical readiness; AI answer and mention coverage changes by product and market.</p></article>
              </div>
              <p className="marketing-guide-callout"><span><Globe2 size={15} aria-hidden="true" /></span> A location can be selected anywhere, but a live rank or AI report is only possible where the active provider supports it.</p>
            </GuideChapter>

            <GuideChapter id="influencer-marketing" number="05" eyebrow="Creator partnerships" title="How brand and influencer collaborations work" intro="The marketplace helps brands and creators find a fit, agree on a campaign and manage the work in one place.">
              <div className="marketing-guide-role-grid">
                <article>
                  <p className="marketing-guide-kicker">FOR CREATORS</p><h3>Build a trusted profile</h3>
                  <ol><li>Create an influencer account and add your portfolio, categories, location and rates.</li><li>Connect Instagram through the official authorization flow so the marketplace can verify ownership and current account statistics. There is no minimum follower count.</li><li>After review, find approved brands and campaigns, then apply with your proposal.</li></ol>
                  <Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fcreator">Create an influencer profile</Link>
                </article>
                <article>
                  <p className="marketing-guide-kicker">FOR BRANDS</p><h3>Find the right creator</h3>
                  <ol><li>Create a brand profile with your business, offerings and audience.</li><li>After approval, publish a brief with budget, deliverables and deadlines.</li><li>Review applications or invite suitable verified creators to collaborate.</li></ol>
                  <Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fbrand">Create a brand profile</Link>
                </article>
              </div>
              <div className="marketing-guide-collab-flow"><span>Application or invitation</span><ArrowRight size={14} aria-hidden="true" /><span>Accepted campaign conversation</span><ArrowRight size={14} aria-hidden="true" /><span>Agreed scope and deliverables</span><ArrowRight size={14} aria-hidden="true" /><span>Submit, review and complete</span></div>
              <p className="marketing-guide-callout"><span><ShieldCheck size={15} aria-hidden="true" /></span> Instagram counts must come from an eligible official Meta connection; screenshots and manually entered counts are not verified statistics. Creators of every audience size may apply for review. Payment and payout options are shown only where enabled for your account and region.</p>
            </GuideChapter>

            <GuideChapter id="first-steps" number="06" eyebrow="Start here" title="Your first session, step by step" intro="You can read the guide without an account. To use reports or marketplace tools, create an account and complete the relevant setup.">
              <ol className="marketing-guide-checklist">
                {firstSteps.map(({ title, text, href, action }, index) => <li key={title}>
                  <span className="marketing-guide-check-number">0{index + 1}</span>
                  <div><h3>{title}</h3><p>{text}</p><Link href={href}>{action}</Link></div>
                </li>)}
              </ol>
              <div className="marketing-guide-last-step">
                <div><p className="marketing-guide-kicker">READY TO COLLABORATE?</p><h3>Join the creator marketplace</h3><p>Choose the account type that matches your role, complete your profile and follow the review steps before contacting partners.</p></div>
                <div><Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fcreator">Join as a creator</Link><Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fbrand">Join as a brand</Link></div>
              </div>
            </GuideChapter>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
