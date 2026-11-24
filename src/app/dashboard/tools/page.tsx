import { connection } from "next/server";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Activity, ArrowRightLeft, BarChart3, Braces, FileBarChart, FileSearch, Gauge, Globe, Globe2, LineChart, Link2, ListTodo, MapPinned, Megaphone, Radar, ScanSearch, Search, Sparkles, Split, Target } from "lucide-react";
import { SiteAuditControls } from "@/components/workspace/site-audit-controls";
import { SiteIssueManager } from "@/components/workspace/site-issue-manager";
import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";
import { DATAFORSEO_DASHBOARD_URL, getDataForSeoAccountStatus } from "@/lib/integrations/dataforseo";

export const instant = false;

type LiveTool = { name: string; provider?: boolean; description: string; icon: typeof Target; state: string; href: string };
const liveTools: LiveTool[] = [
  { name: "Rank a page", provider: true, description: "Pick a page and a keyword: see your Google position, what is missing, and a step-by-step plan to rank higher.", icon: Target, state: "Optimize a page", href: "/dashboard/rank-a-page" },
  { name: "Client-ready reports", description: "Branded PDF report per website: health trend, issues, PageSpeed, Search Console, keywords and AI readiness.", icon: FileBarChart, state: "Open reports", href: "/dashboard/report" },
  { name: "SEO checker", description: "Check any public page live for SEO health, on-page details, issues and AI search readiness.", icon: ScanSearch, state: "Check a page", href: "/dashboard/seo-checker" },
  { name: "Technical site audits", description: "Crawl verified pages for metadata, indexability, schema, errors, and internal links.", icon: FileSearch, state: "Run audit", href: "#website-controls" },
  { name: "PageSpeed reports", description: "Load mobile and desktop Lighthouse scores and performance opportunities.", icon: Gauge, state: "Run PageSpeed", href: "#website-controls" },
  { name: "SEO action plans", description: "Turn open audit findings into trackable tasks for your workspace.", icon: ListTodo, state: "Create plan", href: "#website-controls" },
  { name: "Search Console & GA4", description: "Review verified search performance and authorized traffic reports.", icon: BarChart3, state: "Connect Google", href: "/dashboard/integrations" },
  { name: "SEO Authority Index", provider: true, description: "Calculate a versioned authority estimate from saved backlink, Search Console and crawl evidence.", icon: Activity, state: "Open research", href: "/dashboard/research" },
  { name: "GEO, AEO & LLMO readiness", description: "Review first-party content and technical signals from the latest site crawl.", icon: Radar, state: "Open readiness", href: "/dashboard/visibility" },
  { name: "Domain overview & organic research", provider: true, description: "Any website's estimated traffic, 12-month trend, ranking distribution, every ranking keyword and its top pages.", icon: Globe, state: "Open research", href: "/dashboard/research" },
  { name: "Keyword magic", provider: true, description: "Hundreds of keyword ideas with volume, difficulty, intent and trend, plus filters and automatic word groups.", icon: Sparkles, state: "Find keywords", href: "/dashboard/research" },
  { name: "Position tracking & share of voice", provider: true, description: "Daily, weekly or monthly ranks with competitor positions, SERP features, AI Overview citations and share of voice.", icon: LineChart, state: "Track positions", href: "/dashboard/research" },
  { name: "Local map grid", provider: true, description: "A 3×3 or 5×5 heatmap of your Google Maps position around a location.", icon: MapPinned, state: "Run a grid", href: "/dashboard/research" },
  { name: "Backlink analytics & gap", provider: true, description: "Referring domains, anchors, new and lost backlinks, and sites that link to competitors but not to you.", icon: Link2, state: "Analyse links", href: "/dashboard/research" },
  { name: "Advertising research", provider: true, description: "The paid Google keywords and ads of your website or a competitor.", icon: Megaphone, state: "Research ads", href: "/dashboard/research" },
  { name: "Keyword cannibalization", description: "Searches where two or more of your pages compete, from your Search Console data. Free.", icon: Split, state: "Find conflicts", href: "/dashboard/research" },
  { name: "Schema Generator", description: "Build JSON-LD structured data for any page — Article, FAQ, Product, LocalBusiness, Event and more.", icon: Braces, state: "Generate schema", href: "/dashboard/tools/schema" },
  { name: "hreflang Builder", description: "Generate hreflang link tags and sitemap XML for international pages. Validates language codes.", icon: Globe2, state: "Build tags", href: "/dashboard/tools/hreflang" },
  { name: "Redirect Manager", description: "Store 301/302 redirect rules per site. Export as nginx, Apache .htaccess, Vercel JSON or CSV.", icon: ArrowRightLeft, state: "Manage redirects", href: "/dashboard/tools/redirects" },
  { name: "Content Brief (AI)", description: "AI-generated brief for writers: outline, schema recommendation, semantic keywords, CTAs, checklist.", icon: Sparkles, state: "Open AI Studio", href: "/dashboard/ai" },
  { name: "E-E-A-T Audit (AI)", description: "AI-scored audit of experience, expertise, authority, and trustworthiness signals on any page.", icon: Sparkles, state: "Open AI Studio", href: "/dashboard/ai" },
];

