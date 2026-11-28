import { randomBytes } from "node:crypto";
import { guardSitePost, failure, noStore } from "@/lib/security/site-request";
import { safeGet } from "@/lib/seo/crawler";
import { sameSite } from "@/lib/seo/toolbox";
import { ToolError, bulkReport, compareReport, duplicateReport, externalLinkReport, generateSitemap, imageReport, orphanReport, pageReport, renderingReport, robotsFile, sitemapReport, type Context as ToolContext } from "@/lib/seo/toolbox-server";

export const maxDuration = 60;
type Context = { params: Promise<{ domain: string }> };
type Body = { tool?: unknown; url?: unknown; urls?: unknown; keyword?: unknown };
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function POST(request: Request, context: Context) {
  const guard = await guardSitePost<Body>(request, context.params, { permission: "audit.run", bucket: "technical-tools", limit: 40 });
  if (guard.response) return guard.response;
  const { db, domain, website, body } = guard;
  if (!website.verifiedAt) return failure("Verify ownership of this website first.", 403);
  let origin: string;
  try { origin = new URL(typeof website.url === "string" && sameSite(website.url, domain) ? website.url : `https://${domain}`).origin; } catch { origin = `https://${domain}`; }
  const tools: ToolContext = { db, get: safeGet, domain, origin, scope: { organizationId: website.organizationId, websiteDomain: domain }, sitemapUrl: typeof website.sitemapUrl === "string" ? website.sitemapUrl : undefined, deadline: Date.now() + 45_000 };
  const url = text(body.url, 2048) || origin + "/";
  const urls = Array.isArray(body.urls) ? body.urls.map((item) => text(item, 2048)).filter(Boolean).slice(0, 100) : [];

  try {
    switch (body.tool) {
      case "rendering": return Response.json(await renderingReport(tools, urls), { headers: noStore });
      case "sitemap": return Response.json(await sitemapReport(tools), { headers: noStore });
      case "sitemap-generate": return Response.json(await generateSitemap(tools), { headers: noStore });
      case "orphans": return Response.json(await orphanReport(tools), { headers: noStore });
      case "external-links": return Response.json(await externalLinkReport(tools), { headers: noStore });
      case "bulk": return Response.json(await bulkReport(tools, urls), { headers: noStore });
      case "duplicates": return Response.json(await duplicateReport(tools), { headers: noStore });
      case "compare": return Response.json(await compareReport(tools), { headers: noStore });
      case "page": return Response.json(await pageReport(tools, url, text(body.keyword, 120)), { headers: noStore });
      case "images": return Response.json(await imageReport(tools, url), { headers: noStore });
      case "robots": return Response.json(await robotsFile(tools), { headers: noStore });
      case "indexnow-key": {
        // The key is public by design: search engines read it from the website to confirm ownership.
        const key = typeof website.indexNowKey === "string" ? website.indexNowKey : randomBytes(16).toString("hex");
        await db.collection("websites").updateOne({ _id: website._id }, { $set: { indexNowKey: key } });
        return Response.json({ key, fileUrl: `${origin}/${key}.txt` }, { headers: noStore });
      }
      case "indexnow-submit": {
        const key = typeof website.indexNowKey === "string" ? website.indexNowKey : "";
        if (!key) return failure("Create your IndexNow key first.", 409);
        const host = new URL(origin).hostname;
        const list = [...new Set(urls)].filter((item) => { try { return new URL(item).hostname === host; } catch { return false; } });
        if (!list.length) return failure(`Enter at least one address on ${host}.`, 400);
        const keyLocation = `${origin}/${key}.txt`;
        const file = await safeGet(keyLocation).catch(() => null);
        if (!file?.response.ok || file.body.trim() !== key) return failure(`Upload the key file first: ${keyLocation} must contain only your key.`, 409);
        const response = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ host, key, keyLocation, urlList: list }), signal: AbortSignal.timeout(15_000) });
        if (response.status !== 200 && response.status !== 202) return failure(`IndexNow did not accept the addresses (${response.status}).`, 502);
        return Response.json({ submitted: list.length }, { headers: noStore });
      }
      default: return failure("Choose a tool.", 400);
    }
  } catch (error) {
    if (error instanceof ToolError) return failure(error.message, 409);
    console.error("technical tool failed", body.tool, error instanceof Error ? error.message : "unknown");
    return failure("The tool could not finish. Please try again.", 502);
  }
}
