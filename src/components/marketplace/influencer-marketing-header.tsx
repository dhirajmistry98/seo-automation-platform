"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, ChevronDown, Compass, Heart, LayoutDashboard, LogOut, Megaphone, MessageSquareText, Plus, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { WorkspaceNotifications } from "@/components/workspace/workspace-notifications";
import { signOutAction } from "@/app/login/action";

const base = "/influencer-marketing";
const primaryLinks = [
  { href: `${base}/discover`, label: "Discover", icon: Compass },
  { href: `${base}/campaigns`, label: "Campaigns", icon: Megaphone },
  { href: `${base}/inbox`, label: "Inbox", icon: MessageSquareText },
  { href: `${base}/cart`, label: "Saved", icon: Heart },
];

function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

export function InfluencerMarketingHeader({ brandName, userName, userEmail, showAdmin }: { brandName: string; userName: string; userEmail: string; showAdmin: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === `${base}/discover` && pathname.startsWith(`${base}/creators/`));

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  // Close the account menu after navigating.
  useEffect(() => { const timer = window.setTimeout(() => setMenuOpen(false), 0); return () => window.clearTimeout(timer); }, [pathname]);

  return <header className="imh">
    <div className="imh-inner">
      <Link href={base} className="imh-brand" aria-label={`${brandName} Influencer Marketing home`}>
        <BrandLogo className="imh-logo" />
        <span className="imh-brand-text"><strong>{brandName}</strong><small>Creators</small></span>
      </Link>

      <nav className="imh-nav" aria-label="Influencer marketing">
        {primaryLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(href) ? "is-active" : ""} aria-current={isActive(href) ? "page" : undefined}><Icon size={16} strokeWidth={1.9} /><span>{label}</span></Link>)}
      </nav>

      <div className="imh-actions">
        <Link href={`${base}/campaigns`} className="imh-cta"><Plus size={15} /><span>Post a campaign</span></Link>
        <WorkspaceNotifications scope="influencer-marketing" />
        <div className="imh-account" ref={menuRef}>
          <button type="button" className="imh-avatar-button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu" onClick={() => setMenuOpen((open) => !open)}>
            <span className="imh-avatar" aria-hidden="true">{initials(userName || userEmail)}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {menuOpen && <div className="imh-menu" role="menu">
            <div className="imh-menu-identity"><strong>{userName}</strong>{userEmail && <small>{userEmail}</small>}</div>
            <Link role="menuitem" href={`${base}/creator`}><UserRound size={15} /> Creator studio</Link>
            <Link role="menuitem" href={`${base}/brand`}><BriefcaseBusiness size={15} /> Brand studio</Link>
            <Link role="menuitem" href={`${base}/account`}><Settings2 size={15} /> Marketplace account</Link>
            {showAdmin && <Link role="menuitem" href={`${base}/admin`}><ShieldCheck size={15} /> Administration</Link>}
            <hr />
            <Link role="menuitem" href="/dashboard"><LayoutDashboard size={15} /> SEO Dashboard <ArrowLeft size={13} className="imh-menu-trailing" /></Link>
            <form action={signOutAction}><button role="menuitem" type="submit"><LogOut size={15} /> Sign out</button></form>
          </div>}
        </div>
      </div>
    </div>
  </header>;
}
