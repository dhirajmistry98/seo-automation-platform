# SEO Studio

SEO Studio is a Next.js application backed by MongoDB. The workspace has separate Overview, Websites, SEO tools, Research, Integrations, and Account pages, with shared navigation and organization-aware access. It includes account sign-in, DNS ownership verification, a bounded first-party crawler and SEO audit, historical audit storage, an SEO health score, issue-to-task generation, team task assignment and discussion, provider-backed SEO research, and Google PageSpeed Insights.

The first-party audit checks titles, descriptions, social preview tags, canonical links, robots directives, document language/encoding/viewport, heading structure, image alt text, visible-text length signals, and crawl-discovered internal links. The crawler pins each request to the public DNS addresses it validates to reduce DNS-rebinding risk. These checks are a foundation rather than a complete implementation of the [master requirements status](docs/MASTER-REQUIREMENTS-STATUS.md).

## Setup

1. Install dependencies with `npm install`.
2. Choose where data should live. For a local Homebrew install on Apple Silicon, run `mongod --config /opt/homebrew/etc/mongod.conf --fork`. To store data in Atlas, replace `MONGODB_URI` with your Atlas URI and allow the app host in Atlas Network Access. The URI selects the database; a local URI will never appear in Atlas Data Explorer.
3. Copy `.env.example` to `.env` and set `MONGODB_URI` and `AUTH_SECRET`. Confirm `/api/health` returns HTTP 200 before creating data; a 503 means MongoDB is not reachable and application writes cannot persist.
4. For email sign-in, configure either `GMAIL_USER` + `GMAIL_APP_PASSWORD` (no domain needed) or `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM`. Google sign-in additionally needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
5. `GOOGLE_PAGESPEED_API_KEY` is optional. Google documents the PageSpeed Insights v5 endpoint as usable without a key, while recommending a key for frequent automated requests.
6. Optional SEO research requires `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`. Research requests are started manually, limited per website, and may incur charges on your DataForSEO account.
6. For Google data connections, the app reuses `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` by default. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` only when you want a separate reporting client; set both together. Add `https://<your-host>/api/integrations/google/callback` to that web client's authorized redirect URIs, along with `/api/auth/callback/google` if it also handles Auth.js sign-in. Configure a public `NEXT_PUBLIC_APP_URL`. `GOOGLE_TOKEN_ENCRYPTION_KEY` remains required to encrypt reporting tokens; generate a distinct key with `openssl rand -base64 32` and back it up securely with the database.
7. For authenticator MFA, set a separate `MFA_ENCRYPTION_KEY` with `openssl rand -base64 32`, and configure email sign-in delivery. MFA requires an email OTP plus an authenticator or recovery code; Google sign-in is blocked for MFA-enabled accounts.
8. For app-initiated WordPress metadata updates, set `WORDPRESS_TOKEN_ENCRYPTION_KEY` to another generated key and rotate the website's plugin token after deployment.
9. Start the app with `npm run dev`.

Run the automated unit checks with `npm test`. Run `npx tsc --noEmit --incremental false` for a TypeScript check and `npm run build` for the production build.

## Marketplace setup (India, INR)

The marketplace is available at `/marketplace` after sign-in. Influencer and brand profiles have separate onboarding and MongoDB collections, while both use the existing verified Auth.js account. A brand starts in review and needs an administrator's approval before publishing campaigns. An influencer needs a professional Instagram account connected through Meta OAuth, an authorized follower count of at least 5,000, and administrator approval before appearing in discovery. Manual identity review never grants a verified follower count.

Configure `MARKETPLACE_ADMIN_EMAILS` with the verified email addresses allowed to review profiles, cases, and commission settings. For Instagram connection, set `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET`, `META_GRAPH_API_VERSION`, and a distinct 32-byte base64 `META_TOKEN_ENCRYPTION_KEY`. Register `https://<your-host>/api/marketplace/meta/callback` as the Meta OAuth redirect URI and obtain the required Meta permissions and app review for live users. The app stores encrypted Instagram tokens and API-sourced follower snapshots in MongoDB; unverified or older than seven-day snapshots are excluded from public discovery.

For live private conversation updates and presence, set a server-side `ABLY_API_KEY`. The application issues short-lived, conversation-scoped subscribe and presence tokens after checking membership; message writes still go through the authenticated API and MongoDB. Without Ably, the inbox polls. Set a 32-character `CRON_SECRET` and call `POST /api/cron/marketplace-instagram` at least daily to refresh Instagram verification, and `POST /api/cron/marketplace-realtime` every 1–5 minutes to retry queued Ably events. Both accept `Authorization: Bearer <CRON_SECRET>` and claim one due item per request. Schedule enough calls for the number of connected creators and pending events.

