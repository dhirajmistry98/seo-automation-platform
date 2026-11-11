import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/marketing/homepage-sections";
import { SiteHeader } from "@/components/marketing/site-header";
import "./terms.css";

export const metadata: Metadata = {
  title: "Terms and Conditions | SEO STUDIO",
  description: "Terms for using the SEO STUDIO workspace, research tools, WordPress plugin and collaboration marketplace.",
};

export const instant = false;

export default async function TermsPage() {
  await connection();
  const session = await auth();
  const user = session?.user ? { name: session.user.name, email: session.user.email } : null;
  const legalName = process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME?.trim();
  const legalAddress = process.env.NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS?.trim();
  const legalEmail = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim();
  const missingLegalDetails = !legalName || !legalAddress || !legalEmail;

  return <>
    <a href="#terms-content" className="skip-link">Skip to terms</a>
    <SiteHeader currentUser={user} />
    <main id="terms-content" className="terms-page">
      <article className="terms-document">
        <Link className="terms-back-link" href="/">SEO STUDIO <span aria-hidden="true">/</span> Terms</Link>
        <p className="landing-eyebrow"><span className="landing-eyebrow-dot" /> LEGAL INFORMATION</p>
        <h1>Terms and Conditions</h1>
        <p className="terms-updated">Last updated: 10 November 2026 · Applies to users in India and other supported regions.</p>
        <p className="terms-lead">These terms explain how you may use the SEO STUDIO website, application, WordPress plugin, research reports and collaboration marketplace. Please read them before creating an account or using a service.</p>

        <section className="terms-operator" aria-labelledby="terms-operator-heading">
          <h2 id="terms-operator-heading">Platform operator and legal notices</h2>
          <dl>
            <div><dt>Legal operator</dt><dd>{legalName || "SEO STUDIO — legal entity details to be supplied"}</dd></div>
            <div><dt>Registered address</dt><dd>{legalAddress || "To be supplied before public commercial launch"}</dd></div>
            <div><dt>Legal contact</dt><dd>{legalEmail ? <a href={`mailto:${legalEmail}`}>{legalEmail}</a> : "To be configured before public commercial launch"}</dd></div>
          </dl>
          {missingLegalDetails && <p>For deployment, set the public legal identity and contact values listed in <code>.env.example</code>. Do not accept paid customers until these details are accurate.</p>}
        </section>

        <section><h2>1. Agreement and eligibility</h2><p>By creating an account, accessing the workspace or using a marketplace feature, you agree to these terms and applicable law. You must be at least 18 and able to enter a binding agreement. If you use the service for a company or client, you confirm that you have authority to bind them.</p></section>
        <section><h2>2. Accounts and security</h2><p>Give accurate account information, keep sign-in methods and recovery codes secure, and promptly tell us if you suspect unauthorized access. You are responsible for activity through your account. We may require additional identity or organization verification before enabling sensitive features.</p></section>
        <section><h2>3. Websites, locations and permissions</h2><p>Only add or connect websites and third-party accounts that you own or are authorized to manage. Complete ownership checks before crawling or publishing changes. You are responsible for selecting an accurate target country, city, region and language. Location choices depend on the data provider’s available catalog and do not represent every neighborhood or physical coordinate.</p></section>
        <section><h2>4. SEO, GEO, AEO and LLMO data</h2><p>Audits, readiness scores and recommendations are informational tools based on sampled crawls, configured rules or third-party data. Organic performance reports depend on the connected provider and may be delayed, incomplete or estimated. AI mention reports are provider observations, while GEO/AEO/LLMO readiness is a technical and content-structure assessment. Neither guarantees search rankings, traffic, sales, citations, inclusion in AI answers or any particular business result.</p></section>
        <section><h2>5. Automated and publishing changes</h2><p>Review recommendations and generated content before use. A change is applied only through an available feature and the authorization you grant. Keep backups of your website and verify important changes after publication. We are not responsible for actions taken by search engines, hosting providers, plugins or other systems outside our control.</p></section>
        <section><h2>6. WordPress plugin</h2><p>When connecting WordPress, use a site and account for which you have administrative authority. Keep plugin credentials private, review the permissions requested, and revoke them when no longer needed. Compatibility and supported operations may vary with WordPress, PHP, themes, hosting and other plugins.</p></section>
        <section><h2>7. Marketplace listings and collaborations</h2><p>Brands, influencers and service providers are responsible for accurate profiles, lawful claims, deliverables, disclosures and agreed campaign terms. Instagram statistics are presented as verified only when obtained from an authorized connection and while that verification remains current. Users must not misrepresent audience metrics or impersonate another person or business. Unless an enabled checkout explicitly confirms otherwise, the platform does not hold funds in escrow, guarantee payment or settle an off-platform agreement. Parties remain responsible for their contracts, taxes, advertising disclosures and applicable consumer rules.</p></section>
        <section><h2>8. Fees, cancellations and taxes</h2><p>Any subscription, commission, payment, cancellation or refund terms will be shown before an enabled transaction is confirmed. Do not treat a proposal, campaign budget or message as a payment guarantee. You are responsible for taxes that apply to your activity, subject to non-waivable legal protections.</p></section>
        <section><h2>9. Acceptable use</h2><p>Do not use the services for unlawful activity, spam, credential theft, unauthorized scraping, deceptive reviews, fake engagement, harmful code, infringement, harassment or attempts to bypass access controls or provider limits. Do not upload content you lack rights to use. We may restrict or suspend accounts to protect users, the platform or third-party services.</p></section>
        <section><h2>10. Your content and platform rights</h2><p>You retain rights to content you submit. You grant us a limited license to host, process, display and transmit it as needed to operate the features you choose. You authorize us to share data with a provider only when you connect that provider or request a provider-backed report. The platform, software, branding and documentation are protected by applicable intellectual-property laws.</p></section>
        <section><h2>11. Third-party services</h2><p>Search engines, social networks, analytics providers, payment processors and hosting services have separate terms and availability. Their APIs, data, fees, policies and access can change. We do not control those services and may pause a feature if a provider changes or withdraws access.</p></section>
        <section><h2>12. Privacy and retention</h2><p>We process account, website, report and collaboration information to provide the features you use, protect the service and meet legal obligations. Connected tokens and sensitive data are handled according to the security controls documented by the service. Account export and deletion requests are available through account settings, subject to lawful retention requirements. These terms do not replace a privacy notice. The operator must publish a complete privacy notice and data grievance contact before production data is collected.</p></section>
        <section><h2>13. Availability, suspension and termination</h2><p>We may update, limit or discontinue features, and may suspend access for a breach, security risk, provider restriction or legal requirement. You may stop using the service and request account deletion. Provisions that by their nature should continue, including accrued obligations, intellectual-property rules and liability limits, continue after termination.</p></section>
        <section><h2>14. Warranties and liability</h2><p>The service is provided as available. To the extent permitted by law, we disclaim implied warranties and are not liable for indirect, incidental or consequential losses, lost revenue, lost rankings, lost data or third-party service interruption. Nothing in these terms limits liability or consumer rights that applicable law does not allow us to limit. Maintain independent backups and verify important decisions and changes.</p></section>
        <section><h2>15. Governing law and changes</h2><p>These terms are governed by the laws of India, without limiting mandatory consumer protections that apply where you live. Courts with jurisdiction under applicable law may hear disputes. We may update these terms by publishing a new version with its effective date. Continued use after an update means you accept the revised terms where the law permits.</p></section>
        <section><h2>16. Contact</h2><p>Use the legal contact shown above for notices about these terms. If operator contact details are still marked as pending, they must be completed before commercial launch.</p></section>
        <div className="terms-document-footer"><Link href="/">Return to SEO STUDIO home <span aria-hidden="true">↗</span></Link><Link href="/login">Sign in <span aria-hidden="true">↗</span></Link></div>
      </article>
    </main>
    <SiteFooter />
  </>;
}
