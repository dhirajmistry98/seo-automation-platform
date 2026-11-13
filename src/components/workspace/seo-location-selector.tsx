"use client";

import { useEffect, useState } from "react";
import { Crosshair, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM } from "@/lib/seo/geo-target";
import type { SeoTarget } from "@/lib/seo/target";
import { readJson } from "@/lib/read-json";

type Language = { code: string; name: string };
type Country = { locationCode: number; countryCode: string; name: string; languages: Language[] };
type Location = { location_code: number; location_name: string; location_type: string; country_iso_code: string };
type Props = { value: SeoTarget; onChange: (target: SeoTarget) => void; hiddenPrefix?: string; label?: string };

export function SeoLocationSelector({ value, onChange, hiddenPrefix, label = "Search target" }: Props) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Location[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [accuracyMetres, setAccuracyMetres] = useState<number | null>(null);
  const hasPoint = typeof value.latitude === "number" && typeof value.longitude === "number";
  const country = countries.find((item) => item.countryCode === value.countryCode);
  const languageOptions = country?.languages.length
    ? (country.languages.some((item) => item.code === value.languageCode) ? country.languages : [{ code: value.languageCode, name: value.languageCode.toUpperCase() }, ...country.languages])
    : [{ code: value.languageCode || "en", name: value.languageCode || "English" }];

  useEffect(() => {
    let active = true;
    fetch("/api/seo/locations?kind=countries", { cache: "no-store" })
      .then(async (response) => {
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload.error || "Countries could not be loaded.");
        if (active) setCountries(Array.isArray(payload.countries) ? payload.countries : []);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Countries could not be loaded."); })
      .finally(() => { if (active) setLoadingCountries(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || !value.countryCode) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true); setError("");
      fetch(`/api/seo/locations?kind=search&country=${encodeURIComponent(value.countryCode)}&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = await readJson(response);
          if (!response.ok) throw new Error(payload.error || "Locations could not be loaded.");
          if (active) setMatches(Array.isArray(payload.locations) ? payload.locations : []);
        })
        .catch((caught) => { if (active) { setMatches([]); setError(caught instanceof Error ? caught.message : "Locations could not be loaded."); } })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, value.countryCode]);

  /** The target without an exact point (choosing a country or city replaces the live location). */
  function withoutPoint(target: SeoTarget): SeoTarget {
    const { latitude: _latitude, longitude: _longitude, radiusKm: _radiusKm, ...rest } = target;
    void _latitude; void _longitude; void _radiusKm;
    return rest;
  }

  /** Like Google: ask the browser for the device's precise position (GPS on phones, Wi-Fi on laptops). */
  function requestLiveLocation() {
    if (!("geolocation" in navigator)) { setError("This browser cannot share its location."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setAccuracyMetres(Math.round(position.coords.accuracy));
        onChange({
          ...value,
          locationCode: value.countryLocationCode,
          locationName: "Your live location",
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
          radiusKm: value.radiusKm ?? DEFAULT_RADIUS_KM,
        });
        setQuery(""); setMatches([]);
      },
      (failure) => {
        setLocating(false);
        setError(failure.code === failure.PERMISSION_DENIED
          ? "Location permission was blocked. Allow location for this site in your browser's address bar, then try again."
          : failure.code === failure.TIMEOUT
            ? "Finding your location took too long. Try again, or search for a city instead."
            : "Your location could not be determined. Try again, or search for a city instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function clearLiveLocation() {
    setAccuracyMetres(null);
    onChange({ ...withoutPoint(value), locationCode: value.countryLocationCode, locationName: value.countryName });
  }

  function changeCountry(countryCode: string) {
    const next = countries.find((item) => item.countryCode === countryCode);
    if (!next) return;
    const language = next.languages.find((item) => item.code === value.languageCode) || next.languages.find((item) => item.code === "en") || next.languages[0];
    setAccuracyMetres(null);
    onChange({ locationCode: next.locationCode, locationName: next.name, countryCode: next.countryCode, countryName: next.name, countryLocationCode: next.locationCode, languageCode: language?.code || "en" });
    setQuery(""); setMatches([]); setError("");
  }

  function selectLocation(location: Location) {
    const selectedCountry = countries.find((item) => item.countryCode === location.country_iso_code);
    setAccuracyMetres(null);
    onChange({ ...withoutPoint(value), locationCode: location.location_code, locationName: location.location_name, countryCode: location.country_iso_code, countryName: selectedCountry?.name || value.countryName, countryLocationCode: selectedCountry?.locationCode || value.countryLocationCode });
    setQuery(""); setMatches([]); setError("");
  }

  function changeLanguage(languageCode: string) {
    onChange({ ...value, languageCode });
  }

  return <div className="seo-location-selector">
    {hiddenPrefix && <>
      <input type="hidden" name={`${hiddenPrefix}LocationCode`} value={value.locationCode} />
      <input type="hidden" name={`${hiddenPrefix}LocationName`} value={value.locationName} />
      <input type="hidden" name={`${hiddenPrefix}CountryCode`} value={value.countryCode} />
      <input type="hidden" name={`${hiddenPrefix}CountryName`} value={value.countryName} />
      <input type="hidden" name={`${hiddenPrefix}CountryLocationCode`} value={value.countryLocationCode} />
      <input type="hidden" name={`${hiddenPrefix}LanguageCode`} value={value.languageCode} />
      <input type="hidden" name={`${hiddenPrefix}Latitude`} value={hasPoint ? String(value.latitude) : ""} />
      <input type="hidden" name={`${hiddenPrefix}Longitude`} value={hasPoint ? String(value.longitude) : ""} />
      <input type="hidden" name={`${hiddenPrefix}RadiusKm`} value={hasPoint ? String(value.radiusKm ?? DEFAULT_RADIUS_KM) : ""} />
    </>}
    <div className="seo-location-controls">
      <label>Country<select value={value.countryCode} onChange={(event) => changeCountry(event.target.value)} disabled={loadingCountries || !countries.length}>
        {loadingCountries && <option value={value.countryCode}>Loading countries…</option>}
        {!loadingCountries && !countries.length && <option value={value.countryCode}>Provider list unavailable</option>}
        {!loadingCountries && countries.length > 0 && !country && <option value={value.countryCode}>{value.countryCode} · saved target</option>}
        {countries.map((item) => <option key={item.countryCode} value={item.countryCode}>{item.name}</option>)}
      </select></label>
      <label className="seo-location-search-label">{label}<span className="seo-location-searchbox"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); if (next.trim().length < 2) { setMatches([]); setSearching(false); setError(""); } }} placeholder={country ? `Search a city or region in ${country.name}` : "Choose a country first"} minLength={2} maxLength={100} autoComplete="off" /><span aria-live="polite">{searching && <LoaderCircle size={14} className="seo-location-spinner" />}</span></span></label>
      <label>Language<select value={value.languageCode} onChange={(event) => changeLanguage(event.target.value)} disabled={!country?.languages.length}>
        {languageOptions.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
      </select></label>
    </div>
    <div className="seo-location-live">
      <button type="button" className="seo-location-live-button" onClick={requestLiveLocation} disabled={locating} data-no-loader>
        {locating ? <LoaderCircle size={14} className="seo-location-spinner" aria-hidden="true" /> : <Crosshair size={14} aria-hidden="true" />}
        {locating ? "Finding your location…" : hasPoint ? "Update live location" : "Use my live location"}
      </button>
      {hasPoint && <label className="seo-location-radius">Radius<select value={value.radiusKm ?? DEFAULT_RADIUS_KM} onChange={(event) => onChange({ ...value, radiusKm: Number(event.target.value) })}>
        {RADIUS_OPTIONS_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
      </select></label>}
    </div>
    {hasPoint ? (
      <div className="seo-location-selected is-live">
        <Crosshair size={14} aria-hidden="true" />
        <span>Your live location</span>
        <small>
          {value.latitude?.toFixed(5)}, {value.longitude?.toFixed(5)} · {value.radiusKm ?? DEFAULT_RADIUS_KM} km radius{accuracyMetres !== null ? ` · accurate to ~${accuracyMetres} m` : ""} ·{" "}
          <a href={`https://www.google.com/maps?q=${value.latitude},${value.longitude}`} target="_blank" rel="noreferrer">View on Google Maps</a>
        </small>
        <button type="button" className="seo-location-clear" onClick={clearLiveLocation} aria-label="Stop using live location" data-no-loader><X size={13} aria-hidden="true" /></button>
      </div>
    ) : (
      <div className="seo-location-selected"><MapPin size={14} aria-hidden="true" /><span>{value.locationName || country?.name || "Choose a search location"}</span><small>{value.locationName && country ? `${country.name} · ${value.locationCode === value.countryLocationCode ? "country" : "local area"}` : "Select a country, search a city, or use your live location"}</small></div>
    )}
    {hasPoint && <p className="seo-location-message" role="status">Rank checks use results as seen from this exact spot, like a searcher standing there. Keyword volumes stay country-wide ({country?.name || value.countryName}); make sure that country matches where you are.</p>}
    {error && <p className="seo-location-message is-error" role="status">{error}</p>}
    {query.trim().length === 1 && <p className="seo-location-message" role="status">Enter at least two characters to search locations.</p>}
    {matches.length > 0 && <ul className="seo-location-results" aria-label="Matching locations">{matches.map((item) => <li key={`${item.location_code}-${item.location_name}`}><button type="button" onClick={() => selectLocation(item)}><MapPin size={14} aria-hidden="true" /><span>{item.location_name}</span><small>{item.location_type}</small></button></li>)}</ul>}
    {query.trim().length >= 2 && !searching && !error && matches.length === 0 && <p className="seo-location-message" role="status">No provider location matches “{query.trim()}”. Try another spelling or choose the country itself.</p>}
  </div>;
}

export function WebsiteSeoLocationField({ initialTarget }: { initialTarget: SeoTarget }) {
  const [target, setTarget] = useState(initialTarget);
  return <SeoLocationSelector value={target} onChange={setTarget} hiddenPrefix="rankTracking" label="City, region, or local area" />;
}
