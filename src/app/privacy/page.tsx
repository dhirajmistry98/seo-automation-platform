import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";
import "../terms/terms.css";

export const metadata: Metadata = {
  title: "Privacy Policy | SEO STUDIO",
  alternates: { canonical: "/privacy" },
  description: "How SEO STUDIO collects, uses, shares, protects and deletes personal data, and how to exercise your rights.",
};

export const instant = false;

export default async function PrivacyPage() {
  await connection();
  const session = await auth();
  const user = session?.user ? { name: session.user.name, email: session.user.email } : null;
  const legalName = process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME?.trim();
  const legalAddress = process.env.NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS?.trim();
  const legalEmail = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim();
  const contact = legalEmail ? <a href={`mailto:${legalEmail}`}>{legalEmail}</a> : "the contact shown above";

  return <>
    <a href="#privacy-content" className="skip-link">Skip to privacy policy</a>
    <SiteHeader currentUser={user} />
    <main id="privacy-content" className="terms-page">
      <article className="terms-document">
        <Link className="terms-back-link" href="/">SEO STUDIO <span aria-hidden="true">/</span> Privacy</Link>
        <p className="landing-eyebrow"><span className="landing-eyebrow-dot" /> LEGAL INFORMATION</p>
        <h1>Privacy Policy</h1>
        <p className="terms-updated">Last updated: 16 November 2026 · Applies to users in India and other supported regions.</p>
        <p className="terms-lead">This policy explains what personal data SEO STUDIO collects when you use the website, application, WordPress plugin, research tools and collaboration marketplace, why we use it, who we share it with, how long we keep it, and how you can access, correct or delete it. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023.</p>

        <section className="terms-operator" aria-labelledby="privacy-operator-heading">
          <h2 id="privacy-operator-heading">Data fiduciary and grievance contact</h2>
          <dl>
            <div><dt>Data fiduciary</dt><dd>{legalName || "SEO STUDIO — legal entity details to be supplied"}</dd></div>
            <div><dt>Registered address</dt><dd>{legalAddress || "To be supplied before public commercial launch"}</dd></div>
            <div><dt>Grievance officer / privacy contact</dt><dd>{legalEmail ? <a href={`mailto:${legalEmail}`}>{legalEmail}</a> : "To be configured before public commercial launch"}</dd></div>
          </dl>
        </section>

        <section><h2>1. Data we collect</h2>
          <ul>
            <li><strong>Account data:</strong> name, email address, profile image (when you sign in with Google), sign-in history, and multi-factor authentication settings. Authenticator secrets are stored encrypted.</li>
            <li><strong>Websites and SEO data:</strong> websites you add, ownership verification records, crawl and audit results of public pages, issues, tasks, keywords, reports and settings.</li>
            <li><strong>Connected Google data</strong> (only when you connect a service): Google Search Console performance and indexing data, Google Analytics 4 reports, Business Profile and Merchant Center data for the properties you choose. OAuth tokens are stored encrypted.</li>
            <li><strong>Creator and brand profiles:</strong> display name, bio, location, categories, packages, rates, portfolio links, brand details and campaign briefs.</li>
            <li><strong>Instagram data</strong> (only when a creator verifies through Meta): Instagram username and account ID, account type, follower and media counts, profile picture and recent posts, and, where permitted, audience insights. Access tokens are stored encrypted.</li>
            <li><strong>Collaboration content:</strong> messages, offers, deliverables, reviews and files exchanged inside a collaboration.</li>
            <li><strong>WordPress connection:</strong> a plugin token (stored only as a hash) and the page metadata you choose to sync.</li>
            <li><strong>Technical data:</strong> IP address and browser information used for security and rate limiting (stored as one-way hashes where possible), and website analytics (see Cookies).</li>
          </ul>
        </section>

        <section><h2>2. How we use it</h2><p>To provide the features you use (audits, research, reports, rank tracking, AI visibility checks, integrations, marketplace and messaging); to verify website and Instagram ownership; to send sign-in codes and service notifications; to keep the service secure and prevent abuse; to understand usage and improve the product; and to meet legal obligations. We do not sell personal data and do not use it for third-party advertising.</p></section>

        <section><h2>3. Legal basis and consent</h2><p>We process personal data on the basis of your consent, given when you create an account, connect a service or verify Instagram, and for legitimate uses permitted by law, such as security and legal compliance. You can withdraw consent at any time by disconnecting a service or deleting your account; this does not affect processing that happened before withdrawal.</p></section>

        <section><h2>4. Who we share data with</h2><p>We share data only with service providers that process it on our behalf to run the service, or with the platforms you ask us to connect:</p>
          <ul>
            <li><strong>Vercel</strong> (application hosting, India region) and <strong>MongoDB Atlas</strong> (database).</li>
            <li><strong>Google</strong> (sign-in, Search Console, Analytics, Business Profile, Merchant Center, PageSpeed Insights, and Google Analytics for this website).</li>
            <li><strong>Meta</strong> (Instagram verification for creators).</li>
            <li><strong>SEO data providers</strong> (search, keyword, backlink and AI-answer research): receive the keywords, domains and questions you submit when extended research features are used, not your account details.</li>
            <li><strong>Email providers</strong> (Gmail or Resend) to deliver sign-in codes and notifications, and <strong>Ably</strong> for real-time collaboration messages.</li>
            <li><strong>Other marketplace users</strong>: your public creator or brand profile is visible to signed-in users; collaboration content is visible only to its participants.</li>
            <li><strong>Authorities</strong>, when required by law or to protect rights and safety.</li>
          </ul>
          <p>Some providers may process data outside India under their own safeguards.</p>
        </section>

        <section><h2>5. Google user data (Limited Use)</h2><p>SEO STUDIO&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Google data is used only to show you your own reports and features inside SEO STUDIO, is not used for advertising, is not sold, and is not read by people except with your permission, for security, or to comply with law.</p></section>

        <section><h2>6. Cookies and analytics</h2><p>We use essential cookies to keep you signed in and to protect forms. This website also uses Google Analytics to understand visits; it sets analytics cookies and receives pseudonymous usage data. You can block or delete cookies in your browser settings; essential cookies are needed to sign in.</p></section>

        <section><h2>7. Security</h2><p>Data is encrypted in transit (HTTPS). Third-party tokens and authentication secrets are encrypted at rest, and plugin tokens are stored only as hashes. Access is limited by workspace roles, and requests are protected against cross-site forgery and abuse. No system is perfectly secure; if a personal data breach affects you, we will notify you and the Data Protection Board of India as required by law.</p></section>

        <section><h2>8. Retention</h2><p>We keep personal data while your account is active and as needed to provide the service. Sign-in codes expire within minutes; security logs are kept for a limited period. When you delete your account or creator profile, we delete or anonymise the related data, except records we must keep for legal, tax, dispute or fraud-prevention reasons, such as completed collaborations and payment records.</p></section>

        <section id="data-deletion"><h2>9. Your rights and how to delete your data</h2>
          <p>You can access, correct, export and erase your personal data, withdraw consent, nominate another person to exercise your rights, and raise a grievance.</p>
          <ul>
            <li><strong>Export your data:</strong> Dashboard → Account → Export my data.</li>
            <li><strong>Delete your creator profile and Instagram data:</strong> Influencer Marketing → Creator studio → Delete creator account. This removes your profile and the stored Instagram connection and tokens.</li>
            <li><strong>Disconnect Google or Instagram:</strong> revoke SEO STUDIO in your Google Account (Security → Third-party apps with account access) or in Instagram (Settings → Website permissions → Apps and websites). Stored tokens then stop working; delete your account or creator profile to remove them.</li>
            <li><strong>Delete your whole account:</strong> Dashboard → Account → Delete account.</li>
            <li><strong>Anything else:</strong> email {contact}. We respond within 30 days.</li>
          </ul>
          <p>If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>
        </section>

        <section><h2>10. Children</h2><p>SEO STUDIO is not intended for people under 18. We do not knowingly collect personal data from children; if you believe a child has provided data, contact us and we will delete it.</p></section>

        <section><h2>11. Changes to this policy</h2><p>We may update this policy as the service changes. We will show the new date above and, for significant changes, notify you in the application or by email.</p></section>

        <section><h2>12. Contact</h2><p>For privacy questions, requests or grievances, contact {contact}{legalAddress ? `, or write to ${legalAddress}` : ""}.</p></section>

        <div className="terms-document-footer"><Link href="/terms">Terms and Conditions <span aria-hidden="true">↗</span></Link><Link href="/">Return to SEO STUDIO home <span aria-hidden="true">↗</span></Link></div>
      </article>
    </main>
    <SiteFooter />
  </>;
}