Marketplace profiles, social connection metadata, campaigns, applications, invitations, offers, accepted terms records, messages, deliverables, reviews, reports, disputes, and audit entries are stored in `mp_*` MongoDB collections. Campaign pages show application, invitation, acceptance and completion counts from those records; these are platform activity counts, not reach or sales metrics. Accepted terms records capture both participants' proposal and acceptance but are not electronic signatures. Private conversation attachments are stored in MongoDB GridFS and can be downloaded only by collaboration members. They accept JPEG, PNG, WebP, MP4 and PDF up to 10 MB per file; downloads are forced as attachments. Account export includes owned and authored marketplace records while omitting encrypted provider tokens. Account deletion currently refuses accounts with marketplace collaborations because settlement and retained business records need a defined workflow.

**Marketplace release limits:** Payment processing is disabled for this release. Checkout, escrow, commissions, refunds, wallets and payouts must not be enabled; setting Razorpay environment variables does not enable these routes. Campaign discovery, invitations, agreements and delivery reviews remain available as non-payment collaboration workflows. Attachment malware scanning, storage quotas and retention cleanup are not implemented. Accepted campaign terms are records of agreement, not electronic signatures. YouTube verification, broad reach/engagement analytics and campaign performance attribution remain pending. A later payment launch needs separate approval, provider/legal operations and end-to-end acceptance.

Email codes expire after ten minutes, allow five verification attempts, and can be requested once per minute per email address. Email delivery remains disabled until the Resend key and verified sender are set. The session uses Auth.js JWT encryption with `AUTH_SECRET`.

All environment variables read by the app are listed in `.env.example`. `AUTH_SECRET` and `MONGODB_URI` are required to run the application. Production also requires an HTTPS `NEXT_PUBLIC_APP_URL`, at least one configured sign-in provider, and `TRUSTED_CLIENT_IP_HEADER` set to a client-IP header overwritten by the trusted ingress proxy. Email delivery, Google connections, encryption for stored integration secrets, PageSpeed quota, and scheduled audits each have their own optional settings described in that file. Keep production keys distinct and store them in the deployment host's secret manager.

## Workspace pages

- `/dashboard` is the overview and entry point to current work.
- `/dashboard/websites` adds sites and provides site audit and issue controls.
- `/dashboard/tools` groups live site analysis separately from tools that need a provider or more implementation.
- `/dashboard/integrations` manages Google and WordPress connections per verified website.
- `/dashboard/account` contains MFA, data export/deletion, organizations, invitations, and roles.

## Website audit flow

Add a public domain from the signed-in dashboard. The dashboard provides a DNS TXT ownership proof. Add the record at `_seo-studio.<domain>`, then select **Verify DNS record**. Crawling stays disabled until the record resolves and verifies.

Select **Run site audit** to queue a background crawl. The default limit is 100 HTML pages; `SEO_CRAWL_MAX_PAGES` sets a server ceiling from 10 to 250 and each website can choose a lower cap. The worker reports progress, retries transient failures up to three times, records events/history, deduplicates URLs, supports safe cancellation and applies a workspace-wide crawl rate limit. It checks robots rules, sitemap declarations and `/sitemap.xml`, follows same-site links, limits page size, request time and redirects, blocks private address ranges, and applies a crawl delay. It saves page snapshots, findings, audit history, score history and an idempotent task for each finding. Scheduled audits are enqueued by `/api/cron/scheduled-audits`; `/api/cron/crawl-jobs` processes one queued or retryable job per call. Configure both with `CRON_SECRET` in a trusted scheduler. This crawler analyzes server-returned HTML; JavaScript rendering is not implemented.

The current audit rules cover HTTP errors, missing or long titles, missing descriptions, duplicate metadata across crawled pages, H1/H2 headings, empty image alt text, noindex, missing canonical, invalid JSON-LD, and broken or redirecting internal links when their destination was crawled. Visible word counts are stored, with no universal minimum-length penalty.

The versioned SEO Health Score follows the SRS weights: technical 25%, on-page 25%, indexability and crawlability 20%, content 15%, internal linking 10%, and external-link quality 5%. External link quality remains neutral while its provider data is unavailable, and confidence is recorded separately. Duplicate rules are counted once per page and score version. This is not a Google ranking score and is separate from any authority metric.

