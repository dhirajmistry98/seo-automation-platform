import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { collaborationAccess, objectId } from "@/lib/marketplace/core";
import { createCollaborationTokenRequest, realtimeAvailable } from "@/lib/marketplace/realtime";

export async function GET(request: Request) {
  const session = await auth(); if (!session?.user?.id) return Response.json({ error: "Authentication required." }, { status: 401 });
  const id = objectId(new URL(request.url).searchParams.get("collaborationId"));
  if (!id) return Response.json({ error: "Invalid collaboration ID." }, { status: 400 });
  if (!realtimeAvailable()) return Response.json({ error: "Real-time transport is not configured." }, { status: 503 });
  const db = (await clientPromise).db();
  if (!(await collaborationAccess(db, id, session.user.id))) return Response.json({ error: "Collaboration access required." }, { status: 403 });
  const tokenRequest = await createCollaborationTokenRequest(String(id), session.user.id);
  return Response.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
}
