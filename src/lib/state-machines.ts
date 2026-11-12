/**
 * Explicit state machines for every status field stored in MongoDB.
 *
 * Each machine lists its states, the states a record may be created in, and every allowed move.
 * The code still performs moves with guarded updates (`updateOne({ _id, status: "open" }, { $set: { status: "closed" } })`);
 * this file is the single place that says which moves exist. `tests/state-machines.test.mjs` scans every
 * MongoDB write in `src/` and fails if code writes a state or makes a move that is not declared here.
 *
 * Adding a status or a move: add it here first, then write the code. New code can use `transitionFilter()`
 * to build the guard from this table instead of hand-writing the allowed "from" states.
 */

export type StateMachine<S extends string = string> = {
  /** MongoDB collection that stores the records. */
  collection: string;
  /** Field holding the state. */
  field: string;
  description: string;
  /** States a record may be created in. */
  initial: readonly S[];
  /** Every state, mapped to the states it may move to. Terminal states map to an empty list. */
  transitions: { readonly [K in S]: readonly S[] };
  /** Known gaps between this model and the intended behaviour. */
  knownIssues?: readonly string[];
};

function machine<const S extends string>(definition: StateMachine<S>): StateMachine<S> {
  return definition;
}

// ---------------------------------------------------------------------------------------------
// Organizations and connections
// ---------------------------------------------------------------------------------------------

export const organizationMembership = machine({
  collection: "organization_memberships",
  field: "status",
  description: "A user's membership in an organization. Accepting a new invitation reactivates a removed member.",
  initial: ["active"],
  transitions: {
    active: ["active", "removed"],
    removed: ["active"],
  },
});

export const organizationInvitation = machine({
  collection: "organization_invitations",
  field: "status",
  description: "Team invitation. Expiry is by `expiresAt`, not a status change.",
  initial: ["pending"],
  transitions: {
    pending: ["accepted"],
    accepted: [],
  },
});

export const googleConnection = machine({
  collection: "google_connections",
  field: "status",
  description: "Stored Google OAuth connection for one website and service. Reconnecting refreshes it in place.",
  initial: ["connected"],
  transitions: {
    connected: ["connected"],
  },
});

export const integrationStatus = machine({
  collection: "integration_status",
  field: "status",
  description: "Per-website integration summary shown in the dashboard.",
  initial: ["connected", "disconnected"],
  transitions: {
    connected: ["connected", "disconnected"],
    disconnected: ["connected"],
  },
});

// ---------------------------------------------------------------------------------------------
// SEO workspace
// ---------------------------------------------------------------------------------------------

