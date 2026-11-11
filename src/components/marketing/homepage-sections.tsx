import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Blocks,
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  FileCheck2,
  Building2,
  Camera,
  LockKeyhole,
  MapPin,
  Search,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { BRAND, ROUTES } from "@/lib/marketing";
import clientPromise from "@/lib/mongodb";
import { profileTier } from "@/lib/marketplace/core";
import { ScrollCue } from "./scroll-cue";
import { BrandLogo } from "./brand-logo";
import { ApplicationPreview, PluginPreview } from "./product-previews";

const capabilities = [
  { icon: ShieldCheck, title: "Technical SEO audits", text: "Crawl verified websites to review indexing, metadata, links, performance and technical issues." },
  { icon: Search, title: "On-page and content SEO", text: "Review page titles, headings, content structure, internal links and practical optimization opportunities." },
  { icon: BarChart3, title: "Organic search performance", text: "Bring authorized Search Console clicks, impressions, CTR and position reports into your workspace." },
  { icon: MapPin, title: "Local SEO and rank tracking", text: "Set a supported country, city or region and language for location-aware keyword and rank research." },
  { icon: Waypoints, title: "Keyword, competitor and backlink research", text: "Use connected provider data to explore demand, competitor gaps and backlink summaries." },
  { icon: Sparkles, title: "GEO, AEO and LLMO readiness", text: "Check crawl-based structure signals for generative search, answer engines and language-model discovery." },
  { icon: Bot, title: "AI search visibility research", text: "Run provider-backed AI mention reports where platform, language and country coverage is available." },
  { icon: Blocks, title: "WordPress SEO management", text: "Connect the separate plugin to manage supported metadata and technical settings with a review history." },
  { icon: FileCheck2, title: "Reports and progress", text: "Keep audits, research snapshots, tasks and approved improvements in one place." },
  { icon: Building2, title: "SEO expert services", text: "Browse professional listings for scoped SEO, local SEO, GEO, AEO, LLMO and WordPress assistance." },
  { icon: UsersRound, title: "Brand and influencer collaborations", text: "Create reviewed profiles, find eligible partners and manage campaign conversations and deliverables." },
];

const workflow = [
  { title: "Connect", text: "Authorize a website and the data sources you want to use." },
  { title: "Understand", text: "Review audits, search signals and issues in one place." },
  { title: "Prioritize", text: "Choose an improvement based on evidence and impact." },
  { title: "Approve", text: "Check proposed changes before anything is applied." },
  { title: "Improve", text: "Apply supported WordPress updates and verify the result." },
];

const integrations = [
  { mark: "G", name: "Search Console", scope: "Queries, impressions and clicks", status: "Connect in workspace" },
  { mark: "↗", name: "PageSpeed Insights", scope: "Page experience and performance", status: "After site verification" },
  { mark: "G", name: "Business Profile", scope: "Local presence information", status: "Connect in workspace" },
  { mark: "G", name: "Merchant Center", scope: "Product visibility signals", status: "Connect in workspace" },
  { mark: "W", name: "WordPress", scope: "Approved on-page and technical updates", status: "Separate plugin" },
  { mark: "S", name: "Shopify", scope: "Possible future integration", status: "Not available" },
];

