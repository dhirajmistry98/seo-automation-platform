import { BRAND } from "@/lib/marketing";
import { BrandLogo } from "./brand-logo";
import { Activity, Check, CircleHelp, Globe2, LayoutDashboard, MousePointerClick, Search, Sparkles } from "lucide-react";

export function DashboardPreview() {
  return (
    <div className="dashboard-window" aria-label="SEO application overview with no connected website">
      <div className="dashboard-topbar">
        <div className="flex items-center gap-2.5"><BrandLogo className="mini-brand-logo" /><span className="text-[12px] font-semibold text-brand-cream">{BRAND.name}</span></div>
        <div className="hidden items-center gap-5 text-[10px] text-brand-cream sm:flex"><span>Overview</span><span>Site audit</span><span>Keywords</span></div>
        <span className="preview-pill"><span className="h-1.5 w-1.5 rounded-full bg-brand-coral" />No website connected</span>
      </div>
      <div className="dashboard-body">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-medium uppercase tracking-[0.14em] text-brand-cream">Website overview</p><p className="mt-1 text-[16px] font-semibold tracking-[-0.04em] text-brand-cream sm:text-[19px]">Your SEO, at a glance</p></div>
          <div className="hidden items-center gap-2 rounded-lg border border-brand-cream bg-brand-cream px-2.5 py-2 text-[10px] text-brand-cream sm:flex"><Globe2 size={12} /> Connect a website</div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[["SEO health", Activity, "No audit yet"], ["Organic clicks", MousePointerClick, "Connect Search Console"], ["Keywords", Search, "No keywords tracked"], ["Issues found", CircleHelp, "Run your first audit"]].map(([label, Icon, detail]) => {
            const MetricIcon = Icon as typeof Activity;
            return <div key={label as string} className="preview-stat"><div className="flex items-center justify-between"><span className="preview-label">{label as string}</span><MetricIcon size={13} className="text-brand-cream" /></div><strong className="preview-number">—</strong><span className="text-[9px] text-brand-cream">{detail as string}</span></div>;
          })}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.65fr_1fr]">
          <div className="preview-panel">
            <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold text-brand-cream">Organic performance</p><p className="mt-1 text-[9px] text-brand-cream">Search Console data</p></div><span className="rounded-md bg-brand-navy px-2 py-1 text-[9px] text-brand-cream">Not connected</span></div>
            <div className="chart-wrap"><div className="empty-chart"><span className="empty-chart-icon"><Activity size={15}/></span><span>Connect Search Console to view clicks and impressions.</span></div></div>
            <div className="mt-1 flex justify-between text-[8px] text-brand-cream"><span>Performance data appears here after connection</span></div>
          </div>
          <div className="preview-panel recommendation-panel">
            <div className="flex items-center gap-2"><span className="ai-icon"><Sparkles size={13} /></span><p className="text-[11px] font-semibold text-brand-cream">Recommendations</p></div>
            <p className="mt-3 text-[10px] font-semibold leading-4 text-brand-cream">Your next steps will appear here</p>
            <p className="mt-1.5 text-[9px] leading-[1.6] text-brand-cream">Connect a website and complete an audit to see recommendations based on its data.</p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-navy px-2 py-1 text-[8px] font-medium text-brand-cream"><span className="h-1 w-1 rounded-full bg-brand-coral" />Awaiting website</span>
          </div>
        </div>
      </div>
      <div className="dashboard-bottom"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-coral" />Website data appears after an authorized connection</span><span>Live data only</span></div>
    </div>
  );
}

export function ApplicationPreview() {
  return <div className="product-preview app-preview">
    <div className="product-preview-head"><div className="flex items-center gap-2"><BrandLogo className="mini-brand-logo" /><span className="text-[11px] font-semibold text-brand-cream">Site overview</span></div><span className="preview-pill">No site connected</span></div>
    <div className="grid grid-cols-[0.8fr_1.2fr] gap-3 p-4">
      <div className="rounded-xl border border-brand-cream bg-brand-cream p-3"><p className="text-[9px] text-brand-cream">Health score</p><div className="mx-auto mt-3 flex h-[76px] w-[76px] items-center justify-center rounded-full border-[7px] border-brand-cream text-xl font-semibold text-brand-cream">—</div><p className="mt-2 text-center text-[8px] text-brand-cream">Available after an audit</p></div>
      <div className="rounded-xl border border-brand-cream bg-brand-cream p-3"><p className="text-[9px] font-medium text-brand-cream">Audit summary</p><div className="mt-3 space-y-2.5">{[["Technical", "Awaiting crawl"], ["On-page", "Awaiting crawl"], ["Content", "Awaiting crawl"]].map(([a,b])=><div key={a} className="flex items-center justify-between text-[9px]"><span className="text-brand-cream">{a}</span><span className="rounded-full bg-brand-navy px-2 py-1 text-brand-cream">{b}</span></div>)}</div></div>
    </div>
    <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-brand-navy bg-brand-navy p-3"><span className="ai-icon"><Sparkles size={12}/></span><span className="text-[9px] leading-4 text-brand-cream">Evidence-based recommendations appear after your first audit.</span></div>
  </div>;
}

export function PluginPreview() {
  return <div className="product-preview plugin-preview">
    <div className="product-preview-head"><div className="flex items-center gap-2"><span className="wp-mark">W</span><span className="text-[11px] font-semibold text-brand-cream">Page SEO</span></div><span className="text-[9px] text-brand-cream">No page selected</span></div>
    <div className="p-4">
      <div className="flex items-center gap-2 border-b border-brand-cream pb-3"><LayoutDashboard size={13} className="text-brand-cream"/><span className="text-[10px] text-brand-cream">On-page settings</span><span className="ml-auto rounded-full bg-brand-navy px-2 py-1 text-[8px] text-brand-cream">Select a page</span></div>
      <label className="mt-3 block text-[8px] font-medium uppercase tracking-[0.08em] text-brand-cream">SEO title</label><div className="mt-1 rounded-lg border border-brand-cream bg-brand-cream px-2.5 py-2 text-[9px] text-brand-cream">Select a page to manage its title</div>
      <label className="mt-3 block text-[8px] font-medium uppercase tracking-[0.08em] text-brand-cream">Meta description</label><div className="mt-1 min-h-[45px] rounded-lg border border-brand-cream bg-brand-cream px-2.5 py-2 text-[9px] leading-4 text-brand-cream">Page metadata will appear here.</div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-navy px-2.5 py-2"><span className="flex items-center gap-1.5 text-[9px] text-brand-cream"><Check size={11} className="text-brand-cream"/>Changes require approval</span><span className="text-[8px] text-brand-cream">History</span></div>
    </div>
  </div>;
}
