# SEO Studio — Feature Matrix

Audit date: 2026-11-11. Scope: SEO Studio only (Influencer Marketing and Expert Services marketplaces excluded).

**Status key**

| Status | Meaning | Weight used for completion % |
|---|---|---|
| IMPLEMENTED AND VERIFIED | Code traced end to end and covered by a passing unit test | 1.0 |
| IMPLEMENTED BUT NOT LIVE-TESTED | Code traced end to end; never run against a real site/provider/account | 0.5 |
| PARTIALLY IMPLEMENTED | Usable code exists but required behaviour is missing or incorrect | 0.25 |
| BLOCKED BY DEPLOYMENT | Code exists but cannot run until infrastructure (scheduler, env) exists | 0 |
| BLOCKED BY CREDENTIALS | Code exists but required credentials/approvals are absent | 0 |
| MISSING | No implementation | 0 |
| BROKEN | Implemented but produces wrong results | 0 |

"Live-verified" in this audit = **none**. No staging site, real Google/DataForSEO/WordPress account, or authenticated browser session was exercised (see `SEO-STUDIO-TEST-RESULTS.md`).

## A. Website onboarding, crawler and technical audit

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Add / edit / pause / delete website | NOT LIVE-TESTED | `src/app/dashboard/actions.ts`, `src/app/api/sites/[domain]/route.ts` |
| 2 | DNS TXT ownership verification | NOT LIVE-TESTED | `api/sites/[domain]/verify/route.ts` (`_seo-studio.<domain>` TXT) |
| 3 | HTML meta ownership verification | NOT LIVE-TESTED | same route, homepage fetched through SSRF-safe `fetchPublicHtml` |
| 4 | Run audit (queued crawl, progress, cancel, retries) | **BLOCKED BY DEPLOYMENT** | UI posts to `crawl-jobs` → job is only executed by `POST /api/cron/crawl-jobs`. No scheduler exists, so jobs stay `queued` |
| 5 | Sitemap discovery | PARTIAL | Regex `<loc>` parse; max 3 nested sitemaps; no `.xml.gz`; no sitemap validation report |
| 6 | robots.txt compliance (crawler) | PARTIAL | `crawler.ts robotsAllows`: no `*`/`$` wildcards; consecutive `User-agent` lines handled incorrectly; specific-group precedence not applied |
| 7 | HTTP status / HTTP error detection | VERIFIED | `audit.ts technical.http_error`, unit tests |
| 8 | Redirect chains / loops | PARTIAL | Up to 5 redirects followed safely, but only final URL stored; no chain/loop findings |
| 9 | Broken internal links | PARTIAL | Only detected when the destination was itself crawled in the same run |
| 10 | Broken external links | MISSING | External links extracted, never checked |
| 11 | Canonical checks (missing/multiple/invalid/cross-origin) | VERIFIED | `audit.ts` |
| 12 | Missing / duplicate titles and descriptions | VERIFIED | `audit.ts`, `addCrossPageIssues`, unit tests |
| 13 | Duplicate / near-duplicate body content | MISSING | — |
| 14 | H1/H2 presence, multiple H1, hierarchy skips, empty headings | VERIFIED | unit tests |
| 15 | Image alt missing / duplicate | VERIFIED | unit tests |
| 16 | Image optimisation (size, format, dimensions) | MISSING | images are not fetched |
| 17 | Orphan pages / crawl depth | PARTIAL | Crawl-scope "not linked" notice only; depth not tracked |
| 18 | Pagination, URL-parameter handling | MISSING | only tracking parameters stripped |
| 19 | Hreflang syntax + return links | VERIFIED | unit tests |
| 20 | Structured data validation | PARTIAL | JSON parse only; no type/property validation |
| 21 | Mobile (viewport) / HTTPS / mixed content | PARTIAL | Detected, but `technical.mixed_content` is not counted in any score category |
| 22 | JavaScript rendering | MISSING | server HTML only |
| 23 | Crawl history and crawl-to-crawl comparison | PARTIAL | Audits, pages, scores stored per `auditId`; no diff view/API |
| 24 | Multiple websites per workspace | NOT LIVE-TESTED | org-scoped `websites` |
| 25 | SSRF / DNS rebinding / private IP / redirect validation | VERIFIED | `url-security.ts` DNS pinning, per-hop validation, unit tests |
| 26 | Large-site capacity | PARTIAL | Hard cap 250 pages; sequential with ≥500 ms delay; worker `maxDuration` 300 s; crawl not resumable; persistence is ~5 sequential DB calls per finding |

