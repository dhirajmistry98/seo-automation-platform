"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, CircleAlert, Clapperboard, Dumbbell, Gem, Home, Laptop, MapPin, Megaphone, MessageSquareText, Plane, Search, ShieldCheck, Shirt, Sparkles, UserRound, UtensilsCrossed, WandSparkles } from "lucide-react";
import { CreatorTile } from "./creator-tile";
import { readJson } from "@/lib/read-json";

type Item = Record<string, unknown>;
const api = "/api/marketplace/v1";
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";

export const CREATOR_CATEGORIES = [
  { label: "Beauty", icon: WandSparkles },
  { label: "Fashion", icon: Shirt },
  { label: "Lifestyle", icon: Gem },
  { label: "Food", icon: UtensilsCrossed },
  { label: "Travel", icon: Plane },
  { label: "Fitness", icon: Dumbbell },
  { label: "Technology", icon: Laptop },
  { label: "Home", icon: Home },
  { label: "Entertainment", icon: Clapperboard },
] as const;

const FAQ = [
  { q: "How does booking a creator work?", a: "Open a creator profile, choose one of their packages and send your brief with a delivery date. When the creator accepts, the package price and scope are recorded as agreed terms and a private collaboration opens for messages, files and content review." },
  { q: "Are follower counts real?", a: "Standard creators connect their Instagram professional account through Meta. Follower counts and recent posts come from Meta’s API and must have been refreshed within the last seven days to stay listed." },
  { q: "Can I run a campaign instead of booking one creator?", a: "Yes. Publish a campaign brief from an approved brand and creators can apply with a pitch. You can also invite saved creators directly to a campaign." },
  { q: "How are payments handled?", a: "Online checkout and payouts are not enabled yet. Agreed prices are kept as a collaboration record so both sides have a clear scope; settle payment directly until marketplace payments launch." },
  { q: "What happens if content needs changes?", a: "Brands can approve each deliverable or request up to three revisions. If something goes wrong, either side can open a dispute for administrator review." },
];

