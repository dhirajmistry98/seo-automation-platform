import { getWorkspaceData, websiteRole } from "@/lib/workspace-data";
import { hasOrganizationPermission } from "@/lib/organizations";

/** The websites a user may open for a permission, and which one is selected (`?site=` or the first). One place for every per-site page. */
export async function loadSiteSelection(userId: string, requested: unknown, permission: Parameters<typeof hasOrganizationPermission>[1] = "reports.read") {
  const workspace = await getWorkspaceData(userId);
  const sites = workspace.websites.filter((item) => hasOrganizationPermission(websiteRole(workspace.memberships, item), permission));
  const wanted = typeof requested === "string" ? requested.toLowerCase() : "";
  return { workspace, sites, site: sites.find((item) => item.domain === wanted) ?? sites[0] };
}
