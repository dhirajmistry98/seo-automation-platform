"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, BriefcaseBusiness, Clock3, ExternalLink, MapPin, Search, Send, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { SERVICE_SPECIALTIES } from "@/lib/marketplace/services";
import { readJson } from "@/lib/read-json";

type Profile = { _id: string; displayName: string; headline: string; bio: string; specialties: string[]; location: string; experienceYears: number; status: string; updatedAt?: string; portfolio?: string[]; website?: string | null };
type Proposal = { _id: string; message: string; scope: string; amountPaise: number; deliveryDays: number; status: string; createdAt: string };
type ServiceAttachment = { id: string; name: string; type: string; size: number; uploadedAt?: string; uploadedByMe?: boolean };
type ServiceOrder = { _id: string; status: string; paymentStatus: string; checkoutState?: string; amountPaise: number; currency: string; payoutStatus?: string };
type ServiceRequest = { _id: string; title: string; details: string; website?: string | null; listingTitle: string; listingCategory: string; expertNameSnapshot?: string; clientNameSnapshot?: string; status: string; createdAt: string; orderStatus?: string | null; order?: ServiceOrder | null; budgetPaise?: number | null; attachments?: ServiceAttachment[]; proposals: Proposal[] };
type Listing = { _id: string; title: string; summary: string; description: string; category: string; deliveryDays: number; pricePaise: number; expert: { displayName: string; headline: string; specialties: string[]; location: string; experienceYears: number; portfolio: string[]; website?: string | null } };
type Overview = { profile: Profile | null; listings: Array<Listing & { status: string }>; outgoing: ServiceRequest[]; incoming: ServiceRequest[]; admin: boolean };
type AdminData = { experts: Profile[]; listings: Array<Listing & { status: string }> };

