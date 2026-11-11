import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { fetchPublicHtml } from "@/lib/seo/crawler";
import { findAccessibleWebsite } from "@/lib/organizations";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  await ensureSeoIndexes(client.db());
  const sites = client.db().collection("websites");
  const { website: site } = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  let token = site.verificationToken;
  if (typeof token !== "string") {
    token = randomBytes(24).toString("hex");
    await sites.updateOne({ _id: site._id, verificationToken: { $exists: false } }, { $set: { verificationToken: token, updatedBy: session.user.id, updatedAt: new Date() } });
    const updated = await sites.findOne({ _id: site._id }, { projection: { verificationToken: 1, verifiedAt: 1 } });
    token = updated?.verificationToken;
  }
  return NextResponse.json({ token, verified: Boolean(site.verifiedAt), method: site.verificationMethod ?? null, recordName: `_seo-studio.${domain}`, recordValue: `seo-studio-verification=${token}`, htmlMetaName: "seo-studio-verification", htmlMetaContent: token, htmlMetaTag: `<meta name="seo-studio-verification" content="${token}">` }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  let method = "dns_txt";
  if (request.body) {
    const parsed = await readJsonLimited<{ method?: unknown }>(request, 256);
    if (!parsed.ok) return NextResponse.json({ error: "Invalid verification request." }, { status: parsed.status });
    if (parsed.value.method !== undefined) {
      if (!["dns_txt", "html_meta"].includes(String(parsed.value.method))) return NextResponse.json({ error: "Choose DNS TXT or HTML meta verification." }, { status: 400 });
      method = String(parsed.value.method);
    }
  }
  const client = await clientPromise;
  await ensureSeoIndexes(client.db());
  const sites = client.db().collection("websites");
  const { website: site } = await findAccessibleWebsite(client.db(), session.user.id, domain, "websites.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (site.verifiedAt) return NextResponse.json({ verified: true, method: site.verificationMethod ?? "dns" });
  if (typeof site.verificationToken !== "string") return NextResponse.json({ error: "Load verification instructions first." }, { status: 409 });
  const expected = `seo-studio-verification=${site.verificationToken}`;
  if (method === "dns_txt") {
    try {
      const records = await resolveTxt(`_seo-studio.${domain}`);
      if (!records.some((parts) => parts.join("").trim() === expected)) throw new Error("record missing");
    } catch {
      return NextResponse.json({ error: "The verification TXT record was not found yet." }, { status: 422 });
    }
  } else {
    try {
      const { html } = await fetchPublicHtml(site.url, domain);
      const found = [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => {
        const attributes = new Map([...tag.matchAll(/([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]));
        return attributes.get("name")?.toLowerCase() === "seo-studio-verification" && attributes.get("content") === site.verificationToken;
      });
      if (!found) return NextResponse.json({ error: "The SEO Studio verification meta tag was not found on the website homepage." }, { status: 422 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not check the website homepage." }, { status: 422 });
    }
  }
  const now = new Date();
  await sites.updateOne({ _id: site._id, verificationToken: site.verificationToken }, { $set: { verifiedAt: now, verifiedBy: session.user.id, verificationMethod: method, updatedBy: session.user.id, updatedAt: now } });
  await client.db().collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "website.verified", method, createdAt: now });
  return NextResponse.json({ verified: true, method, verifiedAt: now });
}
