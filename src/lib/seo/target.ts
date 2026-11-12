import { parseGeoPoint } from "./geo-target.ts";

export type SeoTarget = {
  locationCode: number;
  locationName: string;
  countryCode: string;
  countryName: string;
  countryLocationCode: number;
  languageCode: string;
  /** Exact point for local SEO ("live location"). When set, live Google results are fetched from here. */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
};

const legacyMarkets: Record<number, { countryCode: string; name: string }> = {
  2356: { countryCode: "IN", name: "India" },
  2840: { countryCode: "US", name: "United States" },
  2826: { countryCode: "GB", name: "United Kingdom" },
  2124: { countryCode: "CA", name: "Canada" },
  2036: { countryCode: "AU", name: "Australia" },
};
const legacyMarketsByCountry: Record<string, { locationCode: number; name: string }> = {
  IN: { locationCode: 2356, name: "India" },
  US: { locationCode: 2840, name: "United States" },
  GB: { locationCode: 2826, name: "United Kingdom" },
  CA: { locationCode: 2124, name: "Canada" },
  AU: { locationCode: 2036, name: "Australia" },
};

export function getWebsiteSeoTarget(website: {
  rankTrackingLocationCode?: unknown;
  rankTrackingLocationName?: unknown;
  rankTrackingCountryCode?: unknown;
  rankTrackingCountryName?: unknown;
  rankTrackingCountryLocationCode?: unknown;
  rankTrackingLanguageCode?: unknown;
  rankTrackingLatitude?: unknown;
  rankTrackingLongitude?: unknown;
  rankTrackingRadiusKm?: unknown;
  targetCountry?: unknown;
  targetLanguage?: unknown;
}): SeoTarget {
  const savedLocationCode = Number(website.rankTrackingLocationCode);
  const locationCode = Number.isSafeInteger(savedLocationCode) && savedLocationCode > 0 ? savedLocationCode : 2356;
  const legacy = legacyMarkets[locationCode] || legacyMarkets[2356];
  const targetCountry = typeof website.targetCountry === "string" ? website.targetCountry.trim() : "";
  const targetCountryCode = /^[a-z]{2}$/i.test(targetCountry) ? targetCountry.toUpperCase() : ({ india: "IN", "united states": "US", usa: "US", "united kingdom": "GB", canada: "CA", australia: "AU" } as Record<string, string>)[targetCountry.toLowerCase()];
  const countryCode = typeof website.rankTrackingCountryCode === "string" && /^[a-z]{2}$/i.test(website.rankTrackingCountryCode)
    ? website.rankTrackingCountryCode.toUpperCase()
    : targetCountryCode || legacy.countryCode;
  const savedCountryLocationCode = Number(website.rankTrackingCountryLocationCode);
  const countryLocationCode = Number.isSafeInteger(savedCountryLocationCode) && savedCountryLocationCode > 0
    ? savedCountryLocationCode
    : legacyMarkets[locationCode]?.countryCode === countryCode
      ? locationCode
      : legacyMarketsByCountry[countryCode]?.locationCode || locationCode;
  const locationName = typeof website.rankTrackingLocationName === "string" && website.rankTrackingLocationName.trim()
    ? website.rankTrackingLocationName.trim().slice(0, 255)
    : legacy.name;
  const countryName = typeof website.rankTrackingCountryName === "string" && website.rankTrackingCountryName.trim()
    ? website.rankTrackingCountryName.trim().slice(0, 120)
    : legacyMarketsByCountry[countryCode]?.name || legacyMarkets[locationCode]?.name || countryCode;
  const languageCode = typeof website.rankTrackingLanguageCode === "string" && /^[a-z]{2,3}$/i.test(website.rankTrackingLanguageCode)
    ? website.rankTrackingLanguageCode.toLowerCase()
    : typeof website.targetLanguage === "string" && /^[a-z]{2,3}$/i.test(website.targetLanguage)
      ? website.targetLanguage.toLowerCase()
      : "en";
  const point = parseGeoPoint(website.rankTrackingLatitude, website.rankTrackingLongitude, website.rankTrackingRadiusKm);
  return { locationCode, locationName, countryCode, countryName, countryLocationCode, languageCode, ...(point ?? {}) };
}
