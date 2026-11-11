import type { ReactNode } from "react";
import { auth } from "@/auth";
import { connection } from "next/server";
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
import { ArrowUpRight, BriefcaseBusiness, LogOut, UsersRound } from "lucide-react";
import "./dashboard.css";

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
  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  return <div className="workspace-shell">
    <header className="workspace-header"><div className="workspace-header-inner">
      <Link href="/dashboard" className="workspace-brand" aria-label={`${BRAND.name} workspace`}><BrandLogo className="workspace-brand-logo" /><span><strong>{BRAND.name}</strong><small>WORKSPACE</small></span></Link>
      <div className="workspace-account"><Link href="/influencer-marketing" className="workspace-module-switch"><UsersRound size={15} aria-hidden="true" /><span>Influencer Marketing</span><ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/marketplace/services" className="workspace-module-switch"><BriefcaseBusiness size={15} aria-hidden="true" /><span>Expert services</span><ArrowUpRight size={13} aria-hidden="true" /></Link><WorkspaceNotifications /><Link href="/dashboard/account" className="workspace-account-profile" aria-label="Open account settings"><UserAvatar src={user.image} name={user.name || user.email || firstName} /><span className="workspace-account-copy"><strong>{user.name || "Account"}</strong><small>{user.email}</small></span></Link><form action={signOutAction}><button className="workspace-signout" type="submit" aria-label="Sign out"><LogOut size={15} aria-hidden="true" /><span>Sign out</span></button></form></div>
    </div></header>
    <div className="workspace-layout"><WorkspaceNavigation siteCount={siteCount} /><main className="workspace-main workspace-main-redesign workspace-route-main">{siteCount === null && <div className="workspace-alert" role="status">Workspace database is unavailable. Start MongoDB or update <code>MONGODB_URI</code>, then refresh.</div>}{children}<footer className="workspace-footer"><span>{BRAND.name} · SEO workspace</span><Link href="/">Back to the website</Link></footer></main></div>
  </div>;
}
