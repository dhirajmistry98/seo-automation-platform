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
 * Location field that suggests Indian cities as "City, State" while typing, so saved locations are consistent.
 * Works controlled (value/onChange) or inside a plain form (name/defaultValue).
 */
export function LocationInput({ value, onChange, defaultValue = "", name, placeholder = "City, State", required, maxLength = 80, className }: Props) {
  const listId = useId();
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const set = (next: string) => { if (onChange) onChange(next); if (value === undefined) setInner(next); };

  return <span className={`mp-location-input${className ? ` ${className}` : ""}`}>
    <input name={name} value={current} onChange={(event) => set(event.target.value)} list={listId} placeholder={placeholder} required={required} maxLength={maxLength} autoComplete="address-level2" />
    <datalist id={listId}>{INDIA_CITIES.map((city) => <option key={city} value={city} />)}</datalist>
  </span>;
}
