import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { updateWebsiteAction, setWebsiteActiveAction } from "@/app/dashboard/actions";
import { findAccessibleWebsite, getOrganizationMemberships, hasOrganizationPermission } from "@/lib/organizations";
import { isDataForSeoConfigured } from "@/lib/integrations/dataforseo";
import { WebsiteOrganizationSelector } from "@/components/workspace/website-organization-selector";
import { WebsiteSeoLocationField } from "@/components/workspace/seo-location-selector";
import { getWebsiteSeoTarget } from "@/lib/seo/target";
import { seoCrawlPageLimit } from "@/lib/seo/crawler";
import { ArrowLeft, Download, Save } from "lucide-react";
import { WebsiteDeleteControl } from "@/components/workspace/website-delete-control";

export const instant = false;

type Website = {
  organizationId: unknown;
  domain: string;
  url: string;
  name?: string;
  websiteType?: string;
  businessCategory?: string;
  targetCountry?: string;
  targetLanguage?: string;
  timeZone?: string;
  primaryKeywords?: string[];
  competitorDomains?: string[];
  sitemapUrl?: string;
  robotsUrl?: string;
  crawlFrequency?: string;
  pageSpeedFrequency?: string;
  nextScheduledPageSpeedAt?: Date | string | null;
  lastScheduledPageSpeedStatus?: string;
  maxPages?: number;
  rankTrackingFrequency?: string;
  rankTrackingLocationCode?: number;
  rankTrackingLocationName?: string;
  rankTrackingCountryCode?: string;
  rankTrackingCountryName?: string;
  rankTrackingCountryLocationCode?: number;
  rankTrackingLanguageCode?: string;
  rankTrackingDevice?: string;
  nextScheduledRankTrackingAt?: Date | string | null;
  lastRankTrackingAt?: Date | string;
  lastRankTrackingStatus?: string;
  active?: boolean;
  createdAt?: Date;
  detectedCms?: { name: string; confidence: "high" | "likely"; evidence: string } | null;
};

