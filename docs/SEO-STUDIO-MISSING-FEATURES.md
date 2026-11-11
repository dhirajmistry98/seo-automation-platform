# SEO Studio — Gaps and Missing Features

Audit date: 2026-11-11. Each gap uses the format: current state · evidence · missing · business impact · technical risk · fix · files · dependencies · testing · priority.

---

## CRITICAL

### G1. Audits never run without an external scheduler
- **Current:** "Run audit" (`site-audit-controls.tsx`) calls `POST /api/sites/[domain]/crawl-jobs`, which only inserts a `queued` job.
- **Evidence:** The only executor is `POST /api/cron/crawl-jobs` (CRON_SECRET-protected, one job per call). No `vercel.json`, cron config, or worker process exists in the repo.
- **Missing:** Something that calls the worker continuously (every ~1 min).
- **Impact:** The core product action appears to hang forever ("Queued"). Scheduled audits, scheduled rank tracking and scheduled PageSpeed also never run.
- **Risk:** High — first-time users will think the product is broken.
- **Fix:** Add a scheduler (Vercel Cron / GitHub Actions / external cron / long-running worker) for `/api/cron/crawl-jobs` (1 min), `/api/cron/scheduled-audits` (5–15 min), `/api/cron/scheduled-rank-tracking` (15 min), `/api/cron/scheduled-pagespeed` (15–60 min). Optionally have the UI show "waiting for worker" when a job has been queued > 2 min.
- **Files:** new `vercel.json` (or infra config); `site-audit-controls.tsx` (stale-queue message).
- **Dependencies:** Hosting choice; `CRON_SECRET`.
- **Testing:** Queue a crawl on staging, confirm it reaches `completed` without manual calls.
- **Priority:** Critical.

### G2. Production build fails without `TRUSTED_CLIENT_IP_HEADER`
- **Current:** `src/lib/production-env.ts` throws during build/startup if unset; it is absent from `.env`.
- **Impact:** Cannot deploy.
- **Fix:** Set it to the header your ingress overwrites (`x-forwarded-for` on Vercel, `cf-connecting-ip` behind Cloudflare, `x-real-ip` behind nginx configured to overwrite it).
- **Files:** hosting env only.
- **Testing:** `next build` on CI with production env.
- **Priority:** Critical.

### G3. Large crawls can time out and never complete
- **Current:** Crawl is sequential with ≥500 ms delay plus up to 8 s per fetch; worker `maxDuration = 300` s; job lease 8 min; after 3 failed attempts the job fails. Crawls restart from zero on retry.
- **Evidence:** `crawler.ts`, `api/cron/crawl-jobs/route.ts`. `persistCrawlResult` performs ~5 sequential DB round-trips **per finding** (a 250-page crawl with ~10 findings/page ≈ 12 000 round-trips).
- **Impact:** Sites above ~100–150 pages may fail repeatedly on serverless hosting.
- **Fix:** (a) bounded concurrency (e.g. 3–5 fetches) respecting crawl-delay; (b) checkpoint the queue/visited set to Mongo so a retry resumes; (c) batch issue upserts with `bulkWrite` and pre-load existing issues in one query.
- **Files:** `src/lib/seo/crawler.ts`, `src/lib/seo/persist-crawl.ts`, `src/app/api/cron/crawl-jobs/route.ts`.
- **Testing:** Load test against a 250-page staging site; measure wall time and DB ops.
- **Priority:** Critical.

### G4. SEO Health Score correctness defects
- **Current:** Weights match spec. But:
  1. `externalLinkQuality` is hard-coded to **100**, adding up to +5 points to every score instead of being excluded and re-weighted.
  2. Rules emitted but not mapped to any category, so they never affect the score: `technical.mixed_content`, `technical.nofollow`, all `hreflang.*`.
  3. Category `technical` matches prefixes (`technical.server*`, `technical.redirect*`) that no rule emits.
  4. `confidence` is the constant 83.
