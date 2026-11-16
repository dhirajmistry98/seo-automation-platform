import clientPromise from "@/lib/mongodb";
import { expireOverdueRequests } from "@/lib/marketplace/core";

/** Scheduled: decline bookings and invitations that were not answered within the response window. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const db = (await clientPromise).db();
  const expired = await expireOverdueRequests(db);
  // processed stays falsy when nothing expired, so the scheduler moves on.
  return Response.json({ processed: expired > 0 ? 1 : 0, expired });
}
