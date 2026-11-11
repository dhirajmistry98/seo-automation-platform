"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Camera, CircleUserRound, Compass, Megaphone, MessageSquareText, ShoppingBag, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

type RecordValue = Record<string, unknown>;
type Identity = { name: string; email: string };
type MarketplaceMe = {
  influencer?: RecordValue | null;
  brands?: RecordValue[];
  memberships?: RecordValue[];
  applications?: RecordValue[];
  collaborations?: RecordValue[];
  instagramConnectAvailable?: boolean;
};
type InstagramState = { connected?: boolean; username?: string | null; lastInsightsAt?: string | Date | null };
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const rows = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const string = (value: unknown) => typeof value === "string" ? value : "";
const dateLabel = (value: unknown) => {
  if (!value) return "Not synced yet";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Not synced yet" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const rupees = (value: unknown) => typeof value === "number" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value / 100) : "Rate not set";
const statusLabel = (value: unknown) => string(value).replaceAll("_", " ") || "Draft";
const statusClass = (value: unknown) => string(value).toLowerCase().replace(/[^a-z_]/g, "") || "draft";

function StatusPill({ value }: { value: unknown }) {
  return <span className={`influencer-account-status is-${statusClass(value)}`}>{statusLabel(value)}</span>;
}

function QuickLink({ href, icon: Icon, title, detail }: { href: string; icon: typeof Compass; title: string; detail: string }) {
  return <Link className="influencer-account-quick-link" href={href}><span><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16} /></Link>;
}

