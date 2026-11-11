import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { MarketplaceNavigation } from "@/components/marketplace/navigation";
import "./marketplace.css";

export const instant = false;

export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fmarketplace%2Fservices");
  return <div className="marketplace-shell">
    <header className="marketplace-header"><div className="marketplace-header-inner">
      <Link href="/marketplace/services" className="marketplace-mark"><span className="marketplace-mark-symbol">✳</span><span>SEO STUDIO <small>EXPERT SERVICES</small></span></Link>
      <div className="marketplace-header-actions"><span className="marketplace-session-name">{session.user.name || session.user.email}</span><Link href="/influencer-marketing">Influencer Marketing ↗</Link><Link href="/dashboard">SEO workspace ↗</Link></div>
    </div></header>
    <div className="marketplace-layout"><MarketplaceNavigation /><main className="marketplace-content">{children}</main></div>
  </div>;
}