export default async function WebsiteSettingsPage({ params, searchParams }: { params: Promise<{ domain: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { domain: rawDomain } = await params;
  const domain = decodeURIComponent(rawDomain).toLowerCase();
  const client = await clientPromise;
  const { website: accessibleWebsite } = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.manage");
  const website = accessibleWebsite as Website | null;
  if (!website) notFound();
  const activity = await client.db().collection("audit_logs").find({ organizationId: website.organizationId, websiteDomain: domain })
    .sort({ createdAt: -1 }).limit(15)
    .project<{ action?: string; createdAt?: Date; actorId?: string; method?: string; pageCount?: number; issueCount?: number; auditId?: string }>({ _id: 0, action: 1, createdAt: 1, actorId: 1, method: 1, pageCount: 1, issueCount: 1, auditId: 1 }).toArray();
  const memberships = await getOrganizationMemberships(client.db(), session.user.id);
  const allowedOrganizationIds = memberships.filter((item) => hasOrganizationPermission(item.role, "websites.manage")).map((item) => item.organizationId);
  const organizationRecords = await client.db().collection("organizations").find({ _id: { $in: allowedOrganizationIds } }, { projection: { name: 1 } }).toArray();
  const organizations = allowedOrganizationIds.flatMap((id) => {
    const item = organizationRecords.find((record) => String(record._id) === String(id));
    return item ? [{ id: String(id), name: item.name }] : [];
  });
  const query = await searchParams;
  const researchConfigured = isDataForSeoConfigured();
  const seoTarget = getWebsiteSeoTarget(website);
  const errors: Record<string, string> = {
    url: "Sitemap and robots URLs must use HTTP or HTTPS and belong to this website.",
    fields: "Check the website type, audit schedule, page limit, and search market settings.",
    rank_keywords: "Add at least one primary keyword before enabling scheduled rank tracking.",
    competitors: "Enter up to 20 public competitor domains. Do not include paths, ports, or this website.",
    save: "Website settings could not be saved. Try again.",
  };
  return <div className="website-settings-page">
    <section className="website-settings-card">
      <Link href="/dashboard/websites" className="website-settings-back"><ArrowLeft size={14} /> Back to websites</Link>
      <a className="website-settings-export" href={`/api/sites/${encodeURIComponent(website.domain)}/report?download=1`}><Download size={14} /> Export site data</a>
      <p className="workspace-eyebrow">WEBSITE CONFIGURATION</p>
      <h1>{website.name || website.domain}</h1>
      <p className="website-settings-intro">Set the crawl and market details used by audits and future connected services.</p>
      <div className="website-cms-detection"><strong>Detected platform</strong>{website.detectedCms ? <><span>{website.detectedCms.name}</span><small>{website.detectedCms.confidence === "high" ? "Strong generator signal" : "Likely based on page markers"} · found during the latest crawl</small></> : <><span>Not detected yet</span><small>Run an audit to check common CMS and commerce platform markers.</small></>}</div>
      {query.saved && <p className="website-settings-message" role="status">Website settings saved.</p>}
      {query.error && <p className="website-settings-message is-error" role="alert">{errors[query.error] || "Could not save changes."}</p>}
      {organizations.length > 1 && <WebsiteOrganizationSelector domain={website.domain} currentOrganizationId={String(website.organizationId)} organizations={organizations} />}
      <form action={updateWebsiteAction} className="website-settings-form">
        <input type="hidden" name="domain" value={website.domain} />
        <label>Website name<input name="name" defaultValue={website.name || ""} maxLength={100} /></label>
        <label>Website type<select name="websiteType" defaultValue={website.websiteType || "business"}><option value="business">Business</option><option value="blog">Blog</option><option value="ecommerce">Ecommerce</option><option value="other">Other</option></select></label>
        <label>Business category<input name="businessCategory" defaultValue={website.businessCategory || ""} maxLength={100} /></label>
        <label>Time zone<input name="timeZone" defaultValue={website.timeZone || ""} maxLength={80} placeholder="Asia/Kolkata" /></label>
        <label>Primary keywords<input name="primaryKeywords" defaultValue={website.primaryKeywords?.join(", ") || ""} maxLength={1000} /><small>Comma-separated, up to 30. Scheduled rank tracking checks the first 10 unique keywords.</small></label>
        <div className="website-settings-row">
          <label>Rank tracking frequency<select name="rankTrackingFrequency" defaultValue={website.rankTrackingFrequency || "manual"}><option value="manual">Manual only</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><small>Live checks use your configured DataForSEO account and may incur provider charges.</small></label>
          <label>Search device<select name="rankTrackingDevice" defaultValue={website.rankTrackingDevice || "desktop"}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
        </div>
        <div className="website-market-settings"><p className="workspace-eyebrow">SEARCH MARKET</p><h2>Target country, city, or region</h2><p>Choose the real search area and language used by live rank checks and research reports. Country-level keyword datasets remain country-scoped when the provider does not offer city-level volume data.</p><WebsiteSeoLocationField initialTarget={seoTarget} /></div>
        {website.rankTrackingFrequency && website.rankTrackingFrequency !== "manual" && !researchConfigured && <p className="website-settings-message is-error" role="status">Scheduled rank tracking is saved, but waits for DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to be configured on the server.</p>}
        {website.nextScheduledRankTrackingAt && <p className="website-settings-message" role="status">Next scheduled rank check: {new Date(website.nextScheduledRankTrackingAt).toLocaleString()}.</p>}
        <label>Competitor domains<input name="competitorDomains" defaultValue={website.competitorDomains?.join(", ") || ""} maxLength={1000} /><small>Comma-separated, up to 20.</small></label>
        <label>Sitemap URL<input name="sitemapUrl" defaultValue={website.sitemapUrl || ""} maxLength={2048} placeholder={`${website.url}/sitemap.xml`} /></label>
        <label>Robots.txt URL<input name="robotsUrl" defaultValue={website.robotsUrl || ""} maxLength={2048} placeholder={`${website.url}/robots.txt`} /></label>
        <div className="website-settings-row"><label>Crawl frequency<select name="crawlFrequency" defaultValue={website.crawlFrequency || "manual"}><option value="manual">Manual only</option><option value="weekly">Weekly scheduled audit</option><option value="monthly">Monthly scheduled audit</option></select><small>Scheduled audits run when the configured external scheduler calls the worker endpoint.</small></label><label>Maximum pages<input name="maxPages" type="number" min={1} max={seoCrawlPageLimit()} defaultValue={Math.min(website.maxPages || 25, seoCrawlPageLimit())} /><small>Server limit: {seoCrawlPageLimit()} pages per crawl.</small></label></div>
        <label>PageSpeed schedule<select name="pageSpeedFrequency" defaultValue={website.pageSpeedFrequency || "manual"}><option value="manual">Manual only</option><option value="weekly">Weekly mobile homepage check</option><option value="monthly">Monthly mobile homepage check</option></select><small>Uses the Google PageSpeed API key and an external scheduler. Runs only for verified, active websites.</small></label>
        {website.nextScheduledPageSpeedAt && <p className="website-settings-message" role="status">Next PageSpeed check: {new Date(website.nextScheduledPageSpeedAt).toLocaleString()}{website.lastScheduledPageSpeedStatus ? ` · Last attempt: ${website.lastScheduledPageSpeedStatus}` : ""}.</p>}
        <button type="submit"><Save size={15} /> Save website settings</button>
      </form>
      <form action={setWebsiteActiveAction} className="website-active-form">
        <input type="hidden" name="domain" value={website.domain} />
        <input type="hidden" name="active" value={website.active === false ? "true" : "false"} />
        <div><strong>{website.active === false ? "Website is paused" : "Website is active"}</strong><p>Pausing prevents new site audits. Existing reports and history remain available.</p></div>
        <button type="submit">{website.active === false ? "Reactivate website" : "Pause website"}</button>
      </form>
      <section className="website-activity" aria-labelledby="website-activity-title"><div><p className="workspace-eyebrow">AUDIT TRAIL</p><h2 id="website-activity-title">Recent activity</h2></div>{activity.length ? <ol>{activity.map((item, index) => <li key={`${item.auditId || item.action}-${item.createdAt?.toISOString?.() || index}`}><span className="website-activity-dot" /><div><strong>{(item.action || "website.updated").replaceAll(".", " ").replaceAll("_", " ")}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Time unavailable"}{item.method ? ` · ${item.method.replaceAll("_", " ")}` : ""}{typeof item.pageCount === "number" ? ` · ${item.pageCount} pages` : ""}{typeof item.issueCount === "number" ? ` · ${item.issueCount} findings` : ""}</small></div></li>)}</ol> : <p>No recorded website activity yet. Verification and audits will appear here.</p>}</section>
      <div className="website-delete-panel"><div><strong>Remove this website</strong><p>Delete this site and its saved SEO data from this workspace.</p></div><WebsiteDeleteControl domain={website.domain} /></div>
    </section>
  </div>;
}
