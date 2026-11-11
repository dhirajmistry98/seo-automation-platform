# Production readiness assessment

**Status: not certified for production.** The repository now has stronger code-level safeguards and a repeatable CI workflow, but production readiness also depends on the deployment, external credentials, and operational evidence listed below. No third-party security review or production recovery exercise has been performed.

## Security work in the repository

- Updated Next.js from 16.4.4 to 16.4.5, which includes upstream security fixes. The ESLint parser's vulnerable nested minimatch dependency is pinned to patched 11.0.1.
- Added global response security headers, production HSTS, required production environment checks, and explicit trusted-proxy client IP configuration.
- Bounded JSON API request bodies and the app-to-WordPress response body. The public-site crawler validates public DNS addresses, pins connections to those addresses, revalidates redirects, and applies time and response limits.
- Applied same-origin checks to browser-driven mutations, request and user/email/IP rate limits to sensitive endpoints, and revoked active JWT sessions when an account is deleted.
- Added GEO/AEO/LLMO crawl-derived reporting with scoped persistence and bounded first-party signals; added an authenticated, rate-limited expert-services workflow with profile/listing moderation, scoped requests, INR proposals, idempotent selection, notification, export and account-deletion handling.
- Added durable crawl-job queueing for manual and scheduled audits, progress/events/history, retry with lease recovery, cancellation, idempotent page/issue/score/task persistence, and workspace crawl rate limits.
- Added regression coverage for body limits, proxy IP parsing, production configuration, crawler URL defenses, permissions, encrypted provider secrets, and account deletion session revocation.

## Required deployment configuration

1. Set `MONGODB_URI` in the deployment secret manager to the intended Atlas database using TLS. Allow the deployed app's egress IP in Atlas Network Access and outbound TCP port 27017; do not use `0.0.0.0/0`. MongoDB documents the IP access list and port in its [Atlas connection troubleshooting guide](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). Confirm `/api/health` and create a known test record in staging before releasing. Changing the URI does not migrate existing local database records; migrate them with a protected `mongodump`/`mongorestore` while the app is stopped, preserving encryption keys.
2. Set a unique AUTH_SECRET with at least 32 random characters and NEXT_PUBLIC_APP_URL to the public HTTPS origin.
3. Configure at least one complete sign-in method: RESEND_API_KEY with a verified AUTH_EMAIL_FROM, or AUTH_GOOGLE_ID with AUTH_GOOGLE_SECRET.
4. Set TRUSTED_CLIENT_IP_HEADER to a header that the trusted ingress proxy always overwrites. Do not expose the app directly around that proxy. This is required for production IP-based rate limits to resist spoofing.
5. Configure distinct 32-byte keys for Google, MFA, WordPress-token and Meta-token encryption when those features are enabled. They must be base64 strings that decode to exactly 32 bytes. The local keys were corrected after confirming the related encrypted-record collections were empty. Preserve production keys once records exist; rotate only with an explicit migration/re-enrollment plan. Back up keys securely and store all secrets in the deployment secret manager, never in source control.
6. If Google reporting is enabled, register the exact OAuth callback and grant only the needed API scopes. If scheduled jobs are enabled, configure `CRON_SECRET` and a trusted scheduler: call `/api/cron/scheduled-audits` every 5–15 minutes to enqueue due crawls and `/api/cron/crawl-jobs` about once per minute to execute/retry them; schedule PageSpeed and rank workers at their chosen cadence.
7. Payment processing is intentionally disabled for this release. Do not configure or use Razorpay checkout, escrow, commissions, refunds, wallets, or payouts. Environment placeholders do not enable those features.
8. Rotate the Atlas database user's password before production. A credential was shared in the task conversation; do not reuse it or paste a replacement into chat. Update `.env` locally after rotation.

See .env.example for the full variable list and generation notes. Verify the active database target through /api/health and the workspace UI before testing writes; a successful web build does not establish database connectivity.

## Release gates still required

- Run the GitHub Actions workflow on the release commit and require it in branch protection. The workflow now includes npm audit --audit-level=moderate.
- Run authenticated browser tests against a reachable staging database, including cross-organization authorization, MFA and recovery codes, exports, account deletion, website deletion, Google token revocation, and WordPress updates.
- Complete an independent security review or penetration test covering authorization/IDOR, CSRF, SSRF, OAuth/session handling, rate limits, data export/deletion, and secret rotation.
- Configure uptime/error monitoring, alert ownership, redacted logs, retention policy, and incident response. Verify that logs and client responses do not contain access tokens, OAuth secrets, or database credentials.
- Configure automated encrypted database backups and encryption-key backups. Demonstrate an isolated restore, application rollback, and post-restore sign-in/data-integrity checks; document the RPO/RTO.
- Complete load and abuse testing for queued crawling, API limits, and the scheduled worker. Confirm the selected host supports the configured Node.js and Next.js runtime behavior and can invoke the queue worker frequently enough.
- Obtain the required privacy, terms, data-retention, vendor, and customer-support decisions for the regions where the service will operate.
- Finish the unmet product requirements in MASTER-REQUIREMENTS-STATUS.md before claiming general availability, including SaaS subscription billing, complete automation approvals/recovery, live Google and research-provider acceptance, and provider/WordPress compatibility coverage.
- Keep all payment routes disabled until a separately approved payment launch. At that time, complete sandbox, legal, webhook, reconciliation, refund and payout acceptance before enabling checkout.

