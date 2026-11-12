/**
 * Exact-point ("live location") search targets for local SEO.
 *
 * Google personalises local results by the searcher's precise position. DataForSEO's live SERP endpoints accept
 * `location_coordinate: "latitude,longitude,radius"` instead of a `location_code`, so a rank check can run from a
 * specific street rather than a whole city. Keyword-volume endpoints (DataForSEO Labs) only support country codes,
 * so they keep using the country.
 */

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 25] as const;
export const DEFAULT_RADIUS_KM = 2;

export type GeoPoint = { latitude: number; longitude: number; radiusKm: number };

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** Validates a latitude/longitude/radius triple from a form or JSON body. Returns null when absent or invalid. */
export function parseGeoPoint(latitude: unknown, longitude: unknown, radiusKm: unknown): GeoPoint | null {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const radius = toNumber(radiusKm);
  const safeRadius = Number.isFinite(radius) ? Math.min(100, Math.max(0.2, radius)) : DEFAULT_RADIUS_KM;
  // 7 decimals is ~1 cm, DataForSEO's maximum precision.
  return { latitude: Number(lat.toFixed(7)), longitude: Number(lng.toFixed(7)), radiusKm: safeRadius };
}

/** DataForSEO `location_coordinate` value: "latitude,longitude,radius" with the radius in metres (200 m – 199.999 km). */
export function dataForSeoCoordinate(point: GeoPoint) {
  const metres = Math.round(Math.min(199_999, Math.max(200, point.radiusKm * 1000)));
  return `${point.latitude},${point.longitude},${metres}`;
}

/** Location fields for a DataForSEO live SERP task: the exact point when one is set, otherwise the location code. */
export function serpLocation(locationCode: number, point: GeoPoint | null) {
  return point ? { location_coordinate: dataForSeoCoordinate(point) } : { location_code: locationCode };
}

export function describeGeoPoint(point: GeoPoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · ${point.radiusKm} km radius`;
}
