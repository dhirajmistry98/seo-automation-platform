import { connection } from "next/server";
import { auth } from "@/auth";
import Link from "next/link";
import { InvitationAcceptance } from "@/components/workspace/invitation-acceptance";

export const instant = false;

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await connection();
  const [{ token }, session] = await Promise.all([searchParams, auth()]);
  const safeToken = typeof token === "string" && token.length <= 100 ? token : "";
  return <div className="invite-page"><section className="invite-card"><p className="workspace-eyebrow">TEAM INVITATION</p><h1>Join an SEO workspace</h1>
    {session?.user ? <InvitationAcceptance token={safeToken} /> : <><p>Sign in with the email address that received the invitation to continue.</p><Link className="invite-button" href={`/login?callbackUrl=${encodeURIComponent(`/dashboard/invitations/accept?token=${safeToken}`)}`}>Sign in to accept</Link></>}
  </section></div>;
}
