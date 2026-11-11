import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest, sameOriginError } from "@/lib/security/request";
import { decryptToken, encryptToken, fetchInstagramInsights, refreshInstagramToken } from "@/lib/marketplace/meta";
import { ensureMarketplaceIndexes } from "@/lib/marketplace/core";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Authentication required." }, 401);
  const db = (await clientPromise).db();
  const [connection, latest] = await Promise.all([
    db.collection("mp_social_connections").findOne({ userId: session.user.id, provider: "instagram" }, { projection: { username: 1, expiresAt: 1, lastInsightsAt: 1 } }),
    db.collection("mp_instagram_insights").findOne({ userId: session.user.id }, { projection: { _id: 0, metrics: 1, fetchedAt: 1, source: 1, status: 1 }, sort: { fetchedAt: -1 } }),
  ]);
  return json({ connected: Boolean(connection), username: connection?.username || null, lastInsightsAt: connection?.lastInsightsAt || null, latest: latest || null });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Authentication required." }, 401);
  const db = (await clientPromise).db();
  await ensureMarketplaceIndexes(db);
  const limit = await consumeRateLimit(db, "marketplace-instagram-insights", session.user.id, 6, 60 * 60_000);
  if (!limit.allowed) return json({ error: "Insight refresh limit reached. Try again later." }, 429);
  const now = new Date();
  const connection = await db.collection("mp_social_connections").findOne({ userId: session.user.id, provider: "instagram" });
  if (!connection || typeof connection.accessTokenEncrypted !== "string") return json({ error: "Connect your Instagram professional account first." }, 409);
  try {
    let token = decryptToken(connection.accessTokenEncrypted);
    let expiresAt = connection.expiresAt instanceof Date ? connection.expiresAt : new Date(connection.expiresAt);
    if (expiresAt.getTime() < now.getTime() + 14 * 86_400_000) {
      const refreshed = await refreshInstagramToken(token);
      token = refreshed.token;
      expiresAt = refreshed.expiresAt;
    }
    const metrics = await fetchInstagramInsights(token, String(connection.providerUserId));
    if (!metrics.length) return json({ error: "Meta returned no insight metrics. Confirm the Instagram Insights permission and professional account eligibility." }, 502);
    const report = { _id: new ObjectId(), userId: session.user.id, provider: "instagram_graph_api", providerUserId: String(connection.providerUserId), username: String(connection.username || ""), metrics, source: "Meta Instagram Insights API", fetchedAt: now };
    await db.collection("mp_instagram_insights").insertOne(report);
    await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { accessTokenEncrypted: encryptToken(token), expiresAt, lastInsightsAt: now, lastInsightsError: null, updatedAt: now } });
    await db.collection("mp_audit").insertOne({ entityId: session.user.id, actorId: session.user.id, action: "instagram.insights.refreshed", metricCount: metrics.length, createdAt: now });
    return json({ report: { metrics, source: report.source, fetchedAt: now } });
  } catch {
    await db.collection("mp_social_connections").updateOne({ _id: connection._id }, { $set: { lastInsightsError: "provider_or_permission_error", lastInsightsAttemptAt: now, updatedAt: now } });
    return json({ error: "Instagram Insights could not be retrieved. Confirm Meta App Review for instagram_business_manage_insights, reconnect the professional account, and retry." }, 502);
  }
}
