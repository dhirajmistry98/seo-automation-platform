import { GridFSBucket, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth, SESSION_MAX_AGE_SECONDS } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { revokeUserSessions } from "@/lib/security/sessions";
import { getOrganizationMemberships } from "@/lib/organizations";
import { decryptGoogleSecret } from "@/lib/integrations/google";
import { emailKey, EMAIL_OTP_COLLECTION, EMAIL_OTP_RATE_COLLECTION } from "@/lib/email-otp";
import { isSameOriginRequest, readJsonLimited, sameOriginError } from "@/lib/security/request";

type ServiceRequestAttachmentRecord = { _id: ObjectId; attachments?: Array<{ id?: string }> };
const scopedCollections = ["websites", "seo_audits", "seo_pages", "seo_issues", "seo_issue_history", "seo_scores", "seo_authority_scores", "seo_visibility_reports", "seo_tasks", "seo_task_history", "seo_research_reports", "pagespeed_results", "integration_status", "google_connections", "google_oauth_states", "google_search_console_reports", "google_analytics_reports", "google_merchant_reports", "google_business_profile_reports", "wordpress_content", "wordpress_sync_history", "notifications", "audit_logs", "organization_activity", "organization_invitations"];

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = await readJsonLimited<{ confirmation?: unknown }>(request, 1_024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid JSON request body." }, { status: parsed.status });
  const body = parsed.value;
  if (body.confirmation !== "DELETE MY ACCOUNT") return NextResponse.json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, { status: 400 });
  const db = (await clientPromise).db();
  const memberships = await getOrganizationMemberships(db, session.user.id);
  const owned = await db.collection("organizations").find({ ownerId: session.user.id }).toArray();
  const ownedIds = owned.map((item) => item._id);
  const sharedTeams = await db.collection("organization_memberships").find({ organizationId: { $in: ownedIds }, userId: { $ne: session.user.id }, status: "active" }).toArray();
  if (sharedTeams.length) return NextResponse.json({ error: "Transfer ownership or remove other members from your organizations before deleting this account." }, { status: 409 });
  const marketplaceBrands = await db.collection("mp_brands").find({ ownerId: session.user.id }, { projection: { _id: 1 } }).toArray();
  const marketplaceBrandIds = marketplaceBrands.map((brand) => brand._id);
  const marketplaceMembers = await db.collection("mp_brand_members").countDocuments({ brandId: { $in: marketplaceBrandIds }, userId: { $ne: session.user.id }, status: "active" });
  if (marketplaceMembers) return NextResponse.json({ error: "Transfer your marketplace brand accounts before deleting this account." }, { status: 409 });
  const marketplaceCollaborations = await db.collection("mp_collaborations").countDocuments({ $or: [{ influencerId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] });
  if (marketplaceCollaborations) return NextResponse.json({ error: "Your marketplace collaborations need settlement and a retained business record before account deletion. Contact support to close them safely." }, { status: 409 });
  const serviceOrders = await db.collection("service_orders").find({ $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] }).toArray();
  const unsettledServiceOrders = serviceOrders.some((item) => item.paymentStatus !== "not_started" || !["awaiting_payment_setup", "cancelled_before_start"].includes(String(item.status)));
  if (unsettledServiceOrders) return NextResponse.json({ error: "Your expert service orders need to be completed or settled before account deletion." }, { status: 409 });
  const serviceRequests = await db.collection("service_requests").find({ $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] }, { projection: { _id: 1, clientUserId: 1, expertUserId: 1, status: 1, orderStatus: 1 } }).toArray();
  const clientServiceRequestIds = serviceRequests.filter((item) => item.clientUserId === session.user.id).map((item) => item._id);
  const retainedExpertRequestIds = serviceRequests.filter((item) => item.expertUserId === session.user.id && item.clientUserId !== session.user.id).map((item) => item._id);
  const serviceFiles = await db.collection("mp_uploads.files").find({
    $or: [
      { "metadata.uploadedBy": session.user.id, "metadata.serviceRequestId": { $exists: true } },
      { "metadata.serviceRequestId": { $in: clientServiceRequestIds } },
    ],
  }, { projection: { _id: 1, "metadata.serviceRequestId": 1 } }).toArray();
  const removedServiceFileIds = serviceFiles.map((file) => String(file._id));
  await revokeUserSessions(db, session.user.id, session.user.sessionId, new Date(), SESSION_MAX_AGE_SECONDS);
  const marketplaceCampaignIds = (await db.collection("mp_campaigns").find({ brandId: { $in: marketplaceBrandIds } }, { projection: { _id: 1 } }).toArray()).map((campaign) => campaign._id);
  await db.collection("service_requests").updateMany({ clientUserId: session.user.id, status: "open" }, { $set: { status: "closed", closedAt: new Date(), updatedAt: new Date() } });
  await db.collection("service_requests").updateMany({ clientUserId: session.user.id, status: "accepted", orderStatus: "awaiting_payment_setup" }, { $set: { status: "cancelled", orderStatus: "cancelled_before_start", cancelledAt: new Date(), updatedAt: new Date() } });
  await db.collection("service_requests").updateMany({ expertUserId: session.user.id, status: "accepted", orderStatus: "awaiting_payment_setup" }, { $set: { status: "cancelled", orderStatus: "cancelled_before_start", cancelledAt: new Date(), expertNameSnapshot: "Expert unavailable", updatedAt: new Date() } });
  await db.collection("service_requests").updateMany({ expertUserId: session.user.id, status: "open" }, { $set: { status: "expert_unavailable", expertNameSnapshot: "Expert unavailable", closedAt: new Date(), updatedAt: new Date() } });
  await db.collection("service_requests").updateMany({ expertUserId: session.user.id }, { $unset: { expertUserId: "" } });
  await Promise.all([
    db.collection("service_experts").deleteOne({ userId: session.user.id }),
    db.collection("service_listings").deleteMany({ expertUserId: session.user.id }),
    db.collection("service_requests").deleteMany({ clientUserId: session.user.id }),
    db.collection("service_proposals").deleteMany({ $or: [{ expertUserId: session.user.id }, { requestId: { $in: clientServiceRequestIds } }] }),
    db.collection("service_orders").deleteMany({ $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] }),
    db.collection("service_marketplace_events").deleteMany({ $or: [{ actorId: session.user.id }, { requestId: { $in: clientServiceRequestIds } }] }),
    db.collection("service_messages").deleteMany({ $or: [{ senderId: session.user.id }, { requestId: { $in: clientServiceRequestIds } }] }),
    db.collection("mp_influencers").deleteMany({ userId: session.user.id }),
    db.collection("mp_social_connections").deleteMany({ userId: session.user.id }),
    db.collection("mp_oauth_states").deleteMany({ userId: session.user.id }),
    db.collection("mp_verification_requests").deleteMany({ userId: session.user.id }),
    db.collection("mp_applications").deleteMany({ $or: [{ influencerId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] }),
    db.collection("mp_campaigns").deleteMany({ _id: { $in: marketplaceCampaignIds } }),
    db.collection("mp_brand_members").deleteMany({ $or: [{ userId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] }),
    db.collection("mp_brands").deleteMany({ _id: { $in: marketplaceBrandIds } }),
    db.collection("mp_audit").deleteMany({ $or: [{ actorId: session.user.id }, { entityId: { $in: marketplaceBrandIds } }, { entityId: session.user.id }] }),
  ]);
  if (removedServiceFileIds.length) {
    if (retainedExpertRequestIds.length) {
      await db.collection<ServiceRequestAttachmentRecord>("service_requests").updateMany(
        { _id: { $in: retainedExpertRequestIds } },
        { $pull: { attachments: { id: { $in: removedServiceFileIds } } } },
      );
    }
    const uploads = new GridFSBucket(db, { bucketName: "mp_uploads" });
    await Promise.all(serviceFiles.map((file) => uploads.delete(file._id).catch(() => undefined)));
  }
  const deleteIds = ownedIds;
  const googleConnections = await db.collection("google_connections").find({ $or: [{ createdBy: session.user.id }, { organizationId: { $in: deleteIds } }] }).toArray();
  let revokedGoogleConnections = 0; let failedGoogleRevocations = 0;
  for (const connection of googleConnections) {
    if (connection.refreshTokenEncrypted && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
      try {
        const token = decryptGoogleSecret(connection.refreshTokenEncrypted);
        const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (response.ok) revokedGoogleConnections++; else failedGoogleRevocations++;
      } catch { failedGoogleRevocations++; }
    } else failedGoogleRevocations++;
  }
  for (const organizationId of deleteIds) {
    for (const collectionName of scopedCollections) await db.collection(collectionName).deleteMany({ organizationId });
    await db.collection("organization_memberships").deleteMany({ organizationId });
    await db.collection("organizations").deleteOne({ _id: organizationId });
  }
  const retainedIds = memberships.map((item) => item.organizationId).filter((id) => !deleteIds.some((ownedId) => String(id) === String(ownedId)));
  if (retainedIds.length) await db.collection("organization_memberships").deleteMany({ userId: session.user.id, organizationId: { $in: retainedIds } });
  await db.collection("organization_invitations").deleteMany({ invitedBy: session.user.id });
  await db.collection("notifications").deleteMany({ userId: session.user.id });
  for (const item of googleConnections) if (!deleteIds.some((id) => String(id) === String(item.organizationId))) await db.collection("integration_status").updateOne({ organizationId: item.organizationId, websiteDomain: item.domain, provider: item.service }, { $set: { status: "disconnected", providerEmail: null, updatedAt: new Date() } });
  const userIdFilter = ObjectId.isValid(session.user.id) ? { $in: [session.user.id, new ObjectId(session.user.id)] } : session.user.id;
  const userDelete = ObjectId.isValid(session.user.id)
    ? db.collection("users").deleteOne({ _id: new ObjectId(session.user.id) })
    : Promise.resolve(null);
  await Promise.all([
    db.collection("sessions").deleteMany({ userId: userIdFilter }),
    db.collection("accounts").deleteMany({ userId: userIdFilter }),
    db.collection("verificationTokens").deleteMany({ identifier: session.user.email }),
    userDelete,
    db.collection("user_mfa").deleteOne({ userId: session.user.id }),
    db.collection("google_oauth_states").deleteMany({ userId: session.user.id }),
    db.collection("google_connections").deleteMany({ createdBy: session.user.id }),
    ...(session.user.email ? [db.collection("auth_user_repair_archive").deleteMany({ email: session.user.email.toLowerCase() })] : []),
    ...(session.user.email ? [
      db.collection(EMAIL_OTP_COLLECTION).deleteMany({ emailHash: emailKey(session.user.email) }),
      db.collection(EMAIL_OTP_RATE_COLLECTION).deleteMany({ emailHash: emailKey(session.user.email) }),
    ] : []),
  ]);
  const response = NextResponse.json({ deleted: true });
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  response.cookies.delete("authjs.csrf-token");
  response.cookies.delete("__Secure-authjs.csrf-token");
  response.headers.set("X-Google-Connections-Revoked", String(revokedGoogleConnections));
  response.headers.set("X-Google-Revocation-Failures", String(failedGoogleRevocations));
  return response;
}