## B. SEO Health Score and issue workflow

| # | Feature | Status | Evidence |
|---|---|---|---|
| 27 | Weighted SEO Health Score (25/25/20/15/10/5) | PARTIAL | Weights correct (`audit.ts getPageHealthScore`), but external-link quality is hard-coded to 100, several emitted rules are not mapped to any category, confidence is a constant 83 |
| 28 | Score history | NOT LIVE-TESTED | `seo_scores` per audit |
| 29 | Issue de-duplication, history, reopen | NOT LIVE-TESTED | `persist-crawl.ts` |
| 30 | Tasks generated from findings | NOT LIVE-TESTED | `persist-crawl.ts` + tasks API/UI |

## C. Keyword research, rank tracking, competitors (DataForSEO)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 31 | Keyword overview (volume, difficulty, CPC) | NOT LIVE-TESTED | `research/route.ts kind=keywords` → `keyword_overview/live` |
| 32 | Question keyword research | NOT LIVE-TESTED | `keyword_suggestions/live` filtered by question words |
| 33 | Related / long-tail suggestions | PARTIAL | Suggestions endpoint only used for questions |
| 34 | Search intent | PARTIAL | Raw provider rows saved; no intent presented or validated |
| 35 | Keyword clustering | MISSING | — |
| 36 | Keyword-to-page mapping, cannibalisation | MISSING | — |
| 37 | Keyword history / trends | PARTIAL | Reports saved; no trend view |
| 38 | Manual rank check (country/city, language, device) | NOT LIVE-TESTED | `serp/google/organic/live/advanced`, unit-tested row matching |
| 39 | Scheduled rank tracking | BLOCKED BY DEPLOYMENT | `/api/cron/scheduled-rank-tracking` needs a scheduler |
| 40 | Competitor keyword gap | NOT LIVE-TESTED | `domain_intersection/live` |
| 41 | Competitor visibility estimate | NOT LIVE-TESTED | `domain_rank_overview/live` |
| 42 | Competitor backlink comparison | MISSING | — |
| 43 | Competitor landing pages / content gap | MISSING | — |

## D. Backlinks and Authority Index