Select **Run PageSpeed** for the verified site's homepage. The app calls Google's PageSpeed Insights v5 API, stores the returned Lighthouse category scores, selected lab metrics and opportunities with their source and timestamp, and displays the actual provider result. Provider errors appear as errors; no sample metrics are substituted.

### SEO research

Open **Research** in the workspace navigation, choose a website, then select keyword demand, live organic positions, or a backlink summary. Keyword demand accepts up to 25 terms per run; rank checks accept up to 10. Location and language are included in the provider request. Reports are stored for the website and visible according to report access permissions. Only owners, administrators, SEO managers, and SEO specialists can start provider requests; each website is rate limited to 20 requests per hour. A request calls DataForSEO and can incur provider charges. Live position checks are snapshots and do not yet provide scheduled tracking or historical charts.

SEO action plan tasks can be assigned to active organization members, given a due date, moved through their status workflow, and discussed in a bounded comment thread. Task management permission is required to change or comment on tasks.

## API routes

- `GET /api/sites/:domain/verify` returns the signed-in owner's DNS verification instructions.
- `POST /api/sites/:domain/verify` checks the DNS TXT proof and records the verification event.
- `POST /api/sites/:domain/crawl-jobs` queues a crawl; `GET` reports recent and active crawl jobs; `DELETE` safely cancels an eligible job. The site must be active and verified.
- `POST /api/sites/:domain/audit` remains as a synchronous, rate-limited compatibility endpoint.
- `GET /api/sites/:domain/tasks` lists that owner's SEO tasks for the site.
- `POST /api/sites/:domain/tasks` creates tasks idempotently from an audit's open findings.
- `PATCH /api/sites/:domain/tasks` updates a task status (`todo`, `in_progress`, or `done`).
- `POST /api/sites/:domain/pagespeed` requests a mobile or desktop report for a URL on a verified site.
- `GET|POST /api/sites/:domain/wordpress-token` returns connection status or rotates a one-time token for that verified site.
- `POST /api/plugin/v1/sync` accepts an authenticated, bounded batch of WordPress content and metadata using the bearer token.
- `GET /api/organizations` lists the signed-in user's organizations; `POST` creates one. `/api/organizations/:id/members` lists members and invitations, creates copy-link invitations, updates roles, transfers organization ownership, and removes members.
- `GET /api/account/export` downloads accessible SEO records as JSON. `DELETE /api/account/delete` deletes an account only when the client submits the exact confirmation `DELETE MY ACCOUNT`; organizations owned by that account cannot still have active teammates.
- `GET /api/integrations/google/:service/authorize?domain=...` starts OAuth for `search_console`, `analytics`, `merchant_center`, or `business_profile`. OAuth state is single use and expires after ten minutes; refresh and access tokens are encrypted with AES-256-GCM.
- `GET|POST /api/sites/:domain/search-console` lists matching Search Console properties and fetches bounded search reports. `GET /api/sites/:domain/analytics` lists accessible GA4 properties; `POST` fetches a daily report for the selected property.
- `GET|POST /api/sites/:domain/merchant-center` lists accessible Merchant accounts and fetches a product performance report.
- `GET|POST /api/sites/:domain/business-profile` lists Business Profile accounts/locations and fetches daily performance metrics for a selected location.
- `PATCH /api/sites/:domain/organization` moves the site and its stored audit/integration history to another organization where the actor can manage websites.
- `/api/account/mfa` exposes authenticator MFA setup, status, recovery codes, and disable operations. `GET|PATCH /api/notifications` lists and marks in-app notifications read.
- `POST /api/cron/scheduled-audits` queues one due weekly or monthly audit. `POST /api/cron/crawl-jobs` claims and runs one queued crawl with progress and retries. Both require `Authorization: Bearer <CRON_SECRET>` and are designed for a trusted external scheduler.
- `GET /api/sites/:domain/issues` lists audit findings. `PATCH` can ignore/reopen findings, or resolve them only after a newer crawl includes the affected URL and no longer reports that rule.
- `GET /api/sites/:domain/report?format=csv` downloads stored SEO records in CSV with formula injection protection.

The website API routes require an authenticated session and scope queries to the signed-in user and website domain. The plugin sync route uses its website-specific bearer token. Audit, task and integration mutations are recorded in `audit_logs`.

## Product scope

