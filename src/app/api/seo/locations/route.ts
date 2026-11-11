import type { Db } from "mongodb";
import type { Collection } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { dataForSeoGet, isDataForSeoConfigured } from "@/lib/integrations/dataforseo";

type ProviderLanguage = { language_code: string; language_name: string; available_sources?: string[] };
type LocationRecord = { location_code: number; location_name: string; location_code_parent?: number | null; country_iso_code: string; location_type: string };
type CountryRecord = { locationCode: number; countryCode: string; name: string; languages: Array<{ code: string; name: string }> };
type CachedCatalog = { _id: string; fetchedAt: Date; entries: LocationRecord[] | CountryRecord[] };
const CACHE_TTL_MS = 14 * 24 * 60 * 60_000;

async function saveCatalog(collection: Collection<CachedCatalog>, cacheId: string, entries: CachedCatalog["entries"]) {
  const document = { fetchedAt: new Date(), entries };
  try {
    await collection.updateOne({ _id: cacheId }, { $set: document }, { upsert: true });
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) throw error;
    await collection.updateOne({ _id: cacheId }, { $set: document });
  }
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } });
}

function taskRecords(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || !Array.isArray((value as { tasks?: unknown[] }).tasks)) return [];
  const task = (value as { tasks: Array<{ result?: unknown }> }).tasks[0];
  return task && Array.isArray(task.result) ? task.result.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function normalizeLocation(row: Record<string, unknown>): LocationRecord | null {
  const code = Number(row.location_code);
  const name = typeof row.location_name === "string" ? row.location_name.trim().slice(0, 255) : "";
  const country = typeof row.country_iso_code === "string" ? row.country_iso_code.toUpperCase() : "";
  const type = typeof row.location_type === "string" ? row.location_type.slice(0, 40) : "";
  if (!Number.isSafeInteger(code) || code <= 0 || !name || !/^[A-Z]{2}$/.test(country) || !type) return null;
  const parent = row.location_code_parent === null ? null : Number(row.location_code_parent);
  return { location_code: code, location_name: name, location_code_parent: Number.isSafeInteger(parent) ? parent : null, country_iso_code: country, location_type: type };
}

async function loadCountries(db: Db) {
  const collection = db.collection<CachedCatalog>("seo_location_catalog");
  const cacheId = "dataforseo-labs-google-countries-v1";
  const cached = await collection.findOne({ _id: cacheId });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return cached.entries as CountryRecord[];
  const response = await dataForSeoGet("dataforseo_labs/locations_and_languages");
  const countries = taskRecords(response).flatMap((row) => {
    const countryCode = typeof row.country_iso_code === "string" ? row.country_iso_code.toUpperCase() : "";
    const name = typeof row.location_name === "string" ? row.location_name.trim().slice(0, 120) : "";
    const locationCode = Number(row.location_code);
    if (!/^[A-Z]{2}$/.test(countryCode) || !name || !Number.isSafeInteger(locationCode)) return [];
    const languages = Array.isArray(row.available_languages) ? (row.available_languages as ProviderLanguage[]).flatMap((language) => {
      const code = typeof language.language_code === "string" ? language.language_code.toLowerCase() : "";
      const languageName = typeof language.language_name === "string" ? language.language_name.slice(0, 80) : "";
      if (!/^[a-z]{2,3}$/.test(code) || !languageName || (Array.isArray(language.available_sources) && !language.available_sources.includes("google"))) return [];
      return [{ code, name: languageName }];
    }) : [];
    return [{ locationCode, countryCode, name, languages }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (!countries.length) throw new Error("SEO provider returned an empty country list.");
  await saveCatalog(collection, cacheId, countries);
  return countries;
}

async function loadLocations(db: Db, country: string) {
  const collection = db.collection<CachedCatalog>("seo_location_catalog");
  const cacheId = `dataforseo-google-serp-locations-${country}-v1`;
  const cached = await collection.findOne({ _id: cacheId });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return cached.entries as LocationRecord[];
  const response = await dataForSeoGet(`serp/google/locations/${country.toLowerCase()}`);
  const locations = taskRecords(response).flatMap((row) => {
    const location = normalizeLocation(row);
    return location && location.country_iso_code === country ? [location] : [];
  });
  if (!locations.length) throw new Error("SEO provider returned no search locations for this country.");
  await saveCatalog(collection, cacheId, locations);
  return locations;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Authentication required." }, 401);
  if (!isDataForSeoConfigured()) return json({ error: "Worldwide SEO locations require DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD." }, 503);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "countries";
  const country = (url.searchParams.get("country") || "").toUpperCase();
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (kind !== "countries" && kind !== "search") return json({ error: "Choose a supported location lookup." }, 400);
  if (kind === "search" && (!/^[A-Z]{2}$/.test(country) || query.length < 2)) return json({ error: "Choose a country and enter at least two characters." }, 400);
  const client = await clientPromise;
  const db = client.db();
  const rate = await consumeRateLimit(db, "seo-location-catalog", session.user.id, 120, 60 * 60_000);
  if (!rate.allowed) return json({ error: `Location search limit reached. Try again in ${rate.retryAfterSeconds} seconds.` }, 429);
  try {
    if (kind === "countries") return json({ countries: await loadCountries(db) });
    const countries = await loadCountries(db);
    if (!countries.some((item) => item.countryCode === country)) return json({ error: "This country is not currently supported by the configured search provider." }, 400);
    const search = query.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    const locations = (await loadLocations(db, country)).filter((item) => item.location_name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().includes(search));
    locations.sort((a, b) => {
      const left = a.location_name.toLocaleLowerCase(); const right = b.location_name.toLocaleLowerCase();
      const rank = (name: string) => name === search ? 0 : name.startsWith(search) ? 1 : name.includes(`,${search}`) ? 2 : 3;
      return rank(left) - rank(right) || a.location_name.localeCompare(b.location_name);
    });
    return json({ locations: locations.slice(0, 30) });
  } catch (error) {
    console.error("SEO location catalog request failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Search locations are temporarily unavailable. Check the SEO provider connection and try again." }, 502);
  }
}
