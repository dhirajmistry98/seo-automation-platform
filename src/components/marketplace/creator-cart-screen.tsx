"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Camera, CircleAlert, MapPin, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { readJson } from "@/lib/read-json";

type Item = Record<string, unknown>;
const api = "/api/marketplace/v1";
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const money = (paise: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof paise === "number" ? paise / 100 : 0);

export function CreatorCartScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [cartResponse, campaignResponse] = await Promise.all([fetch(api + "/cart", { cache: "no-store" }), fetch(api + "/campaigns?mine=1", { cache: "no-store" })]);
      const [cartData, campaignData] = await Promise.all([readJson(cartResponse) as Promise<Item>, readJson(campaignResponse) as Promise<Item>]);
      if (!cartResponse.ok) throw new Error(str(cartData.error) || "Your creator cart could not be loaded.");
      setItems(arr(cartData.items)); setCampaigns(arr(campaignData.campaigns).filter((campaign) => campaign.status === "open"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your creator cart could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function removeCreator(creatorId: string) {
    setBusyId(creatorId); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/cart/" + encodeURIComponent(creatorId), { method: "DELETE" });
      const result = await readJson(response) as Item;
      if (!response.ok) throw new Error(str(result.error) || "Creator could not be removed.");
      setItems((current) => current.filter((item) => str(item.creatorId) !== creatorId));
      setNotice("Creator removed from your cart.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Creator could not be removed."); }
    finally { setBusyId(""); }
  }

  async function invite(creatorId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const campaignId = String(data.get("campaignId") || "");
    setBusyId(creatorId); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/campaigns/" + encodeURIComponent(campaignId) + "/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ influencerProfileId: creatorId, message: data.get("message") }) });
      const result = await readJson(response) as Item;
      if (!response.ok) throw new Error(str(result.error) || "Invitation could not be sent.");
      setNotice("Invitation sent. The creator can reply and negotiate in Collaborations."); form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invitation could not be sent."); }
    finally { setBusyId(""); }
  }

  return <div className="marketplace-page creator-cart-page">
    <div className="marketplace-page-head"><span className="marketplace-eyebrow">INFLUENCER MARKETING / CREATOR CART</span><h1>Your creator shortlist</h1><p>Review verified profiles and recent Instagram portfolio media, then invite a creator to an approved campaign. Adding a profile does not charge you.</p></div>
    {error && <div className="marketplace-banner is-warn" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    {notice && <div className="marketplace-banner is-success" role="status"><BadgeCheck size={17} /><span>{notice}</span></div>}
    {loading ? <div className="marketplace-loading" role="status">Loading your saved creators…</div> : items.length ? <>
      <div className="creator-cart-summary"><span><ShoppingCart size={17} /> {items.length} saved creator{items.length === 1 ? "" : "s"}</span><Link href="/influencer-marketing/discover">Continue discovering <ArrowRight size={15} /></Link></div>
      <div className="creator-cart-list">{items.map((cartItem) => {
        const creator = obj(cartItem.influencer); const instagram = obj(creator.instagram); const creatorId = str(cartItem.creatorId); const recentMedia = arr(instagram.recentMedia).slice(0, 6); const username = str(creator.instagramUsername).replace(/^@/, "");
        return <article className="creator-cart-card" key={str(cartItem.id)}>
          <div className="creator-cart-card-profile">
            {str(instagram.profilePictureUrl) ? <Image className="marketplace-creator-avatar" src={str(instagram.profilePictureUrl)} alt="" width={60} height={60} unoptimized /> : <span className="marketplace-creator-avatar marketplace-creator-avatar-empty"><UserRound size={22} /></span>}
            <div><span className="marketplace-card-meta"><BadgeCheck size={14} /> Meta verified · {str(creator.tier) || "Emerging Creator"}</span><h2>{str(creator.displayName)}</h2><small>{username ? "@" + username : "Instagram creator"}</small></div>
            <button type="button" className="creator-cart-remove" disabled={busyId === creatorId} onClick={() => void removeCreator(creatorId)}><Trash2 size={15} /><span>Remove</span></button>
          </div>
          <div className="creator-cart-facts"><span><Camera size={15} /> {Number(instagram.verifiedFollowers || 0).toLocaleString("en-IN")} verified followers</span><span><MapPin size={15} /> {str(creator.location) || "Location not listed"}</span><strong>Starting rate · {money(creator.ratePaise)}</strong></div>
          {str(creator.bio) && <p className="creator-cart-bio">{str(creator.bio)}</p>}
          <div className="marketplace-chip-row">{Array.isArray(creator.categories) && creator.categories.map((category) => <span key={String(category)}>{String(category)}</span>)}</div>
          <h3 className="creator-cart-media-heading">Recent Instagram portfolio</h3>
          {recentMedia.length ? <div className="creator-cart-media">{recentMedia.map((media, index) => { const image = str(media.thumbnailUrl) || str(media.mediaUrl); return image ? <a key={str(media.id) || index} href={str(media.permalink) || ("https://www.instagram.com/" + encodeURIComponent(username) + "/")} target="_blank" rel="noopener noreferrer" aria-label={"Open Instagram post " + (index + 1) + " by " + str(creator.displayName)}><Image src={image} alt={str(media.caption) || "Creator portfolio post"} fill sizes="(max-width: 720px) 45vw, 190px" unoptimized /></a> : null; })}</div> : <div className="creator-cart-media-empty"><Camera size={18} /> No public media is available from the authorized Instagram connection.</div>}
          {campaigns.length ? <form className="creator-cart-invite" onSubmit={(event) => void invite(creatorId, event)}><label className="marketplace-field"><span>Invite through a campaign</span><select name="campaignId" required>{campaigns.map((campaign) => <option key={str(campaign._id)} value={str(campaign._id)}>{str(campaign.title)}</option>)}</select></label><label className="marketplace-field"><span>Invitation note</span><input name="message" minLength={10} maxLength={1000} required placeholder="Explain why this creator fits your campaign" /></label><button type="submit" className="marketplace-primary" disabled={busyId === creatorId}>{busyId === creatorId ? "Sending…" : "Invite to campaign"}<ArrowRight size={15} /></button></form> : <div className="creator-cart-no-campaign"><span>Create or publish an approved brand campaign to invite this creator.</span><Link href="/influencer-marketing/campaigns">Open campaigns <ArrowRight size={14} /></Link></div>}
        </article>;
      })}</div>
      <p className="creator-cart-note">Creator rates are starting prices. Scope, deliverables and usage rights can be agreed in a private collaboration. Payments are not enabled in this version.</p>
    </> : <div className="marketplace-empty"><ShoppingCart size={23} /><strong>Your creator cart is empty</strong><p>Save approved creators from discovery to compare verified profiles and recent portfolio posts here.</p><Link className="marketplace-primary" href="/influencer-marketing/discover">Discover creators <ArrowRight size={15} /></Link></div>}
  </div>;
}
