# SEO Studio — Test Results

Run date: 2026-11-11, local macOS machine, Next.js 16.4.5, Node from the project toolchain. Scope: SEO Studio only.

## Commands run in this audit

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **40 / 40 passed**, 0 failed (includes marketplace tests in the same runner) |
| TypeScript | `npx tsc --noEmit --incremental false` | **Passed** (exit 0) |
| ESLint | `npm run lint` | **Passed**, no findings |
| Dependency audit | `npm audit --audit-level=moderate` | **0 known vulnerabilities** |
| Production build | `next build` | **Not re-run in this audit** — disk had ~660 MB free. A build earlier the same day failed without `TRUSTED_CLIENT_IP_HEADER` and passed with `TRUSTED_CLIENT_IP_HEADER=x-forwarded-for` set only for that command. |
| WordPress plugin lint/tests | `php -l` | **Not run** — PHP is not installed on this machine |

## What the 40 tests actually cover (SEO-relevant subset)

All are pure unit tests that call library functions directly. None start the server, call an API route, use a browser, or talk to a provider.

- Request protections: same-origin guard, body-size limits, trusted client-IP header, production env guard.
- Role permissions (least privilege).
- Crawler: private IP/scheme rejection, DNS-pinned lookup.
- Audit rules: missing metadata, duplicate titles, social metadata, language, empty headings, hierarchy skips, CMS detection, HTTPS, primary keywords, crawl-scope linking, hreflang reciprocity, weighted page scores.
- Search visibility (GEO/AEO/LLMO) signals, empty-sample behaviour, AI-crawler robots groups.
- Authority Index refuses to score without real inputs.
- DataForSEO response size limit, item extraction, rank row matching, location/target mapping, rank schedule validation.
- Google secret encryption and OAuth state hashing.
- Auth.js profile persistence, session revocation on account deletion.

## Test gaps (required by the audit brief, not present)

| Area | Status |
|---|---|
| API route tests (auth, permission, validation per route) | None |
| Tenant isolation tests (user A cannot read org B data) | None |
| Crawl job lifecycle (queue → worker → persist → tasks) | None |
| Persistence/idempotency of `persistCrawlResult` | None |
| SEO score regression tests for unmapped rules / N/A handling | None — current tests would not catch the external-link 100 default |
| Frontend component / end-to-end browser tests | None |
| WordPress plugin (PHPUnit, WP versions, SEO-plugin matrix) | None |
| Provider contract tests (recorded fixtures for DataForSEO, PSI, GSC, GA4) | None |
| Load / large-site crawl tests | None |
| Backup / restore / recovery drills | None |

## Live / provider verification

None performed. Reasons:

- No authenticated browser session was available; `/dashboard` redirects to `/login`.
- No staging website with DNS control was available for ownership verification and a first real crawl.
- DataForSEO requests are billable; no approval was requested or given for paid calls in this audit. Estimated cost of a minimal acceptance pass (1 keyword overview, 1 question report, 1 rank check of 10 keywords, 1 backlink summary, 1 competitor report, 1 AI-mentions report) is typically a few US cents to under one US dollar depending on the account's price list — confirm against your DataForSEO pricing before approving.
- Google Search Console / GA4 / Merchant / Business Profile need a real Google account with property access and a production-registered OAuth callback.
- PageSpeed Insights is free within quota but was not called.

Therefore every provider-backed feature is marked "IMPLEMENTED BUT NOT LIVE-TESTED" at best.

## Are existing tests meaningful?

Yes for what they cover — they test real logic with real inputs, and external calls are not mocked to fake success. But they cover library functions only. The two most important runtime paths (queued crawl execution and multi-tenant data access) have no tests at all.
