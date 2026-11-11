"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Compass, House, Megaphone, MessageSquareText, Settings2, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";

const links = [
  { href: "/influencer-marketing", label: "Overview", icon: House },
  { href: "/influencer-marketing/discover", label: "Discover creators & brands", icon: Compass },
  { href: "/influencer-marketing/cart", label: "Creator cart", icon: ShoppingCart },
  { href: "/influencer-marketing/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/influencer-marketing/creator", label: "Creator studio", icon: UserRound },
  { href: "/influencer-marketing/brand", label: "Brand studio", icon: BriefcaseBusiness },
  { href: "/influencer-marketing/inbox", label: "Collaborations", icon: MessageSquareText },
  { href: "/influencer-marketing/account", label: "Account", icon: Settings2 },
];

export function InfluencerMarketingNavigation({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const items = showAdmin ? [...links, { href: "/influencer-marketing/admin", label: "Administration", icon: ShieldCheck }] : links;
  return <nav className="marketplace-sidebar" aria-label="Influencer Marketing">
    <span className="marketplace-nav-heading">INFLUENCER MARKETING</span>
    {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href || (href !== "/influencer-marketing" && pathname.startsWith(`${href}/`)) ? "is-active" : ""} aria-current={pathname === href ? "page" : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>)}
    <p className="marketplace-nav-note">For India · INR<br />Creator statistics are shown as verified only after an eligible Meta authorization.</p>
  </nav>;
}
