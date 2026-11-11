import clientPromise from "@/lib/mongodb";
import type { Db, ObjectId } from "mongodb";
import { ensurePersonalOrganization, getOrganizationMemberships } from "@/lib/organizations";

export type WorkspaceWebsite = {
  domain: string;
  url: string;
  organizationId?: unknown;
  name?: string;
  websiteType?: string;
  status?: string;
  detectedCms?: { name: string; confidence: "high" | "likely"; evidence: string } | null;
  createdAt?: Date;
  verifiedAt?: Date;
  lastAudit?: { auditId: string; score: number; confidence: number; pageCount: number; issueCounts: { critical: number; warning: number; notice: number }; confidenceNote: string } | null;
};

export type WorkspaceMembership = { organizationId: ObjectId; userId: string; role: string };
export type WorkspaceOrganization = { id: string; name: string; role: string };
type WorkspaceData = { available: boolean; db: Db | null; memberships: WorkspaceMembership[]; organizationIds: ObjectId[]; organizations: WorkspaceOrganization[]; websites: WorkspaceWebsite[] };

export async function getWorkspaceData(userId: string): Promise<WorkspaceData> {
  try {
    const db = (await clientPromise).db();
    await ensurePersonalOrganization(db, userId);
    const records = await getOrganizationMemberships(db, userId);
    const memberships: WorkspaceMembership[] = records.map((record) => ({ organizationId: record.organizationId, userId: String(record.userId), role: String(record.role) }));
    const organizationIds = memberships.map((membership) => membership.organizationId);
    const organizationDocs = await db.collection("organizations").find({ _id: { $in: organizationIds } }, { projection: { name: 1 } }).toArray();
    const organizations = memberships.flatMap((membership) => {
      const organization = organizationDocs.find((item) => String(item._id) === String(membership.organizationId));
      return organization ? [{ id: String(membership.organizationId), name: organization.name, role: membership.role }] : [];
    });
    const websites = await db.collection<WorkspaceWebsite>("websites")
      .find({ $or: [{ organizationId: { $in: organizationIds } }, { ownerId: userId, organizationId: { $exists: false } }] })
      .project<WorkspaceWebsite>({ _id: 0, domain: 1, url: 1, organizationId: 1, name: 1, websiteType: 1, status: 1, createdAt: 1, verifiedAt: 1, detectedCms: 1, lastAudit: 1 })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return { available: true, db, memberships, organizationIds, organizations, websites };
  } catch (error) {
    console.error("Workspace data unavailable:", error);
    return { available: false, db: null as Db | null, memberships: [], organizationIds: [], organizations: [], websites: [] };
  }
}

export function websiteRole(memberships: Array<{ organizationId: unknown; role: string }>, website: WorkspaceWebsite) {
  return memberships.find((membership) => String(membership.organizationId) === String(website.organizationId))?.role
    || (website.organizationId ? undefined : "owner");
}
