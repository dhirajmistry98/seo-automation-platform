import type { ReactNode } from "react";
import { auth } from "@/auth";
import { connection } from "next/server";
import { cookies } from "next/headers";
import Link from "next/link";
import clientPromise from "@/lib/mongodb";
import { ensureSessionUserProfile } from "@/lib/user-profile";
import { signOutAction } from "@/app/login/action";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { WorkspaceNotifications } from "@/components/workspace/workspace-notifications";
import { WorkspaceNavigation } from "@/components/workspace/workspace-navigation";
import { UserAvatar } from "@/components/workspace/user-avatar";
import { ensurePersonalOrganization, getOrganizationMemberships } from "@/lib/organizations";
import { BRAND } from "@/lib/marketing";
import { ArrowRight, BriefcaseBusiness, ChevronRight, LogOut, Rocket, UsersRound } from "lucide-react";
import { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import "./styles/01-base.css";
import "./styles/02-tools.css";
import "./styles/03-polish.css";
import "./styles/04-layout-polish.css";
import "./styles/05-reference.css";
import "./styles/06-shell.css";
import "./styles/07-ai-visibility.css";
import "./styles/08-audit-overview.css";
import "./styles/07-theme.css";
import "./styles/09-sidebar.css";
import "./styles/10-insights.css";
import "./styles/11-google.css";
import { SubmitButton } from "@/components/ui/submit-button";
import { SiteAssistant } from "@/components/workspace/site-assistant";

export const instant = false;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth();
  if (!session?.user) return <div className="workspace-shell workspace-invite-shell"><header className="workspace-header"><div className="workspace-header-inner"><Link href="/" className="workspace-brand"><BrandLogo className="workspace-brand-logo" /><span><strong>{BRAND.name}</strong><small>WORKSPACE</small></span></Link><Link className="workspace-signout" href="/login">Sign in</Link></div></header>{children}</div>;
  const user = session.user;
  let siteCount: number | null = 0;
  try {
    const db = (await clientPromise).db();
    if (user.id && user.email) await ensureSessionUserProfile(db, { id: user.id, email: user.email, name: user.name, image: user.image });
    await ensurePersonalOrganization(db, user.id!);
    const memberships = await getOrganizationMemberships(db, user.id!);
    siteCount = await db.collection("websites").countDocuments({ $or: [{ organizationId: { $in: memberships.map((item) => item.organizationId) } }, { ownerId: user.id, organizationId: { $exists: false } }] });
  } catch { siteCount = null; }
  const theme = (await cookies()).get("ws-theme")?.value === "dark" ? "dark" : "light";
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  return <div className="workspace-shell ws2" data-ws-theme={theme}>
    <aside className="ws2-side">
      <Link href="/dashboard" className="ws2-brand" aria-label={`${BRAND.name} workspace`}><BrandLogo className="ws2-brand-logo" /><span><strong>{BRAND.name}</strong><small>Workspace</small></span></Link>
      <WorkspaceNavigation siteCount={siteCount} />
      <div className="ws2-promo"><Rocket size={20} aria-hidden="true" /><strong>Grow faster with experts</strong><p>Hire vetted SEO specialists for audits, content and links.</p><Link href="/marketplace/services">Browse services <ArrowRight size={13} aria-hidden="true" /></Link></div>
      <Link href="/dashboard/account" className="ws2-user" aria-label="Open account settings"><UserAvatar src={user.image} name={user.name || user.email || firstName} /><span><strong>{user.name || "Account"}</strong><small>{user.email}</small></span><ChevronRight size={15} aria-hidden="true" /></Link>
    </aside>
    <div className="ws2-body">
      <header className="ws2-header">
        <WorkspaceSearch />
        <div className="ws2-actions"><Link href="/influencer-marketing" className="ws2-pill"><UsersRound size={15} aria-hidden="true" /><span>Influencer Marketing</span></Link><Link href="/marketplace/services" className="ws2-pill"><BriefcaseBusiness size={15} aria-hidden="true" /><span>Expert Services</span></Link><WorkspaceNotifications /><ThemeToggle initialTheme={theme} /><form action={signOutAction}><SubmitButton className="ws2-signout" aria-label="Sign out"><LogOut size={15} aria-hidden="true" /><span>Sign out</span></SubmitButton></form></div>
      </header>
      <main className="workspace-main workspace-main-redesign workspace-route-main ws2-main">{siteCount === null && <div className="workspace-alert" role="status">We can’t reach your saved data right now. Please refresh in a minute — if this keeps happening, contact support.</div>}{children}<footer className="workspace-footer"><span>{BRAND.name} · SEO workspace</span><Link href="/">Back to the website</Link></footer></main>
    </div>
    <SiteAssistant />
  </div>;
}
