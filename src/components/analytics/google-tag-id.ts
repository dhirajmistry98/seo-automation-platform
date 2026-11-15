/** Default Google tag: the GA4 measurement ID. NEXT_PUBLIC_GOOGLE_TAG_ID overrides it (a GTM- container also works); "off" disables it. */
export const DEFAULT_GOOGLE_TAG_ID = "G-1FYHM8LV25";

/** Strictly validated tag ID, or null. The ID is interpolated into a script URL, so nothing else may pass. */
export function googleTagId(value: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID) {
  const id = (value ?? DEFAULT_GOOGLE_TAG_ID).trim().toUpperCase();
  return /^(GTM|GT|G)-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}
