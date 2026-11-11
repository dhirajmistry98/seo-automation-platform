# Database persistence model

SEO Studio stores application data in MongoDB selected by `MONGODB_URI`. The URI's database name is used by `client.db()`; the example local database is `seo_automation`.

## User identity and account profile

Auth.js owns the `users`, `accounts`, `sessions`, and `verificationTokens` collections. A Mongo user document is keyed by `_id`; the app also keeps a string `userId` equal to that Auth.js ID for consistent references. On successful email-code or Google sign-in, it persists the user's email, display name, verified-email timestamp, HTTPS profile image, creation/update timestamps, last-login time, and provider. Login-provider account records are stored separately by the Auth.js adapter.

When a workspace is initialized, legacy user records missing `userId` are backfilled from `_id`, and owned website records missing `userId` are backfilled from `ownerId`. This is idempotent and only fills missing identifiers; it does not overwrite existing ownership.

The app only persists profile information that its sign-in providers or forms collect. It does not collect a password, phone number, mailing address, or other profile fields. Email OTP values and MFA recovery values are hashed; MFA and Google/WordPress integration secrets are encrypted. Hashed IP identifiers and bounded user-agent values are retained in authentication audit events.

## Organizations and websites

- `organizations` records workspace ownership. `organization_memberships` links each member's `userId` to an organization and role.
- `websites` records `ownerId`/`userId`, `organizationId`, normalized `domain`, canonical `url`, site type, crawl settings, target market, configured keywords and competitors, verification state, CMS detection, and integration status. `createdBy`, `updatedBy`, and `verifiedBy` identify the user who performed those actions.
- SEO audits, crawled pages, issues, tasks, scores, PageSpeed results, provider reports, WordPress content/sync records, and audit logs are scoped by `organizationId` and `websiteDomain`. User-owned records use `ownerId`; provider reports also record the requesting `userId` and `createdBy`. Scheduled jobs record the site owner separately from the system actor.
- `seo_visibility_reports` stores versioned GEO/AEO/LLMO heuristic snapshots by `organizationId` and `websiteDomain`, with the source audit ID, source audit time, dimensions, recommendations, limitations, and observed homepage AI-crawler/`llms.txt` state. Per-page `searchSignals` store bounded structural counts and booleans rather than copied page text. These are first-party checks, not AI ranking or citation predictions.
- `notifications` are associated with a `userId`, and may also include the organization and website.

Records are not stored only in the browser. Server actions and authenticated API routes write to MongoDB. The workspace health endpoint at `/api/health` checks database reachability. If MongoDB is unavailable or `MONGODB_URI` is invalid, writes cannot succeed; check that endpoint and the server logs.

## Export and deletion

The account export includes the stored account profile and accessible organization/site data while omitting authentication session tokens and secret values. Account deletion removes the user's account and owned organization data after the ownership-transfer checks. Website deletion removes site-scoped records and retains a deletion audit event.

## Expert services marketplace

The expert-services marketplace has its own account-facing records and does not reuse organization member roles:

- `service_experts` has one profile per Auth.js `userId`; profile content and its review status are persisted in MongoDB. Public discovery only returns approved profiles attached to active listings.
- `service_listings` belongs to an expert user and stores specialty, scoped service description, INR price in paise, delivery estimate, moderation status, and moderation timestamps/reason.
- `service_requests` records the customer and selected expert internally, with public name snapshots, requested scope, optional website/budget, lifecycle status, selected proposal, and payment-setup state. API responses remove both parties' Auth.js IDs.
- `service_proposals` is unique per expert and request and stores price in paise, delivery estimate, scope, message, and decision state.
- `service_orders` is created after a customer accepts a proposal. It records the accepted INR amount and provider order/payment references. Captures are verified by a server-side provider fetch or signed webhook before work begins; payment, commission, delivery, refund and dispute state is persisted.
- `service_milestone_plans`, `service_deliverables`, `service_revisions`, `service_reviews`, and `service_disputes` persist agreed scope, delivery/revision history, completion feedback and resolution cases. `service_financial_ledger`, `service_refunds`, `service_payout_requests`, and `provider_payment_disputes` store reconciliation records. Payout requests remain `awaiting_route_setup`; these records do not transfer money to experts.
- `service_marketplace_events` records profile, request, proposal, moderation, and cancellation actions. Marketplace notifications are stored in the shared `notifications` collection.
- `service_messages` stores private messages scoped to a service request; API responses expose participant-relative `mine` state and display name, not Auth.js user IDs. Project files live in the `mp_uploads` GridFS bucket and carry a service-request or collaboration scope; downloads require participant authorization.

## Influencer-brand marketplace

- `mp_influencers`, `mp_brands`, `mp_campaigns`, `mp_applications`, `mp_collaborations`, `mp_offers`, and `mp_agreements` persist separate creator and brand accounts, campaign opportunities, applications/invitations, accepted INR terms and agreement records.
- `mp_orders` stores one local payment record per collaboration, the accepted gross amount, saved commission rate, checkout and capture status, completion/refund totals, and held payout status. Provider order/payment references stay server-side and are omitted from ordinary API responses.
- `mp_financial_ledger`, `mp_refunds`, `mp_provider_disputes`, `mp_payment_anomalies`, and `mp_payout_requests` hold append-once or idempotent reconciliation records. Provider webhooks are signature-checked against the raw request body and deduplicated through `razorpay_webhook_events`. Payout requests remain held until recipient onboarding/KYC and a transfer integration are approved.
- `mp_deliverables`, `mp_reviews`, and `mp_disputes` store submitted links, bounded revision status, participant completion feedback, and dispute state. Disputes place payout eligibility on hold; they do not automatically issue refunds.
- `mp_instagram_insights` stores sanitized account metrics returned by authorized Meta API calls, separated from follower verification data. Encrypted OAuth credentials remain in `mp_social_connections` and are omitted from exports.

The account export includes the expert profile, listings, participating requests, proposals, orders, authored service messages, service activity, campaign payment/refund/payout ledger state, and authorized Instagram Insights. It excludes encrypted credentials and beneficiary details while retaining the order references needed for the account's payment record. Account deletion removes the user's authored messages and service uploads, removes upload references from retained requests, removes client-owned requests and their files, closes open requests, marks requests to a removed expert unavailable, and removes internal account identifiers from those requests. Marketplace collaboration history and service orders that have entered a payment or work state block self-service account deletion pending settlement and retained-record handling.
