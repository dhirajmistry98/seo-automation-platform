import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { decryptGoogleSecret, encryptGoogleSecret, ensureGoogleIntegrationIndexes, googleClientConfig, GOOGLE_SERVICES, hashOAuthState, type GoogleService } from "@/lib/integrations/google";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") || "";
  const code = requestUrl.searchParams.get("code") || "";
  let appUrl = requestUrl.origin;
  try { appUrl = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : requestUrl.origin; } catch { /* The OAuth config validation below will reject an invalid callback URL. */ }
  const fail = (reason: string) => NextResponse.redirect(`${appUrl}/dashboard/integrations?integration=${encodeURIComponent(reason)}`);
  const session = await auth();
  if (!session?.user?.id) return fail("session_required");
  if (!state) return fail("invalid_state");
  const db = (await clientPromise).db();
  await ensureGoogleIntegrationIndexes(db);
  const now = new Date();
  const consumed = await db.collection("google_oauth_states").findOneAndUpdate({ stateHash: hashOAuthState(state), userId: session.user.id, consumedAt: { $exists: false }, expiresAt: { $gt: now } }, { $set: { consumedAt: now } }, { returnDocument: "after" });
  const authState = consumed && "value" in consumed ? consumed.value : consumed;
  if (!authState) return fail("invalid_state");
  if (!code) return fail(requestUrl.searchParams.has("error") ? "cancelled" : "missing_code");
  const service = authState.service as GoogleService;
  if (!(service in GOOGLE_SERVICES)) return fail("invalid_service");
  try {
    const config = googleClientConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: decryptGoogleSecret(authState.codeVerifierEncrypted) }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const tokenBody = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) return fail("token_exchange_failed");
    const infoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { redirect: "manual", headers: { Authorization: `Bearer ${tokenBody.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const info = infoResponse.ok ? await infoResponse.json() as { email?: string; sub?: string } : {};
    const current = await db.collection("google_connections").findOne({ organizationId: authState.organizationId, domain: authState.domain, service });
    const refreshTokenEncrypted = tokenBody.refresh_token ? encryptGoogleSecret(tokenBody.refresh_token) : current?.refreshTokenEncrypted;
    if (!refreshTokenEncrypted) return fail("missing_refresh_token");
    await db.collection("google_connections").updateOne(
      { organizationId: authState.organizationId, domain: authState.domain, service },
      { $set: { userId: authState.userId, updatedBy: authState.userId, status: "connected", providerEmail: info.email || null, providerSubject: info.sub || null, refreshTokenEncrypted, accessTokenEncrypted: encryptGoogleSecret(tokenBody.access_token), accessTokenExpiresAt: new Date(Date.now() + (tokenBody.expires_in ?? 3600) * 1000), grantedScopes: (tokenBody.scope || "").split(" ").filter(Boolean), connectedAt: current?.connectedAt || now, updatedAt: now }, $setOnInsert: { organizationId: authState.organizationId, domain: authState.domain, service, createdBy: authState.userId } }, { upsert: true },
    );
    await db.collection("integration_status").updateOne({ organizationId: authState.organizationId, websiteDomain: authState.domain, provider: service }, { $set: { userId: authState.userId, updatedBy: authState.userId, status: "connected", connectedAt: now, providerEmail: info.email || null }, $setOnInsert: { organizationId: authState.organizationId, websiteDomain: authState.domain, provider: service, createdBy: authState.userId } }, { upsert: true });
    await db.collection("audit_logs").insertOne({ ownerId: authState.userId, userId: authState.userId, organizationId: authState.organizationId, websiteDomain: authState.domain, actorId: authState.userId, action: "google.integration.connected", provider: service, createdAt: now });
    const teammates = await db.collection("organization_memberships").find({ organizationId: authState.organizationId, status: "active", userId: { $ne: authState.userId } }, { projection: { userId: 1 } }).toArray();
    if (teammates.length) await db.collection("notifications").insertMany(teammates.map((member) => ({
      userId: member.userId, organizationId: authState.organizationId, websiteDomain: authState.domain,
      type: "integration.connected", title: `${GOOGLE_SERVICES[service].label} connected for ${authState.domain}`,
      message: `A workspace member connected ${GOOGLE_SERVICES[service].label}.`, createdAt: now,
    })));
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?integration=connected&service=${encodeURIComponent(service)}`);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return fail("connection_failed");
  }
}
