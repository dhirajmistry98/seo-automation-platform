/** Default Google tag (Tag Manager container). NEXT_PUBLIC_GOOGLE_TAG_ID overrides it; "off" disables it. */
export const DEFAULT_GOOGLE_TAG_ID = "GTM-K6328NKS";

/** Strictly validated tag ID, or null. The ID is interpolated into a script URL, so nothing else may pass. */
export function googleTagId(value: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID) {
  const id = (value ?? DEFAULT_GOOGLE_TAG_ID).trim().toUpperCase();
  return /^(GTM|GT|G)-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}