export function InfluencerMarketingAccountScreen({ identity }: { identity: Identity }) {
  const [me, setMe] = useState<MarketplaceMe | null>(null);
  const [instagram, setInstagram] = useState<InstagramState | null>(null);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/marketplace/v1/me", { cache: "no-store" }).then(async (response) => {
        const value = await response.json() as MarketplaceMe & { error?: string };
        if (!response.ok) throw new Error(value.error || "Marketplace account details could not be loaded.");
        return value;
      }),
      fetch("/api/marketplace/instagram/insights", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<InstagramState> : null),
    ]).then(([account, social]) => {
      if (!active) return;
      setCurrentTime(Date.now());
      setMe(account);
      setInstagram(social);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Marketplace account details could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  const influencer = record(me?.influencer);
  const brands = rows(me?.brands);
  const collaborations = rows(me?.collaborations);
  const applications = rows(me?.applications);
  const instagramProfile = record(influencer.instagram);
  const followers = typeof instagramProfile.verifiedFollowers === "number" ? instagramProfile.verifiedFollowers : null;
  const verifiedAt = instagramProfile.verifiedAt;
  const verifiedTimestamp = verifiedAt ? new Date(String(verifiedAt)).getTime() : Number.NaN;
  const freshVerification = currentTime !== null && instagramProfile.source === "meta_api" && Number.isFinite(verifiedTimestamp) && currentTime - verifiedTimestamp <= 7 * 86_400_000;
  const verified = freshVerification && followers !== null && followers >= 0;
  const creatorStatus = !influencer._id ? "not created" : verified && influencer.status === "approved" ? "verified" : statusLabel(influencer.status);
  const connectedBrandMemberships = rows(me?.memberships).length;

  return <div className="marketplace-page influencer-account-page">
    <header className="influencer-account-hero">
      <span className="marketplace-eyebrow">YOUR MARKETPLACE ACCOUNT</span>
      <div className="influencer-account-hero-row">
        <div><h1>One account for your creator partnerships.</h1><p>Manage your creator profile, brand presence, connected social accounts and collaborations from this Influencer Marketing workspace.</p></div>
        <Link className="marketplace-primary" href="/influencer-marketing/discover">Explore marketplace <ArrowRight size={16} /></Link>
      </div>
      <div className="influencer-account-stat-row">
        <div><span>Creator profile</span><strong>{influencer._id ? "Set up" : "Not started"}</strong><small>{creatorStatus}</small></div>
        <div><span>Brand profiles</span><strong>{brands.length}</strong><small>{connectedBrandMemberships ? `${connectedBrandMemberships} team membership${connectedBrandMemberships === 1 ? "" : "s"}` : "Your brand workspaces"}</small></div>
        <div><span>Collaborations</span><strong>{collaborations.length}</strong><small>{applications.length} campaign application{applications.length === 1 ? "" : "s"}</small></div>
      </div>
    </header>

    {error && <div className="marketplace-banner is-warn" role="alert"><ShieldCheck size={18} /><span>{error}</span></div>}
    {!me && !error && <div className="marketplace-loading" role="status">Loading your marketplace account…</div>}
    {me && <>
      <div className="influencer-account-main-grid">
        <section className="marketplace-panel influencer-account-identity">
          <div className="influencer-account-section-head"><span className="influencer-account-icon"><CircleUserRound size={20} /></span><div><span className="marketplace-eyebrow">SIGN-IN IDENTITY</span><h2>Your marketplace login</h2></div></div>
          <div className="influencer-account-identity-row"><span className="influencer-account-avatar" aria-hidden="true">{identity.name.slice(0, 1).toUpperCase()}</span><span><strong>{identity.name}</strong><small>{identity.email || "Email address is not available"}</small></span><BadgeCheck size={18} /></div>
          <p className="marketplace-muted">This identity is used to sign in to your Influencer Marketing workspace. Creator and brand profiles below are stored separately from your sign-in details.</p>
        </section>

        <section className="marketplace-panel influencer-account-social">
          <div className="influencer-account-section-head"><span className="influencer-account-icon"><Camera size={20} /></span><div><span className="marketplace-eyebrow">SOCIAL VERIFICATION</span><h2>Instagram account</h2></div></div>
          {instagram?.connected ? <>
            <div className="influencer-account-connected"><span className="influencer-account-live-dot" /><span><strong>{instagram.username ? `@${instagram.username}` : "Professional account connected"}</strong><small>Connected through Meta authorization</small></span><BadgeCheck size={18} /></div>
            <div className="influencer-account-follower-row"><span>Marketplace follower verification</span><strong>{verified && followers !== null ? `${followers.toLocaleString("en-IN")} followers` : "Needs profile verification"}</strong></div>
            <small className="influencer-account-sync">Last insights sync: {dateLabel(instagram.lastInsightsAt)} · Public creator verification expires after 7 days.</small>
          </> : <p className="marketplace-muted">Connect an eligible Instagram professional account to verify ownership and request current follower data. Statistics are not marked verified until Meta confirms them.</p>}
          {Boolean(influencer._id) && me.instagramConnectAvailable && <Link className="marketplace-secondary influencer-account-social-action" href="/api/marketplace/meta/authorize"><Camera size={15} />{instagram?.connected ? "Reconnect Instagram" : "Connect Instagram"}<ArrowRight size={15} /></Link>}
          {!me.instagramConnectAvailable && <small className="influencer-account-note">Instagram connection is unavailable until Meta app credentials and permissions are configured.</small>}
          {!influencer._id && <Link className="marketplace-secondary influencer-account-social-action" href="/influencer-marketing/creator">Create creator profile first <ArrowRight size={15} /></Link>}
        </section>
      </div>

      <div className="influencer-account-profile-grid">
        <section className="marketplace-panel">
          <div className="influencer-account-section-head"><span className="influencer-account-icon"><UsersRound size={20} /></span><div><span className="marketplace-eyebrow">CREATOR PROFILE</span><h2>{string(influencer.displayName) || "Your creator presence"}</h2></div>{Boolean(influencer._id) && <StatusPill value={influencer.status} />}</div>
          {influencer._id ? <>
            <p className="influencer-account-profile-copy">{string(influencer.bio) || "Add a short introduction in Creator Studio so brands understand your content and audience."}</p>
            <div className="influencer-account-facts"><span>{string(influencer.location) || "Location not added"}</span><strong>{rupees(influencer.ratePaise)}</strong></div>
            <div className="marketplace-chip-row">{Array.isArray(influencer.categories) && influencer.categories.length ? influencer.categories.slice(0, 6).map((category) => <span key={String(category)}>{String(category)}</span>) : <span>Add your content categories</span>}</div>
            <div className="influencer-account-verified-line">{verified ? <><BadgeCheck size={16} /> {followers?.toLocaleString("en-IN")} followers · {string(influencer.tier) || "Eligible creator"} · verified through Meta</> : <><ShieldCheck size={16} /> Complete an eligible Instagram verification to appear as verified in discovery.</>}</div>
          </> : <p className="influencer-account-profile-copy">Create a creator profile to show brands your location, content categories, portfolio and collaboration rate.</p>}
          <Link className="marketplace-primary" href="/influencer-marketing/creator">{influencer._id ? "Manage creator profile" : "Create creator profile"}<ArrowRight size={16} /></Link>
        </section>

        <section className="marketplace-panel">
          <div className="influencer-account-section-head"><span className="influencer-account-icon"><BriefcaseBusiness size={20} /></span><div><span className="marketplace-eyebrow">BRAND WORKSPACES</span><h2>Your brand accounts</h2></div></div>
          {brands.length ? <div className="influencer-account-brand-list">{brands.slice(0, 4).map((brand) => <article key={String(brand._id)}><span className="influencer-account-brand-symbol"><BriefcaseBusiness size={17} /></span><span><strong>{string(brand.name) || "Brand profile"}</strong><small>{[string(brand.category).replaceAll("_", " "), string(brand.location)].filter(Boolean).join(" · ") || "Brand profile details"}</small></span><StatusPill value={brand.status} /></article>)}</div> : <div className="influencer-account-brand-empty"><Sparkles size={19} /><p>Create a brand profile to publish campaign briefs and invite creators.</p></div>}
          <Link className="marketplace-secondary" href="/influencer-marketing/brand">{brands.length ? "Manage brand profiles" : "Create brand profile"}<ArrowRight size={15} /></Link>
        </section>
      </div>

      <section className="influencer-account-workspace-links">
        <div><span className="marketplace-eyebrow">YOUR WORKSPACE</span><h2>Pick up where you left off</h2><p>Find partners, handle campaign work and review invitations in the same marketplace.</p></div>
        <div className="influencer-account-quick-links">
          <QuickLink href="/influencer-marketing/discover" icon={Compass} title="Discover" detail="Find approved creators and brands" />
          <QuickLink href="/influencer-marketing/campaigns" icon={Megaphone} title="Campaigns" detail="Browse briefs and applications" />
          <QuickLink href="/influencer-marketing/inbox" icon={MessageSquareText} title="Collaborations" detail="Messages, offers and deliverables" />
          <QuickLink href="/influencer-marketing/cart" icon={ShoppingBag} title="Saved creators" detail="Review your creator shortlist" />
        </div>
      </section>
    </>}
  </div>;
}
