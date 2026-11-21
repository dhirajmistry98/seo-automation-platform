"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/ui/safe-image";
import { ArrowRight, BadgeCheck, Heart, Users, BriefcaseBusiness, Camera, CircleAlert, Clock3, Inbox, MapPin, Megaphone, MessageSquareText, Package, Plus, RefreshCw, Search, Send, ShieldCheck, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import { LocationInput } from "@/components/marketplace/location-input";
import { CAMPAIGN_CATEGORIES, COMPENSATION_LABEL, type Compensation } from "@/lib/marketplace/campaigns";
import { CreatorTile } from "./creator-tile";
import { readJson } from "@/lib/read-json";

type View = "overview" | "influencer" | "brand" | "discover" | "campaigns" | "campaign" | "inbox" | "admin";
type Item = Record<string, unknown>;
type Data = Record<string, unknown>;
const api = "/api/marketplace/v1";
/** Heart toggle used on creator and campaign cards to save or unsave. */
function SaveHeart({ saved, busy, label, onToggle }: { saved: boolean; busy: boolean; label: string; onToggle: () => void }) {
  return <button type="button" className={`mp-heart${saved ? " is-saved" : ""}`} aria-pressed={saved} aria-label={saved ? `Remove ${label} from Saved` : `Save ${label}`} title={saved ? "Saved" : "Save"} disabled={busy} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}><Heart size={18} aria-hidden="true" fill={saved ? "currentColor" : "none"} /></button>;
}
const isPausedStatus = (value: unknown) => value === "rejected" || value === "suspended";
const compensationLabel = (value: unknown) => COMPENSATION_LABEL[(value as Compensation)] ?? "Paid";
/** Creator state shown in the UI: listed after Meta verification, paused only by moderation. */
const creatorStateLabel = (influencer: Item) => !influencer._id ? "Not created" : influencer.listed ? "Listed" : influencer.paused ? "Paused" : "Not verified";
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const money = (paise: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof paise === "number" ? paise / 100 : 0);
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const listField = (form: FormData, name: string) => String(form.get(name) || "").split(",").map((value) => value.trim()).filter(Boolean);
const inr = (rupees: number) => `₹${Math.round(rupees).toLocaleString("en-IN")}`;
type PackageDraft = { key: string; title: string; price: string; deliverables: string; deliveryDays: string };
const PACKAGE_PRESETS = ["1 Instagram Reel", "1 Instagram Story", "1 Instagram Photo Post", "Reel + 3 Stories", "UGC video (no posting)"];
const packageField = (form: FormData) => {
  try {
    const rows = JSON.parse(String(form.get("packagesJson") || "[]")) as PackageDraft[];
    return rows.filter((row) => row.title.trim() || row.price.trim() || row.deliverables.trim()).map((row) => ({
      title: row.title.trim(), pricePaise: row.price.trim() ? Math.round(Number(row.price) * 100) : -1,
      deliverables: row.deliverables.trim(), deliveryDays: row.deliveryDays.trim() ? Number(row.deliveryDays) : null,
    }));
  } catch { return []; }
};

