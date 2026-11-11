import type { Db } from "mongodb";

const globalForIndexes = globalThis as typeof globalThis & { seoIndexesPromise?: Promise<void> };

export function ensureSeoIndexes(db: Db) {
  if (!globalForIndexes.seoIndexesPromise) {
    globalForIndexes.seoIndexesPromise = Promise.all([
      db.collection("websites").createIndex({ ownerId: 1, domain: 1 }, { unique: true, name: "owner_domain_unique" }),
      db.collection("websites").createIndex({ pluginTokenHash: 1 }, { unique: true, partialFilterExpression: { pluginTokenHash: { $type: "string" } }, name: "plugin_token_hash_unique" }),
      db.collection("websites").createIndex({ active: 1, verifiedAt: 1, rankTrackingFrequency: 1, nextScheduledRankTrackingAt: 1 }, { name: "rank_tracking_due" }),
      db.collection("websites").createIndex({ active: 1, verifiedAt: 1, pageSpeedFrequency: 1, nextScheduledPageSpeedAt: 1 }, { name: "pagespeed_due" }),
      db.collection("seo_audits").createIndex({ auditId: 1 }, { unique: true, name: "audit_id_unique" }),
      db.collection("seo_audits").createIndex({ ownerId: 1, websiteDomain: 1, startedAt: -1 }, { name: "site_audit_history" }),
      db.collection("seo_crawl_jobs").createIndex({ status: 1, nextAttemptAt: 1, createdAt: 1 }, { name: "crawl_queue_due" }),
      db.collection("seo_crawl_jobs").createIndex({ status: 1, leaseUntil: 1 }, { name: "crawl_queue_lease" }),
      db.collection("seo_crawl_jobs").createIndex({ ownerId: 1, websiteDomain: 1, createdAt: -1 }, { name: "site_crawl_history" }),
      db.collection("seo_crawl_job_events").createIndex({ jobId: 1, createdAt: -1 }, { name: "crawl_job_event_history" }),
      db.collection("seo_pages").createIndex({ ownerId: 1, websiteDomain: 1, auditId: 1, url: 1 }, { unique: true, name: "audit_page_unique" }),
      db.collection("seo_issues").createIndex({ ownerId: 1, websiteDomain: 1, status: 1, severity: 1 }, { name: "site_issue_queue" }),
      db.collection("seo_issues").createIndex({ ownerId: 1, websiteDomain: 1, pageUrl: 1, ruleId: 1 }, { name: "page_rule_identity" }),
      db.collection("seo_issue_history").createIndex({ ownerId: 1, websiteDomain: 1, issueId: 1, detectedAt: -1 }, { name: "issue_detection_history" }),
      db.collection("seo_issue_history").createIndex({ auditId: 1, issueId: 1, action: 1 }, { unique: true, partialFilterExpression: { auditId: { $type: "string" } }, name: "audit_issue_event_unique" }),
      db.collection("seo_tasks").createIndex({ ownerId: 1, sourceIssueId: 1 }, { unique: true, partialFilterExpression: { sourceIssueId: { $type: "string" } }, name: "issue_task_unique" }),
      db.collection("seo_tasks").createIndex({ ownerId: 1, websiteDomain: 1, status: 1, createdAt: -1 }, { name: "site_task_queue" }),
      db.collection("seo_task_history").createIndex({ ownerId: 1, websiteDomain: 1, taskId: 1, changedAt: -1 }, { name: "task_change_history" }),
      db.collection("seo_scores").createIndex({ ownerId: 1, websiteDomain: 1, scoredAt: -1 }, { name: "site_score_history" }),
      db.collection("seo_authority_scores").createIndex({ organizationId: 1, websiteDomain: 1, calculatedAt: -1 }, { name: "site_authority_history" }),
      db.collection("seo_visibility_reports").createIndex({ organizationId: 1, websiteDomain: 1, calculatedAt: -1 }, { name: "site_visibility_history" }),
      db.collection("seo_research_reports").createIndex({ organizationId: 1, websiteDomain: 1, fetchedAt: -1 }, { name: "site_research_history" }),
      db.collection("pagespeed_results").createIndex({ ownerId: 1, websiteDomain: 1, retrievedAt: -1 }, { name: "pagespeed_history" }),
      db.collection("integration_status").createIndex({ ownerId: 1, websiteDomain: 1, provider: 1 }, { unique: true, name: "site_provider_unique" }),
      db.collection("wordpress_content").createIndex({ ownerId: 1, websiteDomain: 1, wordpressPostId: 1 }, { unique: true, name: "wordpress_post_unique" }),
      db.collection("wordpress_sync_history").createIndex({ ownerId: 1, websiteDomain: 1, syncedAt: -1 }, { name: "wordpress_sync_history" }),
      db.collection("audit_logs").createIndex({ ownerId: 1, websiteDomain: 1, createdAt: -1 }, { name: "site_audit_trail" }),
    ]).then(() => undefined).catch((error) => {
      globalForIndexes.seoIndexesPromise = undefined;
      throw error;
    });
  }
  return globalForIndexes.seoIndexesPromise;
}