const emptyOverview: Overview = { profile: null, listings: [], outgoing: [], incoming: [], admin: false };
const cash = (paise?: number | null) => typeof paise === "number" ? `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "Budget flexible";
const when = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function ServicesMarketplaceScreen() {
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [listings, setListings] = useState<Listing[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextSkip, setNextSkip] = useState(0);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (search = "", specialty = "") => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (specialty) qs.set("category", specialty);
      const [overviewResponse, listingsResponse] = await Promise.all([
        fetch("/api/marketplace/services/v1/overview", { cache: "no-store" }),
        fetch(`/api/marketplace/services/v1/listings?${qs.toString()}`, { cache: "no-store" }),
      ]);
      const overviewData = await readJson(overviewResponse);
      const listingsData = await readJson(listingsResponse);
      if (!overviewResponse.ok || !listingsResponse.ok) throw new Error(overviewData.error || listingsData.error || "Could not load the expert marketplace.");
      setOverview({ ...emptyOverview, ...overviewData });
      setListings(Array.isArray(listingsData.listings) ? listingsData.listings : []);
      setHasMore(listingsData.hasMore === true);
      setNextSkip(typeof listingsData.nextSkip === "number" ? listingsData.nextSkip : 0);
      if (overviewData.admin) {
        const response = await fetch("/api/marketplace/services/v1/admin", { cache: "no-store" });
        const data = await readJson(response);
        if (response.ok) setAdminData(data);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load the expert marketplace."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  async function loadMore() {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ skip: String(nextSkip) });
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      const response = await fetch(`/api/marketplace/services/v1/listings?${params.toString()}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load more services.");
      setListings((current) => [...current, ...(Array.isArray(data.listings) ? data.listings : [])]);
      setHasMore(data.hasMore === true);
      setNextSkip(typeof data.nextSkip === "number" ? data.nextSkip : nextSkip);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load more services."); }
    finally { setBusy(false); }
  }

  async function mutate(path: string, body: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/marketplace/services/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "The request could not be completed.");
      setMessage(success);
      await refresh(query, category);
      return data as Record<string, unknown>;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The request could not be completed."); return null; }
    finally { setBusy(false); }
  }

  function formSubmit(path: string, build: (form: FormData) => Record<string, unknown>, success: string) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const element = event.currentTarget;
      const form = new FormData(element);
      const done = await mutate(path, build(form), success);
      if (done) element.reset();
    };
  }

  const requests = useMemo(() => ({ outgoing: overview.outgoing || [], incoming: overview.incoming || [] }), [overview]);
  const expertStatus = overview.profile?.status || "not created";

  return <div className="marketplace-page service-marketplace">
    <header className="marketplace-page-head">
      <p className="marketplace-eyebrow">SEO · GEO · AEO · LLMO PROFESSIONALS</p>
      <h1>Expert services</h1>
      <p>Find a specialist for a defined search project, request a scoped proposal and review the terms before you accept.</p>
    </header>

    <div className="service-marketplace-notice" role="status">Payments are disabled for this release. You can browse experts, send requests and discuss proposals; accepting a proposal and starting paid project work is unavailable until payments are approved and enabled.</div>

    {(error || message) && <div className={`service-marketplace-notice ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error || message}</div>}

    <section className="service-marketplace-intro" aria-label="Marketplace principles">
      <div><span className="service-marketplace-icon"><ShieldCheck size={19} /></span><strong>Reviewed profiles</strong><small>Experts and service listings require admin approval.</small></div>
      <div><span className="service-marketplace-icon"><WalletCards size={19} /></span><strong>Clear INR proposals</strong><small>Price and delivery terms stay visible before acceptance.</small></div>
      <div><span className="service-marketplace-icon"><Sparkles size={19} /></span><strong>Real project data</strong><small>Only published MongoDB listings appear here.</small></div>
    </section>

    <section className="marketplace-section-title service-marketplace-section-head">
      <div><p className="marketplace-eyebrow">FIND A PROFESSIONAL</p><h2>Available services</h2></div>
      <span className="marketplace-count">{loading ? "Loading" : `${listings.length} shown`}</span>
    </section>
    <form className="service-marketplace-search" onSubmit={(event) => { event.preventDefault(); void refresh(query, category); }}>
      <label><Search size={16} /><span className="sr-only">Search services and specialties</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GEO, technical SEO, content strategy…" /></label>
      <label><span className="sr-only">Filter by specialty</span><select value={category} onChange={(event) => { setCategory(event.target.value); void refresh(query, event.target.value); }}><option value="">All specialties</option>{SERVICE_SPECIALTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="marketplace-primary" disabled={loading}><Search size={14} /> Search</button>
    </form>
    {loading && <div className="marketplace-panel service-marketplace-empty" role="status">Loading services from the marketplace…</div>}
    {!loading && listings.length > 0 && <div className="marketplace-card-grid service-marketplace-grid">{listings.map((listing) => <article className="marketplace-card service-marketplace-card" key={listing._id}>
      <span className="marketplace-card-icon"><BriefcaseBusiness size={18} /></span>
      <span className="marketplace-card-meta">{listing.category}</span>
      <h3>{listing.title}</h3><p>{listing.summary}</p>
      <div className="service-marketplace-expert"><span>{listing.expert.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{listing.expert.displayName}</strong><small>{listing.expert.headline}</small></div><BadgeCheck size={16} aria-label="Reviewed expert" /></div>
      <div className="service-marketplace-facts"><span><MapPin size={13} />{listing.expert.location}</span><span><Clock3 size={13} />{listing.deliveryDays} days</span><strong>{cash(listing.pricePaise)}</strong></div>
      <details className="service-marketplace-details"><summary>View scope and portfolio</summary><p>{listing.description}</p>{listing.expert.portfolio.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">Portfolio link <ExternalLink size={12} /></a>)}</details>
      <details className="service-marketplace-request"><summary>Request a proposal <Send size={13} /></summary>
        <form className="marketplace-form" onSubmit={formSubmit("/requests", (data) => ({ listingId: listing._id, title: data.get("title"), details: data.get("details"), website: data.get("website"), budgetPaise: data.get("budget") ? Math.round(Number(data.get("budget")) * 100) : null }), "Project request sent to the expert.")}>
          <label className="marketplace-field"><span>Project title</span><input name="title" required minLength={8} maxLength={140} placeholder="Improve organic visibility for my store" /></label>
          <label className="marketplace-field"><span>Project details</span><textarea name="details" required minLength={40} maxLength={4000} rows={4} placeholder="Describe the outcome, current situation and any constraints." /></label>
          <div className="service-marketplace-form-row"><label className="marketplace-field"><span>Website (optional)</span><input name="website" type="url" placeholder="https://example.com" /></label><label className="marketplace-field"><span>Budget in INR (optional)</span><input name="budget" type="number" min="0" step="1" placeholder="Flexible" /></label></div>
          <p className="service-marketplace-hint">After sending, attach screenshots, reports, images, videos or PDFs from the project card.</p><button className="marketplace-secondary" disabled={busy}>Send project request</button>
        </form>
      </details>
    </article>)}</div>}
    {!loading && hasMore && <button className="marketplace-load-more" type="button" onClick={() => void loadMore()} disabled={busy}>Load more expert services</button>}
    {!loading && !listings.length && <div className="marketplace-panel service-marketplace-empty"><span className="service-marketplace-icon"><Search size={18} /></span><h3>No matching services yet</h3><p>Approved experts will appear here after their profile and service listings pass review. You can create a request after a suitable service is published.</p></div>}

    <section className="service-marketplace-workspace">
      <section className="service-marketplace-column">
        <div className="marketplace-section-title"><div><p className="marketplace-eyebrow">EXPERT PROFILE</p><h2>Offer your expertise</h2></div><span className={`marketplace-status service-status-${expertStatus.replace(/[^a-z]/g, "-")}`}>{expertStatus.replaceAll("_", " ")}</span></div>
        <p className="service-marketplace-hint">Your profile is hidden from discovery until approved. Editing it sends it back for review.</p>
        <form key={String(overview.profile?.updatedAt || "empty-profile")} className="marketplace-panel marketplace-form service-marketplace-profile-form" onSubmit={formSubmit("/expert/profile", (data) => ({ displayName: data.get("displayName"), headline: data.get("headline"), bio: data.get("bio"), specialties: data.getAll("specialties"), location: data.get("location"), experienceYears: Number(data.get("experienceYears")), website: data.get("website"), portfolio: String(data.get("portfolio") || "").split(/\s*,\s*/).filter(Boolean) }), "Expert profile sent for admin review.")}>
          <div className="marketplace-form-grid"><label className="marketplace-field"><span>Professional name</span><input name="displayName" required minLength={2} maxLength={100} defaultValue={overview.profile?.displayName} /></label><label className="marketplace-field"><span>Location</span><input name="location" required minLength={2} maxLength={100} placeholder="City, India" defaultValue={overview.profile?.location} /></label></div>
          <label className="marketplace-field"><span>Profile headline</span><input name="headline" required minLength={8} maxLength={140} placeholder="Technical SEO consultant for growing teams" defaultValue={overview.profile?.headline} /></label>
          <label className="marketplace-field"><span>Professional biography</span><textarea name="bio" required minLength={40} maxLength={2400} rows={4} defaultValue={overview.profile?.bio} placeholder="Describe your experience and the work you deliver." /></label>
          <fieldset className="service-marketplace-specialties"><legend>Specialties</legend><div>{SERVICE_SPECIALTIES.map((item) => <label key={item}><input name="specialties" type="checkbox" value={item} defaultChecked={overview.profile?.specialties.includes(item)} /><span>{item}</span></label>)}</div></fieldset>
          <div className="marketplace-form-grid"><label className="marketplace-field"><span>Years of experience</span><input name="experienceYears" type="number" required min="0" max="60" defaultValue={overview.profile?.experienceYears ?? 0} /></label><label className="marketplace-field"><span>Professional website (optional)</span><input name="website" type="url" placeholder="https://…" defaultValue={overview.profile?.website || ""} /></label></div>
          <label className="marketplace-field"><span>Portfolio links (comma separated HTTPS links)</span><input name="portfolio" placeholder="https://case-study.example, https://portfolio.example" defaultValue={overview.profile?.portfolio?.join(", ")} /></label>
          <button className="marketplace-primary" disabled={busy}><BriefcaseBusiness size={14} /> Submit profile for review</button>
        </form>

        {overview.profile?.status === "approved" && <>
          <div className="marketplace-section-title"><div><p className="marketplace-eyebrow">YOUR OFFER</p><h2>Create a service listing</h2></div></div>
          <form className="marketplace-panel marketplace-form" onSubmit={formSubmit("/listings", (data) => ({ title: data.get("title"), summary: data.get("summary"), description: data.get("description"), category: data.get("category"), deliveryDays: Number(data.get("deliveryDays")), pricePaise: Math.round(Number(data.get("price")) * 100) }), "Service listing submitted for moderation.")}>
            <label className="marketplace-field"><span>Service title</span><input name="title" required minLength={8} maxLength={120} placeholder="Technical SEO audit and prioritized roadmap" /></label>
            <label className="marketplace-field"><span>Short summary</span><input name="summary" required minLength={30} maxLength={220} /></label>
            <label className="marketplace-field"><span>Included scope</span><textarea name="description" required minLength={50} maxLength={3000} rows={4} /></label>
            <div className="marketplace-form-grid"><label className="marketplace-field"><span>Specialty</span><select name="category" required><option value="">Choose a specialty</option>{SERVICE_SPECIALTIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="marketplace-field"><span>Delivery days</span><input name="deliveryDays" type="number" required min="1" max="180" defaultValue="7" /></label><label className="marketplace-field"><span>Price (INR)</span><input name="price" type="number" required min="1" step="1" /></label></div>
            <button className="marketplace-primary" disabled={busy}>Submit listing for review</button>
          </form>
          <section className="marketplace-panel service-marketplace-my-listings"><div className="marketplace-section-title"><div><p className="marketplace-eyebrow">LISTING STATUS</p><h2>Your services</h2></div></div>{overview.listings.length ? overview.listings.map((item) => <div className="service-marketplace-row" key={item._id}><span><strong>{item.title}</strong><small>{item.category} · {cash(item.pricePaise)}</small></span><span className={`marketplace-status service-status-${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>) : <p>You have not submitted a service listing.</p>}</section>
        </>}
      </section>

      <section className="service-marketplace-column">
        <div className="marketplace-section-title"><div><p className="marketplace-eyebrow">PROJECT PIPELINE</p><h2>Requests and proposals</h2></div></div>
        <div className="marketplace-panel service-marketplace-requests"><h3>Requests you sent</h3>{requests.outgoing.length ? requests.outgoing.map((item) => <RequestCard key={item._id} item={item} role="client" busy={busy} mutate={mutate} onRefresh={() => refresh(query, category)} />) : <p className="service-marketplace-hint">Your project requests will appear here.</p>}</div>
        <div className="marketplace-panel service-marketplace-requests"><h3>Requests sent to you</h3>{requests.incoming.length ? requests.incoming.map((item) => <RequestCard key={item._id} item={item} role="expert" busy={busy} mutate={mutate} onRefresh={() => refresh(query, category)} />) : <p className="service-marketplace-hint">Requests for your approved listings will appear here.</p>}</div>
      </section>
    </section>

    {overview.admin && <section className="service-marketplace-admin">
      <div className="marketplace-section-title"><div><p className="marketplace-eyebrow">ADMIN REVIEW</p><h2>Expert marketplace moderation</h2></div><ShieldCheck size={20} /></div>
      <p className="service-marketplace-hint">Review professional profiles and service listings before making them public. This does not approve payments or provide identity verification.</p>
      <div className="service-marketplace-admin-grid">{(adminData?.experts || []).filter((item) => item.status === "pending_review").map((item) => <ModerationCard key={item._id} id={item._id} title={item.displayName} subtitle={`${item.headline} · ${item.location}`} path="experts" busy={busy} mutate={mutate} />)}{(adminData?.listings || []).filter((item) => ["pending_review", "suspended"].includes(item.status)).map((item) => <ModerationCard key={item._id} id={item._id} title={item.title} subtitle={`${item.category} · ${cash(item.pricePaise)} · ${item.status.replaceAll("_", " ")}`} path="listings" busy={busy} mutate={mutate} />)}{adminData && !adminData.experts.some((item) => item.status === "pending_review") && !adminData.listings.some((item) => ["pending_review", "suspended"].includes(item.status)) && <p>No items are waiting for review.</p>}</div>
    </section>}
  </div>;
}

