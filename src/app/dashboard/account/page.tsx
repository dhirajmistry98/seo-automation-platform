import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AccountDataControls } from "@/components/workspace/account-data-controls";
import { MfaSettings } from "@/components/workspace/mfa-settings";
import { OrganizationManager } from "@/components/workspace/organization-manager";

export const instant = false;

export default async function AccountPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> PROFILE & ACCESS</p><h1>Account</h1><p>Manage your profile, workspace membership, and account security.</p></div></header>
    <section className="workspace-section workspace-account-page">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">SIGNED-IN ACCOUNT</p><h2>{session.user.name || "Account"}</h2><p>{session.user.email}</p></div><span className="workspace-account-active">Active session</span></div>
      <div className="workspace-account-tools"><article><div><h3>Account security</h3><p>Require an email code and authenticator code during sign-in.</p></div><MfaSettings /></article><article><div><h3>Your account data</h3><p>Export accessible SEO records or permanently delete your account.</p></div><AccountDataControls /></article></div>
    </section>
    <OrganizationManager />
  </>;
}