## Verification for the 2026-11-10 live-feature audit

- `GET /api/health` returned HTTP 200 and reached the configured MongoDB Atlas deployment. A count-only inspection found 4 users but no websites, crawls, SEO reports, Google connections or marketplace records; there is no site performance data to render yet. This is a connectivity check, not proof that every integration is authorized or returning data.
- `npm test`: all 39 unit tests passed at the time of that audit.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run lint`: passed.
- Production build passed with the temporary validation override `TRUSTED_CLIENT_IP_HEADER=x-real-ip npm run build`. The local MFA, WordPress-token and Meta-token encryption keys were repaired after confirming no records used them. Set the production trusted-client-IP header to the header actually overwritten by the hosting ingress; the local override does not establish proxy safety.
- Local `.env` has MongoDB, Google sign-in, Resend email, DataForSEO, Meta Instagram, PageSpeed, Ably, cron and encryption settings by key presence. The dedicated `GOOGLE_OAUTH_*` pair is unset, though Google reporting can fall back to the Auth.js Google pair. Razorpay, OpenAI and `TRUSTED_CLIENT_IP_HEADER` are missing. Values were not printed. Email delivery and provider requests have not been exercised; missing Razorpay credentials prevent marketplace checkout, and the AI SEO agent itself is not implemented.
- No live DataForSEO call was made because research requests can incur charges. Google/Meta OAuth, WordPress staging, authenticated browser acceptance, PHP compatibility, load, backup/restore and rollback checks were not run. Ably was configured but realtime message delivery was not exercised. Marketplace payment processing is now explicitly disabled for this release.
- Run the full CI workflow and attach staging evidence for each external provider before release. Do not mark this release ready until the trusted proxy header, provider acceptance, scheduler, security, backup/recovery and product completion gates above have evidence.

## Latest local verification (2026-11-11)

- `npm test`: 40 passed, 0 failed. `npx tsc --noEmit --incremental false` and `npm run lint` passed. The production build passed with the temporary validation override `TRUSTED_CLIENT_IP_HEADER=x-real-ip`; configure the header your production ingress overwrites before deployment.
- `npm audit --audit-level=moderate`: 0 known vulnerabilities.
- A read-only Atlas count check found 4 users and 0 websites, SEO audits, crawled pages, issues, scores, tasks, crawl jobs/events, research reports, Google connections, or PageSpeed results. The check performed no writes.
- No staging site is ready, so website ownership, a first real crawl and dashboard persistence/isolation acceptance remain unverified. No synthetic SEO data was inserted.
- Runtime check: `/api/health` returned `status: ok` after a MongoDB ping; an unauthenticated `/dashboard` request redirected to `/login`. The local dev server was started for this check.
- No scheduler deployment file or host scheduler was found. A queued crawl only progresses when the protected worker endpoint is called; status polling alone does not run it. Google Search Console refresh is user-triggered and provider data can lag; other reports are timestamped snapshots, not continuously streamed metrics.
- Local key-presence check (values withheld): DataForSEO, Google PageSpeed, Auth.js Google, and `CRON_SECRET` are present; the dedicated Google reporting OAuth pair and production trusted-proxy header are absent. The existing Auth.js Google pair is a supported OAuth fallback, but no Google connection is stored in Atlas.


## Post-audit changes and verification (2026-11-11)

| Area | Previous status | Change made | Verification | Result and remaining limitation |
|---|---|---|---|---|
| Influencer eligibility | Tier regression test failing; standard threshold needed enforcement | Standard profiles now require a current Meta API snapshot with at least 5,000 followers; Emerging Creator is a separate below-5,000 track | Marketplace unit tests | Passing locally; no live Meta account/API test |
| SEO crawl | Synchronous 10-page limit; no visible queue progress or recovery | Added configurable 10–250 page ceiling (default 100), queued manual/scheduled crawls, progress, event history, retries, lease recovery, cancellation, URL deduplication and per-workspace rate limits | 40/40 unit tests, TypeScript, ESLint, production build, dependency audit | Server-returned HTML only; JavaScript rendering and host scheduler are not yet verified |
| SEO persistence | Real site workflow had no data to inspect | Crawl persistence saves pages, audit/score history, deduplicated issues and an idempotent task per finding; dashboard recovers active crawl state and shows recent job history after refresh | TypeScript/unit checks; MongoDB/staging acceptance unavailable | No staging hostname is ready, so no website was verified or crawled and no SEO data was fabricated |
| Marketplace payments | Checkout paths existed in code | Payment processing is gated off for this release; route responses reject checkout/refund/payout initiation and UI copy identifies the disabled state | Static code review and local checks | Do not configure credentials or claim payment readiness |
| Production security/operations | Deployment review incomplete | Scheduler docs updated; required proxy header remains a deployment value; Atlas credential shared in chat still needs rotation by an Atlas administrator | Configuration review; no production-host access | Actual proxy, credential rotation, monitoring, encrypted backup/restore, and independent security review remain external release gates |
| External integrations | Code existed without authorized acceptance | No paid or external requests were made | No live request issued | DataForSEO, Google, Meta, WordPress, PageSpeed quota, Ably and production provider behavior remain unverified; the user confirmed no staging site is ready |
