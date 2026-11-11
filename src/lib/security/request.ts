export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : new URL(request.url).origin;
    return new URL(origin).origin === configuredOrigin;
  } catch {
    return false;
  }
}

export function sameOriginError() {
  return Response.json({ error: "This request must come from the signed-in application." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export function requestClientIp(request: Request) {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!header || !/^[a-z0-9-]{1,64}$/.test(header)) return "unknown";
  const candidate = request.headers.get(header)?.trim() || "";
  return isIP(candidate) ? candidate : "unknown";
}

export function isAllowedBodySize(request: Request, maximumBytes: number) {
  const header = request.headers.get("content-length");
  if (header === null) return true;
  const length = Number(header);
  return Number.isSafeInteger(length) && length >= 0 && length <= maximumBytes;
}

export async function readJsonLimited<T>(request: Request, maximumBytes: number): Promise<{ ok: true; value: T } | { ok: false; status: 400 | 413 }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false, status: 400 };
  if (!isAllowedBodySize(request, maximumBytes)) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(joined)) as T };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function readTextLimited(response: Response, maximumBytes: number) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
    await response.body?.cancel();
    throw new Error("Response exceeds the configured size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("Response exceeds the configured size limit.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}
import { isIP } from "node:net";

