"use client";

import { useId, useState } from "react";
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

/**
 * Location field that suggests matching Indian cities as "City, State" once the user types 2+ letters, so saved locations are consistent.
 * Works controlled (value/onChange) or inside a plain form (name/defaultValue).
 */
export function LocationInput({ value, onChange, defaultValue = "", name, placeholder = "City, State", required, maxLength = 80, className }: Props) {
  const listId = useId();
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const set = (next: string) => { if (onChange) onChange(next); if (value === undefined) setInner(next); };
  // Browsers open the whole list on focus when an input has suggestions; only attach them once the user types,
  // so an empty field shows nothing and typing shows matching cities only.
  const showSuggestions = current.trim().length >= 2;

  return <span className={`mp-location-input${className ? ` ${className}` : ""}`}>
    <input name={name} value={current} onChange={(event) => set(event.target.value)} list={showSuggestions ? listId : undefined} placeholder={placeholder} required={required} maxLength={maxLength} autoComplete="address-level2" />
    {showSuggestions && <datalist id={listId}>{INDIA_CITIES.map((city) => <option key={city} value={city} />)}</datalist>}
  </span>;
}
