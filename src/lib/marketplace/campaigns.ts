/**
 * Campaign briefs brands post for creators to apply to: what is needed, for whom, where, and how creators are
 * compensated (paid, gifted product, or both). Pure validation helpers shared by the API and tests.
 */
export const CAMPAIGN_CATEGORIES = ["Beauty", "Fashion", "Lifestyle", "Food", "Travel", "Fitness", "Technology", "Home", "Entertainment"] as const;
export const COMPENSATION_TYPES = ["paid", "gifted", "paid_and_gifted"] as const;
export type Compensation = (typeof COMPENSATION_TYPES)[number];
export const COMPENSATION_LABEL: Record<Compensation, string> = { paid: "Paid", gifted: "Gifted product", paid_and_gifted: "Paid + product" };

type Input = Record<string, unknown>;
const text = (value: unknown, max: number, min = 1) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null;
};
const wholeNumber = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : null);

export type CampaignFields = {
  title: string; brief: string; deliverables: string[]; targetAudience: string; category: string; location: string;
  compensation: Compensation; budgetPaise: number; productValuePaise: number; creatorsWanted: number; minFollowers: number; deadline: Date;
};

/** Validates a new campaign; returns the clean fields or the first problem in plain language. */
export function parseCampaign(body: Input, now = new Date()): { value: CampaignFields } | { error: string } {
  const title = text(body.title, 120, 5);
  if (!title) return { error: "Give the campaign a title (5 to 120 characters)." };
  const brief = text(body.brief, 4000, 20);
  if (!brief) return { error: "Describe the campaign in at least 20 characters: product, message, do's and don'ts." };
  const deliverables = Array.isArray(body.deliverables) ? [...new Set(body.deliverables.map((item) => text(item, 60)).filter((item): item is string => Boolean(item)))].slice(0, 20) : [];
  if (!deliverables.length) return { error: "List at least one deliverable, for example 1 Reel, 2 Stories." };
  const targetAudience = text(body.targetAudience, 500, 3);
  if (!targetAudience) return { error: "Describe the target audience (at least 3 characters)." };
  const category = CAMPAIGN_CATEGORIES.find((item) => typeof body.category === "string" && item.toLowerCase() === body.category.toLowerCase());
  if (!category) return { error: "Choose a campaign category." };
  const location = body.location == null || body.location === "" ? "" : text(body.location, 80, 2);
  if (location === null) return { error: "Enter a valid location, or leave it empty for anywhere in India." };
  const compensation = COMPENSATION_TYPES.find((item) => item === body.compensation) ?? "paid";
  const paid = compensation !== "gifted";
  const budgetPaise = paid ? wholeNumber(body.budgetPaise, 100, 100_000_000) : 0;
  if (budgetPaise === null) return { error: "Enter the budget per creator in rupees (at least ₹1)." };
  const productValuePaise = compensation === "paid" ? 0 : wholeNumber(body.productValuePaise ?? 0, 0, 100_000_000);
  if (productValuePaise === null) return { error: "Enter the product value in rupees, or 0." };
  const creatorsWanted = wholeNumber(body.creatorsWanted ?? 1, 1, 100);
  if (creatorsWanted === null) return { error: "Creators needed must be between 1 and 100." };
  const minFollowers = wholeNumber(body.minFollowers ?? 0, 0, 100_000_000);
  if (minFollowers === null) return { error: "Minimum followers must be 0 or more." };
  const deadline = typeof body.deadline === "string" ? new Date(body.deadline) : new Date(NaN);
  if (!Number.isFinite(deadline.getTime()) || deadline <= now || deadline.getTime() > now.getTime() + 365 * 86_400_000) return { error: "Choose an application deadline in the next 12 months." };
  return { value: { title, brief, deliverables, targetAudience, category, location, compensation, budgetPaise, productValuePaise, creatorsWanted, minFollowers, deadline } };
}

/** Whether a creator meets the campaign's minimum followers (older campaigns have no minimum). */
export function meetsFollowerMinimum(campaign: Record<string, unknown>, followers: unknown) {
  const minimum = typeof campaign.minFollowers === "number" ? campaign.minFollowers : 0;
  return minimum <= 0 || (typeof followers === "number" && followers >= minimum);
}

/** Creator's own price when applying to a paid campaign: optional, but if given must fit the budget. */
export function parseProposedPrice(value: unknown, budgetPaise: number): { value: number | null } | { error: string } {
  if (value == null || value === "") return { value: null };
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 100) return { error: "Enter your price in rupees (at least ₹1)." };
  if (budgetPaise > 0 && value > budgetPaise) return { error: "Your price is above this campaign's budget per creator." };
  return { value };
}
