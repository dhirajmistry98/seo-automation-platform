"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/ui/safe-image";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, CircleAlert, CircleCheck, Clock3, Compass, Eye, Heart, Link2, Megaphone, MessageCircle, Package, Share2, ShoppingCart, Star, Timer, UserPlus, UsersRound } from "lucide-react";
import { RESPONSE_WINDOW_HOURS, USAGE_RIGHTS, USAGE_RIGHTS_LABEL } from "@/lib/marketplace/booking-cart";
import { CreatorTile, RatingBadge, StarRow } from "./creator-tile";
import { readJson } from "@/lib/read-json";

type Item = Record<string, unknown>;
const api = "/api/marketplace/v1";
const compact = (value: number) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
/** Country name and flag from an ISO code (flag built from regional indicator letters). */
function countryLabel(code: string) {
  if (code === "Other" || !/^[A-Z]{2}$/.test(code)) return { name: code, flag: "" };
  let name = code; try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { /* keep the code */ }
  return { name, flag: String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)) };
}
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown) => typeof value === "string" ? value : "";
const money = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof value === "number" ? value / 100 : 0);
const date = (value: unknown) => {
  if (!value) return "Not available";
  const valueDate = new Date(String(value));
  return Number.isNaN(valueDate.getTime()) ? "Not available" : valueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};
const isoDateInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export function CreatorMarketplaceProfile({ creatorId, basePath = "/influencer-marketing" }: { creatorId: string; basePath?: string }) {
  const [creator, setCreator] = useState<Item | null>(null);
  const [reviews, setReviews] = useState<Item[]>([]);
  const [similar, setSimilar] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<Item[]>([]);
  const [brands, setBrands] = useState<Item[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareLabel, setShareLabel] = useState("Share");
  const [showAllMedia, setShowAllMedia] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const response = await fetch(`${api}/influencers/${encodeURIComponent(creatorId)}`, { cache: "no-store" });
        const payload = await readJson(response) as Item;
        if (!response.ok) throw new Error(str(payload.error) || "Creator profile could not be loaded.");
        if (active) { setCreator(obj(payload.influencer)); setReviews(arr(payload.reviews)); setSimilar(arr(payload.similar)); }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Creator profile could not be loaded."); }
    }
    async function loadBrandActions() {
      const [cartResult, campaignResult, meResult] = await Promise.allSettled([
        fetch(`${api}/cart`, { cache: "no-store" }).then(async (response) => response.ok ? readJson(response) as Promise<Item> : {} as Item),
        fetch(`${api}/campaigns?mine=1`, { cache: "no-store" }).then(async (response) => response.ok ? readJson(response) as Promise<Item> : {} as Item),
        fetch(`${api}/me`, { cache: "no-store" }).then(async (response) => response.ok ? readJson(response) as Promise<Item> : {} as Item),
      ]);
      if (!active) return;
      if (cartResult.status === "fulfilled") setSaved(arr(cartResult.value.items).some((item) => str(item.creatorId) === creatorId));
      if (campaignResult.status === "fulfilled") setCampaigns(arr(campaignResult.value.campaigns).filter((campaign) => campaign.status === "open" && new Date(String(campaign.deadline)).getTime() > Date.now()));
      if (meResult.status === "fulfilled") setBrands(arr(meResult.value.brands).filter((brand) => brand.status !== "rejected" && brand.status !== "suspended"));
    }
    void loadProfile();
    void loadBrandActions();
    return () => { active = false; };
  }, [creatorId]);

  async function post(path: string, body: Item) {
    const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await readJson(response) as Item;
    if (!response.ok) throw new Error(str(payload.error) || "Could not complete this action. Please try again.");
    return payload;
  }

  const [cartAdded, setCartAdded] = useState(false);
  async function addPackageToCart() {
    setBusy(true); setError(""); setMessage("");
    try {
      await post("/booking-cart", { influencerProfileId: creatorId, packageIndex: selectedPackage });
      setCartAdded(true); window.dispatchEvent(new Event("marketplace:cart-changed")); setMessage("Package added to your cart.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The package could not be added to your cart."); }
    finally { setBusy(false); }
  }
  async function saveCreator() {
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = await post("/cart", { influencerId: creatorId });
      window.dispatchEvent(new Event("marketplace:cart-changed"));
      setSaved(true);
      setMessage(payload.alreadyAdded ? "This creator is already in your saved list." : "Creator saved to your shortlist. No payment was taken.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Creator could not be saved."); }
    finally { setBusy(false); }
  }

  async function inviteToCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await post(`/campaigns/${encodeURIComponent(String(data.get("campaignId") || ""))}/invite`, { influencerProfileId: creatorId, message: data.get("message") });
      setMessage("Invitation sent. The creator can review it and negotiate in Collaborations.");
      form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Campaign invitation could not be sent."); }
    finally { setBusy(false); }
  }

  async function requestBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await post(`/influencers/${encodeURIComponent(creatorId)}/bookings`, { brandId: data.get("brandId"), packageIndex: selectedPackage, brief: data.get("brief"), deadline: data.get("deadline"), usageRights: data.get("usageRights"), message: data.get("message") });
      setMessage("Booking request sent. When the creator accepts, the package price and scope become the agreed terms and a private collaboration opens in your inbox. No payment is taken.");
      setBookingOpen(false);
      form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Booking request could not be sent."); }
    finally { setBusy(false); }
  }

  async function shareProfile() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: str(creator?.displayName) || "Creator profile", url });
      else { await navigator.clipboard.writeText(url); setShareLabel("Link copied"); window.setTimeout(() => setShareLabel("Share"), 1800); }
    } catch { /* Share sheet dismissed. */ }
  }

  if (!creator && !error) return <div className="marketplace-page"><div className="marketplace-loading" role="status">Loading creator profile…</div></div>;
  if (!creator) return <div className="marketplace-page"><Link className="marketplace-back" href={`${basePath}/discover`}><ArrowLeft size={14} /> Back to creators</Link><div className="marketplace-banner is-warn" role="alert"><CircleAlert size={18} /><span>{error}</span></div></div>;

  const instagram = obj(creator.instagram);
  const media = arr(instagram.recentMedia).slice(0, 9);
  const packages = arr(creator.packages);
  const activePackage = packages[selectedPackage] || {};
  const categories = Array.isArray(creator.categories) ? creator.categories.map(String) : [];
  const portfolio = Array.isArray(creator.portfolio) ? creator.portfolio.filter((url): url is string => typeof url === "string" && url.startsWith("https://")) : [];
  const username = str(instagram.username);
  const instagramUrl = username ? `https://www.instagram.com/${encodeURIComponent(username.replace(/^@/, ""))}/` : "";
  const rating = obj(creator.rating);
  const bookable = Boolean(creator.bookable) && packages.length > 0;
  const minDeliveryDays = typeof activePackage.deliveryDays === "number" ? activePackage.deliveryDays : 7;

  return <div className="marketplace-page creator-marketplace-profile">
    <Link className="marketplace-back creator-marketplace-back" href={`${basePath}/discover`}><ArrowLeft size={14} /> Back to creators</Link>
    <div className="creator-marketplace-topline"><span className="marketplace-eyebrow">INFLUENCER MARKETING / CREATOR PROFILE</span><div><button type="button" className="creator-marketplace-quiet-action" onClick={() => void shareProfile()}><Share2 size={15} />{shareLabel}</button>{!creator.owner && <button type="button" className="creator-marketplace-quiet-action" disabled={busy || saved} onClick={() => void saveCreator()}><Heart size={15} />{saved ? "Saved" : "Save creator"}</button>}</div></div>
    <h1 className="creator-marketplace-title">{str(creator.displayName) || "Creator profile"}</h1>
    <div className="mp-profile-subline"><RatingBadge rating={creator.rating} size={15} /><span>{str(creator.location) || "India"}</span>{Number(creator.completedCollaborations || 0) > 0 && <span>{Number(creator.completedCollaborations)} completed collaboration{Number(creator.completedCollaborations) === 1 ? "" : "s"}</span>}</div>
    <div className="creator-marketplace-gallery" aria-label={`${str(creator.displayName)} portfolio`}>
      {media.slice(0, 3).map((post, index) => { const image = str(post.thumbnailUrl) || str(post.mediaUrl); return image ? <a key={str(post.id) || index} href={str(post.permalink) || instagramUrl || undefined} target="_blank" rel="noopener noreferrer"><SafeImage src={image} alt={str(post.caption) || "Creator Instagram portfolio"} fill sizes="(max-width: 760px) 100vw, 45vw" unoptimized /><span>{str(post.mediaType).toLowerCase() === "video" ? "VIDEO" : "INSTAGRAM"}</span></a> : null; })}
      {!media.length && <div className="creator-marketplace-gallery-empty"><Camera size={28} /><strong>Creator portfolio</strong><span>Recent images are shown when Meta returns public media for this connected account.</span></div>}
      {media.length > 3 && <button type="button" className="creator-marketplace-gallery-count" onClick={() => setShowAllMedia((current) => !current)}><Camera size={15} /> {showAllMedia ? "Hide" : `Show all ${media.length} photos`}</button>}
    </div>
    {showAllMedia && media.length > 3 && <section className="creator-marketplace-all-media" aria-label="All recent Instagram photos">{media.slice(3).map((post, index) => { const image = str(post.thumbnailUrl) || str(post.mediaUrl); return image ? <a key={str(post.id) || index} href={str(post.permalink) || instagramUrl || undefined} target="_blank" rel="noopener noreferrer"><SafeImage src={image} alt={str(post.caption) || "Creator Instagram portfolio"} fill sizes="(max-width: 760px) 45vw, 220px" unoptimized /></a> : null; })}</section>}

    {error && <div className="marketplace-banner is-warn" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    {message && <div className="marketplace-banner is-success" role="status"><BadgeCheck size={17} /><span>{message}</span></div>}

    <div className="creator-marketplace-columns">
      <div className="creator-marketplace-main">
        <section className="creator-marketplace-identity">
          {str(instagram.profilePictureUrl) ? <SafeImage className="creator-marketplace-avatar" src={str(instagram.profilePictureUrl)} alt="" width={76} height={76} unoptimized /> : <span className="creator-marketplace-avatar creator-marketplace-avatar-fallback"><UsersRound size={26} /></span>}
          <div><div className="creator-marketplace-name-line"><h2>{str(creator.displayName)}</h2><BadgeCheck size={18} aria-label="Instagram verified" /></div><p>{str(creator.location) || "Location not listed"}{username && <> · <a href={instagramUrl} target="_blank" rel="noopener noreferrer">@{username.replace(/^@/, "")}</a></>}</p><span className="marketplace-card-meta"><BadgeCheck size={14} /> Meta connected · {str(creator.tier) || "Creator"}</span></div>
        </section>
        <p className="creator-marketplace-bio">{str(creator.bio) || "This creator has not added a bio yet."}</p>
        <div className="marketplace-chip-row creator-marketplace-categories">{categories.length ? categories.map((category) => <Link key={category} href={`${basePath}/discover?category=${encodeURIComponent(category)}`}>{category}</Link>) : <span>Content categories not added</span>}</div>
        {portfolio.length > 0 && <section className="creator-marketplace-portfolio-links"><h3>Portfolio links</h3>{portfolio.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><Link2 size={14} /> Portfolio {index + 1}<ArrowRight size={13} /></a>)}</section>}

        <section className="creator-marketplace-analytics" id="creator-analytics">
          <div className="creator-marketplace-section-heading"><div><span className="marketplace-eyebrow">VERIFIED THROUGH META</span><h2>Analytics</h2></div><Camera size={20} /></div>
          {(() => { const analytics = obj(instagram.analytics); const countries = arr(analytics.countries); const ages = arr(analytics.ages); const avgViews = typeof analytics.avgReelViews === "number" ? analytics.avgReelViews : null; return <>
            <div className="mp-analytics-stats">
              <div><span className="mp-analytics-icon"><UserPlus size={20} aria-hidden="true" /></span><div><strong>{typeof instagram.verifiedFollowers === "number" ? compact(instagram.verifiedFollowers) : "—"}</strong><small>Followers</small></div></div>
              <div><span className="mp-analytics-icon"><Eye size={20} aria-hidden="true" /></span><div><strong>{avgViews !== null ? compact(avgViews) : "—"}</strong><small title={avgViews !== null ? `Average over the last ${String(analytics.reelsSampled)} Reels` : analytics.reelsStatus === "no_reels" ? "No Reels found in the latest 50 posts" : "Instagram did not return view counts for these Reels yet"}>Avg. Reels views{avgViews === null && analytics.reelsStatus === "no_reels" ? " · no Reels yet" : avgViews === null && analytics.reelsStatus === "unavailable" ? " · syncing" : ""}</small></div></div>
              <div><span className="mp-analytics-icon"><Camera size={20} aria-hidden="true" /></span><div><strong>{typeof instagram.mediaCount === "number" ? compact(instagram.mediaCount) : "—"}</strong><small>Posts</small></div></div>
            </div>
            {(countries.length > 0 || ages.length > 0) ? <div className="mp-analytics-grid">
              {countries.length > 0 && <div className="mp-analytics-card"><h3>Audience location</h3>{countries.map((row) => { const label = countryLabel(str(row.key)); return <div key={str(row.key)} className="mp-analytics-row"><div><span>{label.flag && <span aria-hidden="true">{label.flag} </span>}{label.name}</span><strong>{Number(row.percent)}%</strong></div><span className="mp-analytics-bar"><i style={{ width: `${Number(row.percent)}%` }} /></span></div>; })}</div>}
              {ages.length > 0 && <div className="mp-analytics-card"><h3>Audience age</h3><p>By age group</p><div className="mp-analytics-ages">{ages.map((row) => <div key={str(row.key)}><strong>{Number(row.percent)}%</strong><span className="mp-analytics-column"><i style={{ height: `${Math.max(2, Number(row.percent))}%` }} /></span><small>{str(row.key)}</small></div>)}</div></div>}
            </div> : <p className="marketplace-muted mp-analytics-note">Audience location and age appear once Meta provides them (Instagram accounts with 100+ followers).</p>}
            <div className="creator-marketplace-source-note"><Clock3 size={14} /><span>From Meta{analytics.fetchedAt ? `, updated ${date(analytics.fetchedAt)}` : instagram.verifiedAt ? `, verified ${date(instagram.verifiedAt)}` : ""}. Audience data is aggregated and shared with the creator&apos;s permission.</span></div>
          </>; })()}
        </section>

        <section className="mp-profile-reviews" aria-labelledby="mp-profile-reviews-title">
          <div className="creator-marketplace-section-heading"><div><span className="marketplace-eyebrow">BRAND FEEDBACK</span><h2 id="mp-profile-reviews-title">{typeof rating.count === "number" ? <>{Number(rating.count)} {Number(rating.count) === 1 ? "Review" : "Reviews"} <span className="mp-profile-review-score">· <Star size={18} fill="currentColor" aria-hidden="true" /> {Number(rating.average).toFixed(1)}</span></> : "Reviews"}</h2></div></div>
          {typeof rating.communication === "number" && <div className="mp-review-scores">{[["Communication", rating.communication, MessageCircle], ["Timeliness", rating.timeliness, Clock3], ["Satisfaction", rating.satisfaction, CircleCheck]].map(([label, value, Icon]) => { const IconComponent = Icon as typeof MessageCircle; return <div key={String(label)}><IconComponent size={26} aria-hidden="true" /><span><small>{String(label)}</small><strong>{Number(value).toFixed(1)}</strong></span></div>; })}</div>}
          {reviews.length ? <div className="mp-profile-review-list">{reviews.map((review) => <article key={str(review._id)}><div><strong>{str(review.brandName)}</strong><StarRow rating={Number(review.rating || 0)} /></div><p>{str(review.comment)}</p><small>{date(review.createdAt)}</small></article>)}</div> : <p className="marketplace-muted">No reviews yet. Reviews appear after a brand completes a collaboration with this creator.</p>}
        </section>
      </div>

      <aside className="creator-marketplace-sidebar">
        <section className="creator-marketplace-packages">
          <div className="creator-marketplace-section-heading"><div><span className="marketplace-eyebrow">COLLABORATION RATES</span><h2>Packages</h2></div><Package size={19} /></div>
          {packages.length ? <div className="creator-marketplace-package-list mp-package-picker" role="radiogroup" aria-label="Choose a package">{packages.map((item, index) => <label key={`${str(item.title)}-${index}`} className={selectedPackage === index ? "is-selected" : ""}><input type="radio" name="package" checked={selectedPackage === index} onChange={() => setSelectedPackage(index)} /><div><span>{str(item.title)}</span><strong>{money(item.pricePaise)}</strong></div><p>{str(item.deliverables)}</p>{typeof item.deliveryDays === "number" && <small><Timer size={12} /> {item.deliveryDays}-day delivery</small>}</label>)}</div> : <div className="creator-marketplace-starting-rate"><span>Starting collaboration rate</span><strong>{money(creator.ratePaise)}</strong><small>This creator has not listed fixed packages yet. Invite them to a campaign to agree a price.</small></div>}

          {bookable && !bookingOpen && <div className="mp-package-actions"><button type="button" className="creator-marketplace-add-cart mp-book-button" disabled={busy} onClick={() => void addPackageToCart()}><ShoppingCart size={17} aria-hidden="true" /> Add to cart · {money(activePackage.pricePaise)}</button><button type="button" className="marketplace-secondary" onClick={() => setBookingOpen(true)}>Book only this creator <ArrowRight size={15} /></button>{cartAdded && <Link className="mp-view-cart" href={`${basePath}/checkout`}>View cart and check out <ArrowRight size={14} /></Link>}</div>}
          {bookable && bookingOpen && (brands.length ? <form className="marketplace-form mp-booking-form" onSubmit={(event) => void requestBooking(event)}>
            <div className="mp-booking-summary"><span>{str(activePackage.title)}</span><strong>{money(activePackage.pricePaise)}</strong></div>
            <label className="marketplace-field"><span>Booking as</span><select name="brandId" required>{brands.map((brand) => <option key={str(brand._id)} value={str(brand._id)}>{str(brand.name)}</option>)}</select></label>
            <label className="marketplace-field"><span>Brief for the creator</span><textarea name="brief" required minLength={20} maxLength={4000} rows={4} placeholder="Your product, key message, do’s and don’ts, and where the content will be used" /></label>
            <label className="marketplace-field"><span>Content needed by</span><input name="deadline" type="date" required min={isoDateInDays(1)} defaultValue={isoDateInDays(minDeliveryDays + 2)} /></label>
            <label className="marketplace-field"><span>Usage rights</span><select name="usageRights" defaultValue="none">{USAGE_RIGHTS.map((value) => <option key={value} value={value}>{USAGE_RIGHTS_LABEL[value]}</option>)}</select></label>
            <label className="marketplace-field"><span>Message (optional)</span><textarea name="message" maxLength={1000} rows={2} placeholder="Anything else the creator should know" /></label>
            <div className="marketplace-actions"><button type="button" onClick={() => setBookingOpen(false)}>Cancel</button><button className="marketplace-primary" disabled={busy}>{busy ? "Sending…" : "Send booking request"}</button></div>
            <small className="marketplace-form-note">The creator has {RESPONSE_WINDOW_HOURS} hours to accept, or the request expires. No payment is taken yet; the agreed price is recorded for both sides.</small>
          </form> : <div className="mp-booking-needs-brand"><p>Create a brand profile to book creators. It takes a minute.</p><Link className="marketplace-secondary" href={`${basePath}/brand`}>Create a brand profile <ArrowRight size={14} /></Link></div>)}
          {!creator.owner && <button type="button" className="mp-save-button" disabled={busy || saved} onClick={() => void saveCreator()}><Heart size={15} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : busy ? "Saving…" : "Save creator"}</button>}
          {Boolean(creator.owner) && <p className="creator-marketplace-cart-note">This is how brands see your profile. <Link href={`${basePath}/creator`}>Edit packages</Link></p>}
        </section>
        {campaigns.length > 0 && <section className="marketplace-panel creator-marketplace-invite"><div className="creator-marketplace-section-heading"><div><span className="marketplace-eyebrow">FOR BRAND ACCOUNTS</span><h2>Invite to campaign</h2></div><Megaphone size={19} /></div><form className="marketplace-form" onSubmit={(event) => void inviteToCampaign(event)}><label className="marketplace-field"><span>Open campaign</span><select name="campaignId" required>{campaigns.map((campaign) => <option key={str(campaign._id)} value={str(campaign._id)}>{str(campaign.title)}</option>)}</select></label><label className="marketplace-field"><span>Invitation note</span><textarea name="message" minLength={10} maxLength={1000} required rows={3} placeholder="Why would this creator fit your brief?" /></label><button className="marketplace-primary" disabled={busy}>Send invitation <ArrowRight size={15} /></button></form></section>}
        <Link className="creator-marketplace-campaign-link" href={`${basePath}/campaigns`}><Compass size={16} /> Browse campaigns <ArrowRight size={14} /></Link>
      </aside>
    </div>

    {similar.length > 0 && <section aria-labelledby="mp-similar-title">
      <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">YOU MAY ALSO LIKE</span><h2 id="mp-similar-title">Similar creators</h2></div></div>
      <div className="mp-creator-tile-grid">{similar.map((item) => <CreatorTile key={str(item._id)} creator={item} basePath={basePath} />)}</div>
    </section>}
  </div>;
}
