export type RankTrackingFrequency = "manual" | "weekly" | "monthly";
export type RankTrackingDevice = "desktop" | "mobile";

export function parseRankTrackingFrequency(value: unknown): RankTrackingFrequency | null {
  return value === "manual" || value === "weekly" || value === "monthly" ? value : null;
}

export function parseRankTrackingLocationCode(value: unknown): number | null {
  const code = typeof value === "number" ? value : typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(code) && code >= 1 && code <= 999_999_999_999 ? code : null;
}

export function parseRankTrackingLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(language) ? language : null;
}

export function parseRankTrackingDevice(value: unknown): RankTrackingDevice | null {
  return value === "desktop" || value === "mobile" ? value : null;
}

export function getRankTrackingKeywords(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const keywords = values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 120);
  return [...new Set(keywords)].slice(0, 10);
}

export function nextRankTrackingAt(frequency: RankTrackingFrequency, from = new Date()): Date | null {
  if (frequency === "manual") return null;
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + (frequency === "weekly" ? 7 : 30));
  return next;
}
