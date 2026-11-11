# SEO Studio — Complete Platform Audit

Audit date: 2026-11-11 · Scope: SEO Studio SaaS (dashboard, SEO/GEO/AEO/LLMO, research, integrations, WordPress plugin, platform/security). The Influencer Marketing and Expert Services marketplaces were **excluded** and not modified. No application code was changed during this audit.

Companion documents: `SEO-STUDIO-FEATURE-MATRIX.md` (per-feature status), `SEO-STUDIO-MISSING-FEATURES.md` (gap details G1–G33), `SEO-STUDIO-TEST-RESULTS.md`, `SEO-STUDIO-PRODUCTION-READINESS.md`.

## 1. Executive summary

| Measure | Result |
|---|---|
| Weighted completion (verified = 1, not live-tested = 0.5, partial = 0.25, other = 0) | **36%** (33.25 of 92 features) |
| Fully code-verified features (traced + unit-tested) | 11 / 92 (12%) |
| Live-provider-verified features | **0 / 92** |
| Unit tests / TypeScript / ESLint / npm audit | 40/40 pass · pass · pass · 0 vulnerabilities |
| Production ready | **No** |

SEO Studio is a carefully engineered first-party crawler and audit product with real (not mocked) provider integrations for DataForSEO, PageSpeed Insights and Google. Data shown in the UI comes from MongoDB records created by real crawls or provider calls; no fake or demo metrics were found. The main problems are operational (no job runner), correctness in scoring and the overview dashboard, missing depth in research/backlinks, the absence of the AI agent, and zero live verification.

## 2. Architecture (as found)

- **App:** Next.js 16 App Router, server components for pages, client components in `src/components/workspace/*`, Auth.js v5 (email OTP + Google, JWT sessions, TOTP MFA).
- **Data:** MongoDB. SEO collections: `websites`, `seo_crawl_jobs`, `seo_crawl_job_events`, `seo_audits`, `seo_pages`, `seo_issues`, `seo_issue_history`, `seo_scores`, `seo_tasks`, `seo_task_history`, `seo_research_reports`, `seo_visibility_reports`, `seo_authority_scores`, `pagespeed_results`, `google_*`, `wordpress_content`, `wordpress_sync_history`, `notifications`, `audit_logs`, organisation collections.
- **Tenancy:** Every website belongs to an organisation; `findAccessibleWebsite` checks membership + role permission; site data queries filter by `organizationId` and `websiteDomain`.
- **Jobs:** Durable crawl queue with leases/retries executed by `/api/cron/crawl-jobs`; scheduled audits, rank tracking and PageSpeed have their own cron routes. **No scheduler is configured.**
- **Providers:** DataForSEO (Labs, SERP, Backlinks, AI mentions), Google PSI v5, Search Console, GA4 Data/Admin, Merchant Center, Business Profile.
- **WordPress:** Plugin v0.5.0 (single PHP file, 662 lines) with meta box, REST API, bulk editor, redirects, schema, sitemap control, SEO-plugin adapters, and a token-authenticated app endpoint.

## 3. End-to-end traces

| Flow | Trace | Works? |
|---|---|---|
| Add site → verify → audit | `addWebsiteAction` → `verify` (DNS TXT or meta) → `crawl-jobs POST` (queued) → **needs** `cron/crawl-jobs` → `crawlAndAudit` → `persistCrawlResult` → issues, tasks, scores, notifications → UI polls `crawl-jobs GET` | Only if a scheduler calls the worker |
| Keyword / rank / backlink / competitor / AI-mention research | `research-workbench` → `research POST` (verified site, rate limit, location validation) → DataForSEO → `seo_research_reports` with cost | Code complete; not live-tested; paid |
| PageSpeed | `site-audit-controls` → `pagespeed POST` (same-domain URL) → PSI → `pagespeed_results`, regression alert | Code complete; not live-tested |
| GEO/AEO/LLMO | `visibility POST` → latest completed audit's `seo_pages` → heuristics → `seo_visibility_reports` | Requires a completed crawl |
| Authority Index | `authority POST` → backlink report + GSC query report + crawl + keywords → score or 409 with missing list | Requires all inputs |
| Search Console / GA4 | OAuth (PKCE) → `google_connections` (encrypted) → report routes → saved reports → overview | Not live-tested; no disconnect |
| WordPress | token issue → plugin sync → `wordpress_content` → editor → `wordpress-metadata POST` (approved) → plugin `/app/metadata` | Not live-tested; no rollback |