function RequestCard({ item, role, busy, mutate, onRefresh }: { item: ServiceRequest; role: "client" | "expert"; busy: boolean; mutate: (path: string, body: Record<string, unknown>, success: string) => Promise<Record<string, unknown> | null>; onRefresh: () => Promise<void> }) {
  const submitProposal = formSubmitForRequest(item._id, mutate);
  return <article className="service-marketplace-request-card">
    <div className="marketplace-line-heading"><strong>{item.title}</strong><span className={`marketplace-status service-status-${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>
    <p className="service-marketplace-request-title">{role === "client" ? `Expert: ${item.expertNameSnapshot || "Unavailable"}` : `Client: ${item.clientNameSnapshot || "Marketplace customer"}`}</p>
    <p className="service-marketplace-request-title">{item.listingTitle} · {item.listingCategory} · {when(item.createdAt)}</p>
    <p>{item.details}</p>{item.website && <a href={item.website} target="_blank" rel="noreferrer">{item.website} <ExternalLink size={12} /></a>}
    {!!item.attachments?.length && <div className="service-marketplace-attachments"><strong>Project files</strong>{item.attachments.map((file) => <a key={file.id} href={"/api/marketplace/files?serviceRequestId=" + encodeURIComponent(item._id) + "&fileId=" + encodeURIComponent(file.id)} download>{file.name} · {Math.max(1, Math.ceil(file.size / 1024))} KB ↓</a>)}</div>}
    {(item.status === "open" || item.status === "accepted") && <ServiceRequestChat requestId={item._id} />}
    {(item.status === "open" || item.status === "accepted") && <ServiceRequestAttachmentUploader requestId={item._id} disabled={busy} onUploaded={onRefresh} />}
    <div className="service-marketplace-request-meta"><span>Client budget: {cash(item.budgetPaise)}</span><span>{item.proposals.length} proposal{item.proposals.length === 1 ? "" : "s"}</span></div>
    {role === "expert" && item.status === "open" && <details><summary>Write a proposal</summary><form className="marketplace-form" onSubmit={submitProposal}>
      <label className="marketplace-field"><span>Proposal message</span><textarea name="message" required minLength={30} maxLength={2000} rows={3} /></label>
      <label className="marketplace-field"><span>Specific scope and exclusions</span><textarea name="scope" required minLength={30} maxLength={2400} rows={3} /></label>
      <div className="marketplace-form-grid"><label className="marketplace-field"><span>Price (INR)</span><input name="amount" type="number" required min="1" step="1" /></label><label className="marketplace-field"><span>Delivery days</span><input name="deliveryDays" type="number" required min="1" max="180" defaultValue="7" /></label></div>
      <button className="marketplace-secondary" disabled={busy}>Send proposal</button>
    </form></details>}
    {item.proposals.map((proposal) => <div className="service-marketplace-proposal" key={proposal._id}><div className="marketplace-line-heading"><strong>{cash(proposal.amountPaise)} · {proposal.deliveryDays} days</strong><span className={`marketplace-status service-status-${proposal.status}`}>{proposal.status}</span></div><p>{proposal.message}</p><small>Scope: {proposal.scope}</small><small>Sent {when(proposal.createdAt)}</small>{role === "client" && proposal.status === "pending" && item.status === "open" && <p className="service-marketplace-hint">Proposal acceptance is disabled until secure payment processing is available.</p>}</div>)}
    {role === "client" && item.status === "open" && <button className="marketplace-actions-button" disabled={busy} onClick={() => void mutate(`/requests/${item._id}/close`, {}, "Project request closed.")}>Close request</button>}
    {role === "client" && item.status === "accepted" && item.orderStatus === "awaiting_payment_setup" && <button className="marketplace-actions-button" disabled={busy} onClick={() => void mutate(`/requests/${item._id}/cancel`, {}, "The selected proposal was cancelled before the order started.")}>Cancel selected proposal</button>}
    {item.status === "accepted" && item.order && role === "client" && item.order.paymentStatus !== "captured" && <div className="service-marketplace-payment-state"><WalletCards size={15} /><span>Accepted project · {cash(item.order.amountPaise)}</span><small>Payment processing is disabled. Project work should not start from this application.</small></div>}
    {item.order && <ServiceOrderPanel orderId={item.order._id} request={item} role={role} onRefresh={onRefresh} />}
  </article>;
}

type OrderLifecycle = { order?: { status: string; payoutStatus?: string }; milestonePlan?: { milestones?: Array<{ id: string; title: string; status: string; revisionCount?: number }> }; deliverables?: Array<{ _id: string; note: string; status: string; files: Array<{ id: string; name: string }> }>; review?: { rating: number }; dispute?: { status: string; reason: string }; payout?: { status: string; netPaise: number } };
function ServiceOrderPanel({ orderId, request, role, onRefresh }: { orderId: string; request: ServiceRequest; role: "client" | "expert"; onRefresh: () => Promise<void> }) {
  const [data, setData] = useState<OrderLifecycle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try { const response = await fetch(`/api/marketplace/services/v1/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" }); const result = await readJson(response); if (!response.ok) throw new Error(result.error || "Could not load project status."); setData(result); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load project status."); }
  }, [orderId]);
  useEffect(() => { const initial = window.setTimeout(() => { void refresh(); }, 0); const timer = window.setInterval(() => void refresh(), 15_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [refresh]);
  async function action(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch(`/api/marketplace/services/v1/orders/${encodeURIComponent(orderId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await readJson(response); if (!response.ok) throw new Error(result.error || "Order update failed."); setNotice(result.message || "Project status updated."); await refresh(); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Order update failed."); }
    finally { setBusy(false); }
  }
  const status = data?.order?.status || request.order?.status;
  const milestone = data?.milestonePlan?.milestones?.find((item) => item.status === (role === "expert" ? "in_progress" : "submitted"));
  const ownFiles = request.attachments?.filter((item) => item.uploadedByMe) || [];
  return <section className="service-marketplace-payment-state service-order-lifecycle" aria-label="Project delivery and review">
    <div className="marketplace-line-heading"><strong>Project workflow</strong><span className={`marketplace-status service-status-${status || "unknown"}`}>{(status || "loading").replaceAll("_", " ")}</span></div>
    {data?.deliverables?.slice(0, 3).map((delivery) => <div key={delivery._id}><strong>Delivery</strong><p>{delivery.note}</p>{delivery.files.map((file) => <a key={file.id} href={`/api/marketplace/files?serviceRequestId=${encodeURIComponent(request._id)}&fileId=${encodeURIComponent(file.id)}`} download>{file.name}</a>)}</div>)}
    {data?.dispute && <p>Dispute status: {data.dispute.status.replaceAll("_", " ")}. Payouts stay on hold while the dispute is open.</p>}
    {role === "expert" && status === "in_progress" && milestone && <form className="marketplace-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void action({ action: "submit_delivery", note: form.get("deliveryNote"), fileIds: form.getAll("fileIds") }); }}><label className="marketplace-field"><span>Delivery notes</span><textarea name="deliveryNote" required minLength={20} maxLength={3000} rows={3} placeholder="Summarize what is complete and any follow-up notes." /></label>{ownFiles.length > 0 && <fieldset className="service-marketplace-specialties"><legend>Attach your project files</legend><div>{ownFiles.map((file) => <label key={file.id}><input type="checkbox" name="fileIds" value={file.id} /><span>{file.name}</span></label>)}</div></fieldset>}<button className="marketplace-secondary" disabled={busy}>Submit delivery</button></form>}
    {role === "client" && status === "in_progress" && milestone && <div><p>Review the submitted milestone: {milestone.title}</p><button className="marketplace-primary" disabled={busy} onClick={() => void action({ action: "approve_delivery" })}>Approve and complete project</button><form className="marketplace-form" onSubmit={(event) => { event.preventDefault(); void action({ action: "request_revision", note: new FormData(event.currentTarget).get("revisionNote") }); }}><label className="marketplace-field"><span>Request a revision (up to three rounds)</span><textarea name="revisionNote" required minLength={20} maxLength={1500} rows={2} /></label><button className="marketplace-secondary" disabled={busy || (milestone.revisionCount || 0) >= 3}>Request revision</button></form></div>}
    {role === "client" && status === "completed" && !data?.review && <form className="marketplace-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void action({ action: "review", rating: Number(form.get("rating")), comment: form.get("reviewComment") }); }}><label className="marketplace-field"><span>Review this completed project</span><select name="rating" defaultValue="5"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label><label className="marketplace-field"><span>Your review</span><textarea name="reviewComment" required minLength={10} maxLength={1200} rows={2} /></label><button className="marketplace-secondary" disabled={busy}>Submit review</button></form>}
    {data?.review && <p>Client review: {data.review.rating}/5</p>}
    {role === "expert" && status === "completed" && !data?.payout && <p className="service-marketplace-hint">Payout setup is disabled during this stage.</p>}
    {data?.payout && <p>Existing payout record · {data.payout.status.replaceAll("_", " ")} (read-only)</p>}
    {!["disputed", "refunded", "partially_refunded"].includes(String(status)) && ["in_progress", "completed"].includes(String(status)) && !data?.dispute && <form className="marketplace-form" onSubmit={(event) => { event.preventDefault(); void action({ action: "open_dispute", note: new FormData(event.currentTarget).get("disputeNote") }); }}><label className="marketplace-field"><span>Ask an administrator to review this project</span><textarea name="disputeNote" required minLength={30} maxLength={2000} rows={2} placeholder="Explain the issue and the resolution you are requesting." /></label><button className="marketplace-actions-button" disabled={busy}>Open dispute</button></form>}
    {error && <p className="service-marketplace-notice is-error" role="alert">{error}</p>}{notice && <p className="service-marketplace-notice is-success" role="status">{notice}</p>}
  </section>;
}

type ServiceMessage = { _id: string; text: string; senderName: string; mine: boolean; createdAt: string };

function ServiceRequestChat({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/marketplace/services/v1/requests/" + encodeURIComponent(requestId) + "/messages", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load project messages.");
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load project messages.");
    } finally { setLoading(false); }
  }, [requestId]);
  useEffect(() => {
    if (!open) return;
    const initial = window.setTimeout(() => { setLoading(true); void load(); }, 0);
    const timer = window.setInterval(() => void load(), 6000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [open, load]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") || "").trim();
    if (!text || sending) return;
    setSending(true); setError("");
    const requestIdempotencyKey = clientId || crypto.randomUUID();
    setClientId(requestIdempotencyKey);
    try {
      const response = await fetch("/api/marketplace/services/v1/requests/" + encodeURIComponent(requestId) + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, clientId: requestIdempotencyKey }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not send the project message.");
      form.reset();
      setClientId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the project message.");
    } finally { setSending(false); }
  }
  return <details className="service-marketplace-chat" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Project conversation <span>Private · updates while open</span></summary>
    <div className="service-marketplace-chat-content">
      <div className="service-marketplace-chat-messages" aria-live="polite">
        {loading && messages.length === 0 && <p>Loading conversation…</p>}
        {!loading && messages.length === 0 && <p>No messages yet. Start the project conversation.</p>}
        {messages.map((message) => <article className={message.mine ? "is-mine" : ""} key={message._id}>
          <small>{message.mine ? "You" : message.senderName} · {when(message.createdAt)}</small>
          <p>{message.text}</p>
        </article>)}
      </div>
      {error && <p className="service-marketplace-upload-error" role="alert">{error}</p>}
      <form className="marketplace-form service-marketplace-chat-form" onSubmit={(event) => void send(event)}>
        <label className="marketplace-field"><span>Message</span><textarea name="text" required maxLength={4000} rows={2} placeholder="Write a private project message…" onChange={() => setClientId("")} /></label>
        <button className="marketplace-actions-button" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
      </form>
    </div>
  </details>;
}

function ServiceRequestAttachmentUploader({ requestId, disabled, onUploaded }: { requestId: string; disabled: boolean; onUploaded: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = Array.from(new FormData(form).getAll("files")).filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) { setError("Choose at least one file."); return; }
    setUploading(true); setError(""); setMessage("");
    let uploaded = 0;
    try {
      for (const file of files) {
        const response = await fetch("/api/marketplace/files?serviceRequestId=" + encodeURIComponent(requestId), {
          method: "POST",
          headers: { "Content-Type": file.type, "X-File-Name": file.name.replace(/[^\x20-\x7E]/g, "_") },
          body: file,
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || "Could not upload the selected project file.");
        uploaded += 1;
      }
      form.reset();
      setMessage(uploaded + " file" + (uploaded === 1 ? "" : "s") + " attached to this private project.");
      await onUploaded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uploaded " + uploaded + " file(s), but another file failed.");
    } finally { setUploading(false); }
  }
  return <div className="service-marketplace-attachment-uploader">
    <form className="marketplace-form" onSubmit={(event) => void submit(event)}>
      <label className="marketplace-field"><span>Add project files · JPEG, PNG, WebP, MP4 or PDF · up to 10 MB each</span><input name="files" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" multiple disabled={disabled || uploading} /></label>
      <button className="marketplace-actions-button" type="submit" disabled={disabled || uploading}>{uploading ? "Uploading…" : "Attach files"}</button>
    </form>
    {error && <p className="service-marketplace-upload-error" role="alert">{error}</p>}
    {message && <p className="service-marketplace-upload-success" role="status">{message}</p>}
  </div>;
}

function formSubmitForRequest(requestId: string, mutate: (path: string, body: Record<string, unknown>, success: string) => Promise<Record<string, unknown> | null>) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const result = await mutate(`/requests/${requestId}/proposals`, { message: data.get("message"), scope: data.get("scope"), amountPaise: Math.round(Number(data.get("amount")) * 100), deliveryDays: Number(data.get("deliveryDays")) }, "Proposal sent to the customer.");
    if (result) form.reset();
  };
}

function ModerationCard({ id, title, subtitle, path, busy, mutate }: { id: string; title: string; subtitle: string; path: "experts" | "listings"; busy: boolean; mutate: (path: string, body: Record<string, unknown>, success: string) => Promise<Record<string, unknown> | null> }) {
  const [note, setNote] = useState("");
  return <article className="service-marketplace-moderation"><strong>{title}</strong><p>{subtitle}</p><label className="marketplace-field"><span>Decision reason</span><input value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={500} /></label><div className="marketplace-actions"><button disabled={busy || note.trim().length < 10} onClick={() => void mutate(`/admin/${path}/${id}/decision`, { decision: path === "experts" ? "approved" : "active", note }, "Marketplace item approved.")}>Approve</button><button disabled={busy || note.trim().length < 10} onClick={() => void mutate(`/admin/${path}/${id}/decision`, { decision: "rejected", note }, "Marketplace item rejected.")}>Reject</button></div></article>;
}
