import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { signInWithGoogle } from "./action";
import { EmailOtpForm } from "@/components/marketing/email-otp-form";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { BRAND } from "@/lib/marketing";
import { emailDeliveryConfigured } from "@/lib/email";
import { AlertCircle, ArrowLeft, Check, Search, ShieldCheck } from "lucide-react";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export const instant = false;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await connection();
  const session = await auth();
  const { error, callbackUrl: requestedCallback } = await searchParams;
  const validCallback = typeof requestedCallback === "string" && requestedCallback.startsWith("/") && !requestedCallback.startsWith("//") && !requestedCallback.includes("\\") && !requestedCallback.startsWith("/login");
  const callbackUrl = validCallback ? requestedCallback.slice(0, 2048) : "/dashboard";
  const emailOtpEnabled = emailDeliveryConfigured();
  if (session?.user) redirect(callbackUrl);
  const getErrorMessage = (code: string) => {
    switch (code) {
      case "OAuthSignin": return "Could not initialize Google sign-in. Please verify your Google Client ID.";
      case "OAuthCallback": return "Google OAuth callback failed. Check the authorized redirect URI in Google Cloud Console.";
      case "OAuthCreateAccount":
      case "Callback": return "Failed to save or link your user session.";
      case "AccessDenied": return "Google sign-in needs a verified email. If authenticator MFA is enabled, use the email code and authenticator code below.";
      case "Configuration": return "Server authentication configuration error. Check the sign-in settings.";
      case "CredentialsSignin": return "That email code is invalid or expired. Request a new one and try again.";
      case "OAuthAccountNotLinked": return "This email is already registered with another sign-in method. Sign in with an email code, then try Google again.";
      default: return `Sign-in could not be completed (${code}).`;
    }
  };

  return (
    <main className="login-shell">
      <aside className="login-story">
        <Link href="/" className="login-brand" aria-label={BRAND.name + " home"}>
          <BrandLogo className="login-brand-logo" />
          <span><strong>{BRAND.name}</strong><small>{BRAND.tagline}</small></span>
        </Link>
        <div className="login-story-copy">
          <p className="login-eyebrow"><span /> Your SEO workspace</p>
          <h1>Search work,<br /><em>made clearer.</em></h1>
          <p>Bring research, site health and approved improvements into one practical workspace.</p>
          <ul>
            <li><Check size={15} /> Start with evidence from your connected sources</li>
            <li><Check size={15} /> Review important changes before they happen</li>
            <li><Check size={15} /> Keep your website data in view</li>
          </ul>
        </div>
        <div className="login-story-footer"><span><ShieldCheck size={14} /> Secure access</span><span>{BRAND.name} · 2026</span></div>
        <span className="login-story-orbit" aria-hidden="true" />
      </aside>

      <section className="login-form-side">
        <div className="login-back-row">
          <Link href="/" className="login-back">
            <span className="login-back-icon" aria-hidden="true"><ArrowLeft size={14} /></span>
            Back to home
          </Link>
        </div>
        <div className="login-card">
          <div className="login-form-heading">
            <span className="login-form-icon"><Search size={18} /></span>
            <p className="login-eyebrow">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p>Use Google or get a secure one-time code by email.</p>
          </div>

          <aside className="login-guidance" aria-label="Getting started guidance">
            <div><strong>New to SEO STUDIO?</strong><p>See the quick guide to setting up your website, target market and data sources.</p></div>
            <Link href="/#guidance">View guide</Link>
          </aside>

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={16} />
              <div><strong>Sign-in error</strong><p>{getErrorMessage(error)}</p></div>
            </div>
          )}

          <form action={signInWithGoogle} className="login-google-form">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button type="submit" className="login-google">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
              </svg>
              Continue with Google
            </button>
          </form>

          {emailOtpEnabled ? <>
            <div className="login-divider"><span>OR CONTINUE WITH EMAIL</span></div>
            <EmailOtpForm redirectTo={callbackUrl} />
            <p className="login-security-note"><ShieldCheck size={14} /> Your sign-in is protected. Email codes expire after 30 seconds.</p>
          </> : <div className="login-email-unavailable" role="status"><ShieldCheck size={15} /><span>Email sign-in is not enabled for this deployment. Continue with Google.</span></div>}
        </div>
        <p className="login-help">Need help? <Link href="/">Visit {BRAND.name}</Link></p>
      </section>
    </main>
  );
}