export function InfluencerMarketingHome({ basePath = "/influencer-marketing" }: { basePath?: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Item>({});
  const [featured, setFeatured] = useState<Item[]>([]);
  const [rising, setRising] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [meResponse, featuredResponse, risingResponse] = await Promise.all([
          fetch(`${api}/me`, { cache: "no-store" }),
          fetch(`${api}/influencers?sort=followers_desc&limit=8`, { cache: "no-store" }),
          fetch(`${api}/influencers?sort=followers_asc&limit=4`, { cache: "no-store" }),
        ]);
        const [meData, featuredData, risingData] = await Promise.all([readJson(meResponse) as Promise<Item>, readJson(featuredResponse) as Promise<Item>, readJson(risingResponse) as Promise<Item>]);
        if (!active) return;
        if (!meResponse.ok) throw new Error(str(meData.error) || "Marketplace data could not be loaded.");
        setMe(meData);
        if (featuredResponse.ok) { setFeatured(arr(featuredData.influencers)); setTotal(Number(featuredData.total || 0)); }
        if (risingResponse.ok) setRising(arr(risingData.influencers));
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Marketplace data could not be loaded."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (location.trim()) params.set("location", location.trim());
    router.push(`${basePath}/discover${params.size ? `?${params.toString()}` : ""}`);
  }

  const influencer = obj(me.influencer);
  const brands = arr(me.brands);
  const collaborations = arr(me.collaborations);
  const pendingRequests = arr(me.applications).filter((item) => item.status === "invited").length;
  const risingIds = new Set(featured.map((item) => str(item._id)));
  const risingOnly = rising.filter((item) => !risingIds.has(str(item._id)));

  return <div className="marketplace-page mp-home">
    <section className="mp-home-hero">
      <span className="marketplace-eyebrow">INFLUENCER MARKETING · INDIA</span>
      <h1>Find and hire verified Instagram creators.</h1>
      <p>Browse creators with Meta-verified follower data, book a fixed-price package or post a campaign, and manage content approvals in one place.</p>
      <form className="mp-home-search" onSubmit={search} role="search">
        <label className="mp-home-search-field is-wide"><Search size={18} aria-hidden="true" /><span><small>Keyword</small><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Creator, niche or keyword" maxLength={80} /></span></label>
        <label className="mp-home-search-field"><Sparkles size={17} aria-hidden="true" /><span><small>Category</small><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{CREATOR_CATEGORIES.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></span></label>
        <label className="mp-home-search-field"><MapPin size={17} aria-hidden="true" /><span><small>Location</small><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Any city" maxLength={80} /></span></label>
        <button type="submit" aria-label="Search creators"><Search size={18} /><span>Search</span></button>
      </form>
      <div className="mp-home-trust"><span><BadgeCheck size={15} /> Meta-verified followers</span><span><ShieldCheck size={15} /> Brands reviewed before posting</span><span><MessageSquareText size={15} /> Private collaboration workspace</span></div>
    </section>

    {error && <div className="marketplace-banner is-warn" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}

    {!loading && (brands.length > 0 || Boolean(influencer._id)) && <div className="mp-home-summary">
      <Link href={`${basePath}/inbox`}><strong>{collaborations.length}</strong><span>Active collaborations</span></Link>
      <Link href={`${basePath}/inbox`}><strong>{pendingRequests}</strong><span>Requests awaiting you</span></Link>
      <Link href={`${basePath}/brand`}><strong>{brands.length}</strong><span>Brand profiles</span></Link>
      <Link href={`${basePath}/creator`}><strong>{influencer._id ? str(influencer.status) || "draft" : "—"}</strong><span>Creator profile</span></Link>
    </div>}

    <section aria-labelledby="mp-home-categories">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">BROWSE BY NICHE</span><h2 id="mp-home-categories">Popular categories</h2></div><Link className="mp-home-see-all" href={`${basePath}/discover`}>All creators <ArrowRight size={14} /></Link></div>
      <div className="mp-home-category-grid">{CREATOR_CATEGORIES.map(({ label, icon: Icon }) => <Link key={label} href={`${basePath}/discover?category=${encodeURIComponent(label)}`}><Icon size={20} /><span>{label}</span></Link>)}</div>
    </section>

    <section aria-labelledby="mp-home-featured">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">FEATURED</span><h2 id="mp-home-featured">Top verified creators</h2></div>{total > 0 && <Link className="mp-home-see-all" href={`${basePath}/discover`}>See all {total} <ArrowRight size={14} /></Link>}</div>
      {loading ? <div className="marketplace-loading" role="status">Loading creators…</div> : featured.length ? <div className="mp-creator-tile-grid">{featured.map((creator) => <CreatorTile key={str(creator._id)} creator={creator} basePath={basePath} />)}</div> : <div className="marketplace-empty"><Sparkles size={22} /><strong>No verified creators listed yet</strong><p>Creators appear here after connecting Instagram through Meta and passing marketplace review.</p><Link className="marketplace-primary" href={`${basePath}/creator`}>Join as a creator <ArrowRight size={15} /></Link></div>}
    </section>

    {risingOnly.length > 0 && <section aria-labelledby="mp-home-rising">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">RISING</span><h2 id="mp-home-rising">Affordable creators with engaged audiences</h2></div><Link className="mp-home-see-all" href={`${basePath}/discover?sort=followers_asc`}>Explore <ArrowRight size={14} /></Link></div>
      <div className="mp-creator-tile-grid">{risingOnly.map((creator) => <CreatorTile key={str(creator._id)} creator={creator} basePath={basePath} />)}</div>
    </section>}

    <section className="mp-home-how" aria-labelledby="mp-home-how">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">HOW IT WORKS</span><h2 id="mp-home-how">From search to published content</h2></div></div>
      <ol>
        <li><span>01</span><h3>Search verified creators</h3><p>Filter by niche, location, follower range and budget. Every listed creator has current Meta-verified Instagram data.</p></li>
        <li><span>02</span><h3>Book a package or post a campaign</h3><p>Pick a fixed-price package with your brief, or publish a campaign and let creators apply.</p></li>
        <li><span>03</span><h3>Review and approve content</h3><p>Chat, share files and approve deliverables or request revisions in a private collaboration.</p></li>
        <li><span>04</span><h3>Leave a review</h3><p>Completed work is rated by the brand, so future buyers can hire with confidence.</p></li>
      </ol>
    </section>

    <div className="marketplace-feature-grid">
      <Link href={`${basePath}/brand`} className="marketplace-feature-card"><BriefcaseBusiness size={26} /><span>FOR BRANDS</span><h3>Hire creators for your brand</h3><p>Create a brand profile, get approved, then book packages or publish campaign briefs.</p><b>Open brand studio <ArrowRight size={16} /></b></Link>
      <Link href={`${basePath}/creator`} className="marketplace-feature-card"><UserRound size={26} /><span>FOR CREATORS</span><h3>Get paid for your content</h3><p>Connect Instagram, list fixed-price packages and receive bookings and campaign invitations.</p><b>Open creator studio <ArrowRight size={16} /></b></Link>
    </div>

    <section className="mp-home-cta"><Megaphone size={22} /><div><strong>Need several creators at once?</strong><span>Publish a campaign brief and receive applications from verified creators.</span></div><Link className="marketplace-primary" href={`${basePath}/campaigns`}>Post a campaign <ArrowRight size={15} /></Link></section>

    <section className="mp-home-faq" aria-labelledby="mp-home-faq">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">FAQ</span><h2 id="mp-home-faq">Common questions</h2></div></div>
      {FAQ.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
    </section>
  </div>;
}
