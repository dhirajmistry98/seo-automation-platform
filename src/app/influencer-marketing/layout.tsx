import type { ReactNode } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { InfluencerMarketingHeader } from "@/components/marketplace/influencer-marketing-header";
import { BRAND } from "@/lib/marketing";
import "@/app/marketplace/marketplace.css";

export const instant = false;
export const metadata: Metadata = {
  title: "Influencer Marketing Workspace",
  description: "A separate workspace for brands and creators to discover partners, manage campaigns and handle collaborations.",
};

export default async function InfluencerMarketingLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Finfluencer-marketing");
  const adminEmails = (process.env.MARKETPLACE_ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const showAdmin = Boolean(session.user.email && adminEmails.includes(session.user.email.toLowerCase()));

  return <div className="marketplace-shell influencer-marketing-shell">
    <InfluencerMarketingHeader brandName={BRAND.name} userName={session.user.name || session.user.email || "Your account"} userEmail={session.user.email || ""} showAdmin={showAdmin} />
    <main className="imh-content">{children}</main>
  </div>;
}