export default async function SeoToolsPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const { websites, memberships } = workspace;
  // Live check of the paid research provider (free endpoints only, cached for a minute), so "ready" is never assumed.
  const provider = await getDataForSeoAccountStatus();
  const providerReady = provider.state === "ready";
  const providerMessage = "message" in provider ? provider.message : provider.state === "not_configured" ? "No research data provider is configured on the server." : "";
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> MEASURE & IMPROVE</p><h1>SEO tools</h1><p>Run available analysis and review each site&apos;s findings and action plan.</p></div><Link href="/dashboard/research" className="workspace-outline-link"><Search size={15} /> Open SEO research</Link></header>
    {!workspace.available && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute — if this keeps happening, contact support.</div>}
    {!providerReady && <div className="workspace-alert tools-provider-alert" role="status"><strong>Research data is not available right now.</strong> {providerMessage} Tools marked “Needs data provider” stay disabled until it is fixed; every other tool below works with live data. <a href={DATAFORSEO_DASHBOARD_URL} target="_blank" rel="noreferrer">Open provider dashboard</a></div>}
    <section className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">{providerReady ? "READY TO USE" : "LIVE STATUS"}</p><h2>Live tools</h2><p>Run them from a verified website. Results are saved in that website’s history.</p></div></div>
      <div className="workspace-tool-grid">{liveTools.map(({ name, provider: needsProvider, description, icon: Icon, state, href }) => <Link className={`workspace-tool-card${needsProvider && !providerReady ? " is-blocked" : ""}`} href={href} key={name}><span><Icon size={18} aria-hidden="true" /></span><div><h3>{name}</h3><p>{description}</p></div><small>{needsProvider && !providerReady ? "Needs data provider" : state}</small></Link>)}</div>
    </section>
    <section id="website-controls" className="workspace-section workspace-tool-section"><div className="workspace-section-heading"><div><p className="workspace-eyebrow">BY WEBSITE</p><h2>Audit and task controls</h2><p>Ownership and team permissions determine which controls are available.</p></div></div>
      {websites.length ? <div className="workspace-site-list">{websites.map((site) => {
        const role = websiteRole(memberships, site);
        const canManage = hasOrganizationPermission(role, "websites.manage");
        const canAudit = hasOrganizationPermission(role, "audit.run");
        const canManageTasks = hasOrganizationPermission(role, "tasks.manage");
        const canManageIssues = hasOrganizationPermission(role, "issues.manage");
        return <article className="workspace-site-card workspace-tool-site" key={site.domain}><span className="workspace-site-mark"><FileSearch size={17} /></span><div className="workspace-site-identity"><strong>{site.name || site.domain}</strong><small>{site.domain} · {site.verifiedAt ? "Verified" : "DNS verification required"}</small></div><Link className="workspace-site-settings" href="/dashboard/websites">Website page</Link>{(canAudit || canManage || canManageTasks) && <SiteAuditControls domain={site.domain} siteUrl={site.url} verifiedAt={site.verifiedAt} lastAudit={site.lastAudit} canManageSite={canManage} canManageTasks={canManageTasks} canRunAudit={canAudit} />}{site.lastAudit && <SiteIssueManager domain={site.domain} canManage={canManageIssues} />}</article>;
      })}</div> : <div className="workspace-site-empty"><span><FileSearch size={18} /></span><div><strong>{workspace.available ? "Add your website to use the SEO tools" : "SEO tools can’t load right now"}</strong><p>{workspace.available ? "Once your website is added and you’ve confirmed you own it, you can scan it for problems and get a step-by-step fix list." : "We can’t reach your saved data right now. Please refresh in a minute — if this keeps happening, contact support."}</p></div>{workspace.available && <Link href="/dashboard/websites">Add your website</Link>}</div>}
    </section>
  </>;
}
