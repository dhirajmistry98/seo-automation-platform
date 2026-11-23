import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Globe2, ListTodo, LockKeyhole, MapPin, Radar } from "lucide-react";

export function NextStepsSection() {
  return (<section className="workspace-section workspace-overview-next" aria-labelledby="overview-next-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">GET STARTED</p><h2 id="overview-next-title">Choose what to do next</h2><p>Each area has its own page and controls.</p></div></div>
      <div className="workspace-quick-links">
        <Link href="/dashboard/websites"><span><Globe2 size={17} /></span><strong>Manage websites</strong><small>Add domains, run audits, and follow issues.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/tools"><span><ListTodo size={17} /></span><strong>SEO audits & technical fixes</strong><small>Audit pages, prioritize findings, and work through fixes.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/research"><span><MapPin size={17} /></span><strong>Local SEO & rank tracking</strong><small>Target supported countries, cities, and regions in search research.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/visibility"><span><Radar size={17} /></span><strong>GEO, AEO & LLMO</strong><small>Review generative search, answer readiness, and AI visibility signals.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/integrations"><span><LockKeyhole size={17} /></span><strong>Google & WordPress data</strong><small>Connect reporting sources and your WordPress site.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/account"><span><CheckCircle2 size={17} /></span><strong>Account & team</strong><small>Manage workspace roles and account security.</small><ArrowRight size={15} /></Link>
        <Link href="/dashboard/websites"><span><FileText size={17} /></span><strong>Content & website setup</strong><small>Manage site settings, keywords, and publishing connections.</small><ArrowRight size={15} /></Link>
      </div>
    </section>);
}
