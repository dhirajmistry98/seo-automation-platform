"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { LocationInput } from "@/components/marketplace/location-input";
import { readJson } from "@/lib/read-json";

const CATEGORIES = [
  { value: "startup", label: "Startup" },
  { value: "small_business", label: "Small business" },
  { value: "local_business", label: "Local business" },
  { value: "ecommerce", label: "E-commerce brand" },
  { value: "established_company", label: "Established company" },
  { value: "marketing_agency", label: "Marketing agency" },
  { value: "enterprise", label: "Enterprise" },
];

/** Minimal brand setup so a first-time buyer can book a creator without leaving the page. */
export function QuickBrandForm({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/marketplace/v1/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          category: form.get("category"),
          location: form.get("location"),
          offerings: String(form.get("offerings") || "").split(",").map((item) => item.trim()).filter(Boolean),
          description: "",
          website: "",
        }),
      });
      const payload = await readJson(response) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your brand could not be created. Please check the details and try again.");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your brand could not be created. Please try again.");
    } finally { setBusy(false); }
  }

  return <form className="marketplace-form mp-quick-brand" onSubmit={(event) => void submit(event)}>
    <div className="mp-quick-brand-head"><strong>Who is booking?</strong><p>Tell creators who you are. This takes under a minute and you can add more details later.</p></div>
    {error && <p className="marketplace-form-note" role="alert">{error}</p>}
    <label className="marketplace-field"><span>Brand or business name</span><input name="name" required minLength={2} maxLength={100} placeholder="e.g. Green Leaf Cafe" autoComplete="organization" /></label>
    <label className="marketplace-field"><span>Type of business</span><select name="category" required defaultValue="">{<><option value="" disabled>Choose one</option>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>}</select></label>
    <label className="marketplace-field"><span>City</span><LocationInput name="location" required placeholder="City, State" /></label>
    <label className="marketplace-field"><span>What do you sell?</span><input name="offerings" required maxLength={300} placeholder="e.g. coffee, desserts, catering (separate with commas)" /></label>
    <button className="marketplace-primary" disabled={busy}>{busy ? "Saving…" : "Save and continue"} <ArrowRight size={16} aria-hidden="true" /></button>
  </form>;
}
