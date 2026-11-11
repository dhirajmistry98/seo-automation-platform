"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

const links = [
  { href: "/marketplace/services", label: "Expert services", icon: Sparkles },
];

export function MarketplaceNavigation() {
  const pathname = usePathname();
  return <nav className="marketplace-sidebar" aria-label="Expert services"><span className="marketplace-nav-heading">EXPERT SERVICES</span>
    {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href || (href !== "/marketplace" && pathname.startsWith(`${href}/`)) ? "is-active" : ""} aria-current={pathname === href ? "page" : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>)}
    <p className="marketplace-nav-note">Reviewed SEO, GEO, AEO, LLMO, local search and WordPress services.</p>
  </nav>;
}