const faqs = [
  ["What are the two products?", "The SEO Application is the central workspace for analysis, research and monitoring. The separate WordPress SEO Plugin manages supported on-page and technical settings in WordPress."],
  ["How can influencers find brand collaborations?", "Create an influencer profile with your portfolio, categories and rates, then connect Instagram for official verification. Once your profile is reviewed, browse approved brands and open campaigns, then apply with a pitch. Creators of every audience size can qualify when their account is connected and reviewed."],
  ["How can brands find and contact influencers?", "Create a brand profile and submit it for review. After approval, publish a campaign, browse verified creator profiles and send an invitation tied to your brief. Private messaging opens after an application or invitation is accepted."],
  ["Can I hire an SEO, GEO, AEO or LLMO specialist?", "Yes. Sign in to browse reviewed expert service listings, send a project brief and compare proposals. Eligible orders can use Razorpay checkout when the deployment has valid merchant credentials; payout transfers are not enabled, and live payment acceptance still requires sandbox and production verification."],
  ["When can a creator and brand message each other?", "A private campaign conversation is created after the other party accepts an application or invitation. They can then discuss scope and pricing, agree on terms, and manage deliverables in that conversation."],
  ["Are integrations available now?", "Integrations depend on implementation, account access and authorization. A source should only appear as connected after an authorized connection is in place."],
  ["Will the platform change my website automatically?", "High-impact changes are intended to wait for your review. Applying a change also depends on supported actions and the authorization you provide."],
  ["Can I use the application without WordPress?", "Yes. The application is designed as a central SEO workspace. WordPress is only needed for direct site management through the plugin."],
  ["How are SEO Health and Authority different?", "SEO Health is based on documented technical and on-page rules. The SEO Authority Index is a separate proprietary measure and is not equivalent to third-party scores."],
  ["How do I begin local SEO for a location anywhere in the world?", "Add and verify your website, then choose a country and a provider-supported city or region with the matching language in website settings or research. Location availability and metrics depend on the data provider; some reports are country-level and some services cover only selected markets."],
  ["What does AI visibility mean in this workspace?", "GEO, AEO and LLMO readiness scores describe technical and content-structure signals found in your latest crawl. AI mention reports are separate third-party snapshots. Neither type guarantees rankings, citations or answers in an AI product."],
  ["Where can I read the platform terms?", "The Terms and Conditions explain account responsibilities, data connections, marketplace use, service availability and limitations. Read them at /terms before using the platform."],
] as const;

function SectionIntro({
  index,
  eyebrow,
  title,
  text,
  light = false,
}: {
  index: string;
  eyebrow: string;
  title: string;
  text: string;
  light?: boolean;
}) {
  return (
    <div className={`landing-section-intro${light ? " landing-section-intro-light" : ""}`}>
      <span className="landing-section-index">{index}</span>
      <div>
        <p className="landing-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="landing-section-copy">{text}</p>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section id="home" className="landing-hero">
      <video className="landing-hero-video" autoPlay loop muted playsInline preload="auto" poster="/seo-hero-glow.jpg" aria-hidden="true" tabIndex={-1}>
        <source src="/seo-studio-hero.mp4" type="video/mp4" />
      </video>
      <div className="landing-hero-image" aria-hidden="true" />
      <div className="landing-hero-grid" aria-hidden="true" />
      <div className="landing-hero-inner mx-auto max-w-7xl px-5 sm:px-8">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><span className="landing-eyebrow-dot" /> SEO STUDIO · LOCAL SEARCH, CLEARLY</p>
          <h1 aria-label="Meet SEO Studio. Search, made clearer.">
            <span className="landing-hero-word">Meet</span>{" "}
            <span className="landing-hero-word">SEO</span>{" "}
            <span className="landing-hero-word">Studio.</span><br />
            <em><span className="landing-hero-word">Search,</span>{" "}<span className="landing-hero-word">made</span>{" "}<span className="landing-hero-word">clearer.</span></em>
          </h1>
          <p className="landing-hero-lede">Audit your site, find meaningful keyword opportunities, and review every recommended update in one focused workspace.</p>
          <div className="landing-hero-actions">
            <Link href={ROUTES.signIn} className="button-primary">Explore the workspace <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <a href="#products" className="landing-text-link">See how it works <ArrowDown size={15} aria-hidden="true" /></a>
          </div>
          <p className="landing-hero-note"><span /> Live data appears only after an authorized source is connected.</p>
        </div>
      </div>
    </section>
  );
}

