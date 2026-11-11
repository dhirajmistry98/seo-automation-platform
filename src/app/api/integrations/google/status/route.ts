import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { findAccessibleWebsite } from "@/lib/organizations";
import { GOOGLE_SERVICES } from "@/lib/integrations/google";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() || "";
  const db = (await clientPromise).db();
  const { website } = await findAccessibleWebsite(db, session.user.id, domain, "websites.read");
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const connections = await db.collection("google_connections").find({ organizationId: website.organizationId, domain }, { projection: { service: 1, status: 1, providerEmail: 1, connectedAt: 1, updatedAt: 1 } }).toArray();
  return NextResponse.json({ services: Object.entries(GOOGLE_SERVICES).map(([service, value]) => {
    const connection = connections.find((item) => item.service === service);
    return { service, label: value.label, status: connection?.status || "disconnected", providerEmail: connection?.providerEmail || null, connectedAt: connection?.connectedAt || null };
  }) }, { headers: { "Cache-Control": "no-store" } });
}
