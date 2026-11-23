"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleAlert, Clock3, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { readJson } from "@/lib/read-json";
import { QuickBrandForm } from "@/components/marketplace/quick-brand-form";
import { RESPONSE_WINDOW_HOURS, USAGE_RIGHTS, USAGE_RIGHTS_LABEL } from "@/lib/marketplace/booking-cart";

type Item = Record<string, unknown>;
const api = "/api/marketplace/v1";
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown) => typeof value === "string" ? value : "";
const money = (paise: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof paise === "number" ? paise / 100 : 0);
const isoDateInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Booking cart: packages from several creators, totals, and one checkout that sends every request. */
export function BookingCartScreen() {
  const [cart, setCart] = useState<Item>({});
  const [brands, setBrands] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [cartResponse, meResponse] = await Promise.all([fetch(`${api}/booking-cart`, { cache: "no-store" }), fetch(`${api}/me`, { cache: "no-store" })]);
      const [cartData, meData] = await Promise.all([readJson(cartResponse), readJson(meResponse)]);
      if (!cartResponse.ok) throw new Error(str(cartData.error) || "Your cart could not be loaded.");
      setCart(cartData);
      setBrands(arr(meData.brands).filter((brand) => brand.status !== "rejected" && brand.status !== "suspended"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your cart could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function remove(itemId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/booking-cart/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(str((await readJson(response)).error) || "The package could not be removed.");
      await load(); window.dispatchEvent(new Event("marketplace:cart-changed"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The package could not be removed."); }
    finally { setBusy(false); }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/booking-cart/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: form.get("brandId"), brief: form.get("brief"), deadline: form.get("deadline"), usageRights: form.get("usageRights"), message: form.get("message") }) });
      const data = await readJson(response);
      if (!response.ok && !arr(data.failed).length) throw new Error(str(data.error) || "Your order could not be placed. Please review your cart and try again.");
      setResult(data); await load(); window.dispatchEvent(new Event("marketplace:cart-changed"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your order could not be placed. Please review your cart and try again."); }
    finally { setBusy(false); }
  }

  const creators = arr(cart.creators);
  return <div className="marketplace-page booking-cart-page">
    <div className="marketplace-page-head"><span className="marketplace-eyebrow">INFLUENCER MARKETING / CART</span><h1>Your cart</h1><p>Add packages from several creators, then send every booking request in one checkout. Each creator has {RESPONSE_WINDOW_HOURS} hours to accept.</p></div>
    {error && <div className="marketplace-banner is-warn" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    {result && <div className="marketplace-banner is-success" role="status"><BadgeCheck size={17} /><span>{arr(result.sent).length} booking request{arr(result.sent).length === 1 ? "" : "s"} sent. Creators have {RESPONSE_WINDOW_HOURS} hours to accept; you will get a notification for each answer.{arr(result.failed).length ? ` Not sent: ${arr(result.failed).map((item) => `${str(item.creator)} (${str(item.error)})`).join("; ")}` : ""} <Link href="/influencer-marketing/inbox">Open Inbox</Link></span></div>}
    {loading ? <div className="marketplace-loading" role="status">Loading your cart…</div> : creators.length ? <div className="booking-cart-layout">
      <section className="booking-cart-items" aria-label="Packages in your cart">
        {creators.map((group) => <article key={str(group.creatorId)} className="booking-cart-creator">
          <header>{str(group.picture) ? <Image src={str(group.picture)} alt="" width={44} height={44} className="marketplace-creator-avatar" unoptimized /> : <span className="marketplace-creator-avatar marketplace-creator-avatar-empty"><UserRound size={18} /></span>}<div><Link href={`/influencer-marketing/creators/${encodeURIComponent(str(group.creatorId))}`}><strong>{str(group.creatorName)}</strong></Link><small>{arr(group.packages).length} package{arr(group.packages).length === 1 ? "" : "s"} · sent as one request</small></div><strong>{money(group.subtotalPaise)}</strong></header>
          <ul>{arr(group.packages).map((item) => <li key={str(item.itemId)}><div><span>{str(item.title)}</span>{typeof item.deliveryDays === "number" && <small><Clock3 size={12} aria-hidden="true" /> {item.deliveryDays} day delivery</small>}</div><strong>{money(item.pricePaise)}</strong><button type="button" aria-label={`Remove ${str(item.title)}`} disabled={busy} onClick={() => void remove(str(item.itemId))}><Trash2 size={15} /></button></li>)}</ul>
        </article>)}
      </section>
      <aside className="booking-cart-summary">
        <h2>Order summary</h2>
        <dl><div><dt>{Number(cart.packageCount)} package{Number(cart.packageCount) === 1 ? "" : "s"} · {Number(cart.creatorCount)} creator{Number(cart.creatorCount) === 1 ? "" : "s"}</dt><dd>{money(cart.totalPaise)}</dd></div><div><dt>Platform fee</dt><dd>{money(0)}</dd></div><div className="is-total"><dt>Total</dt><dd>{money(cart.totalPaise)}</dd></div></dl>
        {brands.length ? <form className="marketplace-form" onSubmit={(event) => void checkout(event)}>
          <label className="marketplace-field"><span>Booking as</span><select name="brandId" required>{brands.map((brand) => <option key={str(brand._id)} value={str(brand._id)}>{str(brand.name)}</option>)}</select></label>
          <label className="marketplace-field"><span>Brief for every creator</span><textarea name="brief" required minLength={20} maxLength={4000} rows={4} placeholder="Your product, key message, do's and don'ts, and where the content will be used" /></label>
          <label className="marketplace-field"><span>Content needed by</span><input name="deadline" type="date" required min={isoDateInDays(1)} defaultValue={isoDateInDays(10)} /></label>
          <label className="marketplace-field"><span>Usage rights</span><select name="usageRights" defaultValue="none">{USAGE_RIGHTS.map((value) => <option key={value} value={value}>{USAGE_RIGHTS_LABEL[value]}</option>)}</select></label>
          <label className="marketplace-field"><span>Message (optional)</span><textarea name="message" maxLength={1000} rows={2} placeholder="Anything else creators should know" /></label>
          <button className="marketplace-primary" disabled={busy}>{busy ? "Sending…" : `Send ${Number(cart.creatorCount)} booking request${Number(cart.creatorCount) === 1 ? "" : "s"}`} <ArrowRight size={16} /></button>
          <small className="marketplace-form-note">No payment is taken yet. Online payment will be added soon; prices are recorded for both sides.</small>
        </form> : <QuickBrandForm onCreated={load} />}
      </aside>
    </div> : <div className="marketplace-empty"><ShoppingCart size={23} /><strong>Your cart is empty</strong><p>Open a creator&apos;s profile, choose a package and tap “Add to cart”. Add packages from several creators and check out once.</p><Link className="marketplace-primary" href="/influencer-marketing/discover">Find creators <ArrowRight size={15} /></Link></div>}
  </div>;
}