function PackageEditor({ initial }: { initial: unknown }) {
  const [rows, setRows] = useState<PackageDraft[]>(() => {
    const saved = Array.isArray(initial) ? initial.map(obj).map((item, index) => ({ key: `saved-${index}`, title: str(item.title), price: typeof item.pricePaise === "number" ? String(item.pricePaise / 100) : "", deliverables: str(item.deliverables), deliveryDays: typeof item.deliveryDays === "number" ? String(item.deliveryDays) : "" })) : [];
    return saved.length ? saved : [{ key: "new-0", title: "1 Instagram Reel", price: "", deliverables: "", deliveryDays: "7" }];
  });
  const priced = rows.filter((row) => row.price.trim() !== "").map((row) => Number(row.price)).filter((value) => Number.isFinite(value) && value >= 0);
  const update = (key: string, field: keyof Omit<PackageDraft, "key">, value: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  return <fieldset className="mp-package-editor">
    <legend>Packages brands can book</legend>
    <p className="marketplace-form-note">Fixed-price packages let brands book you directly from your profile. List up to 10.</p>
    <input type="hidden" name="packagesJson" value={JSON.stringify(rows)} />
    {rows.map((row, index) => { const started = Boolean(row.title.trim() || row.price.trim() || row.deliverables.trim()); return <div className="mp-package-row" key={row.key}>
      <div className="mp-package-row-head"><strong>Package {index + 1}</strong><button type="button" aria-label={`Remove package ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 size={14} /></button></div>
      <div className="marketplace-form-grid">
        <label className="marketplace-field"><span>Package name</span><input list="mp-package-presets" value={row.title} onChange={(event) => update(row.key, "title", event.target.value)} placeholder="1 Instagram Reel" required={started} minLength={2} maxLength={100} /></label>
        <label className="marketplace-field"><span>Price (₹)</span><input type="number" min="0" step="1" value={row.price} onChange={(event) => update(row.key, "price", event.target.value)} placeholder="8000" required={started} /></label>
      </div>
      <div className="marketplace-form-grid">
        <label className="marketplace-field"><span>What’s included</span><input value={row.deliverables} onChange={(event) => update(row.key, "deliverables", event.target.value)} placeholder="One 30–60s edited Reel, brand tag, 30-day usage rights" required={started} minLength={2} maxLength={500} /></label>
        <label className="marketplace-field"><span>Delivery (days)</span><input type="number" min="1" max="90" value={row.deliveryDays} onChange={(event) => update(row.key, "deliveryDays", event.target.value)} placeholder="7" /></label>
      </div>
    </div>; })}
    <datalist id="mp-package-presets">{PACKAGE_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist>
    {rows.length < 10 && <button type="button" className="marketplace-secondary" onClick={() => setRows((current) => [...current, { key: `new-${Date.now()}`, title: "", price: "", deliverables: "", deliveryDays: "7" }])}><Plus size={15} /> Add package</button>}
    {priced.length > 0 && <div className="mp-package-total" aria-live="polite">
      <div><span>{priced.length === 1 ? "1 package" : `${priced.length} packages`}</span><small>Starting from {inr(Math.min(...priced))}</small></div>
      <div><span>Total for all packages</span><strong>{inr(priced.reduce((sum, value) => sum + value, 0))}</strong></div>
    </div>}
  </fieldset>;
}

/** Creator studio side card: where the creator stands with Instagram verification, as numbered steps. */
function CreatorVerificationCard({ influencer, connectAvailable }: { influencer: Item; connectAvailable: boolean }) {
  const [asking, setAsking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setAsking(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [asking]);
  const instagram = obj(influencer.instagram);
  const saved = Boolean(influencer._id);
  const handle = str(influencer.instagramHandle) || str(instagram.username);
  const verifiedAt = instagram.verifiedAt ? new Date(str(instagram.verifiedAt)) : null;
  const verified = Boolean(verifiedAt && str(instagram.username));
  // Verification refreshes automatically every day; it only lapses if Meta access was removed or expired.
  const current = verified && influencer.verificationCurrent === true;
  const approved = influencer.listed === true;
  const followers = typeof instagram.verifiedFollowers === "number" ? Number(instagram.verifiedFollowers) : null;
  const steps = [
    { done: saved && Boolean(handle), title: "Save your profile", text: handle ? `With Instagram username @${handle}` : "Include your Instagram username" },
    { done: verified, title: "Verify through Meta", text: verified ? `Verified as @${str(instagram.username)} on ${verifiedAt!.toLocaleDateString("en-IN")}` : "Log in to Instagram with that exact account" },
    { done: verified && approved, title: "Listed for brands", text: approved ? "Brands can find you in Discover" : influencer.paused ? "Paused by the marketplace team. Contact support." : "Happens automatically after verification" },
  ];
  return <aside className="marketplace-panel marketplace-side-panel mp-verify-card" aria-labelledby="mp-verify-title">
    <div className="mp-verify-head">
      <span className="mp-verify-icon"><Camera size={20} aria-hidden="true" /></span>
      <span className={`mp-verify-status ${verified ? "is-verified" : "is-pending"}`}>{verified ? <><BadgeCheck size={14} aria-hidden="true" /> Verified</> : <><Clock3 size={14} aria-hidden="true" /> Not verified</>}</span>
    </div>
    <span className="marketplace-eyebrow">INSTAGRAM VERIFICATION</span>
    <h3 id="mp-verify-title">{verified ? "Your Instagram is verified" : "Verify your Instagram"}</h3>
    <p>Brands only see creators whose Instagram is confirmed through Meta. Any follower count is welcome.</p>
    <ol className="mp-verify-steps">{steps.map((step, index) => <li key={step.title} className={step.done ? "is-done" : ""}><span className="mp-verify-step-mark" aria-hidden="true">{step.done ? <BadgeCheck size={14} /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.text}</small></span></li>)}</ol>
    {saved && current && <p className="mp-verify-auto"><BadgeCheck size={15} aria-hidden="true" /> Connected to Instagram. Your followers and posts update automatically every day.</p>}
    {saved && connectAvailable && !current && <button type="button" className="marketplace-primary mp-verify-button" onClick={() => { setAgreed(false); setAsking(true); }}>{verified ? "Reconnect Instagram" : "Verify Instagram through Meta"} <ArrowRight size={16} aria-hidden="true" /></button>}
    {saved && verified && !current && <p className="marketplace-form-note">Your Instagram connection lapsed, so your profile is hidden from brands. Reconnect to list it again.</p>}
    {asking && <div className="mp-consent-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAsking(false); }}>
      <div className="mp-consent" role="dialog" aria-modal="true" aria-labelledby="mp-consent-title">
        <div className="mp-consent-head"><span className="mp-verify-icon"><ShieldCheck size={20} aria-hidden="true" /></span><button type="button" className="mp-consent-close" aria-label="Close" onClick={() => setAsking(false)}><X size={18} /></button></div>
        <span className="marketplace-eyebrow">PERMISSION REQUIRED</span>
        <h3 id="mp-consent-title">Allow SEO Studio to verify @{handle || "your Instagram"}</h3>
        <p>Next you&apos;ll see Meta&apos;s secure login. Choose <strong>Continue with Instagram</strong> (or Facebook), pick <strong>@{handle || "your account"}</strong> and allow access. Your password always stays with Meta.</p>
        <div className="mp-consent-grid">
          <div><strong>We will read</strong><ul><li>Instagram username and account ID</li><li>Follower and post counts, profile photo</li><li>Your recent posts (for your portfolio)</li><li>Account insights such as reach, if you allow it</li></ul></div>
          <div><strong>We will never</strong><ul><li>Post, comment or send messages</li><li>See your password or private messages</li><li>Run ads or change your account</li><li>Sell your data</li></ul></div>
        </div>
        <p className="mp-consent-note">The data is used only to verify your account and show it on your creator profile, and is refreshed daily. You can withdraw any time by deleting your creator account or removing SEO Studio in Instagram settings. See our <Link href="/privacy" target="_blank">Privacy Policy</Link>.</p>
        <label className="mp-consent-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> <span>I agree to let SEO Studio access this Instagram data for verification, as described above.</span></label>
        <div className="mp-consent-actions">
          <button type="button" className="marketplace-secondary" onClick={() => setAsking(false)}>Not now</button>
          <a className={`marketplace-primary${agreed ? "" : " is-disabled"}`} aria-disabled={!agreed} href={agreed ? "/api/marketplace/meta/authorize?consent=v1" : undefined} onClick={(event) => { if (!agreed) event.preventDefault(); }}>Continue to Meta <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
      </div>
    </div>}
    {!saved && <p className="marketplace-form-note">Save your creator profile first, then verify.</p>}
    {saved && !connectAvailable && <p className="marketplace-form-note">Instagram verification is temporarily unavailable. Please try again later.</p>}
    <dl className="mp-verify-facts">
      <div><dt>Followers</dt><dd>{followers !== null ? followers.toLocaleString("en-IN") : "—"}</dd></div>
      <div><dt>Creator tier</dt><dd>{str(influencer.tier) || "—"}</dd></div>
    </dl>
    {Boolean(instagram.providerUserId) && <><CreatorInstagramPreview instagram={instagram} /><InstagramInsightsPanel /></>}
  </aside>;
}

/** Result of the Instagram (Meta) connection, passed back as ?meta=<status>. */
const META_RESULT: Record<string, { tone: "info" | "warn" | "success"; text: string }> = {
  "connected-review": { tone: "success", text: "Instagram verified: the account you logged in with matches your username. Your profile is now listed for brands in Discover." },
  "username-mismatch": { tone: "warn", text: "Verification failed: the Instagram account you logged in with is not the username on your profile. Log in with that exact account, or correct the username and save before connecting again." },
  "username-required": { tone: "warn", text: "Add your Instagram username to your creator profile and save it before connecting Instagram." },
  "profile-required": { tone: "warn", text: "Save your creator profile first, then connect Instagram." },
  "already-linked": { tone: "warn", text: "This Instagram account is already linked to another creator profile." },
  "identity-mismatch": { tone: "warn", text: "Meta returned a different account than the one that logged in. Please try again." },
  "verification-unavailable": { tone: "warn", text: "Instagram verification could not be completed. Make sure it is a Professional (Business or Creator) account and try again." },
  "invalid-state": { tone: "warn", text: "The Instagram connection expired. Please click Connect Instagram again." },
  cancelled: { tone: "info", text: "Instagram connection was cancelled." },
  "consent-required": { tone: "info", text: "Please review and accept the Instagram permission notice before continuing to Meta." },
  "too-many-attempts": { tone: "warn", text: "Too many Instagram connection attempts. For your security, please wait a few minutes and try again." },
  "not-configured": { tone: "warn", text: "Instagram connection is not configured yet." },
  "sign-in-required": { tone: "warn", text: "Sign in again, then connect Instagram." },
};
function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "success" }) { return <div role="status" className={`marketplace-banner is-${tone}`}>{tone === "warn" ? <CircleAlert size={18} /> : <ShieldCheck size={18} />}<span>{children}</span></div>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="marketplace-empty"><Inbox size={22} /><strong>{title}</strong><p>{children}</p></div>; }
function Status({ value }: { value: unknown }) { return <span className={`marketplace-status is-${str(value).replace(/[^a-z_]/g, "")}`}>{str(value).replaceAll("_", " ") || "draft"}</span>; }
function Field({ label, name, placeholder, type = "text", required = true, defaultValue }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean; defaultValue?: string | number }) { return <label className="marketplace-field"><span>{label}</span><input name={name} placeholder={placeholder} type={type} required={required} defaultValue={defaultValue} /></label>; }
function Textarea({ label, name, placeholder, required = true, defaultValue }: { label: string; name: string; placeholder?: string; required?: boolean; defaultValue?: string }) { return <label className="marketplace-field"><span>{label}</span><textarea name={name} placeholder={placeholder} required={required} defaultValue={defaultValue} rows={4} /></label>; }
function SectionTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) { return <div className="marketplace-section-title"><div><span className="marketplace-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{aside}</div>; }

export function MarketplaceScreen({ view, id, basePath = "/influencer-marketing" }: { view: View; id?: string; basePath?: string }) {
  const [me, setMe] = useState<Data>({});
  const [data, setData] = useState<Data>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "warn" | "success" } | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [conversation, setConversation] = useState<Data>({});
  const [messages, setMessages] = useState<Item[]>([]);
  const [metaResult, setMetaResult] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [metaWait, setMetaWait] = useState(0);
  useEffect(() => { if (view !== "influencer") return; const timer = window.setTimeout(() => { const params = new URLSearchParams(window.location.search); setMetaResult(params.get("meta") || ""); const wait = Number(params.get("wait")); setMetaWait(Number.isInteger(wait) && wait > 0 && wait <= 60 ? wait : 0); }, 0); return () => window.clearTimeout(timer); }, [view]);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastDataSync, setLastDataSync] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [directory, setDirectory] = useState<"influencers" | "brands">("influencers");
  const [directoryInitialized, setDirectoryInitialized] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directorySearchInput, setDirectorySearchInput] = useState("");
  const [directoryLocationInput, setDirectoryLocationInput] = useState("");
  const [directoryLocation, setDirectoryLocation] = useState("");
  const [directoryCategory, setDirectoryCategory] = useState("");
  const [directorySort, setDirectorySort] = useState("followers_desc");
  const [directoryMaxRateInput, setDirectoryMaxRateInput] = useState("");
  const [directoryMaxRate, setDirectoryMaxRate] = useState("");
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [cartBusyId, setCartBusyId] = useState("");
  const [campaignCategory, setCampaignCategory] = useState("");
  const [campaignCompFilter, setCampaignCompFilter] = useState("");
  const [campaignLocation, setCampaignLocation] = useState("");
  const [campaignLocationInput, setCampaignLocationInput] = useState("");
  const [newCampaignComp, setNewCampaignComp] = useState<Compensation>("paid");
  const [savingCampaignId, setSavingCampaignId] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<Item | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryFollowers, setDirectoryFollowers] = useState("");
  const [urlFiltersReady, setUrlFiltersReady] = useState(view !== "discover");
  const followerRange = (value: string) => { const [min = "", max = ""] = value.split("-"); return { min, max }; };
  const firstCollaborationId = str(arr(me.collaborations)[0]?._id);
  const activeConversationId = conversationId || (view === "inbox" ? firstCollaborationId : "");

  const fetchJson = useCallback(async (path: string) => {
    const response = await fetch(`${api}${path}`, { cache: "no-store" });
    const payload = await readJson(response) as Data;
    if (!response.ok) throw new Error(str(payload.error) || "Unable to load marketplace data.");
    return payload;
  }, []);
  const load = useCallback(async (background = false) => {
    try {
      if (!background) setLoading(true);
      const personal = await fetchJson("/me"); setMe(personal);
      let result: Data = {};
      if (view === "discover") {
        const hasBrandAccount = arr(personal.brands).length > 0 || arr(personal.memberships).length > 0;
        const defaultDirectory = hasBrandAccount ? "influencers" : obj(personal.influencer)._id ? "brands" : "influencers";
        if (!directoryInitialized) { setDirectory(defaultDirectory); setDirectoryInitialized(true); }
        const creatorParams = new URLSearchParams({ skip: "0", sort: directorySort });
        if (directoryQuery) creatorParams.set("q", directoryQuery);
        if (directoryCategory) creatorParams.set("category", directoryCategory);
        if (directoryLocation) creatorParams.set("location", directoryLocation);
        if (directoryMaxRate) creatorParams.set("maxRate", directoryMaxRate);
        const range = followerRange(directoryFollowers);
        if (range.min) creatorParams.set("minFollowers", range.min);
        if (range.max) creatorParams.set("maxFollowers", range.max);
        const query =directoryQuery ? `&q=${encodeURIComponent(directoryQuery)}` : "";
        const [influencers, brands, campaigns, cart] = await Promise.all([fetchJson(`/influencers?${creatorParams.toString()}`), fetchJson(`/brands?skip=0${query}`), fetchJson("/campaigns?mine=1"), fetchJson("/cart")]);
        setCartIds(arr(cart.items).map((item) => str(item.creatorId)).filter(Boolean));
        result = {
          influencers: influencers.influencers, influencersTotal: influencers.total, influencersHasMore: influencers.hasMore,
          brands: brands.brands, brandsTotal: brands.total, brandsHasMore: brands.hasMore,
          brandCampaigns: campaigns.campaigns, cartTotal: cart.total,
        };
      } else if (view === "campaigns") {
        const campaignParams = new URLSearchParams(mine ? { mine: "1" } : {});
        if (!mine && campaignCategory) campaignParams.set("category", campaignCategory);
        if (!mine && campaignCompFilter) campaignParams.set("compensation", campaignCompFilter);
        if (!mine && campaignLocation) campaignParams.set("location", campaignLocation);
        result = await fetchJson(`/campaigns${campaignParams.size ? `?${campaignParams.toString()}` : ""}`);
      } else if (view === "campaign" && id) result = await fetchJson(`/campaigns/${id}`);
      else if (view === "admin" && personal.admin) result = await fetchJson("/admin");
      setData(result);
      setLastDataSync(Date.now());
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Unable to load marketplace data.", tone: "warn" }); }
    finally { if (!background) setLoading(false); }
  }, [fetchJson, view, id, mine, campaignCategory, campaignCompFilter, campaignLocation, directoryInitialized, directoryQuery, directoryCategory, directoryLocation, directorySort, directoryMaxRate, directoryFollowers]);
  // Deep links such as /discover?category=Beauty&location=Mumbai prefill the directory filters.
  useEffect(() => {
    if (view !== "discover") return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.slice(0, 80) || ""; const location = params.get("location")?.slice(0, 80) || ""; const maxRate = params.get("maxRate")?.replace(/\D/g, "") || "";
      if (q) { setDirectoryQuery(q); setDirectorySearchInput(q); }
      if (location) { setDirectoryLocation(location); setDirectoryLocationInput(location); }
      if (maxRate) { setDirectoryMaxRate(maxRate); setDirectoryMaxRateInput(maxRate); }
      const category = params.get("category"); if (category) setDirectoryCategory(category.slice(0, 60));
      const sort = params.get("sort"); if (sort && ["followers_desc", "followers_asc", "rate_asc", "rate_desc"].includes(sort)) setDirectorySort(sort);
      setUrlFiltersReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view]);
  useEffect(() => { if (!urlFiltersReady) return; const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load, urlFiltersReady]);
  useEffect(() => {
    if (!["campaigns", "campaign", "inbox"].includes(view)) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [load, view]);
  async function loadMoreDirectory() {
    setDirectoryLoading(true);
    try {
      const key = directory;
      const existing = arr(data[key]);
      const params = new URLSearchParams({ skip: String(existing.length) });
      if (directoryQuery) params.set("q", directoryQuery);
      if (key === "influencers") {
        if (directoryCategory) params.set("category", directoryCategory);
        if (directoryLocation) params.set("location", directoryLocation);
        if (directoryMaxRate) params.set("maxRate", directoryMaxRate);
        const range = followerRange(directoryFollowers);
        if (range.min) params.set("minFollowers", range.min);
        if (range.max) params.set("maxFollowers", range.max);
        params.set("sort", directorySort);
      }
      const payload = await fetchJson(`/${key}?${params.toString()}`);
      const records = arr(payload[key]);
      setData((current) => ({ ...current, [key]: [...arr(current[key]), ...records], [`${key}Total`]: payload.total, [`${key}HasMore`]: payload.hasMore }));
    } catch (caught) {
      setNotice({ text: caught instanceof Error ? caught.message : "Unable to load more profiles.", tone: "warn" });
    } finally {
      setDirectoryLoading(false);
    }
  }
  async function removeCreatorFromCart(creatorId: string) {
    if (!creatorId || cartBusyId) return;
    setCartBusyId(creatorId); setNotice(null);
    try {
      const response = await fetch(`${api}/cart/${encodeURIComponent(creatorId)}`, { method: "DELETE" });
      const payload = await readJson(response) as Data;
      if (!response.ok) throw new Error(str(payload.error) || "Creator could not be removed from Saved.");
      setCartIds((current) => current.filter((value) => value !== creatorId));
      setData((current) => ({ ...current, cartTotal: Math.max(0, Number(current.cartTotal || 0) - (payload.removed ? 1 : 0)) }));
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Creator could not be removed from Saved.", tone: "warn" }); }
    finally { setCartBusyId(""); }
  }
  async function toggleSavedCampaign(campaignId: string, saved: boolean) {
    if (!campaignId || savingCampaignId) return;
    setSavingCampaignId(campaignId); setNotice(null);
    try {
      const response = saved ? await fetch(`${api}/saved-campaigns/${encodeURIComponent(campaignId)}`, { method: "DELETE" }) : await fetch(`${api}/saved-campaigns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId }) });
      const payload = await readJson(response) as Data;
      if (!response.ok) throw new Error(str(payload.error) || "The campaign could not be saved.");
      const flip = (item: unknown) => str(obj(item)._id) === campaignId ? { ...obj(item), saved: !saved } : item;
      setData((current) => ({ ...current, campaigns: arr(current.campaigns).map(flip), campaign: current.campaign && str(obj(current.campaign)._id) === campaignId ? { ...obj(current.campaign), saved: !saved } : current.campaign }));
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "The campaign could not be saved.", tone: "warn" }); }
    finally { setSavingCampaignId(""); }
  }
  async function addCreatorToCart(creatorId: string) {
    if (!creatorId || cartBusyId) return;
    setCartBusyId(creatorId); setNotice(null);
    try {
      const response = await fetch(`${api}/cart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ influencerId: creatorId }) });
      const payload = await readJson(response) as Data;
      if (!response.ok) throw new Error(str(payload.error) || "Creator could not be added to your cart.");
      setCartIds((current) => current.includes(creatorId) ? current : [...current, creatorId]);
      setData((current) => ({ ...current, cartTotal: Number(current.cartTotal || 0) + (payload.alreadyAdded ? 0 : 1) }));
      setNotice({ text: payload.alreadyAdded ? "This creator is already in your cart." : "Creator added to your saved creator cart. Review their profile and invite them to a campaign when ready.", tone: "success" });
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Creator could not be added to your cart.", tone: "warn" }); }
    finally { setCartBusyId(""); }
  }
  useEffect(() => { if (view !== "inbox") return; const timer = window.setTimeout(() => setConversationId(new URLSearchParams(window.location.search).get("conversation") || ""), 0); return () => window.clearTimeout(timer); }, [view]);
  const loadConversation = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      const [details, messageData] = await Promise.all([fetchJson(`/collaborations/${activeConversationId}`), fetchJson(`/collaborations/${activeConversationId}/messages`)]);
      setConversation(details); setMessages(arr(messageData.messages));
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Unable to load conversation.", tone: "warn" }); }
  }, [activeConversationId, fetchJson]);
  useEffect(() => { if (!activeConversationId) return; const initial = window.setTimeout(() => { void loadConversation(); }, 0); const timer = window.setInterval(() => { void loadConversation(); }, realtimeConnected ? 30_000 : 5_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [activeConversationId, loadConversation, realtimeConnected]);
  useEffect(() => {
    if (!activeConversationId || !me.realtimeAvailable) return;
    let disposed = false;
    let client: import("ably").Realtime | null = null;
    const start = async () => {
      const Ably = await import("ably");
      if (disposed) return;
      client = new Ably.Realtime({ authCallback: async (_params, callback) => {
        try {
          const response = await fetch(`/api/marketplace/realtime/token?collaborationId=${encodeURIComponent(activeConversationId)}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Real-time authorization failed.");
          callback(null, await readJson(response));
        } catch (caught) { callback(caught instanceof Error ? caught.message : "Real-time authorization failed.", null); }
      } });
      const channel = client.channels.get(`marketplace:collaboration:${activeConversationId}`);
      await channel.subscribe(() => { if (!disposed) void loadConversation(); });
      await channel.presence.enter();
      if (!disposed) setRealtimeConnected(true);
      const updatePresence = async () => { const members = await channel.presence.get(); if (!disposed) setOnlineCount(new Set(members.map((member) => member.clientId)).size); };
      await channel.presence.subscribe(() => { void updatePresence(); });
      await updatePresence();
    };
    void start().catch(() => { if (!disposed) { setOnlineCount(null); setRealtimeConnected(false); } });
    return () => { disposed = true; client?.close(); };
  }, [activeConversationId, me.realtimeAvailable, loadConversation]);
  async function deleteCreatorAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirm = String(new FormData(event.currentTarget).get("confirm") || "").trim();
    if (confirm !== "DELETE") { setNotice({ text: "Type DELETE in capitals to confirm.", tone: "warn" }); return; }
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`${api}/influencers/me`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      const payload = await readJson(response) as Data;
      if (!response.ok) throw new Error(str(payload.error) || "Your creator account could not be deleted.");
      setDeleteOpen(false);
      setNotice({ text: "Your creator account was deleted. Your sign-in account and any brand profiles are unchanged.", tone: "success" });
      await load();
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Your creator account could not be deleted.", tone: "warn" }); }
    finally { setBusy(false); }
  }
  async function mutate(path: string, body: Item, success: string) {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await readJson(response) as Data;
      if (!response.ok) throw new Error(str(payload.error) || "The change could not be saved.");
      setNotice({ text: success, tone: "success" }); await load(); if (activeConversationId) await loadConversation();
      return payload;
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "The change could not be saved.", tone: "warn" }); return null; }
    finally { setBusy(false); }
  }
  const submit = (path: string, build: (form: FormData) => Item, success: string) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const payload = await mutate(path, build(new FormData(form)), success); if (!payload) return;
    // Creator accounts are only complete once Instagram is verified through Meta: continue straight to it.
    // Full navigation on purpose: this API route redirects off-site to Instagram, which the client router cannot do.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (path === "/influencers" && obj(payload).verificationRequired && me.instagramConnectAvailable) { window.location.assign("/api/marketplace/meta/authorize"); return; }
    form.reset();
  };
  const influencer = obj(me.influencer);
  const brands = arr(me.brands);
  const collaborations = arr(me.collaborations);
  const applications = arr(me.applications);
  const sentBookings = arr(me.sentBookings);
  const activeCollaboration = collaborations.find((item) => str(item._id) === activeConversationId) || {};
  const discoveredInfluencers = arr(data.influencers);
  const discoveredBrands = arr(data.brands);
  const openBrandCampaigns = arr(data.brandCampaigns).filter((campaign) => campaign.status === "open");
  const title: Record<View, string> = { overview: "Good work starts here.", influencer: "Your creator studio.", brand: "Build your brand presence.", discover: "Find the right partner.", campaigns: "Campaigns with a clear brief.", campaign: "Campaign details.", inbox: "Your collaborations", admin: "Marketplace control room." };
  const subtitle: Record<View, string> = { overview: "One place for brands and creators to make campaigns happen.", influencer: "Show your work, connect verified social accounts and manage applications.", brand: "Present your products, create campaigns and invite creators.", discover: "Explore approved brands and Meta-verified creators of every size.", campaigns: "Browse active briefs or manage your brand campaigns. Listings refresh automatically while you work.", campaign: "Review the brief, deadline and applicants before the next step.", inbox: "Applications, invitations, messages, price proposals and deliverables in one collaboration workspace.", admin: "Review marketplace accounts and enforce eligibility rules." };
  return <div className="marketplace-page">
    <div className="marketplace-page-head"><span className="marketplace-eyebrow">INFLUENCER MARKETING</span><h1>{title[view]}</h1><p>{subtitle[view]}</p></div>
    {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
    {loading ? <div className="marketplace-loading" role="status">Loading marketplace data…</div> : <>
      {view === "overview" && <>
        <div className="marketplace-stat-row"><article><span>Your brands</span><strong>{brands.length}</strong><small>Brand profiles in this marketplace</small></article><article><span>Creator profile</span><strong>{influencer._id ? "1" : "0"}</strong><small>{influencer._id ? creatorStateLabel(influencer) : "Create a profile"}</small></article><article><span>Collaborations</span><strong>{collaborations.length}</strong><small>Private campaign workspaces</small></article></div>
        <SectionTitle eyebrow="CHOOSE YOUR SIDE" title="Two ways to collaborate" />
        <div className="marketplace-feature-grid"><Link href={`${basePath}/creator`} className="marketplace-feature-card"><UserRound size={26} /><span>FOR CREATORS</span><h3>Make your work discoverable</h3><p>Build a portfolio, connect Instagram and apply for campaigns when verified.</p><b>Open influencer studio <ArrowRight size={16} /></b></Link><Link href={`${basePath}/brand`} className="marketplace-feature-card"><BriefcaseBusiness size={26} /><span>FOR BRANDS</span><h3>Find a strong creative fit</h3><p>Present your business, publish briefs and manage collaborations with creators.</p><b>Open brand studio <ArrowRight size={16} /></b></Link></div>
        <Banner tone="warn">Payments, checkout, refunds, and payouts are disabled. Collaboration terms and deliverable workflows remain available. Official Instagram verification still requires approved Meta access.</Banner>
      </>}
      {view === "influencer" && <>
        {META_RESULT[metaResult] && <Banner tone={META_RESULT[metaResult].tone}>{metaResult === "too-many-attempts" && metaWait ? `Too many Instagram connection attempts. For your security, please wait about ${metaWait} minute${metaWait === 1 ? "" : "s"} and try again.` : META_RESULT[metaResult].text}</Banner>}
        <div className="marketplace-two-column"><section className="marketplace-panel"><SectionTitle eyebrow="YOUR PROFILE" title={influencer._id ? "Edit your creator details" : "Create a creator profile"} aside={influencer._id ? <span className="mp-studio-aside"><Link href={`${basePath}/creators/${encodeURIComponent(str(influencer._id))}`}>Preview public profile <ArrowRight size={13} /></Link><span className={`marketplace-status is-${influencer.listed ? "approved" : influencer.paused ? "suspended" : "pending"}`}>{creatorStateLabel(influencer)}</span></span> : null} />
          <form className="marketplace-form" onSubmit={submit("/influencers", (form) => ({ displayName: form.get("displayName"), instagramHandle: form.get("instagramHandle"), bio: form.get("bio"), location: form.get("location"), ratePaise: Math.round(Number(form.get("rateRupees")) * 100), categories: listField(form, "categories"), portfolio: listField(form, "portfolio"), packages: packageField(form) }), "Creator profile saved in the database.")}>
            <Field label="Display name" name="displayName" placeholder="Your creator name" defaultValue={str(influencer.displayName)} /><label className="marketplace-field"><span>Instagram username</span><input name="instagramHandle" required maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@yourusername" defaultValue={str(influencer.instagramHandle) || str(obj(influencer.instagram).username)} /><small className="marketplace-form-note">{obj(influencer.instagram).verifiedAt && str(obj(influencer.instagram).username) ? <><BadgeCheck size={13} aria-hidden="true" /> Verified as @{str(obj(influencer.instagram).username)} through Meta</> : "Not verified yet. After saving, click Connect Instagram and log in with this exact account to verify it."}</small></label><Textarea label="About you" name="bio" placeholder="Your content style and audience" defaultValue={str(influencer.bio)} required={false} /><div className="marketplace-form-grid"><label className="marketplace-field"><span>Location in India</span><LocationInput key={str(influencer._id) || "new"} name="location" required placeholder="Mumbai, Maharashtra" defaultValue={str(influencer.location)} /></label><Field label="Starting rate (₹)" name="rateRupees" type="number" defaultValue={typeof influencer.ratePaise === "number" ? influencer.ratePaise / 100 : 0} /></div><Field label="Content categories (comma separated)" name="categories" placeholder="Fashion, Lifestyle" defaultValue={Array.isArray(influencer.categories) ? influencer.categories.join(", ") : ""} /><PackageEditor key={str(influencer._id) || "new"} initial={influencer.packages} /><Field label="Portfolio HTTPS links (comma separated)" name="portfolio" required={false} placeholder="https://..." defaultValue={Array.isArray(influencer.portfolio) ? influencer.portfolio.join(", ") : ""} /><button className="marketplace-primary" disabled={busy}>Save creator profile <ArrowRight size={16} /></button>
          </form></section><CreatorVerificationCard influencer={influencer} connectAvailable={Boolean(me.instagramConnectAvailable)} /></div>
        {Boolean(influencer._id) && <section className="marketplace-panel mp-danger-zone" aria-labelledby="mp-delete-creator-title">
          <div><span className="marketplace-eyebrow">DANGER ZONE</span><h3 id="mp-delete-creator-title">Delete creator account</h3>
          <p>Permanently removes your creator profile, packages, portfolio and Instagram connection, takes you out of the creator directory and withdraws pending applications and bookings. Your sign-in account, brand profiles and finished collaborations are kept. This cannot be undone.</p></div>
          {deleteOpen ? <form className="mp-danger-form" onSubmit={deleteCreatorAccount}><label className="marketplace-field"><span>Type DELETE to confirm</span><input name="confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="DELETE" required /></label><div className="mp-danger-actions"><button type="button" className="marketplace-secondary" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button><button className="mp-danger-button" disabled={busy}><Trash2 size={15} aria-hidden="true" /> {busy ? "Deleting…" : "Delete creator account"}</button></div></form>
            : <button type="button" className="mp-danger-button" onClick={() => setDeleteOpen(true)}><Trash2 size={15} aria-hidden="true" /> Delete creator account</button>}
        </section>}
      </>}
      {view === "brand" && <><div className="marketplace-two-column"><section className="marketplace-panel"><SectionTitle eyebrow="BRAND ACCOUNT" title="Create a brand profile" /><form className="marketplace-form" onSubmit={submit("/brands", (form) => ({ name: form.get("name"), description: form.get("description"), category: form.get("category"), location: form.get("location"), website: form.get("website"), offerings: listField(form, "offerings") }), "Brand profile created. You can post campaigns and book creators now.")}><Field label="Brand name" name="name" placeholder="Your business name" /><label className="marketplace-field"><span>Business category</span><select name="category" required><option value="startup">Startup</option><option value="small_business">Small business</option><option value="local_business">Local business</option><option value="ecommerce">E-commerce</option><option value="established_company">Established company</option><option value="marketing_agency">Marketing agency</option><option value="enterprise">Enterprise</option></select></label><Textarea label="About your business" name="description" required={false} placeholder="What you make and who it serves" /><div className="marketplace-form-grid"><label className="marketplace-field"><span>Location in India</span><LocationInput name="location" required placeholder="Bengaluru, Karnataka" /></label><Field label="Website (HTTPS)" name="website" type="url" placeholder="https://example.com" required={false} /></div><Field label="Products or services (comma separated)" name="offerings" placeholder="Skincare, Wellness" required={false} /><button className="marketplace-primary" disabled={busy}>Create brand <Plus size={16} /></button></form></section><aside className="marketplace-panel marketplace-side-panel"><BriefcaseBusiness size={28} /><span className="marketplace-eyebrow">YOUR BRANDS</span><h3>{brands.length} brand account{brands.length === 1 ? "" : "s"}</h3><div className="marketplace-list">{brands.map((brand) => <article key={str(brand._id)}><strong>{str(brand.name)}</strong><Status value={brand.status} /><p>{str(brand.category).replaceAll("_", " ")} · {str(brand.location)}</p></article>)}{!brands.length && <p>Create your first brand to start a campaign after approval.</p>}</div></aside></div></>}
      {view === "discover" && <>
        <section className="marketplace-panel marketplace-directory-toolbar" aria-label="Marketplace directories">
          <div className="marketplace-tab-row" role="tablist" aria-label="Choose a directory">
            <button type="button" role="tab" aria-selected={directory === "influencers"} className={directory === "influencers" ? "is-active" : ""} onClick={() => setDirectory("influencers")}><UserRound size={16} /> Influencers <span>{Number(data.influencersTotal || 0)}</span></button>
            <button type="button" role="tab" aria-selected={directory === "brands"} className={directory === "brands" ? "is-active" : ""} onClick={() => setDirectory("brands")}><BriefcaseBusiness size={16} /> Brands <span>{Number(data.brandsTotal || 0)}</span></button>
          </div>
          <Link href={`${basePath}/cart`} className="marketplace-cart-link"><ShoppingCart size={16} /> Creator cart <span>{Number(data.cartTotal || 0)}</span></Link>
          <form className="marketplace-directory-search" onSubmit={(event) => { event.preventDefault(); setDirectoryQuery(directorySearchInput.trim()); setDirectoryLocation(directoryLocationInput.trim()); setDirectoryMaxRate(directoryMaxRateInput.trim()); }}>
            <Search size={17} aria-hidden="true" /><input aria-label="Search profiles" value={directorySearchInput} onChange={(event) => setDirectorySearchInput(event.target.value)} placeholder={directory === "influencers" ? "Search creators, categories or keywords" : "Search brands, products or keywords"} maxLength={80} />
            <button type="submit">Search</button>
            {directoryQuery && <button type="button" className="marketplace-search-clear" onClick={() => { setDirectorySearchInput(""); setDirectoryQuery(""); }}>Clear</button>}
          </form>
          {directory === "influencers" && <div className="marketplace-creator-filters">
            <label><span>Location</span><LocationInput value={directoryLocationInput} onChange={setDirectoryLocationInput} placeholder="Any city" /></label>
            <label><span>Budget up to (₹)</span><input type="number" min="0" max="10000000" value={directoryMaxRateInput} onChange={(event) => setDirectoryMaxRateInput(event.target.value)} placeholder="Any budget" /></label>
            <label><span>Followers</span><select value={directoryFollowers} onChange={(event) => setDirectoryFollowers(event.target.value)}>{<><option value="">Any</option><option value="0-1000">Under 1K</option><option value="1000-5000">1K – 5K</option><option value="5000-10000">5K – 10K</option><option value="10000-50000">10K – 50K · Micro</option><option value="50000-100000">50K – 100K · Mid</option><option value="100000-500000">100K – 500K · Macro</option><option value="500000-">500K+ · Mega</option></>}</select></label>
            <label><span>Sort creators</span><select value={directorySort} onChange={(event) => setDirectorySort(event.target.value)}><option value="followers_desc">Most followers</option><option value="followers_asc">Rising creators</option><option value="rate_asc">Lowest rate</option><option value="rate_desc">Highest rate</option></select></label>
            <button type="button" className={`marketplace-filter-apply${directoryLocation === directoryLocationInput.trim() && directoryMaxRate === directoryMaxRateInput.trim() ? " is-applied" : ""}`} onClick={() => { setDirectoryLocation(directoryLocationInput.trim()); setDirectoryMaxRate(directoryMaxRateInput.trim()); }}>Apply filters</button>
          </div>}
        </section>
        {directory === "influencers" && <>
          <div className="marketplace-discovery-intro"><div><span className="marketplace-eyebrow">VERIFIED INSTAGRAM CREATORS</span><h2>Find the right creator for your next campaign.</h2><p>Every creator has their Instagram account verified through Meta, whatever their audience size. See creator-approved portfolio images and verified account data.</p></div><div className="marketplace-discovery-source"><Camera size={17} /><span>Instagram</span><BadgeCheck size={15} /></div></div>
          <div className="marketplace-creator-category-row" aria-label="Filter creators by niche">{["", "Beauty", "Fashion", "Lifestyle", "Food", "Travel", "Fitness", "Technology", "Home"].map((category) => <button type="button" key={category || "all"} className={directoryCategory === category ? "is-active" : ""} onClick={() => setDirectoryCategory(category)}>{category || "All niches"}</button>)}</div>
          <SectionTitle eyebrow="CREATOR PROFILES" title="Browse approved partners" aside={<span className="marketplace-count">{Number(data.influencersTotal || 0)} profiles</span>} />
          {discoveredInfluencers.length ? <div className="mp-creator-tile-grid mp-discover-grid">{discoveredInfluencers.map((item) => {
            const alreadyInCart = cartIds.includes(str(item._id));
            return <article className="mp-discover-tile" key={str(item._id)}>
              <CreatorTile creator={item} basePath={basePath} />
              {!item.isOwn && <SaveHeart saved={alreadyInCart} busy={cartBusyId === str(item._id)} label={str(item.displayName)} onToggle={() => void (alreadyInCart ? removeCreatorFromCart(str(item._id)) : addCreatorToCart(str(item._id)))} />}
              {item.isOwn ? <Link className="mp-discover-own" href={`${basePath}/creator`}>Your profile · Edit</Link> : null}
              {openBrandCampaigns.length > 0 && <form className="marketplace-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const campaignId = str(form.get("campaignId")); if (campaignId) await mutate(`/campaigns/${campaignId}/invite`, { influencerProfileId: item._id, message: form.get("message") }, "Invitation sent. The creator can respond in their inbox."); }}>
                <label className="marketplace-field"><span>Invite through a campaign</span><select name="campaignId">{openBrandCampaigns.map((campaign) => <option key={str(campaign._id)} value={str(campaign._id)}>{str(campaign.title)}</option>)}</select></label>
                <Field label="Invitation note" name="message" placeholder="Why this creator fits your brief" />
                <button className="marketplace-secondary" disabled={busy}>Send campaign invitation <ArrowRight size={15} /></button>
              </form>}
            </article>;
          })}</div> : <Empty title={directoryQuery ? "No matching creators" : "No verified creators yet"}>{directoryQuery ? "Try a different name, category or location." : "Creator listings appear after official Instagram verification and marketplace approval."}</Empty>}
          {selectedCreator && (() => { const instagram = obj(selectedCreator.instagram); const media = arr(instagram.recentMedia).slice(0, 9); const username = str(selectedCreator.instagramUsername).replace(/^@/, ""); const portfolio = Array.isArray(selectedCreator.portfolio) ? selectedCreator.portfolio.filter((link): link is string => typeof link === "string" && link.startsWith("https://")).slice(0, 6) : []; return <div className="marketplace-profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCreator(null); }}><section role="dialog" aria-modal="true" aria-labelledby="marketplace-profile-dialog-title" className="marketplace-profile-dialog"><button type="button" className="marketplace-profile-dialog-close" aria-label="Close creator profile" onClick={() => setSelectedCreator(null)}><X size={19} /></button><div className="marketplace-profile-dialog-heading">{str(instagram.profilePictureUrl) ? <SafeImage className="marketplace-creator-avatar" src={str(instagram.profilePictureUrl)} alt="" width={64} height={64} unoptimized /> : <span className="marketplace-creator-avatar marketplace-creator-avatar-empty"><UserRound size={24} /></span>}<div><span className="marketplace-card-meta"><BadgeCheck size={15} /> Meta verified · {str(selectedCreator.tier) || "Verified creator"}</span><h2 id="marketplace-profile-dialog-title">{str(selectedCreator.displayName)}</h2><small>{username ? `@${username}` : "Instagram creator"}</small></div></div><p className="marketplace-profile-dialog-bio">{str(selectedCreator.bio) || "This creator has not added a biography yet."}</p><div className="marketplace-profile-dialog-stats"><div><strong>{Number(instagram.verifiedFollowers || 0).toLocaleString("en-IN")}</strong><span>Verified followers</span></div><div><strong>{typeof instagram.mediaCount === "number" ? instagram.mediaCount.toLocaleString("en-IN") : "—"}</strong><span>Instagram posts</span></div><div><strong>{money(selectedCreator.ratePaise)}</strong><span>Starting rate</span></div><div><strong>{str(selectedCreator.location) || "Not listed"}</strong><span>Location</span></div></div><h3>Recent Instagram portfolio</h3>{media.length ? <div className="marketplace-profile-dialog-gallery">{media.map((post, index) => { const imageUrl = str(post.thumbnailUrl) || str(post.mediaUrl); const permalink = str(post.permalink); return imageUrl ? <a key={str(post.id) || index} href={permalink || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : undefined)} target="_blank" rel="noopener noreferrer" aria-label={`Open creator post ${index + 1}`}><SafeImage src={imageUrl} alt={str(post.caption) || "Instagram creator portfolio image"} fill sizes="(max-width: 700px) 40vw, 220px" unoptimized /><span>{str(post.mediaType).toLowerCase() === "video" ? "VIDEO" : "INSTAGRAM"}</span></a> : null; })}</div> : <div className="marketplace-profile-dialog-empty"><Camera size={20} /><span>No public media was returned by Meta for this connected account.</span></div>}<div className="marketplace-chip-row">{Array.isArray(selectedCreator.categories) && selectedCreator.categories.map((category) => <span key={String(category)}>{String(category)}</span>)}</div>{portfolio.length > 0 && <div className="marketplace-profile-links">{portfolio.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer">Portfolio {index + 1} <ArrowRight size={13} /></a>)}</div>}<div className="marketplace-profile-dialog-actions"><button type="button" className="marketplace-secondary" onClick={() => setSelectedCreator(null)}>Close</button><button type="button" className="marketplace-primary" disabled={cartIds.includes(str(selectedCreator._id)) || cartBusyId === str(selectedCreator._id)} onClick={() => void addCreatorToCart(str(selectedCreator._id))}>{cartIds.includes(str(selectedCreator._id)) ? "In your cart" : cartBusyId === str(selectedCreator._id) ? "Adding…" : "Add to cart"}<ShoppingCart size={15} /></button></div></section></div>; })()}
          {Boolean(data.influencersHasMore) && <button type="button" className="marketplace-load-more" disabled={directoryLoading} onClick={() => void loadMoreDirectory()}>{directoryLoading ? "Loading profiles…" : "Show more creators"}<ArrowRight size={16} /></button>}
          {discoveredInfluencers.length > 0 && !openBrandCampaigns.length && <div className="marketplace-directory-cta"><Megaphone size={19} /><span><strong>Want to invite a creator?</strong><small>Publish an open campaign first, then send a private invitation with your brief.</small></span><Link href={`${basePath}/campaigns`}>Manage campaigns <ArrowRight size={15} /></Link></div>}
        </>}
        {directory === "brands" && <>
          <SectionTitle eyebrow="APPROVED BRAND DIRECTORY" title="Discover businesses and campaigns" aside={<span className="marketplace-count">{Number(data.brandsTotal || 0)} profiles</span>} />
          {discoveredBrands.length ? <div className="marketplace-card-grid">{discoveredBrands.map((brand) => <article className="marketplace-card" key={str(brand._id)}>
            <span className="marketplace-card-icon"><BriefcaseBusiness size={23} /></span>
            <div className="marketplace-card-meta"><BadgeCheck size={15} /> Approved · {str(brand.category).replaceAll("_", " ")}</div>
            <h3>{str(brand.name)}</h3><p>{str(brand.description) || "Brand profile"}</p>
            <div className="marketplace-chip-row">{Array.isArray(brand.offerings) && brand.offerings.map((offering) => <span key={String(offering)}>{String(offering)}</span>)}</div>
            <footer><span><MapPin size={14} /> {str(brand.location)}</span>{Boolean(brand.website) && <a href={str(brand.website)} target="_blank" rel="noopener noreferrer">Visit website <ArrowRight size={14} /></a>}</footer>
          </article>)}</div> : <Empty title={directoryQuery ? "No matching brands" : "No brands yet"}>{directoryQuery ? "Try a different business name, category or location." : "Approved businesses will appear here as they join the marketplace."}</Empty>}
          {Boolean(data.brandsHasMore) && <button type="button" className="marketplace-load-more" disabled={directoryLoading} onClick={() => void loadMoreDirectory()}>{directoryLoading ? "Loading profiles…" : "Show more brands"}<ArrowRight size={16} /></button>}
          <div className="marketplace-directory-cta"><Megaphone size={19} /><span><strong>Want to work with a brand?</strong><small>Browse active campaigns and apply with a proposal to start the conversation.</small></span><Link href={`${basePath}/campaigns`}>Browse campaigns <ArrowRight size={15} /></Link></div>
        </>}
      </>}
      {view === "campaigns" && <><div className="marketplace-tab-row"><button className={!mine ? "is-active" : ""} onClick={() => setMine(false)}>Open campaigns</button><button className={mine ? "is-active" : ""} onClick={() => setMine(true)}>My brand campaigns</button></div><div className="marketplace-auto-refresh"><span><RefreshCw size={14} /> Auto-refreshes every 10 seconds{lastDataSync ? ` · Updated ${new Date(lastDataSync).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button type="button" onClick={() => void load(true)}><RefreshCw size={14} /> Refresh now</button></div>{mine && <section className="marketplace-panel"><SectionTitle eyebrow="NEW CAMPAIGN" title="Post a campaign" /><form className="marketplace-form" onSubmit={submit("/campaigns", (form) => ({ brandId: form.get("brandId"), title: form.get("title"), brief: form.get("brief"), category: form.get("category"), location: form.get("location"), compensation: newCampaignComp, budgetPaise: Math.round(Number(form.get("budgetRupees") || 0) * 100), productValuePaise: Math.round(Number(form.get("productRupees") || 0) * 100), creatorsWanted: Number(form.get("creatorsWanted") || 1), minFollowers: Number(form.get("minFollowers") || 0), targetAudience: form.get("targetAudience"), deliverables: listField(form, "deliverables"), deadline: form.get("deadline") }), "Campaign posted. Matching creators have been notified.")}>
          {brands.some((brand) => !isPausedStatus(brand.status)) ? <label className="marketplace-field"><span>Posting as</span><select name="brandId" required>{brands.filter((brand) => !isPausedStatus(brand.status)).map((brand) => <option key={str(brand._id)} value={str(brand._id)}>{str(brand.name)}</option>)}</select></label> : <p className="marketplace-form-note">Create a brand profile first (Brand studio), then post campaigns.</p>}
          <Field label="Campaign title" name="title" placeholder="Monsoon launch with Mumbai fashion creators" />
          <Textarea label="Brief" name="brief" placeholder="Your product, the key message, the look and feel, do's and don'ts, and usage rights" />
          <div className="marketplace-form-grid"><label className="marketplace-field"><span>Category</span><select name="category" required defaultValue="">{[<option key="" value="" disabled>Choose a category</option>, ...CAMPAIGN_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)]}</select></label><label className="marketplace-field"><span>Creator location (optional)</span><LocationInput name="location" placeholder="Anywhere in India" /></label></div>
          <label className="marketplace-field"><span>Compensation</span><select value={newCampaignComp} onChange={(event) => setNewCampaignComp(event.target.value as Compensation)}>{(Object.keys(COMPENSATION_LABEL) as Compensation[]).map((value) => <option key={value} value={value}>{COMPENSATION_LABEL[value]}</option>)}</select></label>
          <div className="marketplace-form-grid">{newCampaignComp !== "gifted" && <Field label="Budget per creator (₹)" name="budgetRupees" type="number" placeholder="5000" />}{newCampaignComp !== "paid" && <Field label="Product value (₹)" name="productRupees" type="number" required={false} placeholder="1500" />}</div>
          <div className="marketplace-form-grid"><Field label="Creators needed" name="creatorsWanted" type="number" defaultValue={1} /><Field label="Minimum followers (optional)" name="minFollowers" type="number" required={false} defaultValue={0} /></div>
          <div className="marketplace-form-grid"><Field label="Deliverables (comma separated)" name="deliverables" placeholder="1 Reel, 2 Stories" /><Field label="Target audience" name="targetAudience" placeholder="Women 20–35 interested in streetwear" /></div>
          <Field label="Application deadline" name="deadline" type="date" />
          <button className="marketplace-primary" disabled={busy || !brands.some((brand) => !isPausedStatus(brand.status))}>Post campaign <ArrowRight size={16} /></button>
        </form></section>}
        <SectionTitle eyebrow={mine ? "YOUR WORK" : "EXPLORE WORK"} title={mine ? "Brand campaigns" : "Open opportunities"} aside={<span className="marketplace-count">{arr(data.campaigns).length} campaigns</span>} />
        {!mine && <form className="mp-campaign-filters" onSubmit={(event) => { event.preventDefault(); setCampaignLocation(campaignLocationInput.trim()); }}>
          <div className="marketplace-tab-row" role="group" aria-label="Category">{["", ...CAMPAIGN_CATEGORIES].map((item) => <button type="button" key={item || "all"} className={campaignCategory === item ? "is-active" : ""} onClick={() => setCampaignCategory(item)}>{item || "All categories"}</button>)}</div>
          <div className="mp-campaign-filter-row"><label><span>Compensation</span><select value={campaignCompFilter} onChange={(event) => setCampaignCompFilter(event.target.value)}><option value="">Any</option>{(Object.keys(COMPENSATION_LABEL) as Compensation[]).map((value) => <option key={value} value={value}>{COMPENSATION_LABEL[value]}</option>)}</select></label><label><span>Location</span><LocationInput value={campaignLocationInput} onChange={setCampaignLocationInput} placeholder="Any city" /></label><button type="submit" className="marketplace-secondary">Apply filters</button></div>
        </form>}{arr(data.campaigns).length ? <div className="marketplace-card-grid">{arr(data.campaigns).map((campaign) => { const saved = campaign.saved === true; const paid = campaign.compensation !== "gifted"; return <article className="marketplace-card mp-campaign-card" key={str(campaign._id)}>
          <div className="mp-campaign-card-top"><span className="mp-campaign-chip">{str(campaign.category) || "Campaign"}</span><span className="mp-campaign-chip is-comp">{compensationLabel(campaign.compensation)}</span>{mine ? <Status value={campaign.status} /> : <SaveHeart saved={saved} busy={savingCampaignId === str(campaign._id)} label={str(campaign.title)} onToggle={() => void toggleSavedCampaign(str(campaign._id), saved)} />}</div>
          {str(obj(campaign.brand).name) && <span className="marketplace-campaign-brand"><BriefcaseBusiness size={13} /> {str(obj(campaign.brand).name)}</span>}
          <h3><Link href={`${basePath}/campaigns/${str(campaign._id)}`} className="mp-campaign-title-link">{str(campaign.title)}</Link></h3>
          <p>{str(campaign.brief)}</p>
          <div className="mp-creator-facts"><span><MapPin size={13} aria-hidden="true" /> {str(campaign.location) ? str(campaign.location).split(",")[0] : "Anywhere"}</span><span><Users size={13} aria-hidden="true" /> {Number(campaign.creatorsWanted || 1)} creator{Number(campaign.creatorsWanted || 1) === 1 ? "" : "s"}</span>{Number(campaign.minFollowers || 0) > 0 && <span><UserRound size={13} aria-hidden="true" /> {Number(campaign.minFollowers).toLocaleString("en-IN")}+ followers</span>}{mine && <span><MessageSquareText size={13} aria-hidden="true" /> {Number(campaign.applicationCount || 0)} applications</span>}</div>
          <footer><span><Clock3 size={14} /> Apply by {date(campaign.deadline)}</span><strong>{paid ? `${money(campaign.budgetPaise)} / creator` : Number(campaign.productValuePaise || 0) > 0 ? `Product worth ${money(campaign.productValuePaise)}` : "Gifted product"}</strong></footer>
        </article>; })}</div> : <Empty title="No campaigns here yet">{mine ? "Post your first campaign above. Matching creators are notified straight away." : "Try another category or location, or check back soon. You will get a notification when a matching campaign is posted."}</Empty>}</>}
      {view === "campaign" && <><Link className="marketplace-back" href={`${basePath}/campaigns`}>← All campaigns</Link>{data.campaign ? <CampaignDetail campaign={obj(data.campaign)} applications={arr(data.applications)} activity={obj(data.activity)} busy={busy} submit={submit} mutate={mutate} /> : <Empty title="Campaign unavailable">This campaign may have closed or may only be visible to its brand.</Empty>}</>}
      {view === "inbox" && <><div className="marketplace-two-column marketplace-inbox-layout"><section className="marketplace-panel marketplace-inbox-queue"><SectionTitle eyebrow="APPLICATIONS & INVITATIONS" title="Requests to review" aside={<span className="marketplace-count">{applications.length}</span>} />{applications.length ? <div className="marketplace-list marketplace-stacked">{applications.map((item) => { const type = str(item.type); return <article key={str(item._id)} className={type === "booking" ? "mp-inbox-booking" : undefined}><div className="marketplace-line-heading"><strong>{type === "booking" ? <><Package size={14} /> Package booking</> : type === "invitation" ? "Brand invitation" : "Your application"}</strong><Status value={item.status} /></div><span className="mp-inbox-context">{str(item.campaignTitle) || "Campaign"}{str(item.brandName) && ` · ${str(item.brandName)}`}</span>{type === "booking" && <span className="mp-inbox-amount">{money(item.amountPaise)}{item.campaignDeadline ? ` · needed by ${date(item.campaignDeadline)}` : ""}</span>}{item.status === "invited" && item.respondBy ? <span className="mp-respond-by"><Clock3 size={13} aria-hidden="true" /> Respond by {new Date(str(item.respondBy)).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}, or it expires</span> : null}{item.declineReason === "no_response" ? <span className="mp-respond-by is-expired">Expired: not answered within 72 hours</span> : null}<p>{str(item.pitch)}</p>{item.status === "invited" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/accept`, {}, type === "booking" ? "Booking accepted. The package price and scope are now the agreed terms — submit content when it’s ready." : "Invitation accepted. Start negotiating terms below.")}>{type === "booking" ? "Accept booking" : "Accept"}</button><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/decline`, {}, type === "booking" ? "Booking declined." : "Invitation declined.")}>Decline</button></div>}{item.status === "pending" && type === "application" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/withdraw`, {}, "Application withdrawn.")}>Withdraw</button></div>}</article>; })}</div> : <Empty title="No requests yet">Bookings, campaign invitations and your applications appear here.</Empty>}
        {sentBookings.length > 0 && <><SectionTitle eyebrow="SENT BY YOUR BRAND" title="Package bookings" aside={<span className="marketplace-count">{sentBookings.length}</span>} /><div className="marketplace-list marketplace-stacked">{sentBookings.map((item) => <article key={str(item._id)} className="mp-inbox-booking"><div className="marketplace-line-heading"><strong>{str(item.creatorName) || "Creator"}</strong><Status value={item.status} /></div><span className="mp-inbox-context">{str(item.packageTitle) || str(item.campaignTitle)} · {str(item.brandName)}</span><span className="mp-inbox-amount">{money(item.amountPaise)}{item.campaignDeadline ? ` · needed by ${date(item.campaignDeadline)}` : ""}</span>{str(item.creatorProfileId) && <Link className="marketplace-creator-full-profile" href={`${basePath}/creators/${encodeURIComponent(str(item.creatorProfileId))}`}>View creator <ArrowRight size={13} /></Link>}{item.status === "invited" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/withdraw`, {}, "Booking request withdrawn.")}>Withdraw request</button></div>}</article>)}</div></>}<SectionTitle eyebrow="PRIVATE WORKSPACES" title="Collaborations" aside={<span className="marketplace-count">{collaborations.length}</span>} />{collaborations.length ? <div className="marketplace-list marketplace-stacked">{collaborations.map((item) => <button className={`marketplace-conversation-choice ${activeConversationId === item._id ? "is-active" : ""}`} key={str(item._id)} onClick={() => setConversationId(str(item._id))}>{item.isBooking ? <Package size={18} /> : <MessageSquareText size={18} />}<span><strong>{str(item.campaignTitle) || `Campaign ${str(item.campaignId).slice(-8)}`}</strong><small>{item.influencerId === me.userId ? str(item.brandName) : str(item.creatorName)} · {str(item.status).replaceAll("_", " ")}</small></span><ArrowRight size={15} /></button>)}</div> : <Empty title="No collaborations yet">Accepted applications and invitations create a private collaboration.</Empty>}</section><section>{activeConversationId ? <Conversation id={activeConversationId} data={conversation} messages={messages} busy={busy} submit={submit} mutate={mutate} revisionNote={revisionNote} setRevisionNote={setRevisionNote} userId={str(me.userId)} onlineCount={onlineCount} summary={activeCollaboration} /> : <div className="marketplace-panel marketplace-select-conversation marketplace-inbox-empty"><MessageSquareText size={30} /><span className="marketplace-eyebrow">YOUR COLLABORATION DESK</span><h3>Every partnership has a home here</h3><p>Review requests, agree on pricing, share files and manage content approvals in one private workspace.</p><div className="marketplace-inbox-process"><div><strong>01</strong><span>Review a request</span></div><div><strong>02</strong><span>Agree on scope</span></div><div><strong>03</strong><span>Share deliverables</span></div></div><div className="marketplace-inbox-empty-actions"><Link className="marketplace-primary" href={`${basePath}/campaigns`}>Browse campaigns <ArrowRight size={15} /></Link><Link className="marketplace-secondary" href={`${basePath}/discover`}>Find partners <Search size={15} /></Link></div></div>}</section></div></>}
      {view === "admin" && (me.admin ? <AdminPanel data={data} busy={busy} mutate={mutate} /> : <Banner tone="warn">This page is available only to configured marketplace administrators.</Banner>)}
    </>}
  </div>;
}

function CampaignActivity({ activity }: { activity: Item }) {
  if (typeof activity.applications !== "number") return null;
  return <div className="marketplace-activity"><span>Platform activity</span><div><strong>{Number(activity.applications)}</strong><small>Applications</small></div><div><strong>{Number(activity.invitations)}</strong><small>Invitations</small></div><div><strong>{Number(activity.accepted)}</strong><small>Accepted</small></div><div><strong>{Number(activity.completed)}</strong><small>Completed</small></div></div>;
}

function CampaignDetail({ campaign, applications, activity, busy, submit, mutate }: { campaign: Item; applications: Item[]; activity: Item; busy: boolean; submit: (path: string, build: (form: FormData) => Item, success: string) => (event: FormEvent<HTMLFormElement>) => Promise<void>; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const isBrand = typeof activity.applications === "number";
  const brand = obj(campaign.brand);
  return <div className="marketplace-two-column">
    <section className="marketplace-panel"><CampaignActivity activity={activity} />
      <div className="marketplace-line-heading"><Status value={campaign.status} /><span>Deadline {date(campaign.deadline)}</span></div>
      {str(brand.name) && <div className="marketplace-campaign-brand marketplace-campaign-brand-detail"><BriefcaseBusiness size={15} /><span><strong>{str(brand.name)}</strong><small>{str(brand.category).replaceAll("_", " ")} · {str(brand.location)}</small></span>{Boolean(brand.website) && <a href={str(brand.website)} target="_blank" rel="noopener noreferrer">Website <ArrowRight size={14} /></a>}</div>}
      <h2 className="marketplace-detail-title">{str(campaign.title)}</h2><p className="marketplace-detail-brief">{str(campaign.brief)}</p>
      <div className="marketplace-detail-facts">
        <div><small>Compensation</small><strong>{campaign.compensation === "gifted" ? (Number(campaign.productValuePaise || 0) > 0 ? `Product worth ${money(campaign.productValuePaise)}` : "Gifted product") : `${money(campaign.budgetPaise)} per creator${campaign.compensation === "paid_and_gifted" ? " + product" : ""}`}</strong></div>
        <div><small>Category</small><strong>{str(campaign.category) || "—"}</strong></div>
        <div><small>Creator location</small><strong>{str(campaign.location) || "Anywhere in India"}</strong></div>
        <div><small>Creators needed</small><strong>{Number(campaign.creatorsWanted || 1)}</strong></div>
        <div><small>Minimum followers</small><strong>{Number(campaign.minFollowers || 0) > 0 ? Number(campaign.minFollowers).toLocaleString("en-IN") : "Any"}</strong></div>
        <div><small>Audience</small><strong>{str(campaign.targetAudience)}</strong></div>
      </div>
      <SectionTitle eyebrow="SCOPE" title="Deliverables" /><div className="marketplace-chip-row">{Array.isArray(campaign.deliverables) && campaign.deliverables.map((item) => <span key={String(item)}>{String(item)}</span>)}</div>
    </section>
    <aside className="marketplace-panel marketplace-side-panel">{isBrand ? <><SectionTitle eyebrow="APPLICATIONS" title={`${applications.length} creator responses`} />{applications.length ? <div className="marketplace-list marketplace-stacked">{applications.map((item) => { const creator = obj(item.influencer); const instagram = obj(creator.instagram); return <article key={str(item._id)}><div className="marketplace-line-heading"><strong>{str(creator.displayName) || "Creator"}</strong><Status value={item.status} /></div><small className="marketplace-applicant-meta">{str(creator.location)} · {Number(instagram.verifiedFollowers || 0).toLocaleString("en-IN")} verified followers · {str(creator.tier) || "Verified creator"}</small><p>{str(item.pitch)}</p>{typeof item.proposedPricePaise === "number" && <small className="marketplace-applicant-meta">Proposed price: <strong>{money(item.proposedPricePaise)}</strong></small>}{item.status === "pending" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/accept`, {}, "Application accepted.")}>Accept</button><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/decline`, {}, "Application declined.")}>Decline</button></div>}</article>; })}</div> : <p>No applications yet.</p>}</> : <><span className="marketplace-eyebrow">APPLY AS A CREATOR</span><h3>Interested in this campaign?</h3><p>Send a short, specific pitch. Your Instagram must be verified through Meta.</p><form className="marketplace-form" onSubmit={submit(`/campaigns/${str(campaign._id)}/apply`, (form) => ({ pitch: form.get("pitch"), ...(form.get("priceRupees") ? { proposedPricePaise: Math.round(Number(form.get("priceRupees")) * 100) } : {}) }), "Application sent. The brand has been notified.")}><Textarea label="Your pitch" name="pitch" placeholder="How would you bring this campaign to life?" />{campaign.compensation !== "gifted" && <Field label={`Your price (₹, optional, up to ${money(campaign.budgetPaise)})`} name="priceRupees" type="number" required={false} placeholder="Leave empty to accept the budget" />}<button disabled={busy} className="marketplace-primary">Apply to campaign <ArrowRight size={16} /></button></form></>}</aside>
  </div>;
}

function MessageRow({ message, userId, busy, submit, senderLabel }: { message: Item; userId: string; busy: boolean; submit: (path: string, build: (form: FormData) => Item, success: string) => (event: FormEvent<HTMLFormElement>) => Promise<void>; senderLabel?: string }) {
  return <div className={`marketplace-message${message.senderId === userId ? " is-mine" : ""}`}><small>{message.senderId === userId ? "You" : senderLabel || `Participant ${str(message.senderId).slice(-8)}`} · {date(message.createdAt)}</small>{Boolean(message.text) && <p>{str(message.text)}</p>}{arr(message.attachments).map((file) => <a className="marketplace-attachment-link" key={str(file.id)} href={`/api/marketplace/files?fileId=${encodeURIComponent(str(file.id))}`} download>{str(file.name)} · {typeof file.size === "number" ? Math.ceil(file.size / 1024) : 0} KB ↓</a>)}{message.senderId !== userId && <details className="marketplace-report"><summary>Report this message</summary><form className="marketplace-form" onSubmit={submit(`/messages/${str(message._id)}/report`, (form) => ({ reason: form.get("reason") }), "Message report sent to marketplace administrators.")}><Field label="Reason" name="reason" placeholder="Explain the concern" /><button className="marketplace-secondary" disabled={busy}>Send report</button></form></details>}</div>;
}

function AttachmentUploader({ collaborationId, busy, mutate }: { collaborationId: string; busy: boolean; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function submitFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = new FormData(form).getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length || files.length > 5 || files.some((file) => file.size > 10 * 1024 * 1024)) { setError("Choose up to five files, each under 10 MB."); return; }
    setUploading(true); setError("");
    try {
      const attachmentIds: string[] = [];
      for (const file of files) {
        const response = await fetch(`/api/marketplace/files?collaborationId=${encodeURIComponent(collaborationId)}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": file.name.replace(/[^\x20-\x7E]/g, "_") }, body: file });
        const payload = await readJson(response) as Data;
        if (!response.ok) throw new Error(str(payload.error) || "File upload failed.");
        attachmentIds.push(str(obj(payload.file).id));
      }
      const sent = await mutate(`/collaborations/${collaborationId}/messages`, { text: "", clientId: crypto.randomUUID(), attachmentIds }, "Attachment sent privately.");
      if (sent) form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "File upload failed."); }
    finally { setUploading(false); }
  }
  return <form className="marketplace-attachment-form" onSubmit={submitFiles}><label>Attach JPEG, PNG, WebP, MP4 or PDF <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" required /></label><button className="marketplace-secondary" disabled={busy || uploading}>{uploading ? "Uploading…" : "Send files"}</button>{error && <span role="alert">{error}</span>}<small>Up to five files, 10 MB each. Files are visible only to collaboration members and download as attachments.</small></form>;
}