## 4. Findings by area

### 4.1 Crawler (§2 of brief)
Strengths: SSRF/DNS-rebinding protection is excellent (pinned lookups, per-hop redirect validation, IPv4/IPv6 private ranges, credentials/ports blocked), response size and time caps, crawl-delay honoured, tracking parameters stripped, cancellation, leases, retries with backoff.
Weaknesses: 250-page ceiling, sequential fetching, non-resumable retries, serverless timeout risk, N+1 persistence (G3); robots wildcard/grouping bugs (G11); no redirect-chain, external-link, duplicate-content, depth, pagination or image checks (G13); no JS rendering.

### 4.2 SEO Health Score (§3)
Weights are correct. Defects: external-link quality fixed at 100, several rule families unscored, constant confidence (G4). Score is correctly labelled as an SEO Studio assessment and versioned (`seo-health-v1`). Issue de-duplication by `(org, domain, pageUrl, ruleId)` and reopen logic are sound. Issues that disappear in a new crawl are not auto-resolved by `persistCrawlResult`.

### 4.3 Keyword research & competitors (§4–5)
Real DataForSEO calls with location/language validation, cost recording, and clear "third-party estimate / may incur charges" notices. Missing clustering, intent, mapping, cannibalisation, trends, competitor backlinks and content gaps. No organisation-level spend cap.

### 4.4 Backlinks & Authority Index (§6)
Summary only. Authority Index is transparent, refuses to score with missing data, records source dates and confidence, and is disclaimed as non-Google — but weights deviate from the specification (G10).

### 4.5 Technical SEO & PageSpeed (§7–8)
PSI integration separates lab and field (CrUX) data and origin field data, stores Lighthouse version and fetch time, alerts on ≥10-point drops. INP appears only as field data (correct — Lighthouse lab has no INP). No retry/backoff on PSI quota errors; scheduled PSI covers the homepage only.

### 4.6 GEO / AEO / LLMO (§9–11)
Twelve transparent heuristics over crawled pages plus homepage robots policy for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and `/llms.txt` presence. Limitations are stated in the report itself and no rankings/citations are promised. Scores are page-coverage percentages, not weighted models; brand/NAP consistency, topical authority, freshness and factual sourcing are not assessed.

### 4.7 AI SEO agent (§12)
Not implemented (G5).

### 4.8 WordPress plugin (§13)
Security practices are good (nonces, `current_user_can`, sanitisation, escaping, `hash_equals`, published-and-viewable check for app edits, change history). Gaps: no rollback (history exists but unused), no app-side before-values or verification, no WooCommerce product schema, no internal linking, no automated tests, PHP not available locally to lint.

### 4.9 Google integrations (§14)
PKCE, hashed single-use state, encrypted tokens, property host matching for Search Console, GSC clicks and GA4 sessions kept separate and labelled. Gaps: no disconnect/revoke (G8), GA4 property not bound to the site and deprecated `conversions` metric (G9), refresh failure not reflected in status, broad scopes for Merchant/Business Profile.

### 4.10 Dashboard & reporting (§15)
Numbers trace to stored records with timestamps and source labels. Overview totals undercount and mix sites (G6). CSV/JSON exports exist; PDF, scheduled and email reports do not.

### 4.11 Background jobs (§16)
Well-designed leases, idempotency and retry logic, but **no scheduler is deployed or configured** (G1). Frontend polling only reads job status; it does not execute jobs. A duplicate synchronous `/api/sites/[domain]/audit` route and a `LEGACY_SYNC_AUDITS` path re-implement persistence without task creation and are not used by the UI (G25).

### 4.12 Auth, tenancy, security (§17)
See production-readiness §4. Code review found consistent organisation scoping; no automated isolation tests exist.

### 4.13 Billing (§18)
No SaaS plans, limits or entitlements. Payment processing was not touched.

