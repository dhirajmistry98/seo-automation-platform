import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { createOAuthPkce, createOAuthState, encryptGoogleSecret, ensureGoogleIntegrationIndexes, googleClientConfig, GOOGLE_SERVICES, hashOAuthState, isGoogleService } from "@/lib/integrations/google";

export async function GET(request: Request, context: { params: Promise<{ service: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const service = (await context.params).service;
  if (!isGoogleService(service)) return NextResponse.json({ error: "Unknown Google integration." }, { status: 404 });
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() || "";
  const db = (await clientPromise).db();
  await ensureGoogleIntegrationIndexes(db);
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "integrations.manage");
  if (!website) return NextResponse.json({ error: "Website not found or integration access is not allowed." }, { status: 404 });
  let config;
  let pkce;
  try { config = googleClientConfig(); pkce = createOAuthPkce(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Google OAuth is not configured." }, { status: 503 }); }
  const state = createOAuthState();
  await db.collection("google_oauth_states").insertOne({ stateHash: hashOAuthState(state), codeVerifierEncrypted: encryptGoogleSecret(pkce.verifier), userId: session.user.id, organizationId: website.organizationId, domain: website.domain, service, expiresAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date() });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: `openid email profile ${GOOGLE_SERVICES[service].scope}`, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, code_challenge: pkce.challenge, code_challenge_method: "S256" }).toString();
  return NextResponse.redirect(url);
}
