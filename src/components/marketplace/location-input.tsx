"use client";

import { useId, useState } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import { INDIA_CITIES } from "@/lib/marketplace/india-cities";

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
};

/** Reverse-geocode in the browser after the user allows location access. Returns "City, State". */
async function currentCity(): Promise<string> {
  if (!("geolocation" in navigator)) throw new Error("Location is not available in this browser.");
  const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 }))
    .catch((error: GeolocationPositionError) => { throw new Error(error.code === 1 ? "Location permission was denied. Allow it in your browser settings or type your city." : "Your location could not be found. Type your city instead."); });
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.search = new URLSearchParams({ latitude: position.coords.latitude.toFixed(4), longitude: position.coords.longitude.toFixed(4), localityLanguage: "en" }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const data = response?.ok ? await response.json().catch(() => null) as { city?: string; locality?: string; principalSubdivision?: string } | null : null;
  const city = (data?.city || data?.locality || "").trim();
  const state = (data?.principalSubdivision || "").trim();
  if (!city) throw new Error("Your city could not be identified. Type it instead.");
  return (state && state !== city ? `${city}, ${state}` : city).slice(0, 80);
}

/**
 * Location field with Indian city suggestions and a "use my current location" button.
 * Works controlled (value/onChange) or inside a plain form (name/defaultValue).
 */
export function LocationInput({ value, onChange, defaultValue = "", name, placeholder = "City, State", required, maxLength = 80, className }: Props) {
  const listId = useId();
  const [inner, setInner] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const current = value ?? inner;
  const set = (next: string) => { if (onChange) onChange(next); if (value === undefined) setInner(next); };

  async function locate() {
    setBusy(true); setHint("");
    try { set(await currentCity()); }
    catch (error) { setHint(error instanceof Error ? error.message : "Your location could not be found."); }
    finally { setBusy(false); }
  }

  return <span className={`mp-location-input${className ? ` ${className}` : ""}`}>
    <span className="mp-location-row">
      <input name={name} value={current} onChange={(event) => set(event.target.value)} list={listId} placeholder={placeholder} required={required} maxLength={maxLength} autoComplete="address-level2" />
      <button type="button" className="mp-locate-button" onClick={locate} disabled={busy} aria-label="Use my current location" title="Use my current location">
        {busy ? <LoaderCircle size={16} className="site-spin" aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
      </button>
    </span>
    <datalist id={listId}>{INDIA_CITIES.map((city) => <option key={city} value={city} />)}</datalist>
    {hint && <small className="mp-location-hint" role="status">{hint}</small>}
  </span>;
}