## 5. UI and UX review (code-based)

An authenticated browser session was not available, so this review is based on page and component source, not screenshots.

| # | Observation | Recommendation |
|---|---|---|
| U1 | Site work is split across `/dashboard/websites` (list + audit), `/dashboard/tools` (same audit/issue components), `/dashboard/research/[domain]`, `/dashboard/visibility/[domain]`, `/dashboard/integrations`, while `/dashboard/websites/[domain]` is settings only | Make `/dashboard/websites/[domain]` a per-site hub with tabs: Overview · Audit & Issues · Tasks · Keywords & Rankings · Backlinks & Authority · PageSpeed · AI Visibility · Integrations · Settings |
| U2 | Overview KPIs mix websites and don't name the site | Add a website switcher in the header; label every KPI with its site and timestamp |
| U3 | Overview site rows all link to `/dashboard/websites` | Link to the site hub |
| U4 | "Get started" grid has 7 cards; two go to the same page | Reduce to 4 task-based cards; hide once the user has a verified, audited site |
| U5 | No score trend or crawl comparison visuals | Add score history sparkline and "new / fixed since last crawl" summary |
| U6 | Queued audit gives no hint when no worker is running | Show "Waiting for the crawl worker" after 2 min with help text |
| U7 | CSS weight: `globals.css` 170 KB + `dashboard.css` 79 KB loaded for the workspace | Consolidate, remove unused rules, move page-specific styles into route-level CSS or Tailwind utilities |
| U8 | Unused components (`workspace-action-dialog.tsx`, `dashboard/test-ping.tsx`) | Remove after confirmation |
| U9 | Workspace header promotes two marketplaces next to account actions | Move module switching into an "Apps" menu so SEO navigation stays primary |
| U10 | Public site lacks privacy page, `robots.txt`, `sitemap.xml`, and uses blank legal fields on `/terms` | Add them — an SEO product's own site should pass its own audit |

## 6. Critical problems (ranked)
1. Audits never execute without a scheduler (G1).
2. Build fails without `TRUSTED_CLIENT_IP_HEADER` (G2).
3. Large crawls may never finish on serverless; slow persistence (G3).
4. SEO Health Score inflation and unscored rules (G4).
5. No live verification of any provider, OAuth flow, WordPress install or email delivery.
6. AI SEO agent absent (G5).

## 7. Recommended implementation order

**Phase 0 — Make it runnable (1–2 days)**
G2 env, G1 scheduler, D3/D5 production env and OAuth callbacks, privacy page + robots/sitemap (G27), stale-queue UI hint.

**Phase 1 — Make results trustworthy (≈1 week)**
G4 score fixes (`seo-health-v2`), G10 Authority weights (`authority-v2`), G6 overview totals and site labelling, G11 robots parser, G9 GA4 binding + `keyEvents`, G8 Google disconnect, G15 keep audit logs, G18 notify the actor, remove dead sync audit path (G25). Add unit tests for every change.

**Phase 2 — Reliability and verification (≈1–2 weeks)**
G3 concurrency/checkpointing/bulk persistence, G12 API + tenant-isolation + Playwright smoke tests, staging provider acceptance pass (approved budget), WordPress staging install, error tracking and stuck-job alerts.

**Phase 3 — Depth (≈2–4 weeks)**
G13 technical checks, G14 backlink detail and competitor comparisons, G20 keyword clustering/intent/mapping, G19 crawl comparison, G16/G17 PDF + email reports, G7 WordPress before/after + rollback, per-site hub UI (U1–U5), CSS consolidation (U7).

**Phase 4 — AI agent (≈3–6 weeks)**
Provider abstraction and usage tracking → recommendation-only mode grounded in crawl/research data → approval workflow with preview and before/after → WordPress execution via G7 with verification and rollback → tightly scoped auto-execution for explicitly authorised low-risk actions. Treat crawled content as untrusted input (prompt-injection defences).

**Phase 5 — Commercial and scale**
Plans/limits/entitlements (no payments until separately approved), JS rendering worker, WooCommerce SEO, internal-link suggestions, white-label reports.
