/**
 * Instagram username a creator claims on their profile. It is only a claim until Meta login proves the
 * creator controls that exact account (see the Meta callback), so it is never shown as verified on its own.
 */
export function normalizeInstagramHandle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim();
  // Accept a pasted profile link: https://www.instagram.com/name/ or instagram.com/name?igsh=…
  const link = value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)/i);
  if (link) value = link[1];
  value = value.replace(/^@/, "").toLowerCase();
  // Instagram rules: 1-30 letters, numbers, periods, underscores; no leading/trailing or doubled period.
  return /^[a-z0-9._]{1,30}$/.test(value) && !value.startsWith(".") && !value.endsWith(".") && !value.includes("..") ? value : null;
}

/** Whether the account Meta logged in as is the one the creator claimed. */
export function instagramHandleMatches(claimed: unknown, verifiedUsername: unknown) {
  const a = normalizeInstagramHandle(claimed);
  const b = normalizeInstagramHandle(verifiedUsername);
  return Boolean(a && b && a === b);
}
