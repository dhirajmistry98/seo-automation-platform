# Release plan

The project is not production-ready yet. Releases move through evidence-based gates; passing a local build alone does not satisfy a gate.

## Gate 0: repeatable development validation

**Purpose:** prevent regressions in the current codebase.

- `.github/workflows/ci.yml` is configured to run `npm ci`, unit tests, TypeScript, ESLint, and a production build on pull requests and pushes. The first hosted run is pending a push to GitHub.
- After the first green hosted run, configure branch protection so merges require the CI job to pass.
- The current local baseline is 38 unit tests passing, TypeScript passing, and lint passing without warnings. Build evidence must be recorded for the current environment separately; an in-memory test key does not validate production encryption configuration. The full dependency audit previously reported zero findings.
- Continue expanding tests whenever an affected feature or security boundary changes.

**Exit evidence:** a green hosted CI run on the exact commit to be released, with the CI job required by branch protection.

## Gate 1: controlled pilot readiness

**Purpose:** validate core accounts, organizations, websites, crawl/audit, tasks, export, and deletion with a small set of real users.

- Choose and configure hosting, production MongoDB, TLS/domain, Auth.js/email delivery, secrets, and deployment/rollback method.
- Run browser-based critical-path tests: sign-in/MFA, organization permissions, site creation/verification, crawl/audit, issue/task lifecycle, export, and account/site deletion.
- Complete an independent security review of authentication, authorization, SSRF controls, data export/deletion, and secret storage.
- Configure backups and demonstrate a restore into an isolated environment; document retention and recovery objectives.
- Configure scheduler, error reporting, uptime/health alerts, and log redaction; exercise a failed job and recovery.

**Exit evidence:** signed test report, security findings disposition, successful restore record, monitored staging deployment, and rollback record.

## Gate 2: provider-backed SEO intelligence

**Scope:** Search Console, Analytics, Business Profile, Merchant Center, PageSpeed, keyword/rank/backlink data.

- Configure verified Google OAuth clients and enabled APIs, plus DataForSEO credentials, quotas, and licensing as applicable.
- Test each provider using a dedicated account and verify scopes, refresh/revocation, rate limits, partial data, and error handling.
- Confirm provider reports are correctly scoped to organization/site and have acceptable request cost and retention.

**Exit evidence:** provider-specific integration tests and real-account acceptance results; no credentials in CI artifacts or logs.

## Gate 3: WordPress and CMS expansion

**Scope:** two-way sync, sitemap ownership, WooCommerce, plugin compatibility, and additional CMS adapters.

- Define supported WordPress, PHP, WooCommerce, SEO plugin, cache, security, and page-builder versions.
- Test install, upgrade, disconnect/reconnect, concurrent edits, conflict resolution, retry, rollback, and multisite behavior on staging sites.
- Implement and verify reviewed sitemap, product, and internal-link workflows before enabling mutations.

**Exit evidence:** compatibility matrix with repeatable integration tests and rollback results for each supported combination.

## Gate 4: commercial automation and AI

**Scope:** billing, agency operations, expanded automation, AI assistance, and the expert-services and creator-brand marketplace commercial lifecycle.

- Select billing provider, plans, taxes/invoices requirements, webhook strategy, and account enforcement policy.
- Complete marketplace messaging, order delivery/revisions, customer acceptance, reviews and disputes. Configure and verify compliant provider capture, commission accounting, refunds and creator/expert payouts; current expert-service orders explicitly wait for payment setup.
- Add durable queues, idempotency, retry/dead-letter handling, approvals, cancellation, and operator recovery before increasing automated writes.
- Define AI provider/data-retention policy, prompt-injection controls, audit trail, human approval, and rollback before enabling AI actions.

**Exit evidence:** billing sandbox acceptance, automation recovery exercises, security review, and AI safety tests for any enabled action.

## Gate 5: general availability

- All release-blocking CI and security findings are resolved.
- Critical user journeys pass browser tests on supported browsers and viewport sizes.
- Load, backup/restore, incident response, deployment rollback, and data deletion are exercised and documented.
- Provider credentials, quotas, monitoring, support ownership, retention, privacy/legal review, and operational on-call are in place.
- Requirement owners accept the traceability matrix; only then may applicable sections be marked production-ready.