- **Evidence:** `src/lib/seo/audit.ts` `scoreCategories`, `getPageHealthScore`, `getHealthScoreDetails`.
- **Impact:** Scores look better than reality; users can't trust movement between crawls.
- **Fix:** Treat missing modules as N/A and renormalise weights over observed categories; map every rule ID to a category (add a unit test asserting every emitted `ruleId` maps); compute confidence from observed weight and crawl coverage; bump `scoreVersion` to `seo-health-v2`.
- **Files:** `src/lib/seo/audit.ts`, tests.
- **Priority:** Critical (trust).

### G5. AI SEO agent does not exist
- **Current:** No AI provider, prompts, or action framework anywhere in `src/`.
- **Impact:** A headline capability in the product brief is absent (explanations, title/meta generation, briefs, internal links, schema, prioritised plans, 3 execution modes).
- **Fix:** See implementation plan phase 4: provider abstraction, grounded prompts over crawl data, `ai_recommendations` + `ai_actions` collections with preview/approve/execute/verify/rollback, usage tracking, prompt-injection defences (crawled HTML is untrusted input).
- **Dependencies:** AI provider key and data policy; G7 (rollback) for WordPress execution.
- **Priority:** Critical for the product vision; not a launch blocker for an "audit + research" MVP.

---

## HIGH

### G6. Overview dashboard shows misleading numbers
- **Current:** `dashboard/page.tsx` sums clicks/impressions from the rows of the latest saved Search Console report (row limit 250). For a `query` report this excludes long-tail and anonymised queries, so totals are undercounted. "SEO Health" displays the first website with an audit without naming it. The latest report may belong to any site.
- **Fix:** Store GSC totals from a dimensionless (or `date`) query; show site name next to every KPI; add a website selector; link site rows to `/dashboard/websites/[domain]`.
- **Files:** `src/app/dashboard/page.tsx`, `search-console/route.ts`.
- **Priority:** High.

### G7. WordPress changes have no rollback or verification
- **Current:** App sends `approved: true` and stores only changed field **names**; the plugin keeps a before/after history in post meta but nothing restores it; the app does not re-read the post after writing.
- **Fix:** Plugin returns before/after; app stores them in `wordpress_sync_history`; add `POST /app/metadata/rollback` in the plugin and an app endpoint; verify by re-fetching after write.
- **Files:** `wordpress-metadata/route.ts`, `wordpress-plugin/seo-studio/seo-studio.php`.
- **Priority:** High (required before any AI auto-execution).

### G8. Google disconnect / revoke missing
- **Fix:** `DELETE /api/integrations/google/[service]` → call `https://oauth2.googleapis.com/revoke`, delete encrypted tokens, set status `disconnected`, audit log; add button in `google-data-card.tsx`. Also mark connection `error` when token refresh fails.
- **Priority:** High (also a Google OAuth verification expectation).

### G9. GA4 property is not bound to the website
- **Current:** Any numeric property the connected Google account can read is accepted and saved under this website.
- **Fix:** Persist the chosen property per website on first selection and verify it appears in `accountSummaries`; replace deprecated `conversions` with `keyEvents`.
- **Files:** `analytics/route.ts`, `google-data-card.tsx`.
- **Priority:** High.

