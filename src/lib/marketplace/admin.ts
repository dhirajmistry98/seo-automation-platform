// The only accounts allowed into any admin area. Deliberately fixed in code, not read from an environment variable.
const ADMIN_EMAILS = new Set(["dhirajmistry1368@gmail.com", "dhirajmistry6930@gmail.com"]);

export function isMarketplaceAdmin(email?: string | null) {
  return typeof email === "string" && ADMIN_EMAILS.has(email.trim().toLowerCase());
}
