
## 12. Fix log (2026-11-25, after the audit)

Verified after fixes: `tsc` 0 errors · `eslint` 0 issues · 97/97 unit tests · 144/144 route tests. Not verified in a browser.

| Item | Result |
|---|---|
| D2 rank tracking device/location | **Fixed (wording + control):** device selector removed (value kept), form text now says positions come from Search Console (28-day average) and are not filtered by device or area |
| D3 AI card names 4 engines | **Fixed:** card now says Gemini only |
| D4 Authority Index dead-end | **Fixed:** the feature cannot compute without backlink data (needs `kind: "backlinks"` reports, no longer producible) – card is now shown only for sites that already have a saved score, and the API error says it cannot be recalculated. Upgraded from P2 to P1 (feature was unusable for new sites). |
| NEW: public marketing overclaims | **Fixed:** blog post "keyword-research-and-rank-tracking" rewritten; corrections in getting-started, ai-search-readiness and google-integrations posts, guide page, llms.txt, blog index and homepage (removed search volume, backlink summaries, competitor gaps, ChatGPT/Perplexity mentions, mobile/city rank tracking claims) |
| D1 scheduler | **Not fixable from code** – needs `CRON_SECRET` (secret) and `APP_URL` (variable) in GitHub |
| D5 `/dashboard` 200 instead of 302 | Not changed (streaming/PPR behaviour; needs browser testing) |
| CSP `script-src`, rate limits on user routes, `/api/health` detail | Not changed (risk of breaking Google tag/login without browser testing) |