### G10. Authority Index weights differ from specification
- **Current:** `AUTHORITY_WEIGHTS` = backlink 30, organic 25, topical **15**, link quality 15, technical **15**. Spec: 30/25/**20**/15/**10**.
- **Fix:** Update weights, bump `AUTHORITY_INDEX_VERSION` to `authority-v2`, keep v1 snapshots labelled.
- **Files:** `src/lib/seo/authority-index.ts`, test.
- **Priority:** High (small change).

### G11. Crawler robots.txt parser is incomplete
- **Current:** `crawler.ts robotsAllows` ignores `*`/`$` wildcards and mis-handles grouped `User-agent` lines; a correct group parser already exists in `search-access.ts`.
- **Fix:** Reuse the group parser + wildcard matching for crawl decisions; prefer a `SeoStudioBot` group over `*`.
- **Priority:** High (crawling disallowed paths is a politeness/compliance risk).

### G12. No integration, tenant-isolation, or end-to-end tests
- **Fix:** Add a Mongo-memory or test-database API test suite covering permission checks per route and cross-org access attempts; Playwright smoke test for login → add site → verify (mocked DNS) → audit → issues.
- **Priority:** High.

### G13. Missing core technical-SEO checks
Redirect chains/loops, broken **external** links (HEAD with limits), duplicate body content (shingle hash), crawl depth, pagination/parameter duplicates, image size/format, schema property validation for common types (Organization, Product, Article, FAQPage, BreadcrumbList).
- **Files:** `crawler.ts`, `audit.ts`.
- **Priority:** High.

### G14. Backlink detail and competitor comparisons
Backlink list, new/lost, anchors, follow/nofollow, referring domains; competitor backlink and content-gap views. DataForSEO endpoints exist (`backlinks/backlinks/live`, `backlinks/referring_domains/live`, `backlinks/anchors/live`, `backlinks/history/live`).
- **Priority:** High for competitive positioning; each is a paid call.

### G15. Website deletion deletes the audit trail
- **Current:** `DELETE /api/sites/[domain]` deletes `audit_logs` and `notifications` for the site, and leaves `seo_crawl_jobs`/events behind.
- **Fix:** Keep audit logs (or move to an immutable archive); delete crawl jobs/events; record deletion.
- **Priority:** High (compliance).

---

## MEDIUM

| ID | Gap | Fix summary | Files |
|---|---|---|---|
| G16 | PDF and scheduled email reports | Server-side PDF (e.g. headless render of a report route) + scheduled report job | new `reports/` module |
| G17 | Email notifications | Reuse Resend (`src/lib/email.ts`) for audit complete / critical issues / rank changes | `persist-crawl.ts`, cron routes |
| G18 | Actor is never notified | Include the triggering user in audit/PageSpeed notifications | `persist-crawl.ts`, `pagespeed/route.ts` |
| G19 | Crawl comparison view | Diff two audits: new/resolved issues, score delta per category | new API + UI |
| G20 | Keyword clustering, intent, page mapping, cannibalisation | Use GSC query→page rows + provider intent | research module |
| G21 | Ownership re-verification | Re-check DNS/meta periodically; pause crawling if removed | verify route + cron |
| G22 | Provider spend controls | Org-level monthly DataForSEO budget using recorded `providerCostUsd` | `research/route.ts` |
| G23 | Content Security Policy | Add `default-src`/`script-src` with nonces | `next.config.ts` |
| G24 | Over-broad Google scopes | Merchant `content` and Business Profile `business.manage` are write-capable; request only when needed and explain | `integrations/google.ts` |
| G25 | Dead / duplicate code | Unused sync `/api/sites/[domain]/audit` route and `LEGACY_SYNC_AUDITS` path duplicate persistence without task creation; unused `test-ping.tsx`, `workspace-action-dialog.tsx` | remove after confirmation |
| G26 | Per-request write overhead | `findAccessibleWebsite` calls `ensurePersonalOrganization` (several writes) on every API request | cache per session/user |
| G27 | Public site SEO basics | Add `/privacy`, `app/robots.ts`, `app/sitemap.ts`, set `NEXT_PUBLIC_SITE_URL` and legal env vars | `src/app` |

## LOW

| ID | Gap |
|---|---|
| G28 | Sitemap `.xml.gz`, sitemap index > 3 children, sitemap validation report |
| G29 | JavaScript rendering (headless browser worker) |
| G30 | WooCommerce product schema / feed checks |
| G31 | Internal-link suggestions and approved insertion |
| G32 | Plans, usage limits and entitlements (no payment processing) |
| G33 | Monitoring, error tracking (e.g. Sentry), backup/restore runbook |
