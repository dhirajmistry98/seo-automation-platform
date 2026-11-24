import type { Db } from "mongodb";
import { analyzeInternalLinks, type LinkPage } from "@/lib/seo/internal-links";

type Site = { organizationId?: unknown; domain?: unknown; [key: string]: unknown };

/** Link graph of the latest completed audit. Null when the site has never been crawled. */
export async function loadInternalLinks(db: Db, site: Site) {
  const domain = String(site.domain ?? "").toLowerCase();
  const scope = { organizationId: site.organizationId, websiteDomain: domain } as never;
  const audit = (await db.collection("seo_audits").find({ ...(scope as object), status: "completed" } as never).sort({ createdAt: -1 }).limit(1).toArray())[0] as { auditId?: string; completedAt?: Date } | undefined;
  if (!audit?.auditId) return null;
  const rows = await db.collection("seo_pages").find({ ...(scope as object), auditId: audit.auditId } as never).sort({ crawledAt: 1 }).project({ url: 1, title: 1, internalLinks: 1, status: 1 }).limit(500).toArray();
  const pages: LinkPage[] = rows.flatMap((row) => typeof row.url === "string" ? [{ url: row.url, title: String(row.title || ""), internalLinks: Array.isArray(row.internalLinks) ? row.internalLinks.filter((link: unknown): link is string => typeof link === "string") : [], status: Number(row.status) || undefined }] : []);
  if (!pages.length) return null;
  return { analysis: analyzeInternalLinks(pages), pageCount: pages.length, auditedAt: audit.completedAt ?? null };
}