| # | Feature | Status | Evidence |
|---|---|---|---|
| 44 | Backlink summary | NOT LIVE-TESTED | `backlinks/summary/live` |
| 45 | Backlink list, new/lost, anchors, follow/nofollow, referring-domain list | MISSING | — |
| 46 | SEO Studio Authority Index | PARTIAL | Weights are 30/25/**15**/15/**15**; spec requires 30/25/**20**/15/**10**. Correctly refuses to score with missing inputs and is labelled as non-Google |

## E. PageSpeed / Core Web Vitals

| # | Feature | Status | Evidence |
|---|---|---|---|
| 47 | Mobile + desktop PSI, Lighthouse categories, lab vs field data separated | NOT LIVE-TESTED | `integrations/pagespeed.ts` |
| 48 | History and ≥10-point regression alert | NOT LIVE-TESTED | `pagespeed/route.ts` |
| 49 | Scheduled PageSpeed | BLOCKED BY DEPLOYMENT | homepage only; needs scheduler |

## F. GEO / AEO / LLMO

| # | Feature | Status | Evidence |
|---|---|---|---|
| 50 | GEO readiness (4 crawl heuristics) | PARTIAL | Entity markup, authorship, outbound links, valid JSON-LD. No NAP/brand consistency, topical authority, mention data |
| 51 | AEO readiness (4 heuristics) | PARTIAL | Question headings, FAQ schema, direct-answer blocks, summary metadata |
| 52 | LLMO readiness (4 heuristics) | PARTIAL | Structure, provenance, indexability |
| 53 | AI crawler robots policy + `/llms.txt` check | VERIFIED | `search-access.ts`, unit tests |
| 54 | AI mention data (Google AI Overview / ChatGPT) | NOT LIVE-TESTED | `ai_optimization/llm_mentions` |
| 55 | Readiness history | NOT LIVE-TESTED | `seo_visibility_reports` |

## G. AI SEO agent and automation

| # | Feature | Status | Evidence |
|---|---|---|---|
| 56 | AI explanations, title/meta generation, briefs, internal links, schema, prioritised plan | MISSING | No AI provider code in `src/` |
| 57 | Recommend-only / approval / auto-execute modes with preview, before/after, verification, rollback | MISSING | — |

## H. WordPress plugin (v0.5.0) and sync

| # | Feature | Status | Evidence |
|---|---|---|---|
| 58 | Connection token (hashed + encrypted) | NOT LIVE-TESTED | `wordpress-token/route.ts`, plugin `hash_equals` |
| 59 | Plugin → app content sync (≤100 posts, retry) | NOT LIVE-TESTED | `api/plugin/v1/sync` |
| 60 | App → WordPress metadata update with approval | PARTIAL | Approval flag required; app stores only changed field names, no before-values, no post-write verification, no rollback |
| 61 | Bulk preview/apply (plugin REST) | NOT LIVE-TESTED | plugin `/bulk/preview`, `/bulk/update` |
| 62 | Redirects | NOT LIVE-TESTED | plugin |
| 63 | Custom JSON-LD | NOT LIVE-TESTED | plugin |
| 64 | Yoast / Rank Math / AIOSEO / SEOPress adapters | NOT LIVE-TESTED | plugin filters |
| 65 | Sitemap control | NOT LIVE-TESTED | `wordpress-sitemap/route.ts` |
| 66 | WooCommerce SEO / product schema | MISSING | product post type only listed |
| 67 | Internal linking suggestions / insertion | MISSING | — |
| 68 | Rollback | MISSING | Plugin records before/after per post; nothing restores it |

## I. Google integrations

| # | Feature | Status | Evidence |
|---|---|---|---|
| 69 | Search Console OAuth (PKCE), property list, reports, period comparison | NOT LIVE-TESTED | `search-console/route.ts` |
| 70 | GA4 organic reports | PARTIAL | Property ID not bound to the website; uses deprecated `conversions` metric |
| 71 | Disconnect / revoke Google access | MISSING | No route or UI |
| 72 | Merchant Center | NOT LIVE-TESTED | `merchant-center/route.ts` (requests write-capable `content` scope) |
| 73 | Business Profile | NOT LIVE-TESTED | `business-profile/route.ts` |

## J. Dashboards and reporting

| # | Feature | Status | Evidence |
|---|---|---|---|
| 74 | Workspace overview | PARTIAL | "SEO Health" shows the first site found without naming it; clicks/impressions are summed from ≤250 rows of the latest report (undercounts) |
| 75 | CSV + JSON website export | NOT LIVE-TESTED | `report/route.ts` |
| 76 | PDF reports | MISSING | — |
| 77 | Scheduled / white-label reports | MISSING | — |
| 78 | In-app notifications | NOT LIVE-TESTED | Teammates only; the user who ran the action is not notified |
| 79 | Email notifications | MISSING | — |

## K. Platform, security, operations

| # | Feature | Status | Evidence |
|---|---|---|---|
| 80 | Email OTP + Google sign-in | NOT LIVE-TESTED | email delivery not exercised |
| 81 | MFA (TOTP + recovery codes) | NOT LIVE-TESTED | enforced in `auth.ts` credentials flow |
| 82 | Organisations, roles, permissions | VERIFIED | unit test "role permissions follow least privilege" |
| 83 | Tenant isolation | NOT LIVE-TESTED | All site queries scoped by `organizationId` + domain; no isolation tests |
| 84 | Same-origin CSRF guard, rate limiting, body limits | VERIFIED | unit tests |
| 85 | Secret encryption (Google, WordPress, MFA) | VERIFIED | unit tests |
| 86 | Account export / deletion with session revocation | NOT LIVE-TESTED | unit test for revocation |
| 87 | Security headers | PARTIAL | No `script-src`/`default-src` CSP |
| 88 | Plans, usage limits, entitlements (no payments) | MISSING | — |
| 89 | Background scheduler | BLOCKED BY DEPLOYMENT | no `vercel.json`/cron config |
| 90 | Monitoring, error tracking, backups | MISSING | — |
| 91 | Production build | NOT LIVE-TESTED | Passes only when `TRUSTED_CLIENT_IP_HEADER` is supplied |
| 92 | Own public site: privacy page, `robots.txt`, `sitemap.xml` | MISSING | `src/app` has `/terms` only |

## Totals

| Status | Count |
|---|---|
| IMPLEMENTED AND VERIFIED | 11 |
| IMPLEMENTED BUT NOT LIVE-TESTED | 34 |
| PARTIALLY IMPLEMENTED | 21 |
| BLOCKED BY DEPLOYMENT | 4 |
| MISSING | 22 |
| BROKEN | 0 (several PARTIAL items contain correctness defects; see audit) |
| **Total** | **92** |

Weighted completion: **33.25 / 92 = 36%**. Live-provider-verified: **0 / 92**.