export function GettingStartedSection() {
  const steps = [
    { icon: Waypoints, title: "How SEO Studio works", text: "See how website data becomes useful findings, reviewed priorities and practical next steps.", href: "/guide#how-it-works", action: "See the workflow" },
    { icon: ChartNoAxesCombined, title: "What the platform offers", text: "Explore SEO, local search, AI visibility, WordPress tools and expert services.", href: "/guide#offerings", action: "Explore the platform" },
    { icon: SearchCheck, title: "Grow search visibility", text: "Follow a realistic plan for technical health, helpful content, research and measurement.", href: "/guide#grow-rankings", action: "Read the growth guide" },
    { icon: UsersRound, title: "Influencer collaborations", text: "Learn how brands and creators set up profiles, discover partners and run campaigns.", href: "/guide#influencer-marketing", action: "Explore collaborations" },
  ];
  return (
    <section id="guidance" className="landing-guidance">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro index="07" eyebrow="A practical guide" title="Start with your site, market and data." text="New to SEO Studio? Explore how the platform works, what it offers, how to improve search visibility and how creator collaborations fit in." />
        <ol className="landing-guidance-grid">
          {steps.map(({ icon: Icon, title, text, href, action }, index) => (
            <li key={title}>
              <span className="landing-guidance-step">0{index + 1}</span>
              <span className="landing-guidance-icon"><Icon size={18} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link href={href}>{action}<ArrowUpRight size={14} aria-hidden="true" /></Link>
            </li>
          ))}
        </ol>
        <p className="landing-guidance-note"><ShieldCheck size={15} aria-hidden="true" /> Read the full first-time-user guide for setup steps, feature details, realistic ranking guidance and creator workflows. <Link href="/guide">Open the complete guide <ArrowUpRight size={14} aria-hidden="true" /></Link></p>
      </div>
    </section>
  );
}

