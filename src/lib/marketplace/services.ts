import type { Db } from "mongodb";

export const SERVICE_SPECIALTIES = ["SEO", "Technical SEO", "Local SEO", "GEO", "AEO", "LLMO", "Content strategy", "Analytics", "WordPress"] as const;

type Input = Record<string, unknown>;
type CleanProfile = {
  displayName: string;
  headline: string;
  bio: string;
  specialties: string[];
  location: string;
  experienceYears: number;
  portfolio: string[];
  website: string | null;
};

function text(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  return clean.length >= min && clean.length <= max ? clean : null;
}

function url(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch { return null; }
}

function textList(value: unknown, maxItems: number, maxLength = 60): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => text(item, maxLength));
  if (items.some((item) => !item)) return null;
  return [...new Set(items as string[])];
}

export function cleanServiceProfile(input: Input): CleanProfile | null {
  const displayName = text(input.displayName, 100, 2);
  const headline = text(input.headline, 140, 8);
  const bio = text(input.bio, 2400, 40);
  const specialties = textList(input.specialties, 9);
  const location = text(input.location, 100, 2);
  const portfolio = Array.isArray(input.portfolio) && input.portfolio.length <= 8 ? input.portfolio.map(url) : null;
  const website = input.website === "" || input.website == null ? null : url(input.website);
  const years = input.experienceYears;
  if (!displayName || !headline || !bio || !specialties?.length || specialties.some((item) => !(SERVICE_SPECIALTIES as readonly string[]).includes(item)) || !location || !portfolio || portfolio.some((item) => !item) || (input.website && !website) || !Number.isInteger(years) || Number(years) < 0 || Number(years) > 60) return null;
  return { displayName, headline, bio, specialties, location, experienceYears: Number(years), portfolio: portfolio as string[], website };
}

export function cleanServiceListing(input: Input) {
  const title = text(input.title, 120, 8);
  const summary = text(input.summary, 220, 30);
  const description = text(input.description, 3000, 50);
  const category = text(input.category, 60);
  const deliveryDays = input.deliveryDays;
  const pricePaise = input.pricePaise;
  if (!title || !summary || !description || !category || !(SERVICE_SPECIALTIES as readonly string[]).includes(category) || !Number.isInteger(deliveryDays) || Number(deliveryDays) < 1 || Number(deliveryDays) > 180 || !Number.isSafeInteger(pricePaise) || Number(pricePaise) < 100 || Number(pricePaise) > 100_000_000) return null;
  return { title, summary, description, category, deliveryDays: Number(deliveryDays), pricePaise: Number(pricePaise) };
}

export function cleanServiceRequest(input: Input) {
  const title = text(input.title, 140, 8);
  const details = text(input.details, 4000, 40);
  const website = input.website === "" || input.website == null ? null : url(input.website);
  const budgetPaise = input.budgetPaise == null ? null : input.budgetPaise;
  if (!title || !details || (input.website && !website) || (budgetPaise !== null && (!Number.isSafeInteger(budgetPaise) || Number(budgetPaise) < 0 || Number(budgetPaise) > 100_000_000))) return null;
  return { title, details, website, budgetPaise: budgetPaise as number | null };
}

export function cleanServiceProposal(input: Input) {
  const message = text(input.message, 2000, 30);
  const scope = text(input.scope, 2400, 30);
  const amountPaise = input.amountPaise;
  const deliveryDays = input.deliveryDays;
  if (!message || !scope || !Number.isSafeInteger(amountPaise) || Number(amountPaise) < 100 || Number(amountPaise) > 100_000_000 || !Number.isInteger(deliveryDays) || Number(deliveryDays) < 1 || Number(deliveryDays) > 180) return null;
  return { message, scope, amountPaise: Number(amountPaise), deliveryDays: Number(deliveryDays) };
}

const serviceIndexes = globalThis as typeof globalThis & { serviceMarketplaceIndexes?: Promise<void> };
export async function ensureServiceMarketplaceIndexes(db: Db) {
  if (!serviceIndexes.serviceMarketplaceIndexes) serviceIndexes.serviceMarketplaceIndexes = Promise.all([
    db.collection("service_experts").createIndex({ userId: 1 }, { unique: true }),
    db.collection("service_experts").createIndex({ status: 1, specialties: 1, updatedAt: -1 }),
    db.collection("service_listings").createIndex({ expertUserId: 1, status: 1, createdAt: -1 }),
    db.collection("service_listings").createIndex({ status: 1, category: 1, createdAt: -1 }),
    db.collection("service_requests").createIndex({ clientUserId: 1, createdAt: -1 }),
    db.collection("service_requests").createIndex({ expertUserId: 1, status: 1, updatedAt: -1 }),
    db.collection("service_messages").createIndex({ requestId: 1, createdAt: -1 }),
    db.collection("service_messages").createIndex({ requestId: 1, senderId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }),
    db.collection("service_proposals").createIndex({ requestId: 1, createdAt: -1 }),
    db.collection("service_proposals").createIndex({ requestId: 1, expertUserId: 1 }, { unique: true }),
    db.collection("service_orders").createIndex({ proposalId: 1 }, { unique: true }),
    db.collection("service_orders").createIndex({ clientUserId: 1, createdAt: -1 }),
    db.collection("service_orders").createIndex({ expertUserId: 1, createdAt: -1 }),
    db.collection("service_payment_anomalies").createIndex({ orderId: 1, paymentId: 1 }, { unique: true }),
    db.collection("service_milestone_plans").createIndex({ orderId: 1, version: 1 }, { unique: true }),
    db.collection("service_deliverables").createIndex({ orderId: 1, createdAt: -1 }),
    db.collection("service_revisions").createIndex({ orderId: 1, createdAt: -1 }),
    db.collection("service_reviews").createIndex({ orderId: 1 }, { unique: true }),
    db.collection("service_disputes").createIndex({ orderId: 1, status: 1, createdAt: -1 }),
    db.collection("service_disputes").createIndex({ orderId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["open", "under_review"] } } }),
    db.collection("service_financial_ledger").createIndex({ orderId: 1, entryType: 1 }, { unique: true }),
    db.collection("razorpay_webhook_events").createIndex({ eventId: 1 }, { unique: true }),
    db.collection("service_refunds").createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } }),
    db.collection("service_refunds").createIndex({ providerRefundId: 1 }, { unique: true, partialFilterExpression: { providerRefundId: { $type: "string" } } }),
    db.collection("service_refunds").createIndex({ orderId: 1, createdAt: -1 }),
    db.collection("service_payout_requests").createIndex({ orderId: 1 }, { unique: true }),
    db.collection("service_payout_requests").createIndex({ expertUserId: 1, status: 1, createdAt: -1 }),
    db.collection("provider_payment_disputes").createIndex({ providerDisputeId: 1 }, { unique: true }),
    db.collection("service_marketplace_events").createIndex({ requestId: 1, createdAt: -1 }),
  ]).then(() => undefined).catch((error) => { serviceIndexes.serviceMarketplaceIndexes = undefined; throw error; });
  await serviceIndexes.serviceMarketplaceIndexes;
}