Organization and access control provide personal and shared workspaces with `owner`, `administrator`, `seo_manager`, `seo_specialist`, `content_editor`, `analyst`, and `viewer` roles. Members can add sites to a shared organization or move an existing site with its stored history. Invitations are copyable links, valid for seven days, and only the signed-in invited email may accept them. Invitation email delivery and organization ownership transfer are not implemented yet.

Account export omits Google token ciphertext. It includes records for organizations the account belongs to. Account deletion removes owned-organization records if no other active members remain, and removes the account from organizations owned by others. The API refuses deletion while a shared organization is still owned by the account.

Google data connections use a dedicated OAuth web client and encrypted token storage. Enable the Search Console API, Analytics Admin API, and Analytics Data API in Google Cloud. Search Console uses `webmasters.readonly`; Analytics uses `analytics.readonly`. Merchant Center requests the broader `content` scope and Business Profile requests `business.manage`; review these scopes and the Google consent screen before enabling them. Google may require app verification, and Business Profile API access requires Google's approval. Connected users must also have permission to the relevant property/account.

Search Console reporting is available in the website dashboard. GA4 reporting accepts a property ID. Merchant Center lists accessible accounts and retrieves a product performance report; Business Profile lists accounts and locations and retrieves daily listing metrics. Google API scopes are controlled by Google, so Merchant Center's `content` scope is not read-only. Provider errors and API approvals are surfaced; no sample performance data is substituted.

Authenticator MFA is enabled from the account panel. The user must enter an email OTP and a six-digit TOTP code at sign-in; ten single-use recovery codes are shown once at setup. Email OTP delivery must be configured before MFA can be enabled. In-app notifications are stored per organization member, currently for audit completion. To activate weekly/monthly crawls, set a random `CRON_SECRET` of at least 32 characters and configure a trusted scheduler to `POST` the scheduled-audits endpoint every 5–15 minutes and the crawl-jobs endpoint about once per minute. Each scheduler call handles one due website or one crawl job, so tune frequency to site and queue volume.

## Deployment and recovery

Use HTTPS in production. Set a long random `AUTH_SECRET`, keep OAuth credentials and `GOOGLE_TOKEN_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, and `WORDPRESS_TOKEN_ENCRYPTION_KEY` in the host secret manager, and keep `.env` out of source control. Restrict MongoDB network access and credentials to the application. Back up MongoDB and all encryption keys together; test restoring them to staging. Replacing an encryption key directly disconnects Google integrations or prevents MFA/WordPress updates because stored secrets cannot be decrypted.

Deploy on a host that supports the configured Next.js release and Node.js runtime, with network access to MongoDB. Set `NEXT_PUBLIC_APP_URL` to the HTTPS origin, configure `TRUSTED_CLIENT_IP_HEADER` to a header overwritten by the ingress proxy, configure Auth.js callbacks, and register the Google callback URI above. Verify sign-in, a DNS-verified audit, PageSpeed, Google OAuth/reporting, WordPress sync, and data export using a non-production account. Keep a prior application build and recent restorable database backup for the hosting provider's rollback process. Background queue code is implemented, but deployment scheduler, monitoring, backup and restore drills remain release gates.

See [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md) for current security validation and the remaining production release gates.

## Remaining SRS work

Remaining requirements and current evidence are tracked in [docs/MASTER-REQUIREMENTS-STATUS.md](docs/MASTER-REQUIREMENTS-STATUS.md). In brief, the main open work is subscription billing, an AI SEO agent, richer content/link analysis, broader WordPress/WooCommerce adapters and rollback, scheduled-job hosting, email/webhook notifications, verified third-party provider acceptance, and production operations. SEO research, Google reporting, Meta verification, Razorpay and Ably each have real integrations in code, but they require valid credentials, approvals, account access and staging acceptance before they can be called production-ready. Research and rank requests run on demand; periodic work runs only when a trusted external scheduler calls the protected workers. No sample metrics are substituted for provider results.

The standalone WordPress plugin source is in `wordpress-plugin/seo-studio`. It provides editor metadata controls, a reviewed bulk-edit REST flow, and the site-token protected app metadata endpoint. A verified website can issue a revocable connection token from the dashboard; a WordPress administrator enters it in the plugin settings and can start a bulk sync of published content and metadata. Plugin save events also queue an incremental push to the app. The app stores a token hash for plugin authentication and an encrypted copy only when `WORDPRESS_TOKEN_ENCRYPTION_KEY` is configured. Rotate the token after configuring that key. See the plugin readme for setup.