function PrinciplesSection() {
  const items = [
    { icon: Activity, title: "Evidence first", text: "See the data behind each finding." },
    { icon: ShieldCheck, title: "You stay in control", text: "Review changes before supported updates." },
    { icon: Waypoints, title: "One connected workflow", text: "Move from research to approved action." },
  ];
  return (
    <section id="principles" className="landing-principles">
      <div className="mx-auto grid max-w-7xl px-5 sm:px-8 md:grid-cols-3">
        {items.map(({ icon: Icon, title, text }, index) => (
          <div className="landing-principle" key={title}>
            <span className="landing-principle-number">0{index + 1}</span>
            <Icon size={17} aria-hidden="true" />
            <div><h2>{title}</h2><p>{text}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductsSection() {
  return (
    <section id="products" className="landing-products">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro index="01" eyebrow="The product system" title="Two focused tools. One clearer way to work." text="Use the application to find and understand opportunities. Use the WordPress plugin to manage supported changes where you publish." />
        <article id="application" className="landing-product-row landing-product-app">
          <div className="landing-product-copy">
            <span className="landing-product-kicker"><ChartNoAxesCombined size={15} /> Product 01 · Web application</span>
            <h3>See the whole search picture.</h3>
            <p>Bring website health, keyword research, competitor context and authorized search data into one practical workspace.</p>
            <ul>
              <li><Check size={14} /> Website audits and issue tracking</li>
              <li><Check size={14} /> Keywords and search performance</li>
              <li><Check size={14} /> Evidence-based recommendations</li>
            </ul>
            <a className="landing-text-link" href="#features">Explore the application <ArrowRight size={15} /></a>
          </div>
          <div className="landing-product-visual"><ApplicationPreview /></div>
        </article>
        <article id="wordpress" className="landing-product-row landing-product-plugin">
          <div className="landing-product-visual"><PluginPreview /></div>
          <div className="landing-product-copy">
            <span className="landing-product-kicker"><Blocks size={15} /> Product 02 · WordPress plugin</span>
            <h3>Make approved updates where you publish.</h3>
            <p>Manage metadata and technical SEO settings in WordPress, with a review step and a visible change history.</p>
            <ul>
              <li><Check size={14} /> Titles, descriptions and focus keywords</li>
              <li><Check size={14} /> Canonicals, schema and sitemaps</li>
              <li><Check size={14} /> Redirects and bulk editing</li>
            </ul>
            <a className="landing-text-link" href="#workflow">See the review workflow <ArrowRight size={15} /></a>
          </div>
        </article>
        <div id="ecosystem" className="landing-connection-note">
          <span className="landing-connection-icon"><LockKeyhole size={17} /></span>
          <p><strong>Connected by authorization.</strong> Shared data and product synchronization depend on implementation and the access you approve.</p>
          <span className="landing-connection-line" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function marketplaceText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function marketplaceCategories(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
}

function marketplaceRate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value / 100);
}

async function MarketplaceSection() {
  let creators: Record<string, unknown>[] = [];
  let brands: Record<string, unknown>[] = [];
  try {
    const db = (await clientPromise).db();
    const verifiedSince = new Date(Date.now() - 7 * 86_400_000);
    [creators, brands] = await Promise.all([
      db.collection("mp_influencers").find({
        status: "approved",
        "instagram.source": "meta_api",
        "instagram.verifiedFollowers": { $gte: 0 },
        "instagram.verifiedAt": { $gte: verifiedSince },
      }, { projection: { displayName: 1, bio: 1, categories: 1, location: 1, ratePaise: 1, "instagramUsername": 1, "instagram.username": 1, "instagram.verifiedFollowers": 1, "instagram.verifiedAt": 1, "instagram.source": 1, "instagram.profilePictureUrl": 1, "instagram.recentMedia": 1 } }).sort({ "instagram.verifiedFollowers": -1 }).limit(3).toArray(),
      db.collection("mp_brands").find({ status: "approved" }, { projection: { ownerId: 0 } }).sort({ createdAt: -1 }).limit(3).toArray(),
    ]);
  } catch {
    // The public marketing page remains available if MongoDB is temporarily offline.
  }

  return (
    <section id="marketplace" className="landing-marketplace">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro index="02" eyebrow="Creator partnerships" title="Meet the people behind the next good campaign." text="Brands can discover verified creators. Influencers can find approved businesses and campaigns. Profiles appear here only after review." />
        <div className="landing-marketplace-directories">
          <article className="landing-marketplace-directory">
            <header>
              <span className="landing-marketplace-heading-icon"><Camera size={18} aria-hidden="true" /></span>
              <div><p className="landing-eyebrow">FOR BRANDS</p><h3>Verified creators</h3></div>
              <span className="landing-marketplace-count">{creators.length ? `${creators.length} featured` : "Directory opening"}</span>
            </header>
            {creators.length ? <div className="landing-marketplace-profiles">{creators.map((creator) => {
              const instagram = creator.instagram && typeof creator.instagram === "object" ? creator.instagram as Record<string, unknown> : {};
              const followers = typeof instagram.verifiedFollowers === "number" ? instagram.verifiedFollowers : 0;
              const tier = profileTier(creator);
              const username = marketplaceText(instagram.username);
              const profilePictureUrl = marketplaceText(instagram.profilePictureUrl);
              const recentMedia = Array.isArray(instagram.recentMedia) ? instagram.recentMedia.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, 3) : [];
              return <article className="landing-marketplace-profile" key={String(creator._id)}>
                <span className="landing-marketplace-profile-icon">{profilePictureUrl ? <Image src={profilePictureUrl} alt="" fill sizes="38px" unoptimized /> : <UsersRound size={18} aria-hidden="true" />}</span>
                <div className="landing-marketplace-profile-main"><div className="landing-marketplace-profile-title"><strong>{marketplaceText(creator.displayName)}</strong><span><BadgeCheck size={13} aria-label="Verified" /> {tier ? `${tier} creator` : "Creator"}</span></div>
                  <small>{username ? `@${username}` : "Instagram creator"} · {followers.toLocaleString("en-IN")} verified followers</small>
                  <p>{marketplaceText(creator.bio) || marketplaceCategories(creator.categories).join(" · ")}</p>
                  <div className="landing-marketplace-profile-meta"><span><MapPin size={13} aria-hidden="true" /> {marketplaceText(creator.location) || "India"}</span>{marketplaceRate(creator.ratePaise) && <strong>From {marketplaceRate(creator.ratePaise)}</strong>}</div>
                </div>
                {recentMedia.length > 0 && <div className="landing-marketplace-media-preview">{recentMedia.map((media, index) => { const src = marketplaceText(media.thumbnailUrl) || marketplaceText(media.mediaUrl); return src ? <a key={marketplaceText(media.id) || index} href={marketplaceText(media.permalink) || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : undefined)} target="_blank" rel="noopener noreferrer" aria-label={`Open a recent Instagram post by ${marketplaceText(creator.displayName)}`}><Image src={src} alt="" fill sizes="(max-width: 800px) 25vw, 120px" unoptimized /></a> : null; })}</div>}
              </article>;
            })}</div> : <div className="landing-marketplace-empty"><UsersRound size={20} aria-hidden="true" /><div><strong>Creator profiles are being reviewed</strong><p>Verified creators will appear here when they join and complete approval.</p></div></div>}
            <Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fdiscover" className="landing-marketplace-directory-link">Discover creators <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </article>

          <article className="landing-marketplace-directory">
            <header>
              <span className="landing-marketplace-heading-icon"><Building2 size={18} aria-hidden="true" /></span>
              <div><p className="landing-eyebrow">FOR CREATORS</p><h3>Approved brands</h3></div>
              <span className="landing-marketplace-count">{brands.length ? `${brands.length} featured` : "Directory opening"}</span>
            </header>
            {brands.length ? <div className="landing-marketplace-profiles">{brands.map((brand) => {
              const offerings = marketplaceCategories(brand.offerings);
              const website = marketplaceText(brand.website);
              return <article className="landing-marketplace-profile" key={String(brand._id)}>
                <span className="landing-marketplace-profile-icon"><Building2 size={18} aria-hidden="true" /></span>
                <div className="landing-marketplace-profile-main"><div className="landing-marketplace-profile-title"><strong>{marketplaceText(brand.name)}</strong><span><BadgeCheck size={13} aria-label="Approved" /> Approved</span></div>
                  <small>{marketplaceText(brand.category).replaceAll("_", " ") || "Business"} · {marketplaceText(brand.location) || "India"}</small>
                  <p>{marketplaceText(brand.description) || offerings.join(" · ") || "Discover products and services from this business."}</p>
                  <div className="landing-marketplace-profile-meta">{offerings.length > 0 && <span>{offerings.join(" · ")}</span>}{website && <a href={website} target="_blank" rel="noopener noreferrer">Visit website ↗</a>}</div>
                </div>
              </article>;
            })}</div> : <div className="landing-marketplace-empty"><Building2 size={20} aria-hidden="true" /><div><strong>Brand profiles are being reviewed</strong><p>Approved businesses will appear here for creators to explore.</p></div></div>}
            <Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fdiscover" className="landing-marketplace-directory-link">Explore brands and campaigns <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </article>
        </div>
        <div className="landing-marketplace-start">
          <article><span className="landing-marketplace-start-icon"><UserRound size={18} aria-hidden="true" /></span><div><p className="landing-eyebrow">FOR INFLUENCERS</p><h3>Create your creator profile</h3><p>Connect Instagram, add your portfolio and rates, then apply to open brand campaigns after profile review.</p></div><Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fcreator">Join as an influencer <ArrowUpRight size={15} aria-hidden="true" /></Link></article>
          <article><span className="landing-marketplace-start-icon"><Building2 size={18} aria-hidden="true" /></span><div><p className="landing-eyebrow">FOR BRANDS</p><h3>Create your brand profile</h3><p>Add your business and offerings. After approval, publish campaigns, discover verified creators and invite them to collaborate.</p></div><Link href="/login?callbackUrl=%2Finfluencer-marketing%2Fbrand">Join as a brand <ArrowUpRight size={15} aria-hidden="true" /></Link></article>
          <article><span className="landing-marketplace-start-icon"><SearchCheck size={18} aria-hidden="true" /></span><div><p className="landing-eyebrow">FOR BUSINESSES &amp; EXPERTS</p><h3>Hire a search specialist</h3><p>Request scoped help with SEO, GEO, AEO, LLMO, local search or WordPress from reviewed professionals.</p></div><Link href="/login?callbackUrl=%2Fmarketplace%2Fservices">Explore expert services <ArrowUpRight size={15} aria-hidden="true" /></Link></article>
        </div>
        <p className="landing-marketplace-note"><ShieldCheck size={15} aria-hidden="true" /> Creator follower counts come from a current authorized Instagram connection. No sample profiles or manually entered audience numbers are shown.</p>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="landing-capabilities">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro index="03" eyebrow="Inside the application" title="Useful signals, clearly organized." text="Start with the evidence. Each area is designed to answer a practical question about your site and search visibility." />
        <div className="landing-capability-list">
          {capabilities.map(({ icon: Icon, title, text }, index) => (
            <article className="landing-capability" key={title}>
              <span className="landing-capability-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="landing-capability-icon"><Icon size={17} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <p className="landing-footnote"><Sparkles size={14} /> SEO Health and SEO Authority are separate measures, with different purposes and methods.</p>
      </div>
    </section>
  );
}

export function AutomationSection() {
  return (
    <section id="workflow" className="landing-workflow">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro index="04" eyebrow="A careful workflow" title="From finding an issue to making a change." text="Use the evidence, confirm the opportunity, and decide what to do. The review stays with you." light />
        <ol className="landing-workflow-steps">
          {workflow.map(({ title, text }, index) => (
            <li key={title}>
              <span className="landing-workflow-index">0{index + 1}</span>
              <span className="landing-workflow-rule" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
              {index === 3 && <span className="landing-approval-tag"><BadgeCheck size={13} /> Your approval</span>}
            </li>
          ))}
        </ol>
        <div className="landing-approval-note"><ShieldCheck size={17} /><p><strong>Nothing important happens silently.</strong> Supported changes require authorization and your approval before they are applied.</p></div>
      </div>
    </section>
  );
}

export function IntegrationsSection() {
  return (
    <section id="integrations" className="landing-integrations">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="landing-integrations-layout">
          <SectionIntro index="05" eyebrow="Connected data" title="Know where each signal comes from." text="Connectors are presented with clear availability. Data is shown only after an authorized source is connected." />
          <div className="landing-integration-ledger" role="list" aria-label="Data integrations and availability">
            {integrations.map(({ mark, name, scope, status }) => (
              <div className="landing-integration-row" key={name} role="listitem">
                <span className={`landing-integration-mark${mark === "W" ? " is-wordpress" : ""}`} aria-hidden="true">{mark}</span>
                <div className="landing-integration-name"><h3>{name}</h3><p>{scope}</p></div>
                <span className={`landing-integration-status${status === "Not available" ? " is-unavailable" : ""}`}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="landing-faq">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.72fr_1.28fr]">
        <SectionIntro index="06" eyebrow="Questions, answered" title="Clarity before you connect." text="A few details about how the products work and what to expect from the platform." />
        <div className="landing-faq-list">
          {faqs.map(([question, answer]) => (
            <details className="landing-faq-item" key={question}>
              <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="landing-cta-wrap">
      <div className="landing-cta mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="landing-cta-copy">
          <p className="landing-eyebrow"><span className="landing-eyebrow-dot" /> Your next useful SEO action</p>
          <h2>Find the issue.<br /><em>Make the improvement.</em></h2>
          <p>Bring analysis, research and approved WordPress updates into one connected workflow.</p>
          <Link href={ROUTES.signIn} className="button-primary">Get started <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="landing-cta-mark" aria-hidden="true"><Activity size={32} /></div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const groups = [
    { title: "Explore", links: [["Home", "/#home"], ["Features", "/#features"], ["Practical guide", "/guide"], ["Get started", "/guide#first-steps"], ["Marketplace", "/#marketplace"], ["Integrations", "/#integrations"], ["Resources", "/#faq"]] },
    { title: "Products", links: [["SEO Application", "/#application"], ["WordPress Plugin", "/#wordpress"]] },
    { title: "Legal", links: [["Terms and Conditions", "/terms"]] },
  ];

  return (
    <footer id="footer" className="landing-footer">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="landing-footer-main">
          <div className="landing-footer-brand">
            <Link href={ROUTES.home} className="flex items-center gap-3">
              <BrandLogo className="footer-brand-logo" />
              <span><strong>{BRAND.name}</strong><small>{BRAND.tagline}</small></span>
            </Link>
            <p>SEO audits, search insights and approved WordPress updates in one focused workspace.</p>
          </div>
          <div className="landing-footer-nav">
            {groups.map((group) => (
              <div className="landing-footer-links" key={group.title}>
                <h2>{group.title}</h2>
                {group.links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
              </div>
            ))}
            <div className="landing-footer-links">
              <h2>Workspace</h2>
              <Link href={ROUTES.signIn}>Sign in</Link>
              <Link href={ROUTES.signIn}>Get started <ArrowUpRight size={13} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© 2026 {BRAND.name}. All rights reserved.</span>
          <span>Evidence first. Your approval always.</span>
        </div>
        <div className="landing-footer-wordmark" aria-hidden="true">SEO STUDIO</div>
      </div>
    </footer>
  );
}

export function HomePageContent() {
  return (
    <>
      <HeroSection />
      <ScrollCue />
      <PrinciplesSection />
      <ProductsSection />
      <MarketplaceSection />
      <FeaturesSection />
      <AutomationSection />
      <IntegrationsSection />
      <FAQSection />
      <GettingStartedSection />
      <FinalCTA />
    </>
  );
}
