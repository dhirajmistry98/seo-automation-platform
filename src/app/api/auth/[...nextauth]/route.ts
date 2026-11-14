import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { hashOAuthState } from "@/lib/integrations/google";
import { GET as googleIntegrationCallback } from "@/app/api/integrations/google/callback/route";

// Google integrations (Search Console, GA4, …) share the sign-in callback URL so only one
// redirect URI has to be registered. A callback whose state matches a pending integration
// request goes to the integration handler; everything else is normal Auth.js sign-in.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state && url.pathname.endsWith("/callback/google")) {
    const db = (await clientPromise).db();
    const pending = await db.collection("google_oauth_states").findOne({ stateHash: hashOAuthState(state) }, { projection: { _id: 1 } });
    if (pending) return googleIntegrationCallback(request);
  }
  return handlers.GET(request);
}

export const { POST } = handlers;
