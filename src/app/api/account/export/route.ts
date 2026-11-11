import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { ensurePersonalOrganization, getOrganizationMemberships } from "@/lib/organizations";
import { ObjectId } from "mongodb";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const db = (await clientPromise).db();
  await ensurePersonalOrganization(db, session.user.id);
  const userDbId = ObjectId.isValid(session.user.id) ? new ObjectId(session.user.id) : session.user.id;
  const userProfile = await db.collection<{ _id: ObjectId | string; name?: string; email?: string; image?: string | null; emailVerified?: Date | null; createdAt?: Date; updatedAt?: Date; profileUpdatedAt?: Date; lastLoginAt?: Date; lastLoginProvider?: string }>("users").findOne({ _id: userDbId }, { projection: { name: 1, email: 1, image: 1, emailVerified: 1, createdAt: 1, updatedAt: 1, profileUpdatedAt: 1, lastLoginAt: 1, lastLoginProvider: 1 } });
  const memberships = await getOrganizationMemberships(db, session.user.id);
  const organizationIds = memberships.map((item) => item.organizationId);
  const organizationRecords = await db.collection("organizations").find({ _id: { $in: organizationIds } }, { projection: { ownerId: 1, name: 1, createdAt: 1 } }).toArray();
  const ownedOrganizationIds = organizationRecords.filter((item) => item.ownerId === session.user.id).map((item) => item._id);
  const organizations = organizationRecords.map(({ _id, name, createdAt }) => ({ _id, name, createdAt }));
  const orgQuery = { organizationId: { $in: ownedOrganizationIds } };
  const [websites, audits, pages, issues, tasks, taskHistories, scores, authorityScores, visibilityReports, histories, pageSpeed, researchReports, integrations, content, syncHistory, googleConnections, searchConsoleReports, analyticsReports, merchantReports, businessProfileReports, notifications, repairedLegacyProfiles] = await Promise.all([
    db.collection("websites").find(orgQuery, { projection: { ownerId: 0, wordpressToken: 0, pluginTokenEncrypted: 0, pluginTokenHash: 0, verificationToken: 0, verificationTokenHash: 0, accessToken: 0, refreshToken: 0, secrets: 0 } }).toArray(),
    db.collection("seo_audits").find(orgQuery).toArray(), db.collection("seo_pages").find(orgQuery).toArray(),
    db.collection("seo_issues").find(orgQuery).toArray(), db.collection("seo_tasks").find(orgQuery).toArray(), db.collection("seo_task_history").find(orgQuery).toArray(),
    db.collection("seo_scores").find(orgQuery).toArray(), db.collection("seo_authority_scores").find(orgQuery).toArray(), db.collection("seo_visibility_reports").find(orgQuery).toArray(), db.collection("seo_issue_history").find(orgQuery).toArray(),
    db.collection("pagespeed_results").find(orgQuery).toArray(), db.collection("seo_research_reports").find(orgQuery).toArray(),
    db.collection("integration_status").find(orgQuery, { projection: { accessToken: 0, refreshToken: 0, token: 0, secret: 0 } }).toArray(),
    db.collection("wordpress_content").find(orgQuery).toArray(), db.collection("wordpress_sync_history").find(orgQuery).toArray(),
    db.collection("google_connections").find(orgQuery, { projection: { accessTokenEncrypted: 0, refreshTokenEncrypted: 0 } }).toArray(),
    db.collection("google_search_console_reports").find(orgQuery).toArray(), db.collection("google_analytics_reports").find(orgQuery).toArray(),
    db.collection("google_merchant_reports").find(orgQuery).toArray(), db.collection("google_business_profile_reports").find(orgQuery).toArray(),
    db.collection("notifications").find({ userId: session.user.id }).toArray(),
    db.collection("auth_user_repair_archive").find({ email: session.user.email?.toLowerCase() }, { projection: { email: 0 } }).toArray(),
  ]);
  const exportedAt = new Date();
  const marketplaceBrandIds = (await db.collection("mp_brands").find({ ownerId: session.user.id }, { projection: { _id: 1 } }).toArray()).map((brand) => brand._id);
  const [marketplaceInfluencer, marketplaceBrands, marketplaceCampaigns, marketplaceApplications, marketplaceCollaborations, marketplaceMessages, marketplaceOffers, marketplaceAgreements, marketplaceDeliverables, marketplaceReviews, marketplaceConnections, marketplaceVerification, marketplaceDisputes, marketplaceMessageReports, marketplaceAttachments] = await Promise.all([
    db.collection("mp_influencers").findOne({ userId: session.user.id }),
    db.collection("mp_brands").find({ _id: { $in: marketplaceBrandIds } }).toArray(),
    db.collection("mp_campaigns").find({ brandId: { $in: marketplaceBrandIds } }).toArray(),
    db.collection("mp_applications").find({ $or: [{ influencerId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] }).toArray(),
    db.collection("mp_collaborations").find({ $or: [{ influencerId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] }).toArray(),
    db.collection("mp_messages").find({ senderId: session.user.id }).toArray(),
    db.collection("mp_offers").find({ proposerId: session.user.id }).toArray(),
    db.collection("mp_agreements").find({ $or: [{ influencerId: session.user.id }, { brandId: { $in: marketplaceBrandIds } }] }).toArray(),
    db.collection("mp_deliverables").find({ submittedBy: session.user.id }).toArray(),
    db.collection("mp_reviews").find({ reviewerId: session.user.id }).toArray(),
    db.collection("mp_social_connections").find({ userId: session.user.id }, { projection: { accessTokenEncrypted: 0 } }).toArray(),
    db.collection("mp_verification_requests").find({ userId: session.user.id }).toArray(),
    db.collection("mp_disputes").find({ openedBy: session.user.id }).toArray(),
    db.collection("mp_message_reports").find({ reporterId: session.user.id }).toArray(),
    db.collection("mp_uploads.files").find({ "metadata.uploadedBy": session.user.id }, { projection: { filename: 1, length: 1, uploadDate: 1, metadata: 1 } }).toArray(),
  ]);
  const marketplaceCollaborationIds = marketplaceCollaborations.map((item) => item._id);
  const marketplaceOrders = marketplaceCollaborationIds.length ? await db.collection("mp_orders").find({ collaborationId: { $in: marketplaceCollaborationIds } }).toArray() : [];
  const marketplaceOrderIds = marketplaceOrders.map((item) => item._id);
  const [marketplaceRefunds, marketplacePayouts, marketplaceLedger, marketplaceProviderDisputes, marketplacePaymentAnomalies, marketplaceInstagramInsights] = await Promise.all([
    db.collection("mp_refunds").find({ orderId: { $in: marketplaceOrderIds } }, { projection: { paymentId: 0, providerRefundId: 0, requestKey: 0 } }).toArray(),
    db.collection("mp_payout_requests").find({ orderId: { $in: marketplaceOrderIds } }, { projection: { beneficiary: 0 } }).toArray(),
    db.collection("mp_financial_ledger").find({ orderId: { $in: marketplaceOrderIds } }).toArray(),
    db.collection("mp_provider_disputes").find({ orderId: { $in: marketplaceOrderIds } }).toArray(),
    db.collection("mp_payment_anomalies").find({ orderId: { $in: marketplaceOrderIds } }, { projection: { expectedPaymentId: 0, observedPaymentId: 0 } }).toArray(),
    db.collection("mp_instagram_insights").find({ userId: session.user.id }).toArray(),
  ]);
  const [expertServicesProfile, expertServicesListings, expertServicesRequests, expertServicesOrders] = await Promise.all([
    db.collection("service_experts").findOne({ userId: session.user.id }, { projection: { userId: 0 } }),
    db.collection("service_listings").find({ expertUserId: session.user.id }, { projection: { expertUserId: 0 } }).toArray(),
    db.collection("service_requests").find({ $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] }).toArray(),
    db.collection("service_orders").find({ $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }] }).toArray(),
  ]);
  const expertServicesRequestIds = expertServicesRequests.map((item) => item._id);
  const expertServicesRequestsForExport = expertServicesRequests.map((item) => {
    const safe = { ...item };
    delete safe.clientUserId;
    delete safe.expertUserId;
    if (Array.isArray(safe.attachments)) {
      safe.attachments = safe.attachments.map((attachment) => {
        if (!attachment || typeof attachment !== "object") return attachment;
        const file = { ...(attachment as Record<string, unknown>) };
        delete file.uploadedBy;
        return file;
      });
    }
    return safe;
  });
  const [expertServicesProposals, expertServicesActivity, expertServicesMessages] = await Promise.all([
    db.collection("service_proposals").find({ $or: [{ expertUserId: session.user.id }, { requestId: { $in: expertServicesRequestIds.filter((requestId) => expertServicesRequests.some((item) => item.clientUserId === session.user.id && String(item._id) === String(requestId))) } }] }, { projection: { expertUserId: 0 } }).toArray(),
    db.collection("service_marketplace_events").find({ $or: [{ actorId: session.user.id }, { requestId: { $in: expertServicesRequestIds } }] }).toArray(),
    db.collection("service_messages").find({ requestId: { $in: expertServicesRequestIds }, senderId: session.user.id }, { projection: { senderId: 0 } }).toArray(),
  ]);
  const expertServicesActivityForExport = expertServicesActivity.map((item) => {
    const safe = { ...item };
    if (safe.actorId !== session.user.id) delete safe.actorId;
    return safe;
  });
  const expertServicesOrdersForExport = expertServicesOrders.map((item) => {
    const safe = { ...item };
    delete safe.clientUserId;
    delete safe.expertUserId;
    return safe;
  });
  await db.collection("audit_logs").insertOne({ ownerId: session.user.id, userId: session.user.id, actorId: session.user.id, action: "account.data_exported", createdAt: exportedAt });
  const payload = { format: "seo-studio-account-export-v4", exportedAt, dataScope: "Personal data and complete data for organizations and marketplace brands owned by this account. Shared conversation content from other participants is excluded. Attachment metadata is included; file content can be downloaded separately while the participant still has access to its private collaboration or service request.", account: { id: session.user.id, name: userProfile?.name || session.user.name, email: userProfile?.email || session.user.email, image: userProfile?.image || session.user.image }, accountProfile: userProfile, repairedLegacyProfiles, memberships, organizations, websites, audits, pages, issues, tasks, taskHistory: taskHistories, scores, authorityScores, searchVisibilityReports: visibilityReports, issueHistory: histories, pageSpeed, researchReports, integrations, googleConnections, searchConsoleReports, analyticsReports, merchantReports, businessProfileReports, notifications, wordpressContent: content, wordpressSyncHistory: syncHistory, marketplace: { influencer: marketplaceInfluencer, brands: marketplaceBrands, campaigns: marketplaceCampaigns, applications: marketplaceApplications, collaborations: marketplaceCollaborations, messages: marketplaceMessages, offers: marketplaceOffers, agreements: marketplaceAgreements, deliverables: marketplaceDeliverables, reviews: marketplaceReviews, socialConnections: marketplaceConnections, instagramInsights: marketplaceInstagramInsights, verificationRequests: marketplaceVerification, disputes: marketplaceDisputes, messageReports: marketplaceMessageReports, attachmentMetadata: marketplaceAttachments, financial: { orders: marketplaceOrders, refunds: marketplaceRefunds, payouts: marketplacePayouts, ledger: marketplaceLedger, providerDisputes: marketplaceProviderDisputes, paymentAnomalies: marketplacePaymentAnomalies }, expertServices: { profile: expertServicesProfile, listings: expertServicesListings, requests: expertServicesRequestsForExport, proposals: expertServicesProposals, orders: expertServicesOrdersForExport, messages: expertServicesMessages, activity: expertServicesActivityForExport } } };
  return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="seo-studio-export-${exportedAt.toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
