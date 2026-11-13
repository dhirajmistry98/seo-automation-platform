/**
 * Safe `response.json()` for browser code.
 *
 * When a route crashes, Next.js answers with an empty 500 body, and `response.json()` throws the cryptic
 * "Unexpected end of JSON input". This returns the parsed body when there is one, and otherwise an
 * `{ error }` object with a readable message, so callers' existing `payload.error` handling shows it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors Response.json(), which callers narrow with casts
export async function readJson(response: Response): Promise<any> {
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
