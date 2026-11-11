# SEO Studio — Production Readiness

Audit date: 2026-11-11. Verdict: **not production ready.** The code base is well-structured and security-conscious, but the core audit workflow cannot run without a scheduler, the build needs one missing variable, and no feature has been verified against a real site or provider.

## 1. Deployment blockers

| # | Blocker | Fix |
|---|---|---|
| D1 | `TRUSTED_CLIENT_IP_HEADER` unset → build/startup fails | Set to the ingress-overwritten header (Vercel `x-forwarded-for`, Cloudflare `cf-connecting-ip`) |
| D2 | No scheduler → queued audits never run; scheduled audits/rank/PageSpeed never run | Configure cron for the four `/api/cron/*` SEO routes (see §3) |
| D3 | `NEXT_PUBLIC_APP_URL` points to localhost | Set to the HTTPS production origin; register `<origin>/api/integrations/google/callback` and the Auth.js Google callback in Google Cloud |
| D4 | Google OAuth app not verified for sensitive scopes | Submit Google OAuth verification (Search Console, Analytics, Merchant, Business Profile scopes) or keep the app in testing with listed test users |
| D5 | Production encryption keys | Generate distinct production values for `GOOGLE_TOKEN_ENCRYPTION_KEY`, `WORDPRESS_TOKEN_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY` (base64, 32 bytes) and back them up; losing them makes stored tokens unreadable |
| D6 | No privacy policy | Required for Google OAuth verification and sign-up |

## 2. Environment variables (names only; no values were printed)

### Present in local `.env` and used by SEO Studio
`MONGODB_URI`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_EMAIL_FROM`, `RESEND_API_KEY`, `CRON_SECRET`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `GOOGLE_PAGESPEED_API_KEY`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `WORDPRESS_TOKEN_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL` (currently localhost).

### Must add for production
| Variable | Why |
|---|---|
| `TRUSTED_CLIENT_IP_HEADER` | Required by `production-env.ts`; rate limits use it |
| `NEXT_PUBLIC_APP_URL` (production HTTPS value) | OAuth redirect URIs, absolute links |
| `NEXT_PUBLIC_SITE_URL` | Homepage canonical/metadata (`src/app/page.tsx`) |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS`, `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` | Shown on `/terms`; currently blank |

### Recommended / optional
| Variable | Why |
|---|---|
| `AUTH_URL` | Explicit Auth.js origin (config uses `trustHost: true`) |
| `SEO_CRAWL_MAX_PAGES` | Server crawl ceiling 10–250 (default 100) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Separate OAuth client for reporting scopes (falls back to the sign-in client) |
| AI provider key (future) | Only when the AI agent is built |

### Not needed for SEO Studio
`RAZORPAY_*`, `MARKETPLACE_*`, `META_*`, `ABLY_API_KEY` belong to the marketplaces (out of scope). `LEGACY_SYNC_AUDITS` should stay unset.

## 3. Required scheduler configuration

All routes require `Authorization: Bearer <CRON_SECRET>` and process **one item per call**.

| Route | Purpose | Suggested cadence |
|---|---|---|
| `POST /api/cron/crawl-jobs` | Executes queued/retrying crawls (user-started and scheduled) | every 1 min |
| `POST /api/cron/scheduled-audits` | Enqueues weekly/monthly audits | every 10 min |
| `POST /api/cron/scheduled-rank-tracking` | Paid DataForSEO rank checks for due sites | every 15 min |
| `POST /api/cron/scheduled-pagespeed` | PSI for due sites (homepage) | every 30 min |

Because each call handles one item, cadence × run time must exceed the number of due items. Add monitoring for jobs stuck in `queued` > 10 min.

## 4. Security review summary

**Strong (verified in code and unit tests):** SSRF protection with DNS pinning and per-redirect validation; same-origin CSRF checks on mutating routes; request body limits; per-user/IP/workspace rate limits; AES-256-GCM encryption for Google/WordPress/MFA secrets; PKCE + hashed single-use OAuth state; hashed plugin tokens with constant-time comparison in PHP; WordPress nonces, capability checks and output escaping; organisation-scoped queries with role permissions; MFA enforced on credential sign-in; session revocation on account deletion; 0 known npm vulnerabilities.

**Concerns:**
| Severity | Concern | Reference |
|---|---|---|
| Medium | GA4 report accepts any property the Google account can read, not bound to the site | G9 |
| Medium | Site deletion removes `audit_logs` (audit trail loss) | G15 |
| Medium | Ownership verification is never re-checked after domain transfer | G21 |
| Medium | No organisation-level spend cap on paid DataForSEO calls (20/hour/site) | G22 |
| Medium | CSP has no `script-src`/`default-src` (XSS defence in depth) | G23 |
| Low | Write-capable Google scopes requested for read-only reporting (Merchant `content`, `business.manage`) | G24 |
| Low | Crawler follows cross-domain redirects and audits the final page under the original URL | crawler `safeGet` |
| Info | No tenant-isolation tests exist, although code review found every site query scoped by organisation | G12 |

## 5. Operations not yet in place
Hosting choice, scheduler, error tracking, uptime/job monitoring, MongoDB backups with a tested restore, log retention policy, staging environment, hosted CI evidence and branch protection.

## 6. Go-live checklist (SEO Studio)
1. Set D1/D3/D5 variables; build on CI.
2. Configure §3 scheduler; verify a crawl completes on staging.
3. Fix score defects (G4) and dashboard totals (G6) before showing scores to customers.
4. Add privacy page, robots/sitemap for the public site.
5. Run the provider acceptance pass (approved budget) on a staging domain: verification, crawl, PSI, GSC, GA4, one of each DataForSEO report.
6. Install plugin v0.5.0 on a staging WordPress with Yoast/Rank Math; sync, edit, confirm front-end output.
7. Add tenant-isolation API tests (G12).
8. Enable error tracking and stuck-job alerts.