export const crawlJob = machine({
  collection: "seo_crawl_jobs",
  field: "status",
  description:
    "Background crawl. Workers claim jobs with a lease; a job whose lease expires while running or saving is reclaimed (running → running, saving → running). Up to 3 attempts.",
  initial: ["queued"],
  transitions: {
    queued: ["running", "cancelled"],
    retrying: ["running", "cancelled"],
    running: ["running", "saving", "retrying", "failed", "cancel_requested", "cancelled"],
    saving: ["running", "completed", "retrying", "failed", "cancelled"],
    cancel_requested: ["cancelled", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
  },
});

export const seoAudit = machine({
  collection: "seo_audits",
  field: "status",
  description: "Audit record for a crawl. Its status mirrors the crawl job through a separate write.",
  initial: ["queued"],
  transitions: {
    queued: ["retrying", "completed", "failed", "cancelled"],
    retrying: ["retrying", "completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  },
  knownIssues: [
    "Mirrors seo_crawl_jobs.status in a second, non-atomic write; a worker crash between the two writes leaves them disagreeing.",
  ],
});

export const seoIssue = machine({
  collection: "seo_issues",
  field: "status",
  description: "Audit finding. A new audit that detects a resolved or ignored issue again reopens it.",
  initial: ["open"],
  transitions: {
    open: ["open", "resolved", "ignored"],
    resolved: ["open"],
    ignored: ["open", "ignored"],
  },
});

export const seoTask = machine({
  collection: "seo_tasks",
  field: "status",
  description: "Task created from an issue. Users may move it freely; a re-detected issue moves a done task back to todo.",
  initial: ["todo"],
  transitions: {
    todo: ["todo", "in_progress", "done"],
    in_progress: ["todo", "in_progress", "done"],
    done: ["todo", "in_progress", "done"],
  },
});

// ---------------------------------------------------------------------------------------------
// Expert services marketplace
// ---------------------------------------------------------------------------------------------

export const serviceExpert = machine({
  collection: "service_experts",
  field: "status",
  description: "Expert profile moderation. Editing a profile sends it back to review.",
  initial: ["pending_review"],
  transitions: {
    pending_review: ["pending_review", "approved", "rejected", "suspended"],
    approved: ["pending_review", "approved", "rejected", "suspended"],
    rejected: ["pending_review", "approved", "rejected", "suspended"],
    suspended: ["pending_review", "approved", "rejected", "suspended"],
  },
});

export const serviceListing = machine({
  collection: "service_listings",
  field: "status",
  description: "Service listing moderation. Editing an active listing sends it back to review; a non-approved expert suspends their listings.",
  initial: ["pending_review"],
  transitions: {
    pending_review: ["pending_review", "active", "rejected", "suspended"],
    active: ["pending_review", "active", "rejected", "suspended"],
    rejected: ["pending_review", "active", "rejected", "suspended"],
    suspended: ["pending_review", "active", "rejected", "suspended"],
  },
});

export const serviceRequest = machine({
  collection: "service_requests",
  field: "status",
  description: "A client's request for expert help.",
  initial: ["open"],
  transitions: {
    open: ["accepted", "closed", "expert_unavailable"],
    accepted: ["completed", "cancelled"],
    closed: [],
    expert_unavailable: [],
    completed: [],
    cancelled: [],
  },
});

export const serviceRequestOrderStatus = machine({
  collection: "service_requests",
  field: "orderStatus",
  description: "Copy of the linked service order's progress, kept on the request for list views.",
  initial: ["awaiting_payment_setup"],
  transitions: {
    awaiting_payment_setup: ["awaiting_payment_setup", "in_progress", "cancelled_before_start"],
    in_progress: ["completed"],
    completed: [],
    cancelled_before_start: [],
  },
  knownIssues: [
    "Disputes and refunds change service_orders.status but never this copy, so a disputed order still shows in_progress here.",
  ],
});

export const serviceProposal = machine({
  collection: "service_proposals",
  field: "status",
  description: "An expert's proposal on a request. Accepting one declines the others.",
  initial: ["pending"],
  transitions: {
    pending: ["accepted", "declined"],
    accepted: [],
    declined: [],
  },
});

export const serviceOrder = machine({
  collection: "service_orders",
  field: "status",
  description: "Paid engagement between a client and an expert.",
  initial: ["awaiting_payment_setup"],
  transitions: {
    awaiting_payment_setup: ["awaiting_payment_setup", "in_progress", "cancelled_before_start"],
    in_progress: ["in_progress", "completed", "disputed", "refunded", "partially_refunded"],
    completed: ["disputed", "refunded", "partially_refunded"],
    disputed: ["disputed", "in_progress", "completed", "refund_review_required", "refunded", "partially_refunded"],
    refund_review_required: ["disputed", "refunded", "partially_refunded"],
    partially_refunded: ["disputed", "refunded", "partially_refunded"],
    refunded: [],
    cancelled_before_start: [],
  },
  knownIssues: [
    "A Razorpay payment.dispute.* webhook sets `disputed` without creating a service_disputes record or saving disputedPreviousStatus, so the admin resolve action cannot move it out (only a refund can).",
    "Every payment.dispute.* event, including won and closed, sets `disputed` again.",
  ],
});

export const serviceOrderProgress = machine({
  collection: "service_orders",
  field: "orderStatus",
  description: "Duplicate of status for the paid part of the order lifecycle.",
  initial: ["in_progress"],
  transitions: {
    in_progress: ["in_progress", "completed"],
    completed: [],
  },
});

export const serviceOrderPayment = machine({
  collection: "service_orders",
  field: "paymentStatus",
  description: "Razorpay payment for a service order.",
  initial: ["not_started"],
  transitions: {
    not_started: ["not_started", "captured", "failed"],
    failed: ["captured", "failed"],
    captured: [],
  },
});

export const serviceOrderPayout = machine({
  collection: "service_orders",
  field: "payoutStatus",
  description: "Whether the expert may be paid out for this order.",
  initial: ["awaiting_route_setup"],
  transitions: {
    awaiting_route_setup: ["awaiting_route_setup", "on_hold", "paid"],
    on_hold: ["awaiting_route_setup", "on_hold"],
    paid: [],
  },
});

export const serviceMilestonePlan = machine({
  collection: "service_milestone_plans",
  field: "status",
  description: "Milestone plan created when payment is captured. Individual milestones carry their own nested status.",
  initial: ["approved"],
  transitions: {
    approved: ["completed"],
    completed: [],
  },
});

export const serviceRevision = machine({
  collection: "service_revisions",
  field: "status",
  description: "Client revision request on a submitted milestone.",
  initial: ["requested"],
  transitions: { requested: [] },
});

export const serviceDispute = machine({
  collection: "service_disputes",
  field: "status",
  description: "Dispute opened by the client or expert, resolved by an admin.",
  initial: ["open"],
  transitions: {
    open: ["under_review", "resolved"],
    under_review: ["resolved"],
    resolved: [],
  },
});

export const serviceReview = machine({
  collection: "service_reviews",
  field: "status",
  description: "Client review of a completed order.",
  initial: ["published"],
  transitions: { published: [] },
});

export const serviceRefund = machine({
  collection: "service_refunds",
  field: "status",
  description: "Admin-issued refund through Razorpay. Uncertain provider responses go to reconciliation and can be retried.",
  initial: ["processing"],
  transitions: {
    processing: ["pending", "processed", "failed", "reconciliation_required", "provider_rejected"],
    pending: ["pending", "processed", "failed"],
    reconciliation_required: ["processing", "pending", "processed", "failed"],
    failed: ["pending", "processed", "failed"],
    provider_rejected: [],
    processed: [],
  },
});

export const servicePayoutRequest = machine({
  collection: "service_payout_requests",
  field: "status",
  description: "Expert payout for a completed order.",
  initial: ["awaiting_route_setup"],
  transitions: {
    awaiting_route_setup: ["queued", "on_hold"],
    queued: ["paid", "on_hold"],
    on_hold: ["awaiting_route_setup", "on_hold"],
    paid: [],
  },
});

export const servicePaymentAnomaly = machine({
  collection: "service_payment_anomalies",
  field: "status",
  description: "A captured payment that does not match the order; needs a human.",
  initial: ["manual_review_required"],
  transitions: { manual_review_required: [] },
});

// ---------------------------------------------------------------------------------------------
// Influencer (campaign) marketplace
// ---------------------------------------------------------------------------------------------

export const influencerProfile = machine({
  collection: "mp_influencers",
  field: "status",
  description: "Creator profile moderation. Profile edits and Instagram reconnects send it back to pending.",
  initial: ["draft"],
  transitions: {
    draft: ["draft", "pending", "approved", "rejected", "suspended"],
    pending: ["draft", "pending", "approved", "rejected", "suspended"],
    approved: ["draft", "pending", "approved", "rejected", "suspended"],
    rejected: ["draft", "pending", "approved", "rejected", "suspended"],
    suspended: ["draft", "pending", "approved", "rejected", "suspended"],
  },
});

export const brandProfile = machine({
  collection: "mp_brands",
  field: "status",
  description: "Brand profile moderation. A brand that is not approved has its open campaigns closed.",
  initial: ["pending"],
  transitions: {
    pending: ["pending", "approved", "rejected", "suspended"],
    approved: ["pending", "approved", "rejected", "suspended"],
    rejected: ["pending", "approved", "rejected", "suspended"],
    suspended: ["pending", "approved", "rejected", "suspended"],
  },
});

export const brandMember = machine({
  collection: "mp_brand_members",
  field: "status",
  description: "User's membership of a brand.",
  initial: ["active"],
  transitions: { active: [] },
});

export const campaign = machine({
  collection: "mp_campaigns",
  field: "status",
  description: "Brand campaign open for applications.",
  initial: ["open"],
  transitions: {
    open: ["closed", "cancelled"],
    closed: [],
    cancelled: [],
  },
});

export const campaignApplication = machine({
  collection: "mp_applications",
  field: "status",
  description: "Creator application to a campaign, or a brand's invitation to a creator.",
  initial: ["pending", "invited"],
  transitions: {
    pending: ["accepted", "declined", "withdrawn"],
    invited: ["accepted", "declined", "withdrawn"],
    accepted: [],
    declined: [],
    withdrawn: [],
  },
});

export const collaboration = machine({
  collection: "mp_collaborations",
  field: "status",
  description: "Brand and creator working together on a campaign.",
  initial: ["negotiating"],
  transitions: {
    negotiating: ["negotiating", "terms_agreed"],
    terms_agreed: ["completed"],
    completed: [],
  },
});

export const collaborationPayment = machine({
  collection: "mp_collaborations",
  field: "paymentStatus",
  description: "Set once the campaign order payment is captured.",
  initial: ["captured"],
  transitions: { captured: [] },
});

export const offer = machine({
  collection: "mp_offers",
  field: "status",
  description: "Negotiation offer. A newer offer supersedes the open one.",
  initial: ["open", "accepted"],
  transitions: {
    open: ["accepted", "superseded"],
    accepted: ["accepted", "superseded"],
    superseded: [],
  },
});

export const agreement = machine({
  collection: "mp_agreements",
  field: "status",
  description: "Recorded terms for a collaboration.",
  initial: ["terms_recorded"],
  transitions: { terms_recorded: ["terms_recorded"] },
});

export const deliverable = machine({
  collection: "mp_deliverables",
  field: "status",
  description: "Content submitted by a creator. Up to three revision rounds.",
  initial: ["submitted"],
  transitions: {
    submitted: ["approved", "revision_requested"],
    revision_requested: ["submitted"],
    approved: [],
  },
});

export const campaignOrderPayment = machine({
  collection: "mp_orders",
  field: "paymentStatus",
  description: "Razorpay payment for a campaign order.",
  initial: ["not_started"],
  transitions: {
    not_started: ["not_started", "captured", "failed"],
    failed: ["not_started", "captured", "failed"],
    captured: [],
  },
});

export const campaignOrderPayout = machine({
  collection: "mp_orders",
  field: "payoutStatus",
  description: "Whether the creator may be paid out for this order.",
  initial: ["not_eligible"],
  transitions: {
    not_eligible: ["not_eligible", "awaiting_route_setup", "on_hold"],
    awaiting_route_setup: ["awaiting_route_setup", "on_hold", "paid"],
    on_hold: ["awaiting_route_setup", "on_hold"],
    paid: [],
  },
  knownIssues: ["A bank dispute only puts the payout on hold; unlike service orders, the order status is not changed."],
});

export const campaignPayoutRequest = machine({
  collection: "mp_payout_requests",
  field: "status",
  description: "Creator payout for a completed collaboration.",
  initial: ["awaiting_route_setup"],
  transitions: {
    awaiting_route_setup: ["awaiting_route_setup", "on_hold", "paid"],
    on_hold: ["awaiting_route_setup", "on_hold"],
    paid: [],
  },
});

export const campaignRefund = machine({
  collection: "mp_refunds",
  field: "status",
  description: "Admin-issued refund for a campaign order. Same lifecycle as service refunds.",
  initial: ["processing"],
  transitions: serviceRefund.transitions,
});

export const campaignPaymentAnomaly = machine({
  collection: "mp_payment_anomalies",
  field: "status",
  description: "A captured payment that does not match the order; needs a human.",
  initial: ["manual_review_required"],
  transitions: { manual_review_required: [] },
});

export const verificationRequest = machine({
  collection: "mp_verification_requests",
  field: "status",
  description: "Creator identity verification request reviewed by an admin.",
  initial: ["pending"],
  transitions: {
    pending: ["reviewed", "dismissed"],
    reviewed: [],
    dismissed: [],
  },
});

export const campaignDispute = machine({
  collection: "mp_disputes",
  field: "status",
  description: "Collaboration dispute reviewed by an admin.",
  initial: ["open"],
  transitions: {
    open: ["resolved", "dismissed"],
    resolved: [],
    dismissed: [],
  },
});

export const messageReport = machine({
  collection: "mp_message_reports",
  field: "status",
  description: "Reported chat message reviewed by an admin.",
  initial: ["pending"],
  transitions: {
    pending: ["resolved", "dismissed"],
    resolved: [],
    dismissed: [],
  },
});

// ---------------------------------------------------------------------------------------------
// Background processing
// ---------------------------------------------------------------------------------------------

export const razorpayWebhookEvent = machine({
  collection: "razorpay_webhook_events",
  field: "status",
  description: "Inbound Razorpay webhook. Failed events are retried when Razorpay redelivers them; stale processing locks are reclaimed.",
  initial: ["received"],
  transitions: {
    received: ["processing", "failed"],
    processing: ["processing", "processed", "failed"],
    failed: ["processing", "failed"],
    processed: [],
  },
});

export const realtimeOutbox = machine({
  collection: "mp_realtime_outbox",
  field: "status",
  description: "Realtime marketplace event waiting to be published. Retried with backoff up to 20 attempts; stale locks are reclaimed.",
  initial: ["pending"],
  transitions: {
    pending: ["processing", "delivered"],
    processing: ["processing", "pending", "delivered", "failed"],
    delivered: [],
    failed: [],
  },
});

// ---------------------------------------------------------------------------------------------
// Registry and helpers
// ---------------------------------------------------------------------------------------------

export const STATE_MACHINES: readonly StateMachine[] = [
  organizationMembership, organizationInvitation, googleConnection, integrationStatus,
  crawlJob, seoAudit, seoIssue, seoTask,
  serviceExpert, serviceListing, serviceRequest, serviceRequestOrderStatus, serviceProposal,
  serviceOrder, serviceOrderProgress, serviceOrderPayment, serviceOrderPayout, serviceMilestonePlan,
  serviceRevision, serviceDispute, serviceReview, serviceRefund, servicePayoutRequest, servicePaymentAnomaly,
  influencerProfile, brandProfile, brandMember, campaign, campaignApplication, collaboration, collaborationPayment,
  offer, agreement, deliverable, campaignOrderPayment, campaignOrderPayout, campaignPayoutRequest, campaignRefund,
  campaignPaymentAnomaly, verificationRequest, campaignDispute, messageReport,
  razorpayWebhookEvent, realtimeOutbox,
];

/** Status-like writes that are not lifecycles: history snapshots and nested integration summaries. */
export const NOT_STATE_MACHINES: Readonly<Record<string, string>> = {
  "audit_logs.status": "Log entry recording a task status at the time of the change.",
  "seo_task_history.status": "History entry recording a task status at the time of the change.",
  "websites.status": "Nested integration summary on the website document, not the website's own lifecycle.",
};

export function findMachine(collection: string, field = "status") {
  return STATE_MACHINES.find((item) => item.collection === collection && item.field === field);
}

export function statesOf<S extends string>(definition: StateMachine<S>) {
  return Object.keys(definition.transitions) as S[];
}

export function isState<S extends string>(definition: StateMachine<S>, value: unknown): value is S {
  return typeof value === "string" && Object.hasOwn(definition.transitions, value);
}

export function canTransition<S extends string>(definition: StateMachine<S>, from: S, to: S) {
  return definition.transitions[from]?.includes(to) ?? false;
}

export function isTerminal<S extends string>(definition: StateMachine<S>, state: S) {
  return definition.transitions[state]?.length === 0;
}

/** States that may move to `to`. */
export function sourcesOf<S extends string>(definition: StateMachine<S>, to: S) {
  return statesOf(definition).filter((from) => definition.transitions[from].includes(to));
}

export function assertTransition<S extends string>(definition: StateMachine<S>, from: S, to: S) {
  if (!canTransition(definition, from, to)) {
    throw new Error(`Invalid ${definition.collection}.${definition.field} transition: ${from} → ${to}`);
  }
}

/**
 * MongoDB filter fragment that only matches records allowed to move to `to`,
 * e.g. `updateOne({ _id, ...transitionFilter(serviceRequest, "closed") }, { $set: { status: "closed" } })`.
 */
export function transitionFilter<S extends string>(definition: StateMachine<S>, to: S) {
  return { [definition.field]: { $in: sourcesOf(definition, to) } };
}
