/**
 * Safe `response.json()` for browser code.
 *
 * When a route crashes, Next.js answers with an empty 500 body, and `response.json()` throws the cryptic
 * "Unexpected end of JSON input". This returns the parsed body when there is one, and otherwise an
 * `{ error }` object with a readable message, so callers' existing `payload.error` handling shows it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors Response.json(), which callers narrow with casts
export async function readJson(response: Response): Promise<any> {
  if (response.status === 401 && redirectToSignIn(response)) return { error: "Your session has ended. Taking you to sign in…" };
  const text = await response.text();
  if (text.trim()) {
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON (for example a platform error page); fall through to a readable message.
    }
  }
  if (response.status === 504) return { error: "The server took too long to respond. Please try again." };
  if (!response.ok) return { error: `Server error (${response.status}). Please try again in a moment.` };
  return { error: "The server sent an empty response. Please try again." };
}

/**
 * A 401 from this app's own API means the sign-in session ended while the page was open (expired, signed out in
 * another tab, or revoked). Send the person to sign in and back to the same page instead of showing raw errors.
 * Never redirects from the login page itself, and only once per page load.
 */
let redirecting = false;
function redirectToSignIn(response: Response) {
  if (typeof window === "undefined" || redirecting) return redirecting;
  try {
    const source = new URL(response.url || "", window.location.href);
    if (source.origin !== window.location.origin || !source.pathname.startsWith("/api/") || source.pathname.startsWith("/api/auth/")) return false;
    if (window.location.pathname.startsWith("/login")) return false;
  } catch { return false; }
  redirecting = true;
  const back = window.location.pathname + window.location.search;
  // Full page load on purpose: this helper runs outside React (no router), and a fresh load picks up the new session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.setTimeout(() => window.location.assign(`/login?callbackUrl=${encodeURIComponent(back)}`), 600);
  return true;
}
