import { ObjectId, type Db, type Document } from "mongodb";

export const ORGANIZATION_ROLES = ["owner", "administrator", "seo_manager", "seo_specialist", "content_editor", "analyst", "viewer"] as const;
export type OrganizationRole = typeof ORGANIZATION_ROLES[number];
export type OrganizationPermission = "organization.manage" | "members.manage" | "websites.read" | "websites.manage" | "audit.run" | "issues.manage" | "tasks.manage" | "integrations.manage" | "reports.read" | "research.run" | "content.edit";

const rolePermissions: Record<OrganizationRole, OrganizationPermission[]> = {
  owner: ["organization.manage", "members.manage", "websites.read", "websites.manage", "audit.run", "issues.manage", "tasks.manage", "integrations.manage", "reports.read", "research.run", "content.edit"],
  administrator: ["organization.manage", "members.manage", "websites.read", "websites.manage", "audit.run", "issues.manage", "tasks.manage", "integrations.manage", "reports.read", "research.run", "content.edit"],
  seo_manager: ["websites.read", "websites.manage", "audit.run", "issues.manage", "tasks.manage", "integrations.manage", "reports.read", "research.run", "content.edit"],
  seo_specialist: ["websites.read", "audit.run", "issues.manage", "tasks.manage", "reports.read", "research.run", "content.edit"],
  content_editor: ["websites.read", "tasks.manage", "reports.read", "content.edit"],
  analyst: ["websites.read", "reports.read"],
  viewer: ["websites.read", "reports.read"],
};

const globalForOrgIndexes = globalThis as typeof globalThis & { organizationIndexesPromise?: Promise<void> };

export async function ensureOrganizationIndexes(db: Db) {
  if (!globalForOrgIndexes.organizationIndexesPromise) globalForOrgIndexes.organizationIndexesPromise = Promise.all([
    db.collection("organizations").createIndex({ personalOwnerId: 1 }, { unique: true, partialFilterExpression: { personalOwnerId: { $type: "string" } }, name: "personal_org_owner_unique" }),
    db.collection("organization_memberships").createIndex({ organizationId: 1, userId: 1 }, { unique: true, name: "org_member_unique" }),
    db.collection("organization_memberships").createIndex({ userId: 1, status: 1 }, { name: "user_org_memberships" }),
    db.collection("organization_invitations").createIndex({ tokenHash: 1 }, { unique: true, name: "invitation_token_unique" }),
    db.collection("organization_invitations").createIndex({ organizationId: 1, email: 1, status: 1 }, { name: "org_invitation_lookup" }),
  ]).then(() => undefined).catch((error) => {
    globalForOrgIndexes.organizationIndexesPromise = undefined;
    throw error;
  });
  await globalForOrgIndexes.organizationIndexesPromise;
}

export async function ensurePersonalOrganization(db: Db, userId: string) {
  await ensureOrganizationIndexes(db);
  await db.collection("websites").updateMany({ ownerId: userId, userId: { $exists: false } }, { $set: { userId } });
  const id = new ObjectId();
  await db.collection("organizations").updateOne(
    { personalOwnerId: userId },
    { $setOnInsert: { _id: id, ownerId: userId, personalOwnerId: userId, name: "My workspace", createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  const organization = await db.collection("organizations").findOne({ personalOwnerId: userId });
  if (!organization) throw new Error("Could not create a personal organization.");
  await db.collection("organization_memberships").updateOne(
    { organizationId: organization._id, userId },
    { $setOnInsert: { organizationId: organization._id, userId, role: "owner", status: "active", createdAt: new Date() } },
    { upsert: true },
  );
  if (organization.schemaVersion !== 1) {
    const now = new Date();
    for (const name of ["websites", "seo_audits", "seo_pages", "seo_issues", "seo_issue_history", "seo_scores", "seo_authority_scores", "seo_visibility_reports", "seo_tasks", "seo_task_history", "seo_research_reports", "pagespeed_results", "integration_status", "google_connections", "google_search_console_reports", "google_analytics_reports", "google_merchant_reports", "google_business_profile_reports", "wordpress_content", "wordpress_sync_history", "notifications", "audit_logs"]) {
      await db.collection(name).updateMany({ ownerId: userId, organizationId: { $exists: false } }, { $set: { organizationId: organization._id } });
    }
    await db.collection("organizations").updateOne({ _id: organization._id }, { $set: { schemaVersion: 1, updatedAt: now } });
  }
  return organization;
}

export async function getOrganizationMemberships(db: Db, userId: string) {
  return db.collection("organization_memberships").find({ userId, status: "active" }).toArray();
}

export function hasOrganizationPermission(role: unknown, permission: OrganizationPermission) {
  return typeof role === "string" && role in rolePermissions && rolePermissions[role as OrganizationRole].includes(permission);
}

export async function findAccessibleWebsite(db: Db, userId: string, domain: string, permission: OrganizationPermission) {
  await ensurePersonalOrganization(db, userId);
  const memberships = await getOrganizationMemberships(db, userId);
  const organizationIds = memberships.map((membership) => membership.organizationId);
  const website = await db.collection("websites").findOne({
    domain,
    $or: [...(organizationIds.length ? [{ organizationId: { $in: organizationIds } }] : []), { ownerId: userId, organizationId: { $exists: false } }],
  });
  if (!website) return { website: null, membership: null };
  const membership = memberships.find((item) => String(item.organizationId) === String(website.organizationId)) ?? null;
  const role = !website.organizationId && website.ownerId === userId ? "owner" : membership?.role;
  if (!hasOrganizationPermission(role, permission)) return { website: null, membership: null };
  return { website, membership };
}

export function organizationIdFilter(organizationId: unknown, ownerId?: string): Document {
  return ownerId ? { $or: [{ organizationId }, { ownerId }] } : { organizationId };
}
