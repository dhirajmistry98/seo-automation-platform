import { guardSitePost, failure, noStore } from "@/lib/security/site-request";
import { fetchPublicHtml } from "@/lib/seo/crawler";
import { checkPage, localFindings, phoneDigits, type PageCheck } from "@/lib/seo/local-check";

export const maxDuration = 60;
type Context = { params: Promise<{ domain: string }> };
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const PATHS = ["/", "/contact", "/contact-us", "/about"];

export async function POST(request: Request, context: Context) {
  const guard = await guardSitePost<{ name?: unknown; address?: unknown; phone?: unknown }>(request, context.params, { permission: "audit.run", bucket: "local-seo", limit: 6 });
  if (guard.response) return guard.response;
  const { db, website, domain, body } = guard;
  if (!website.verifiedAt) return failure("Verify ownership of this website first.", 403);
  const expected = { name: clean(body.name, 120), address: clean(body.address, 300), phone: clean(body.phone, 40) };
  if (expected.name.length < 2 || expected.address.length < 8 || phoneDigits(expected.phone).length < 7) return failure("Enter the business name, full address and phone number.", 400);
  let origin: string;
  try { origin = new URL(typeof website.url === "string" ? website.url : `https://${domain}`).origin; } catch { origin = `https://${domain}`; }
  const fetched = await Promise.all(PATHS.map(async (path) => {
    try { const page = await fetchPublicHtml(origin + path, domain); return { url: page.finalUrl, html: page.html }; } catch { return null; }
  }));
  const unique = new Map(fetched.flatMap((page) => (page ? [[page.url, page.html] as const] : [])));
  if (!unique.size) return failure("Could not read any page on this website.", 502);
  const pages: PageCheck[] = [...unique].map(([url, html]) => ({ url, ...checkPage(html, expected) }));
  const result = { ...localFindings(pages), pages };
  await db.collection("websites").updateOne({ _id: website._id }, { $set: { businessNap: expected } }).catch(() => undefined);
  return Response.json(result, { headers: noStore });
}
