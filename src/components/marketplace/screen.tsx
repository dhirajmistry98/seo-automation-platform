"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Camera, CircleAlert, Clock3, MapPin, Megaphone, MessageSquareText, Package, Plus, RefreshCw, Search, Send, ShieldCheck, ShoppingCart, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { RatingBadge } from "./creator-tile";
import { readJson } from "@/lib/read-json";

type View = "overview" | "influencer" | "brand" | "discover" | "campaigns" | "campaign" | "inbox" | "admin";
type Item = Record<string, unknown>;
type Data = Record<string, unknown>;
const api = "/api/marketplace/v1";
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const money = (paise: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof paise === "number" ? paise / 100 : 0);
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const listField = (form: FormData, name: string) => String(form.get(name) || "").split(",").map((value) => value.trim()).filter(Boolean);
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
  const update = (key: string, field: keyof Omit<PackageDraft, "key">, value: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  return <fieldset className="mp-package-editor">
    <legend>Packages brands can book</legend>
    <p className="marketplace-form-note">Fixed-price packages let brands book you directly from your profile. List up to 10.</p>
    <input type="hidden" name="packagesJson" value={JSON.stringify(rows)} />
    {rows.map((row, index) => <div className="mp-package-row" key={row.key}>
      <div className="mp-package-row-head"><strong>Package {index + 1}</strong><button type="button" aria-label={`Remove package ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 size={14} /></button></div>
      <div className="marketplace-form-grid">
        <label className="marketplace-field"><span>Package name</span><input list="mp-package-presets" value={row.title} onChange={(event) => update(row.key, "title", event.target.value)} placeholder="1 Instagram Reel" maxLength={100} /></label>
        <label className="marketplace-field"><span>Price (₹)</span><input type="number" min="1" value={row.price} onChange={(event) => update(row.key, "price", event.target.value)} placeholder="8000" /></label>
      </div>
      <div className="marketplace-form-grid">
        <label className="marketplace-field"><span>What’s included</span><input value={row.deliverables} onChange={(event) => update(row.key, "deliverables", event.target.value)} placeholder="One 30–60s edited Reel, brand tag, 30-day usage rights" maxLength={500} /></label>
        <label className="marketplace-field"><span>Delivery (days)</span><input type="number" min="1" max="90" value={row.deliveryDays} onChange={(event) => update(row.key, "deliveryDays", event.target.value)} placeholder="7" /></label>
      </div>
    </div>)}
    <datalist id="mp-package-presets">{PACKAGE_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist>
    {rows.length < 10 && <button type="button" className="marketplace-secondary" onClick={() => setRows((current) => [...current, { key: `new-${Date.now()}`, title: "", price: "", deliverables: "", deliveryDays: "7" }])}><Plus size={15} /> Add package</button>}
  </fieldset>;
}

function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "success" }) { return <div role="status" className={`marketplace-banner is-${tone}`}>{tone === "warn" ? <CircleAlert size={18} /> : <ShieldCheck size={18} />}<span>{children}</span></div>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="marketplace-empty"><Sparkles size={22} /><strong>{title}</strong><p>{children}</p></div>; }
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
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastDataSync, setLastDataSync] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [directory, setDirectory] = useState<"influencers" | "brands">("influencers");
  const [creatorTrack, setCreatorTrack] = useState<"standard" | "emerging">("standard");
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
        creatorParams.set("track", creatorTrack);
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
        result = await fetchJson(`/campaigns${mine ? "?mine=1" : ""}`);
      } else if (view === "campaign" && id) result = await fetchJson(`/campaigns/${id}`);
      else if (view === "admin" && personal.admin) result = await fetchJson("/admin");
      setData(result);
      setLastDataSync(Date.now());
    } catch (caught) { setNotice({ text: caught instanceof Error ? caught.message : "Unable to load marketplace data.", tone: "warn" }); }
    finally { if (!background) setLoading(false); }
  }, [fetchJson, view, id, mine, directoryInitialized, directoryQuery, directoryCategory, directoryLocation, directorySort, directoryMaxRate, directoryFollowers, creatorTrack]);
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
      if (params.get("track") === "emerging") setCreatorTrack("emerging");
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
        params.set("track", creatorTrack);
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
    event.preventDefault(); const form = event.currentTarget; const payload = await mutate(path, build(new FormData(form)), success); if (payload) form.reset();
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
        <div className="marketplace-stat-row"><article><span>Your brands</span><strong>{brands.length}</strong><small>Brand profiles in this marketplace</small></article><article><span>Creator profile</span><strong>{influencer._id ? "1" : "0"}</strong><small>{influencer._id ? str(influencer.status) : "Create a profile"}</small></article><article><span>Collaborations</span><strong>{collaborations.length}</strong><small>Private campaign workspaces</small></article></div>
        <SectionTitle eyebrow="CHOOSE YOUR SIDE" title="Two ways to collaborate" />
        <div className="marketplace-feature-grid"><Link href={`${basePath}/creator`} className="marketplace-feature-card"><UserRound size={26} /><span>FOR CREATORS</span><h3>Make your work discoverable</h3><p>Build a portfolio, connect Instagram and apply for campaigns when verified.</p><b>Open influencer studio <ArrowRight size={16} /></b></Link><Link href={`${basePath}/brand`} className="marketplace-feature-card"><BriefcaseBusiness size={26} /><span>FOR BRANDS</span><h3>Find a strong creative fit</h3><p>Present your business, publish briefs and manage collaborations with creators.</p><b>Open brand studio <ArrowRight size={16} /></b></Link></div>
        <Banner tone="warn">Payments, checkout, refunds, and payouts are disabled. Collaboration terms and deliverable workflows remain available. Official Instagram verification still requires approved Meta access.</Banner>
      </>}
      {view === "influencer" && <>
        <div className="marketplace-two-column"><section className="marketplace-panel"><SectionTitle eyebrow="YOUR PROFILE" title={influencer._id ? "Edit your creator details" : "Create a creator profile"} aside={influencer._id ? <span className="mp-studio-aside"><Link href={`${basePath}/creators/${encodeURIComponent(str(influencer._id))}`}>Preview public profile <ArrowRight size={13} /></Link><Status value={influencer.status} /></span> : null} />
          <form className="marketplace-form" onSubmit={submit("/influencers", (form) => ({ displayName: form.get("displayName"), creatorTrack: form.get("creatorTrack"), bio: form.get("bio"), location: form.get("location"), ratePaise: Math.round(Number(form.get("rateRupees")) * 100), categories: listField(form, "categories"), portfolio: listField(form, "portfolio"), packages: packageField(form) }), "Creator profile saved in the database.")}>
            <label className="marketplace-field"><span>Creator account</span><select name="creatorTrack" defaultValue={str(influencer.creatorTrack) || "standard"}><option value="standard">Standard influencer · 5,000+ verified followers</option><option value="emerging">Emerging Creator · under 5,000 verified followers</option></select></label>
            <Field label="Display name" name="displayName" placeholder="Your creator name" defaultValue={str(influencer.displayName)} /><Textarea label="About you" name="bio" placeholder="Your content style and audience" defaultValue={str(influencer.bio)} required={false} /><div className="marketplace-form-grid"><Field label="Location in India" name="location" placeholder="Mumbai, Maharashtra" defaultValue={str(influencer.location)} /><Field label="Starting rate (₹)" name="rateRupees" type="number" defaultValue={typeof influencer.ratePaise === "number" ? influencer.ratePaise / 100 : 0} /></div><Field label="Content categories (comma separated)" name="categories" placeholder="Fashion, Lifestyle" defaultValue={Array.isArray(influencer.categories) ? influencer.categories.join(", ") : ""} /><PackageEditor key={str(influencer._id) || "new"} initial={influencer.packages} /><Field label="Portfolio HTTPS links (comma separated)" name="portfolio" required={false} placeholder="https://..." defaultValue={Array.isArray(influencer.portfolio) ? influencer.portfolio.join(", ") : ""} /><button className="marketplace-primary" disabled={busy}>Save creator profile <ArrowRight size={16} /></button>
          </form></section><aside className="marketplace-panel marketplace-side-panel"><Camera size={28} /><span className="marketplace-eyebrow">VERIFICATION</span><h3>Build trust with verified data</h3><p>Connect your Instagram professional account to confirm ownership and retrieve current follower data. Standard influencer eligibility starts at 5,000 verified followers. Emerging Creator accounts are listed in their own directory and can be booked, invited and apply to campaigns just like standard creators. Manual review does not verify statistics.</p>{Boolean(me.instagramConnectAvailable) && Boolean(influencer._id) && <Link className="marketplace-primary" href="/api/marketplace/meta/authorize">Connect Instagram securely <ArrowRight size={16} /></Link>}{!me.instagramConnectAvailable && <p className="marketplace-form-note">Meta connection is unavailable until the app owner configures approved Meta credentials.</p>}<div className="marketplace-data-line"><span>Instagram followers</span><strong>{typeof obj(influencer.instagram).verifiedFollowers === "number" ? Number(obj(influencer.instagram).verifiedFollowers).toLocaleString("en-IN") : "Not verified"}</strong></div><div className="marketplace-data-line"><span>Creator tier</span><strong>{str(influencer.tier) || (str(influencer.creatorTrack) === "emerging" ? "Emerging Creator" : "Pending verification")}</strong></div>{Boolean(influencer._id) && <form className="marketplace-form" onSubmit={submit("/verification-requests", (form) => ({ instagramUsername: form.get("instagramUsername") }), "Identity review request recorded. Official follower verification is still required.")}><Field label="Instagram username" name="instagramUsername" placeholder="your.handle" defaultValue={str(influencer.instagramUsername)} /><button className="marketplace-secondary" disabled={busy}>Request identity review</button></form>}{Boolean(obj(influencer.instagram).providerUserId) && <><CreatorInstagramPreview instagram={obj(influencer.instagram)} /><InstagramInsightsPanel /></>}</aside></div>
      </>}
      {view === "brand" && <><div className="marketplace-two-column"><section className="marketplace-panel"><SectionTitle eyebrow="BRAND ACCOUNT" title="Create a brand profile" /><form className="marketplace-form" onSubmit={submit("/brands", (form) => ({ name: form.get("name"), description: form.get("description"), category: form.get("category"), location: form.get("location"), website: form.get("website"), offerings: listField(form, "offerings") }), "Brand saved and submitted for review.")}><Field label="Brand name" name="name" placeholder="Your business name" /><label className="marketplace-field"><span>Business category</span><select name="category" required><option value="startup">Startup</option><option value="small_business">Small business</option><option value="local_business">Local business</option><option value="ecommerce">E-commerce</option><option value="established_company">Established company</option><option value="marketing_agency">Marketing agency</option><option value="enterprise">Enterprise</option></select></label><Textarea label="About your business" name="description" required={false} placeholder="What you make and who it serves" /><div className="marketplace-form-grid"><Field label="Location in India" name="location" placeholder="Bengaluru, Karnataka" /><Field label="Website (HTTPS)" name="website" type="url" placeholder="https://example.com" required={false} /></div><Field label="Products or services (comma separated)" name="offerings" placeholder="Skincare, Wellness" required={false} /><button className="marketplace-primary" disabled={busy}>Create brand <Plus size={16} /></button></form></section><aside className="marketplace-panel marketplace-side-panel"><BriefcaseBusiness size={28} /><span className="marketplace-eyebrow">YOUR BRANDS</span><h3>{brands.length} brand account{brands.length === 1 ? "" : "s"}</h3><div className="marketplace-list">{brands.map((brand) => <article key={str(brand._id)}><strong>{str(brand.name)}</strong><Status value={brand.status} /><p>{str(brand.category).replaceAll("_", " ")} · {str(brand.location)}</p></article>)}{!brands.length && <p>Create your first brand to start a campaign after approval.</p>}</div></aside></div></>}
      {view === "discover" && <>
        <section className="marketplace-panel marketplace-directory-toolbar" aria-label="Marketplace directories">
          <div className="marketplace-tab-row" role="tablist" aria-label="Choose a directory">
            <button type="button" role="tab" aria-selected={directory === "influencers"} className={directory === "influencers" ? "is-active" : ""} onClick={() => setDirectory("influencers")}><UserRound size={16} /> Influencers <span>{Number(data.influencersTotal || 0)}</span></button>
            <button type="button" role="tab" aria-selected={directory === "brands"} className={directory === "brands" ? "is-active" : ""} onClick={() => setDirectory("brands")}><BriefcaseBusiness size={16} /> Brands <span>{Number(data.brandsTotal || 0)}</span></button>
          </div>
          {directory === "influencers" && <div className="marketplace-tab-row" role="tablist" aria-label="Choose creator eligibility"><button type="button" role="tab" aria-selected={creatorTrack === "standard"} className={creatorTrack === "standard" ? "is-active" : ""} onClick={() => { setCreatorTrack("standard"); setDirectoryFollowers(""); }}>Standard · 5K+</button><button type="button" role="tab" aria-selected={creatorTrack === "emerging"} className={creatorTrack === "emerging" ? "is-active" : ""} onClick={() => { setCreatorTrack("emerging"); setDirectoryFollowers(""); }}>Emerging Creators</button></div>}
          <Link href={`${basePath}/cart`} className="marketplace-cart-link"><ShoppingCart size={16} /> Creator cart <span>{Number(data.cartTotal || 0)}</span></Link>
          <form className="marketplace-directory-search" onSubmit={(event) => { event.preventDefault(); setDirectoryQuery(directorySearchInput.trim()); setDirectoryLocation(directoryLocationInput.trim()); setDirectoryMaxRate(directoryMaxRateInput.trim()); }}>
            <Search size={17} aria-hidden="true" /><input aria-label="Search profiles" value={directorySearchInput} onChange={(event) => setDirectorySearchInput(event.target.value)} placeholder={directory === "influencers" ? "Search creators, categories or keywords" : "Search brands, products or keywords"} maxLength={80} />
            <button type="submit">Search</button>
            {directoryQuery && <button type="button" className="marketplace-search-clear" onClick={() => { setDirectorySearchInput(""); setDirectoryQuery(""); }}>Clear</button>}
          </form>
          {directory === "influencers" && <div className="marketplace-creator-filters">
            <label><span>Location</span><input value={directoryLocationInput} onChange={(event) => setDirectoryLocationInput(event.target.value)} placeholder="Worldwide or a city" maxLength={80} /></label>
            <label><span>Budget up to (₹)</span><input type="number" min="0" max="10000000" value={directoryMaxRateInput} onChange={(event) => setDirectoryMaxRateInput(event.target.value)} placeholder="Any budget" /></label>
            <label><span>Followers</span><select value={directoryFollowers} onChange={(event) => setDirectoryFollowers(event.target.value)}>{creatorTrack === "emerging" ? <><option value="">Any (under 5K)</option><option value="0-1000">Under 1K</option><option value="1000-5000">1K – 5K</option></> : <><option value="">Any</option><option value="5000-10000">5K – 10K · Nano</option><option value="10000-50000">10K – 50K · Micro</option><option value="50000-100000">50K – 100K · Mid</option><option value="100000-500000">100K – 500K · Macro</option><option value="500000-">500K+ · Mega</option></>}</select></label>
            <label><span>Sort creators</span><select value={directorySort} onChange={(event) => setDirectorySort(event.target.value)}><option value="followers_desc">Most followers</option><option value="followers_asc">Rising creators</option><option value="rate_asc">Lowest rate</option><option value="rate_desc">Highest rate</option></select></label>
            <button type="button" className={`marketplace-filter-apply${directoryLocation === directoryLocationInput.trim() && directoryMaxRate === directoryMaxRateInput.trim() ? " is-applied" : ""}`} onClick={() => { setDirectoryLocation(directoryLocationInput.trim()); setDirectoryMaxRate(directoryMaxRateInput.trim()); }}>Apply filters</button>
          </div>}
        </section>
        {directory === "influencers" && <>
          <div className="marketplace-discovery-intro"><div><span className="marketplace-eyebrow">{creatorTrack === "emerging" ? "EMERGING CREATORS" : "VERIFIED INSTAGRAM CREATORS"}</span><h2>{creatorTrack === "emerging" ? "Discover creators building their audience." : "Find the right creator for your next campaign."}</h2><p>{creatorTrack === "emerging" ? "Creators under 5,000 followers, verified through Meta. Save, invite and book them exactly like standard creators." : "Standard influencer profiles require at least 5,000 current, Meta-verified Instagram followers."} See creator-approved portfolio images and verified account data.</p></div><div className="marketplace-discovery-source"><Camera size={17} /><span>Instagram</span><BadgeCheck size={15} /></div></div>
          <div className="marketplace-creator-category-row" aria-label="Filter creators by niche">{["", "Beauty", "Fashion", "Lifestyle", "Food", "Travel", "Fitness", "Technology", "Home"].map((category) => <button type="button" key={category || "all"} className={directoryCategory === category ? "is-active" : ""} onClick={() => setDirectoryCategory(category)}>{category || "All niches"}</button>)}</div>
          <SectionTitle eyebrow="CREATOR PROFILES" title="Browse approved partners" aside={<span className="marketplace-count">{Number(data.influencersTotal || 0)} profiles</span>} />
          {discoveredInfluencers.length ? <div className="marketplace-card-grid">{discoveredInfluencers.map((item) => {
            const instagram = obj(item.instagram);
            const instagramUrl = str(item.instagramUsername).replace(/^@/, "");
            const portfolio = Array.isArray(item.portfolio) ? item.portfolio.filter((link): link is string => typeof link === "string" && link.startsWith("https://")).slice(0, 3) : [];
            const recentMedia = arr(instagram.recentMedia).slice(0, 4);
            const picture = str(instagram.profilePictureUrl);
            const alreadyInCart = cartIds.includes(str(item._id));
            return <article className="marketplace-card marketplace-creator-card" key={str(item._id)}>
              <div className="marketplace-creator-gallery" aria-label={`${str(item.displayName)} recent Instagram posts`}>
                {recentMedia.length ? recentMedia.map((media, index) => {
                  const imageUrl = str(media.thumbnailUrl) || str(media.mediaUrl);
                  const permalink = str(media.permalink);
                  return imageUrl ? <a key={str(media.id) || `${str(item._id)}-${index}`} href={permalink || (instagramUrl ? `https://www.instagram.com/${encodeURIComponent(instagramUrl)}/` : undefined)} target="_blank" rel="noopener noreferrer" aria-label={`Open Instagram post ${index + 1} by ${str(item.displayName)}`}><Image src={imageUrl} alt="" fill sizes="(max-width: 760px) 45vw, 18vw" unoptimized /></a> : <span key={`${str(item._id)}-${index}`} />;
                }) : <div className="marketplace-creator-gallery-empty"><Camera size={25} /><span>Creator portfolio</span><small>Media appears after the creator authorizes profile access.</small></div>}
                <span className="marketplace-creator-follower-badge"><Camera size={14} /> {Number(instagram.verifiedFollowers).toLocaleString("en-IN")} followers</span>
              </div>
              <div className="marketplace-creator-card-body">
                <div className="marketplace-creator-person">
                  {picture ? <Image className="marketplace-creator-avatar" src={picture} alt="" width={48} height={48} unoptimized /> : <span className="marketplace-creator-avatar marketplace-creator-avatar-empty"><UserRound size={20} /></span>}
                  <div><div className="marketplace-creator-name-line"><h3>{str(item.displayName)}</h3><BadgeCheck size={16} aria-label="Instagram verified" /><RatingBadge rating={item.rating} /></div><small>{instagramUrl ? `@${instagramUrl}` : "Instagram creator"} · {str(item.tier) ? `${str(item.tier)} tier` : "Emerging Creator"}</small></div>
                </div>
                <p>{str(item.bio) || "Creator profile"}</p>
                <div className="marketplace-chip-row">{Array.isArray(item.categories) && item.categories.slice(0, 4).map((category) => <span key={String(category)}>{String(category)}</span>)}</div>
                <div className="marketplace-creator-details"><span><MapPin size={14} /> {str(item.location) || "Location not specified"}</span><span>{typeof instagram.mediaCount === "number" ? `${instagram.mediaCount.toLocaleString("en-IN")} posts` : "Verified account"}</span><span>Checked {date(instagram.verifiedAt)}</span></div>
                {portfolio.length > 0 && <div className="marketplace-profile-links">{portfolio.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer">Portfolio {index + 1} <ArrowRight size={13} /></a>)}</div>}
                <footer><span>{Array.isArray(item.packages) && item.packages.length ? `${item.packages.length} package${item.packages.length === 1 ? "" : "s"} · from` : "Starting collaboration"}</span><strong>{money(typeof item.fromPricePaise === "number" ? item.fromPricePaise : item.ratePaise)}</strong></footer>
                <div className="marketplace-creator-actions"><button type="button" className="marketplace-secondary" onClick={() => setSelectedCreator(item)}>View profile</button><button type="button" className="marketplace-primary" disabled={cartBusyId === str(item._id) || alreadyInCart} onClick={() => void addCreatorToCart(str(item._id))}>{cartBusyId === str(item._id) ? "Adding…" : alreadyInCart ? "In your cart" : "Add to cart"}<ShoppingCart size={15} /></button></div>
                {instagramUrl && <a className="marketplace-creator-instagram-link" href={`https://www.instagram.com/${encodeURIComponent(instagramUrl)}/`} target="_blank" rel="noopener noreferrer">Open Instagram profile <ArrowRight size={13} /></a>}
                <Link className="marketplace-creator-full-profile" href={`${basePath}/creators/${encodeURIComponent(str(item._id))}`}>Open full creator profile <ArrowRight size={14} /></Link>
              {openBrandCampaigns.length > 0 && <form className="marketplace-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const campaignId = str(form.get("campaignId")); if (campaignId) await mutate(`/campaigns/${campaignId}/invite`, { influencerProfileId: item._id, message: form.get("message") }, "Invitation sent. The creator can respond in their inbox."); }}>
                <label className="marketplace-field"><span>Invite through a campaign</span><select name="campaignId">{openBrandCampaigns.map((campaign) => <option key={str(campaign._id)} value={str(campaign._id)}>{str(campaign.title)}</option>)}</select></label>
                <Field label="Invitation note" name="message" placeholder="Why this creator fits your brief" />
                <button className="marketplace-secondary" disabled={busy}>Send campaign invitation <ArrowRight size={15} /></button>
              </form>}
              </div>
            </article>;
          })}</div> : <Empty title={directoryQuery ? "No matching creators" : "No verified creators yet"}>{directoryQuery ? "Try a different name, category or location." : "Creator listings appear after official Instagram verification and marketplace approval."}</Empty>}
          {selectedCreator && (() => { const instagram = obj(selectedCreator.instagram); const media = arr(instagram.recentMedia).slice(0, 9); const username = str(selectedCreator.instagramUsername).replace(/^@/, ""); const portfolio = Array.isArray(selectedCreator.portfolio) ? selectedCreator.portfolio.filter((link): link is string => typeof link === "string" && link.startsWith("https://")).slice(0, 6) : []; return <div className="marketplace-profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCreator(null); }}><section role="dialog" aria-modal="true" aria-labelledby="marketplace-profile-dialog-title" className="marketplace-profile-dialog"><button type="button" className="marketplace-profile-dialog-close" aria-label="Close creator profile" onClick={() => setSelectedCreator(null)}><X size={19} /></button><div className="marketplace-profile-dialog-heading">{str(instagram.profilePictureUrl) ? <Image className="marketplace-creator-avatar" src={str(instagram.profilePictureUrl)} alt="" width={64} height={64} unoptimized /> : <span className="marketplace-creator-avatar marketplace-creator-avatar-empty"><UserRound size={24} /></span>}<div><span className="marketplace-card-meta"><BadgeCheck size={15} /> Meta verified · {str(selectedCreator.tier) || "Emerging Creator"}</span><h2 id="marketplace-profile-dialog-title">{str(selectedCreator.displayName)}</h2><small>{username ? `@${username}` : "Instagram creator"}</small></div></div><p className="marketplace-profile-dialog-bio">{str(selectedCreator.bio) || "This creator has not added a biography yet."}</p><div className="marketplace-profile-dialog-stats"><div><strong>{Number(instagram.verifiedFollowers || 0).toLocaleString("en-IN")}</strong><span>Verified followers</span></div><div><strong>{typeof instagram.mediaCount === "number" ? instagram.mediaCount.toLocaleString("en-IN") : "—"}</strong><span>Instagram posts</span></div><div><strong>{money(selectedCreator.ratePaise)}</strong><span>Starting rate</span></div><div><strong>{str(selectedCreator.location) || "Not listed"}</strong><span>Location</span></div></div><h3>Recent Instagram portfolio</h3>{media.length ? <div className="marketplace-profile-dialog-gallery">{media.map((post, index) => { const imageUrl = str(post.thumbnailUrl) || str(post.mediaUrl); const permalink = str(post.permalink); return imageUrl ? <a key={str(post.id) || index} href={permalink || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : undefined)} target="_blank" rel="noopener noreferrer" aria-label={`Open creator post ${index + 1}`}><Image src={imageUrl} alt={str(post.caption) || "Instagram creator portfolio image"} fill sizes="(max-width: 700px) 40vw, 220px" unoptimized /><span>{str(post.mediaType).toLowerCase() === "video" ? "VIDEO" : "INSTAGRAM"}</span></a> : null; })}</div> : <div className="marketplace-profile-dialog-empty"><Camera size={20} /><span>No public media was returned by Meta for this connected account.</span></div>}<div className="marketplace-chip-row">{Array.isArray(selectedCreator.categories) && selectedCreator.categories.map((category) => <span key={String(category)}>{String(category)}</span>)}</div>{portfolio.length > 0 && <div className="marketplace-profile-links">{portfolio.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer">Portfolio {index + 1} <ArrowRight size={13} /></a>)}</div>}<div className="marketplace-profile-dialog-actions"><button type="button" className="marketplace-secondary" onClick={() => setSelectedCreator(null)}>Close</button><button type="button" className="marketplace-primary" disabled={cartIds.includes(str(selectedCreator._id)) || cartBusyId === str(selectedCreator._id)} onClick={() => void addCreatorToCart(str(selectedCreator._id))}>{cartIds.includes(str(selectedCreator._id)) ? "In your cart" : cartBusyId === str(selectedCreator._id) ? "Adding…" : "Add to cart"}<ShoppingCart size={15} /></button></div></section></div>; })()}
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
          </article>)}</div> : <Empty title={directoryQuery ? "No matching brands" : "No approved brands yet"}>{directoryQuery ? "Try a different business name, category or location." : "Approved businesses will appear here as they join the marketplace."}</Empty>}
          {Boolean(data.brandsHasMore) && <button type="button" className="marketplace-load-more" disabled={directoryLoading} onClick={() => void loadMoreDirectory()}>{directoryLoading ? "Loading profiles…" : "Show more brands"}<ArrowRight size={16} /></button>}
          <div className="marketplace-directory-cta"><Megaphone size={19} /><span><strong>Want to work with a brand?</strong><small>Browse active campaigns and apply with a proposal to start the conversation.</small></span><Link href={`${basePath}/campaigns`}>Browse campaigns <ArrowRight size={15} /></Link></div>
        </>}
      </>}
      {view === "campaigns" && <><div className="marketplace-tab-row"><button className={!mine ? "is-active" : ""} onClick={() => setMine(false)}>Open campaigns</button><button className={mine ? "is-active" : ""} onClick={() => setMine(true)}>My brand campaigns</button></div><div className="marketplace-auto-refresh"><span><RefreshCw size={14} /> Auto-refreshes every 10 seconds{lastDataSync ? ` · Updated ${new Date(lastDataSync).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button type="button" onClick={() => void load(true)}><RefreshCw size={14} /> Refresh now</button></div>{mine && <section className="marketplace-panel"><SectionTitle eyebrow="NEW CAMPAIGN" title="Publish a brief" /><form className="marketplace-form" onSubmit={submit("/campaigns", (form) => ({ brandId: form.get("brandId"), title: form.get("title"), brief: form.get("brief"), targetAudience: form.get("targetAudience"), deliverables: listField(form, "deliverables"), budgetPaise: Math.round(Number(form.get("budgetRupees")) * 100), deadline: form.get("deadline") }), "Campaign published.")}><label className="marketplace-field"><span>Approved brand</span><select name="brandId" required>{brands.filter((brand) => brand.status === "approved").map((brand) => <option key={str(brand._id)} value={str(brand._id)}>{str(brand.name)}</option>)}</select></label><Field label="Campaign title" name="title" placeholder="Summer launch with local creators" /><Textarea label="Campaign brief" name="brief" placeholder="Describe the product, creative direction, usage rights and success criteria" /><div className="marketplace-form-grid"><Field label="Target audience" name="targetAudience" placeholder="Urban skincare customers, 20–35" /><Field label="Budget (₹)" name="budgetRupees" type="number" /></div><div className="marketplace-form-grid"><Field label="Deliverables (comma separated)" name="deliverables" placeholder="1 Reel, 2 Stories" /><Field label="Application deadline" name="deadline" type="date" /></div><button className="marketplace-primary" disabled={busy || !brands.some((brand) => brand.status === "approved")}>Publish campaign <ArrowRight size={16} /></button>{!brands.some((brand) => brand.status === "approved") && <p className="marketplace-form-note">A brand must be approved before it can publish campaigns.</p>}</form></section>}
        <SectionTitle eyebrow={mine ? "YOUR WORK" : "EXPLORE WORK"} title={mine ? "Brand campaigns" : "Open opportunities"} aside={<span className="marketplace-count">{arr(data.campaigns).length} campaigns</span>} />{arr(data.campaigns).length ? <div className="marketplace-card-grid">{arr(data.campaigns).map((campaign) => <Link href={`${basePath}/campaigns/${str(campaign._id)}`} className="marketplace-card marketplace-card-link" key={str(campaign._id)}><div className="marketplace-card-meta"><Megaphone size={15} /> <Status value={campaign.status} /></div>{str(obj(campaign.brand).name) && <span className="marketplace-campaign-brand"><BriefcaseBusiness size={13} /> {str(obj(campaign.brand).name)} · {str(obj(campaign.brand).location)}</span>}<h3>{str(campaign.title)}</h3><p>{str(campaign.brief)}</p><footer><span><Clock3 size={14} /> {date(campaign.deadline)}</span><strong>{money(campaign.budgetPaise)}</strong></footer></Link>)}</div> : <Empty title="No campaigns here yet">Approved brands can publish opportunities, and creators can apply while the campaign is open.</Empty>}</>}
      {view === "campaign" && <><Link className="marketplace-back" href={`${basePath}/campaigns`}>← All campaigns</Link>{data.campaign ? <CampaignDetail campaign={obj(data.campaign)} applications={arr(data.applications)} activity={obj(data.activity)} busy={busy} submit={submit} mutate={mutate} /> : <Empty title="Campaign unavailable">This campaign may have closed or may only be visible to its brand.</Empty>}</>}
      {view === "inbox" && <><div className="marketplace-two-column marketplace-inbox-layout"><section className="marketplace-panel marketplace-inbox-queue"><SectionTitle eyebrow="APPLICATIONS & INVITATIONS" title="Requests to review" aside={<span className="marketplace-count">{applications.length}</span>} />{applications.length ? <div className="marketplace-list marketplace-stacked">{applications.map((item) => { const type = str(item.type); return <article key={str(item._id)} className={type === "booking" ? "mp-inbox-booking" : undefined}><div className="marketplace-line-heading"><strong>{type === "booking" ? <><Package size={14} /> Package booking</> : type === "invitation" ? "Brand invitation" : "Your application"}</strong><Status value={item.status} /></div><span className="mp-inbox-context">{str(item.campaignTitle) || "Campaign"}{str(item.brandName) && ` · ${str(item.brandName)}`}</span>{type === "booking" && <span className="mp-inbox-amount">{money(item.amountPaise)}{item.campaignDeadline ? ` · needed by ${date(item.campaignDeadline)}` : ""}</span>}<p>{str(item.pitch)}</p>{item.status === "invited" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/accept`, {}, type === "booking" ? "Booking accepted. The package price and scope are now the agreed terms — submit content when it’s ready." : "Invitation accepted. Start negotiating terms below.")}>{type === "booking" ? "Accept booking" : "Accept"}</button><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/decline`, {}, type === "booking" ? "Booking declined." : "Invitation declined.")}>Decline</button></div>}{item.status === "pending" && type === "application" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/withdraw`, {}, "Application withdrawn.")}>Withdraw</button></div>}</article>; })}</div> : <Empty title="No requests yet">Bookings, campaign invitations and your applications appear here.</Empty>}
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
      <div className="marketplace-detail-facts"><div><small>Budget</small><strong>{money(campaign.budgetPaise)}</strong></div><div><small>Audience</small><strong>{str(campaign.targetAudience)}</strong></div></div>
      <SectionTitle eyebrow="SCOPE" title="Deliverables" /><div className="marketplace-chip-row">{Array.isArray(campaign.deliverables) && campaign.deliverables.map((item) => <span key={String(item)}>{String(item)}</span>)}</div>
    </section>
    <aside className="marketplace-panel marketplace-side-panel">{isBrand ? <><SectionTitle eyebrow="APPLICATIONS" title={`${applications.length} creator responses`} />{applications.length ? <div className="marketplace-list marketplace-stacked">{applications.map((item) => { const creator = obj(item.influencer); const instagram = obj(creator.instagram); return <article key={str(item._id)}><div className="marketplace-line-heading"><strong>{str(creator.displayName) || "Creator"}</strong><Status value={item.status} /></div><small className="marketplace-applicant-meta">{str(creator.location)} · {Number(instagram.verifiedFollowers || 0).toLocaleString("en-IN")} verified followers · {str(creator.tier) || "Emerging Creator"}</small><p>{str(item.pitch)}</p>{item.status === "pending" && <div className="marketplace-actions"><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/accept`, {}, "Application accepted.")}>Accept</button><button disabled={busy} onClick={() => void mutate(`/applications/${str(item._id)}/decline`, {}, "Application declined.")}>Decline</button></div>}</article>; })}</div> : <p>No applications yet.</p>}</> : <><span className="marketplace-eyebrow">APPLY AS A CREATOR</span><h3>Interested in this campaign?</h3><p>Send a short, specific pitch. You need an approved profile with a current official Instagram verification.</p><form className="marketplace-form" onSubmit={submit(`/campaigns/${str(campaign._id)}/apply`, (form) => ({ pitch: form.get("pitch") }), "Application sent to the brand.")}><Textarea label="Your pitch" name="pitch" placeholder="How would you bring this campaign to life?" /><button disabled={busy} className="marketplace-primary">Apply to campaign <ArrowRight size={16} /></button></form></>}</aside>
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
    {collaboration.status === "completed" && <section className="marketplace-panel"><SectionTitle eyebrow="FEEDBACK" title="Leave a review" /><form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/reviews`, (form) => ({ rating: Number(form.get("rating")), comment: form.get("comment") }), "Review submitted.")}><label className="marketplace-field"><span>Rating</span><select name="rating">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label><Textarea label="Review" name="comment" placeholder="How did the collaboration go?" /><button className="marketplace-secondary" disabled={busy}>Submit review</button></form></section>}
    <section className="marketplace-panel"><SectionTitle eyebrow="RESOLUTION" title="Raise a dispute" /><p>Explain a concern about scope, content or completion. Administrators review the case and hold payout eligibility; opening a case does not automatically issue a refund.</p><form className="marketplace-form" onSubmit={submit(`/collaborations/${id}/disputes`, (form) => ({ reason: form.get("reason") }), "Dispute opened for administrator review.")}><Textarea label="What happened?" name="reason" placeholder="Describe the issue and the outcome you are seeking" /><button className="marketplace-secondary" disabled={busy}>Open dispute</button></form></section>
  </div>;
}

function CreatorInstagramPreview({ instagram }: { instagram: Item }) {
  const media = arr(instagram.recentMedia).slice(0, 9);
  return <section className="marketplace-own-instagram-profile">
    <div className="marketplace-line-heading"><strong>Your connected Instagram</strong>{str(instagram.profilePictureUrl) && <Image className="marketplace-creator-avatar" src={str(instagram.profilePictureUrl)} alt="" width={40} height={40} unoptimized />}</div>
    <p>Recent posts and profile details are loaded from your authorized Instagram connection. Private Insights remain visible only to you.</p>
    {media.length ? <div className="marketplace-own-instagram-media">{media.map((post, index) => { const src = str(post.thumbnailUrl) || str(post.mediaUrl); return src ? <a key={str(post.id) || index} href={str(post.permalink) || "https://www.instagram.com/" + encodeURIComponent(str(instagram.username)) + "/"} target="_blank" rel="noopener noreferrer" aria-label={"Open your Instagram post " + (index + 1)}><Image src={src} alt={str(post.caption) || "Your Instagram post"} fill sizes="(max-width: 480px) 28vw, 110px" unoptimized /></a> : null; })}</div> : <div className="marketplace-instagram-media-empty"><Camera size={18} /> Meta did not return recent public media for this account. Your follower verification is still saved.</div>}
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