function Conversation({ id, data, messages, busy, submit, mutate, revisionNote, setRevisionNote, userId, onlineCount, summary = {} }: { id: string; data: Data; messages: Item[]; busy: boolean; submit: (path: string, build: (form: FormData) => Item, success: string) => (event: FormEvent<HTMLFormElement>) => Promise<void>; mutate: (path: string, body: Item, success: string) => Promise<Data | null>; revisionNote: string; setRevisionNote: (value: string) => void; userId: string; onlineCount: number | null; summary?: Item }) {
  const collaboration = obj(data.collaboration); const offers = arr(data.offers); const deliverables = arr(data.deliverables); const agreement = obj(data.agreement); const order = obj(data.order);
  const senderName = (senderId: unknown) => senderId === collaboration.influencerId ? str(summary.creatorName) || "Creator" : str(summary.brandName) || "Brand team";
  const isBooking = Boolean(summary.isBooking) || collaboration.source === "package_booking";
  return <div className="marketplace-conversation"><section className="marketplace-panel"><div className="marketplace-line-heading"><div><span className="marketplace-eyebrow">{isBooking ? "PACKAGE BOOKING" : "CAMPAIGN CONVERSATION"}</span><h3>{str(summary.campaignTitle) || `Collaboration ${id.slice(-8)}`}</h3><small className="mp-inbox-context">{[str(summary.brandName), str(summary.creatorName)].filter(Boolean).join(" × ")}</small>{onlineCount !== null && <small className="marketplace-online">{onlineCount} online now</small>}</div><Status value={collaboration.status} /></div><div className="marketplace-message-list" aria-live="polite">{messages.length ? messages.map((message) => <MessageRow key={str(message._id)} message={message} userId={userId} busy={busy} submit={submit} senderLabel={senderName(message.senderId)} />) : <p className="marketplace-muted">Start the conversation with a message.</p>}</div><form className="marketplace-message-form" onSubmit={submit(`/collaborations/${id}/messages`, (form) => ({ text: form.get("text"), clientId: crypto.randomUUID() }), "Message sent.")}><input name="text" aria-label="Message" placeholder="Write a message…" maxLength={4000} required /><button disabled={busy} aria-label="Send message"><Send size={17} /></button></form><AttachmentUploader collaborationId={id} busy={busy} mutate={mutate} /></section>
    <section className="marketplace-panel"><SectionTitle eyebrow="PRICE & TERMS" title="Negotiation" />{offers.map((offer) => <article className="marketplace-offer" key={str(offer._id)}><div className="marketplace-line-heading"><strong>{money(offer.amountPaise)}</strong><Status value={offer.status} /></div><p>{str(offer.terms)}</p>{offer.status === "open" && offer.proposerId !== userId && <button disabled={busy} onClick={() => void mutate(`/offers/${str(offer._id)}/accept`, {}, "Terms accepted.")}>Accept this offer</button>}</article>)}{collaboration.status === "negotiating" && <form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/offers`, (form) => ({ amountPaise: Math.round(Number(form.get("amountRupees")) * 100), terms: form.get("terms") }), "Proposal sent.")}><div className="marketplace-form-grid"><Field label="Proposed amount (₹)" name="amountRupees" type="number" /><Textarea label="Scope, usage and timing" name="terms" placeholder="The agreed work, deadlines and rights" /></div><button className="marketplace-secondary" disabled={busy}>Send proposal</button></form>}</section>
    {Boolean(agreement._id) && <section className="marketplace-panel"><SectionTitle eyebrow="AGREED TERMS" title="Agreement record" /><div className="marketplace-data-line"><span>Accepted amount</span><strong>{money(agreement.amountPaise)}</strong></div><p>{str(agreement.terms)}</p><small>Accepted {date(agreement.agreedAt)} by both parties through a proposal and acceptance. This record is not an electronic signature or legal contract.</small></section>}
    {collaboration.status === "terms_agreed" && <section className="marketplace-panel"><SectionTitle eyebrow="CAMPAIGN TERMS" title="Agreed collaboration" /><div className="marketplace-data-line"><span>Agreed amount · INR</span><strong>{money(order.amountPaise || agreement.amountPaise)}</strong></div><p>Payment processing is disabled. These agreed terms are a collaboration record, not a payment request.</p></section>}
    <section className="marketplace-panel"><SectionTitle eyebrow="CONTENT REVIEW" title="Deliverables" />{deliverables.map((item) => <article className="marketplace-offer" key={str(item._id)}><div className="marketplace-line-heading"><strong>{str(item.title)}</strong><Status value={item.status} /></div><a href={str(item.contentUrl)} target="_blank" rel="noopener noreferrer">Open submitted content ↗</a>{item.status === "submitted" && collaboration.influencerId !== userId && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/deliverables/${str(item._id)}/approve`, { note: "" }, "Content approved.")}>Approve</button><button disabled={busy} onClick={() => void mutate(`/deliverables/${str(item._id)}/revise`, { note: revisionNote }, "Revision requested.")}>Request revision</button><input aria-label="Revision note" placeholder="Revision note" value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} /></div>}{Boolean(item.reviewNote) && <p>Review note: {str(item.reviewNote)}</p>}{item.status === "revision_requested" && item.submittedBy === userId && <form className="marketplace-form" onSubmit={submit(`/deliverables/${str(item._id)}/resubmit`, (form) => ({ contentUrl: form.get("contentUrl"), note: form.get("note") }), "Revision submitted.")}><Field label="Revised HTTPS content link" name="contentUrl" type="url" placeholder="https://..." /><Textarea label="Revision note" name="note" required={false} /><button className="marketplace-secondary" disabled={busy}>Submit revision</button></form>}</article>)}{collaboration.status === "terms_agreed" && collaboration.influencerId === userId && <form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/deliverables`, (form) => ({ title: form.get("title"), contentUrl: form.get("contentUrl"), note: form.get("note") }), "Content submitted for review.")}><Field label="Deliverable title" name="title" placeholder="Product launch Reel" /><Field label="HTTPS content link" name="contentUrl" type="url" placeholder="https://..." /><Textarea label="Note" name="note" required={false} /><button className="marketplace-secondary" disabled={busy}>Submit content</button></form>}{collaboration.status === "terms_agreed" && collaboration.influencerId !== userId && deliverables.length > 0 && <button className="marketplace-primary" disabled={busy} onClick={() => void mutate(`/collaborations/${id}/complete`, {}, "Work confirmed complete. Payment and payout processing remain disabled.")}>Confirm completion</button>}</section>
    {collaboration.status === "completed" && <section className="marketplace-panel"><SectionTitle eyebrow="FEEDBACK" title="Leave a review" /><form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/reviews`, (form) => ({ rating: Number(form.get("rating") || 5), communication: Number(form.get("communication") || 5), timeliness: Number(form.get("timeliness") || 5), satisfaction: Number(form.get("satisfaction") || 5), comment: form.get("comment") }), "Review submitted.")}>{data.viewerRole === "brand" ? <div className="marketplace-form-grid">{[["communication", "Communication"], ["timeliness", "Timeliness"], ["satisfaction", "Satisfaction"]].map(([name, label]) => <label key={name} className="marketplace-field"><span>{label}</span><select name={name} defaultValue="5">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label>)}</div> : <label className="marketplace-field"><span>Rating</span><select name="rating">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label>}<Textarea label="Review" name="comment" placeholder="How did the collaboration go?" /><button className="marketplace-secondary" disabled={busy}>Submit review</button></form></section>}
    <section className="marketplace-panel"><SectionTitle eyebrow="RESOLUTION" title="Raise a dispute" /><p>Explain a concern about scope, content or completion. Administrators review the case and hold payout eligibility; opening a case does not automatically issue a refund.</p><form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/disputes`, (form) => ({ reason: form.get("reason") }), "Dispute opened for administrator review.")}><Textarea label="What happened?" name="reason" placeholder="Describe the issue and the outcome you are seeking" /><button className="marketplace-secondary" disabled={busy}>Open dispute</button></form></section>
  </div>;
}

function CreatorInstagramPreview({ instagram }: { instagram: Item }) {
  const media = arr(instagram.recentMedia).slice(0, 9);
  return <section className="marketplace-own-instagram-profile">
    <div className="marketplace-line-heading"><strong>Your connected Instagram</strong>{str(instagram.profilePictureUrl) && <SafeImage className="marketplace-creator-avatar" src={str(instagram.profilePictureUrl)} alt="" width={40} height={40} unoptimized />}</div>
    <p>Recent posts and profile details are loaded from your authorized Instagram connection. Private Insights remain visible only to you.</p>
    {media.length ? <div className="marketplace-own-instagram-media">{media.map((post, index) => { const src = str(post.thumbnailUrl) || str(post.mediaUrl); return src ? <a key={str(post.id) || index} href={str(post.permalink) || "https://www.instagram.com/" + encodeURIComponent(str(instagram.username)) + "/"} target="_blank" rel="noopener noreferrer" aria-label={"Open your Instagram post " + (index + 1)}><SafeImage src={src} alt={str(post.caption) || "Your Instagram post"} fill sizes="(max-width: 480px) 28vw, 110px" unoptimized /></a> : null; })}</div> : <div className="marketplace-instagram-media-empty"><Camera size={18} /> Meta did not return recent public media for this account. Your follower verification is still saved.</div>}
    {Boolean(instagram.mediaFetchedAt) && <small>Media last refreshed {date(instagram.mediaFetchedAt)} · Meta API</small>}
  </section>;
}

function InstagramInsightsPanel() {
  const [report, setReport] = useState<Data>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await fetch("/api/marketplace/instagram/insights", { cache: "no-store" }); const result = await readJson(response) as Data; if (!response.ok) throw new Error(str(result.error) || "Could not load Instagram insights."); setReport(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load Instagram insights."); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(initial); }, [load]);
  async function refreshInsights() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/marketplace/instagram/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const result = await readJson(response) as Data; if (!response.ok) throw new Error(str(result.error) || "Could not refresh Instagram insights."); setReport((current) => ({ ...current, latest: obj(result.report), connected: true })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh Instagram insights."); }
    finally { setBusy(false); }
  }
  const latest = obj(report.latest);
  const metrics = arr(latest.metrics);
  return <section className="marketplace-instagram-insights"><div className="marketplace-line-heading"><strong>Authorized Instagram insights</strong>{typeof report.username === "string" && <small>@{report.username}</small>}</div><p>Reach and engagement are fetched from Meta’s API after you grant the Insights permission.</p><button className="marketplace-secondary" type="button" disabled={busy || !report.connected} onClick={() => void refreshInsights()}>{busy ? "Fetching Meta data…" : "Refresh insights"}</button>{metrics.length > 0 && <div className="marketplace-stat-row">{metrics.map((item) => <article key={str(item.name)}><span>{str(item.title) || str(item.name)}</span><strong>{Number(item.value).toLocaleString("en-IN")}</strong><small>{str(item.period)} · Meta API</small></article>)}</div>}{Boolean(latest.fetchedAt) && <small>Fetched {date(latest.fetchedAt)} · {str(latest.source)}</small>}{error && <p role="alert" className="marketplace-form-note">{error}</p>}</section>;
}

function AdminProfileRow({ profile, kind, busy, mutate }: { profile: Item; kind: "brand" | "influencer"; busy: boolean; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const [reason, setReason] = useState("");
  const label = kind === "brand" ? str(profile.name) : str(profile.displayName);
  return <article><div className="marketplace-line-heading"><strong>{label}</strong><Status value={profile.status} /></div>
    <p>{kind === "brand" ? `${str(profile.category).replaceAll("_", " ")} · ${str(profile.location)}` : `Instagram: ${str(profile.instagramUsername) || "Not connected"} · API followers: ${typeof obj(profile.instagram).verifiedFollowers === "number" ? Number(obj(profile.instagram).verifiedFollowers).toLocaleString("en-IN") : "Unavailable"}`}</p>
    <label className="marketplace-field"><span>Decision note</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for the decision" maxLength={500} /></label>
    <div className="marketplace-actions">{["approved", "rejected", "suspended"].map((decision) => <button key={decision} disabled={busy || profile.status === decision} onClick={() => void mutate(`/admin/profiles/${str(profile._id)}/decision`, { kind, decision, reason }, `${label} ${decision}.`)}>{decision}</button>)}</div>
  </article>;
}

function AdminCaseRow({ item, type, busy, mutate }: { item: Item; type: "disputes" | "message-reports" | "verification-requests"; busy: boolean; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const [note, setNote] = useState("");
  const decisions = type === "verification-requests" ? ["reviewed", "dismissed"] : ["resolved", "dismissed"];
  const reportedMessage = obj(item.reportedMessage);
  return <article><div className="marketplace-line-heading"><strong>{type === "verification-requests" ? `@${str(item.instagramUsername)}` : `${type === "disputes" ? "Dispute" : "Message report"} ${str(item._id).slice(-8)}`}</strong><Status value={item.status} /></div>
    <p>{str(item.reason) || str(item.note)}</p>{type === "message-reports" && <blockquote className="marketplace-evidence">{str(reportedMessage.text) || "The reported message is unavailable."}</blockquote>}<label className="marketplace-field"><span>Review note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record why you made this decision" maxLength={1000} /></label>
    <div className="marketplace-actions">{decisions.map((decision) => <button key={decision} disabled={busy || note.trim().length < 10} onClick={() => void mutate(`/admin/${type}/${str(item._id)}/decision`, { decision, note }, `Case ${decision}.`)}>{decision}</button>)}</div>
  </article>;
}

function AdminPanel({ data, busy, mutate }: { data: Data; busy: boolean; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const influencers = arr(data.influencers), brands = arr(data.brands), requests = arr(data.verificationRequests), disputes = arr(data.disputes), reports = arr(data.messageReports), orders = arr(data.orders), refunds = arr(data.refunds), payouts = arr(data.payouts), anomalies = arr(data.anomalies), providerDisputes = arr(data.providerDisputes);
  const commission = String(Number(obj(data.settings).commissionBps ?? 1000) / 100);
  return <>
    <div className="marketplace-stat-row"><article><span>Influencers</span><strong>{influencers.length}</strong><small>Review API eligibility</small></article><article><span>Brands</span><strong>{brands.length}</strong><small>Approve before publishing</small></article><article><span>Open cases</span><strong>{requests.length + disputes.length + reports.length}</strong><small>Identity, reports and disputes</small></article></div>
    <Banner tone="warn">Manual identity review cannot verify follower counts. Influencer approval requires current authorized Meta data. Payout transfers are held until supported merchant route onboarding, KYC, and settlement operations are accepted.</Banner>
    <section className="marketplace-panel"><SectionTitle eyebrow="PLATFORM SETTINGS" title="Commission" /><p>This saved commission is applied to new campaign and service orders. It does not move funds by itself.</p><form className="marketplace-form" onSubmit={async (event) => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get("commissionPercent")); await mutate("/admin/settings", { commissionBps: Math.round(value * 100) }, "Commission setting saved."); }}><Field label="Commission (%)" name="commissionPercent" type="number" defaultValue={commission} /><button className="marketplace-secondary" disabled={busy}>Save commission</button></form></section>
    <SectionTitle eyebrow="FINANCIAL OPERATIONS" title="Payments disabled" /><p>Checkout, refunds and payouts are disabled. Existing payment records are read-only during this stage.</p><div className="marketplace-list marketplace-stacked">{orders.map((order) => <article key={str(order._id)}><div className="marketplace-line-heading"><strong>Order {str(order._id).slice(-8)} · {money(order.amountPaise)}</strong><Status value={order.paymentStatus} /></div><p>Checkout: {str(order.checkoutState)} · Refunds: {money(order.refundedPaise)} · Payout: {str(order.payoutStatus)}</p></article>)}{!orders.length && <Empty title="No campaign payment records">Payment processing is currently turned off.</Empty>}</div>
    <SectionTitle eyebrow="SETTLEMENT QUEUE" title="Influencer payouts" /><div className="marketplace-list marketplace-stacked">{payouts.map((payout) => <article key={str(payout._id)}><div className="marketplace-line-heading"><strong>Payout {str(payout._id).slice(-8)} · {money(payout.amountPaise)}</strong><Status value={payout.status} /></div><p>Route onboarding and KYC are required before any transfer can be sent.</p></article>)}{!payouts.length && <Empty title="No payouts queued">Completed funded collaborations create a held payout record.</Empty>}</div>
    {refunds.length > 0 && <><SectionTitle eyebrow="REFUND RECONCILIATION" title="Recent refunds" /><div className="marketplace-list marketplace-stacked">{refunds.map((refund) => <article key={str(refund._id)}><div className="marketplace-line-heading"><strong>{money(refund.amountPaise)}</strong><Status value={refund.status} /></div><p>{str(refund.reason)}</p></article>)}</div></>}
    {anomalies.length > 0 && <><SectionTitle eyebrow="MANUAL REVIEW REQUIRED" title="Payment anomalies" /><div className="marketplace-list marketplace-stacked">{anomalies.map((item) => <article key={str(item._id)}><div className="marketplace-line-heading"><strong>Order {str(item.orderId).slice(-8)}</strong><Status value={item.status} /></div><p>A second captured payment requires provider reconciliation before payout.</p></article>)}</div></>}
    <SectionTitle eyebrow="ACCOUNT REVIEW" title="Brand profiles" /><div className="marketplace-list marketplace-stacked">{brands.map((brand) => <AdminProfileRow key={str(brand._id)} profile={brand} kind="brand" busy={busy} mutate={mutate} />)}{!brands.length && <Empty title="No brands to review">New brand applications will appear here.</Empty>}</div>
    <SectionTitle eyebrow="CREATOR REVIEW" title="Influencer profiles" /><div className="marketplace-list marketplace-stacked">{influencers.map((item) => <AdminProfileRow key={str(item._id)} profile={item} kind="influencer" busy={busy} mutate={mutate} />)}{!influencers.length && <Empty title="No creators to review">Creator profiles will appear here after a verification request.</Empty>}</div>
    <SectionTitle eyebrow="IDENTITY FALLBACK" title="Review requests" /><div className="marketplace-list marketplace-stacked">{requests.map((item) => <AdminCaseRow key={str(item._id)} item={item} type="verification-requests" busy={busy} mutate={mutate} />)}{!requests.length && <Empty title="No pending requests">Manual review results remain separate from API follower verification.</Empty>}</div>
    <SectionTitle eyebrow="SAFETY" title="Message reports" /><div className="marketplace-list marketplace-stacked">{reports.map((item) => <AdminCaseRow key={str(item._id)} item={item} type="message-reports" busy={busy} mutate={mutate} />)}{!reports.length && <Empty title="No message reports">User reports will appear here.</Empty>}</div>
    <SectionTitle eyebrow="RESOLUTION" title="Collaboration disputes" /><div className="marketplace-list marketplace-stacked">{disputes.map((item) => <AdminCaseRow key={str(item._id)} item={item} type="disputes" busy={busy} mutate={mutate} />)}{!disputes.length && <Empty title="No open disputes">Disputes raised by participants will appear here.</Empty>}</div>
    {providerDisputes.length > 0 && <><SectionTitle eyebrow="PAYMENT PROVIDER CASES" title="External payment disputes" /><div className="marketplace-list marketplace-stacked">{providerDisputes.map((item) => <AdminProviderDisputeRow key={str(item._id)} item={item} busy={busy} mutate={mutate} />)}</div></>}
  </>;
}

function AdminProviderDisputeRow({ item, busy, mutate }: { item: Item; busy: boolean; mutate: (path: string, body: Item, success: string) => Promise<Data | null> }) {
  const [note, setNote] = useState("");
  return <article><div className="marketplace-line-heading"><strong>Order {str(item.orderId).slice(-8)}</strong><Status value={item.resolution || item.providerStatus} /></div><p>Resolve the case with Razorpay first, then record the provider outcome here. This only clears internal payout eligibility; transfers remain disabled until route onboarding.</p>{!item.resolution && <><label className="marketplace-field"><span>Provider case outcome and reference</span><input value={note} onChange={(event) => setNote(event.target.value)} minLength={20} maxLength={1000} placeholder="Resolution, provider case reference, and evidence" /></label><div className="marketplace-actions">{["resolved", "dismissed"].map((decision) => <button key={decision} disabled={busy || note.trim().length < 20} onClick={() => void mutate(`/admin/provider-disputes/${str(item._id)}/decision`, { decision, note }, `Provider case ${decision}; payout transfer remains disabled.`)}>{decision}</button>)}</div></>}</article>;
}

