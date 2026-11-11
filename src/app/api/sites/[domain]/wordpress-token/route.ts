import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensureSeoIndexes } from "@/lib/seo/indexes";
import { findAccessibleWebsite } from "@/lib/organizations";
import { encryptWordPressToken } from "@/lib/integrations/wordpress";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";

type Context = { params: Promise<{ domain: string }> };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "integrations.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  return NextResponse.json({ tokenIssued: Boolean(site.pluginTokenHash), connectedAt: site.pluginConnectedAt ?? null, lastSyncAt: site.pluginLastSyncAt ?? null, lastSyncStatus: site.pluginLastSyncStatus ?? null, pluginVersion: site.pluginVersion ?? null, appEditingReady: Boolean(site.pluginTokenEncrypted && process.env.WORDPRESS_TOKEN_ENCRYPTION_KEY) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = decodeURIComponent((await context.params).domain).toLowerCase();
  const client = await clientPromise;
  const db = client.db();
  await ensureSeoIndexes(db);
  const { website: site } = await findAccessibleWebsite(db, session.user.id, domain, "integrations.manage");
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!site.verifiedAt) return NextResponse.json({ error: "Verify website ownership before connecting WordPress." }, { status: 403 });
  const token = `sseo_${randomBytes(32).toString("base64url")}`;
  const issuedAt = new Date();
  await db.collection("websites").updateOne({ _id: site._id }, {
    $set: { pluginTokenHash: digest(token), pluginTokenIssuedAt: issuedAt, pluginTokenIssuedBy: session.user.id, pluginConnectedAt: null, updatedBy: session.user.id, updatedAt: issuedAt, ...(process.env.WORDPRESS_TOKEN_ENCRYPTION_KEY ? { pluginTokenEncrypted: encryptWordPressToken(token) } : {}) },
    ...(!process.env.WORDPRESS_TOKEN_ENCRYPTION_KEY ? { $unset: { pluginTokenEncrypted: "" } } : {}),
  });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, organizationId: site.organizationId, websiteDomain: domain, action: "integration.wordpress.token_rotated", createdAt: issuedAt });
  return NextResponse.json({ token, issuedAt, appEditingReady: Boolean(process.env.WORDPRESS_TOKEN_ENCRYPTION_KEY) }, { headers: { "Cache-Control": "no-store" } });
}
