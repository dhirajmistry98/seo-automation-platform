function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function isVerifiedGoogleSignIn(profile: unknown, userEmail: unknown) {
  if (!profile || typeof profile !== "object") return false;
  const googleProfile = profile as { email_verified?: unknown; email?: unknown };
  const profileEmail = normalizeEmail(googleProfile.email);
  const normalizedUserEmail = normalizeEmail(userEmail);
  return googleProfile.email_verified === true && Boolean(profileEmail && profileEmail === normalizedUserEmail);
}
