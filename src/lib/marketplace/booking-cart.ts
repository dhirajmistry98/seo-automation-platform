/**
 * Booking cart: brands add creator packages from several creators and send every request in one checkout.
 * Packages from the same creator become one request. Creators have RESPONSE_WINDOW_HOURS to accept.
 */
export const RESPONSE_WINDOW_HOURS = 72;
export const MAX_CART_ITEMS = 20;
export const USAGE_RIGHTS = ["none", "30_days", "90_days", "1_year", "perpetual"] as const;
export type UsageRights = (typeof USAGE_RIGHTS)[number];
export const USAGE_RIGHTS_LABEL: Record<UsageRights, string> = { none: "Organic post only", "30_days": "30 days usage rights", "90_days": "90 days usage rights", "1_year": "1 year usage rights", perpetual: "Perpetual usage rights" };

export type CartPackage = { itemId: string; creatorId: string; creatorName: string; packageIndex: number; title: string; pricePaise: number; deliveryDays: number | null };

/** Groups cart packages by creator with per-creator and overall totals. */
export function summarizeCart(items: CartPackage[]) {
  const groups = new Map<string, { creatorId: string; creatorName: string; packages: CartPackage[]; subtotalPaise: number }>();
  for (const item of items) {
    const group = groups.get(item.creatorId) ?? { creatorId: item.creatorId, creatorName: item.creatorName, packages: [], subtotalPaise: 0 };
    group.packages.push(item);
    group.subtotalPaise += item.pricePaise;
    groups.set(item.creatorId, group);
  }
  const creators = [...groups.values()];
  return { creators, packageCount: items.length, creatorCount: creators.length, totalPaise: creators.reduce((sum, group) => sum + group.subtotalPaise, 0) };
}

/** When a creator must answer a booking or invitation sent at `sentAt`. */
export const respondByFrom = (sentAt: Date) => new Date(sentAt.getTime() + RESPONSE_WINDOW_HOURS * 3_600_000);

/** Whether an open request has passed its response deadline (requests created before deadlines existed never expire). */
export function isResponseOverdue(request: Record<string, unknown>, now = new Date()) {
  return request.status === "invited" && request.respondBy instanceof Date && request.respondBy.getTime() <= now.getTime();
}

export function parseUsageRights(value: unknown): UsageRights {
  return USAGE_RIGHTS.find((item) => item === value) ?? "none";
}
