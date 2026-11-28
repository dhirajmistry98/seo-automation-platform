# SEO Studio: current features and what we can add

Checked 2026-11-28 against `main` @ fb88240.

## Health check

| Check | Result |
|---|---|
| Type-check, lint | 0 errors |
| Unit tests / route tests | 104 of 104 / 161 of 161 pass |
| Live public pages, sitemap, robots.txt, llms.txt, health | All 200 |
| Protected APIs without login | 401 |
| Scheduled jobs | **Not running.** GitHub `CRON_SECRET` secret and `APP_URL` variable are missing. The workflow still shows "success" because it only skips. |
| Logged-in screens, real Google/AI/Meta/Razorpay calls | **Not checked** (no login or live credentials used) |

Status: **Ready** = built and passes checks, not yet verified in a browser. **Needs setup** = built, waits on a key or account. 

## 1. What we have

### Site audit and technical SEO
| Feature | Status |
|---|---|
| Crawler (robots.txt aware, private-address protection, page cap, crawl history) | Ready |
| Checks: titles, descriptions (incl. duplicates), headings, alt text, canonicals, hreflang, broken and redirecting internal links, deep and unlinked pages, HTTPS, mixed content, noindex, URL format, JSON-LD, Open Graph, thin content | Ready |
| Audit overview: health score, errors/warnings/notices, themed scores, page breakdown, top issues, trend | Ready (new) |
| Issues, tasks, prioritised fixes, action plan, fix impact | Ready |
| Traffic and ranking diagnosis | Ready |
| PageSpeed / Core Web Vitals | Ready (scheduled runs need scheduler) |
| Redirect manager and checker, hreflang builder, schema generator | Ready |
| SEO checker for any URL, Rank-a-page optimiser, internal link suggestions | Ready |

### Keywords and content
| Feature | Status |
|---|---|
| Keyword ideas and questions (Google autocomplete) | Ready |
| Keyword positions, quick wins, cannibalization (Search Console) | Needs Search Console connected |
| Keyword strategy: search intent, clustering, page matching, content gaps, CSV | Needs Search Console data |
| Keyword import/export | Ready |
| AI Studio: titles, meta descriptions, keyword ideas, content optimisation, content brief, E-E-A-T audit, schema suggestion, audit and report summaries | Needs Gemini key |
| In-app assistant | Needs Gemini key |

### Google integrations
| Feature | Status |
|---|---|
| Search Console reports (query, page, country, device, date), sitemap submit, URL inspection | Needs Google connection |
| Google Analytics 4 reports | Needs Google connection |
| Business Profile, Merchant Center | Needs a matching Google account |

### AI search
| Feature | Status |
|---|---|
| AI readiness scores (GEO, AEO, LLMO, E-E-A-T), AI crawler access | Ready |
| Mention and citation check, competitor share of voice, prompts, history | Needs a key per engine; Gemini is the only one set locally. Never tested against live APIs |

### WordPress, reports, account
| Feature | Status |
|---|---|
| WordPress plugin, metadata and content sync, sitemap control | Needs a WordPress site |
| Report page, CSV export, print to PDF | Ready |
| Teams, roles, invitations, MFA, data export, account deletion, notifications, workspace search | Ready |

Influencer marketplace is also built (payments and Instagram need live accounts). It is not an SEO feature.

## 2. What we can add

Effort: S = about a day or less, M = a few days, L = a week or more. These are rough estimates.

### A. Free, code only
| # | Feature | Effort |
|---|---|---|
| A1 | Broken **external** link checker | S |
| A2 | XML sitemap validator and coverage check (in sitemap vs crawled vs indexed) | M |
| A3 | XML sitemap generator | S |
| A4 | robots.txt tester and generator | S |
| A5 | Google result and social share preview | S |
| A6 | Structured data validator | M |
| A7 | Image SEO audit (size, format, dimensions, lazy loading) | M |
| A8 | Security headers check | S |
| A9 | Readability and keyword usage analysis | S |
| A10 | Duplicate and near-duplicate content detection (within own site) | M |
| A11 | Compare two crawls (new, fixed, returned issues) | M |
| A12 | Bulk URL status checker | S |
| A13 | Server log file analysis (search and AI bot visits) | M |
| A14 | Orphan page report (sitemap + Search Console vs crawl) | S |
| A15 | IndexNow submission (Bing and others, not Google) | S |
| A16 | JavaScript rendering audit (needs a headless browser service, may cost) | L |

### B. Free, using Google data
| # | Feature | Effort |
|---|---|---|
| B1 | Position tracking dashboard: visibility trend, top 3/10/20 distribution, winners and losers | M |
| B2 | Country and device filters for tracked positions (restores the removed device option) | S |
| B3 | Content decay report | S |
| B4 | Low click-through opportunities | S |
| B5 | Brand vs non-brand traffic split | S |
| B6 | Organic landing page report (Search Console + GA4) | M |
| B7 | Chrome UX Report field data history | S |
| B8 | Review list and replies (Business Profile API access approval needed) | M |
| B9 | NAP consistency and LocalBusiness checks | S |

### C. Reporting and automation
| # | Feature | Effort |
|---|---|---|
| C1 | Email alerts: critical issues, ranking drops, site down | M |
| C2 | Scheduled weekly/monthly email reports | M |
| C3 | Shareable read-only report links | M |
| C4 | White-label PDF for agencies | M |
| C5 | Keyword lists manager with tags and notes | S |

C1 and C2 need the scheduler fixed first.

### D. AI (uses your AI keys, billed per use)
| # | Feature | Effort |
|---|---|---|
| D1 | Brand sentiment in AI answers | S |
| D2 | Brand narrative themes | M |
| D3 | Prompt suggestions for tracking | S |
| D4 | Scheduled prompt tracking | M |
| D5 | Full content writer and editor with SEO score | L |
| D6 | One-click AI fix suggestions per audit issue | M |
| D7 | Topic cluster content planner and calendar | M |

### E. Free outside sources (access terms to be confirmed before building)
| # | Source | Would add |
|---|---|---|
| E1 | Bing Webmaster Tools API | Inbound links to the user's own site, Bing keyword data |
| E2 | Google Ads Keyword Planner API | Search volume, CPC, ad competition (needs developer token approval; usage rules apply) |
| E3 | Common Crawl web graph | Rough referring domains; heavy to process |
| E4 | YouTube Data API | Video keyword and channel SEO |

### F. Only with a paid data provider
Competitor traffic and keywords, keyword gap, backlink analytics, audit, gap and history, anchor text, keyword difficulty, live Google rankings by city and device, competitor rank tracking, SERP features, local rank map, large keyword database, trends at scale, market and traffic analytics.

Semrush is ruled out by your decision. DataForSEO or SerpApi are the options if you want these later.

### Not SEO
Social media scheduling and paid ads tools. Add only if you want to widen the product.

## 3. Suggested order
1. Fix the scheduler.
2. Check logged-in screens and fix the dashboard design.
3. B1 to B5 (biggest visible gain from data you already collect).
4. A1 to A6 and A11.
5. C1 to C3.
6. D1, D3, D6.
7. E1 and E2 after confirming access.

## Corrections to the earlier audit report
`QA-AUDIT-REPORT.md` says search intent and keyword clustering are not implemented. That is wrong: both exist in the keyword strategy, based on Search Console data.

## Cleanup
Your local `.env` still has `SEMRUSH_API_KEY`, `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`. The code uses none of them.
