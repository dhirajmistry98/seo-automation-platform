type DataForSeoResponse = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: Array<Record<string, unknown>>; [key: string]: unknown }>;
  }>;
};

const baseUrl = "https://api.dataforseo.com/v3";

export type SearchDevice = "desktop" | "mobile";

export function normalizeSearchDevice(value: unknown): SearchDevice {
  return value === "mobile" ? "mobile" : "desktop";
}

export function isDataForSeoConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim());
}


export function normalizeResearchDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().slice(0, 300);
  if (!input || input.includes("@")) return null;
  let parsed: URL;
  try {
    parsed = new URL(input.includes("://") ? input : "https://" + input);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) return null;
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || !host.includes(".") || host === "localhost") return null;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return null;
  return host;
}


// Google location catalogs can contain tens of thousands of records for one
// country. Keep a hard response cap while allowing country-scoped catalogs.
const MAX_DATAFORSEO_RESPONSE_BYTES = 16 * 1024 * 1024;

export async function readDataForSeoResponse(response: Response): Promise<DataForSeoResponse> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_DATAFORSEO_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new Error("Response exceeds the configured size limit.");
  }
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_DATAFORSEO_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Response exceeds the configured size limit.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined)) as DataForSeoResponse;
  } catch {
    throw new Error("SEO research provider returned invalid JSON.");
  }
}

/** Account-level DataForSEO problems an admin must fix in the DataForSEO dashboard (not a temporary outage). */
export class DataForSeoAccountError extends Error {
  providerCode: number;
  constructor(message: string, providerCode: number) {
    super(message);
    this.name = "DataForSeoAccountError";
    this.providerCode = providerCode;
  }
}

function accountError(statusCode: number | undefined, httpStatus: number) {
  const code = Number(statusCode) || 0;
  if (code === 40104) return new DataForSeoAccountError("Your DataForSEO account is not verified yet. Complete verification at app.dataforseo.com, then try again.", code);
  if (code === 40100 || code === 40101 || httpStatus === 401) return new DataForSeoAccountError("DataForSEO rejected the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (use the API password from app.dataforseo.com, not your account password).", code);
  if (code === 40202 || code === 40209 || httpStatus === 429) return new DataForSeoAccountError("DataForSEO rate limit reached. Wait a minute and try again.", code);
  if ((code >= 40200 && code < 40300) || httpStatus === 402) return new DataForSeoAccountError("Your DataForSEO balance is too low. Add funds at app.dataforseo.com, then try again.", code);
  return null;
}

export async function dataForSeoPost(path: string, payload: Array<Record<string, unknown>>) {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new Error("SEO research is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the server environment.");
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("SEO research provider returned an unexpected redirect.");
  let result: DataForSeoResponse;
  try { result = await readDataForSeoResponse(response); }
  catch { throw new Error("SEO research provider returned an invalid or oversized response."); }
  if (!response.ok || (result.status_code && result.status_code >= 40000)) {
    throw accountError(result.status_code, response.status) ?? new Error("SEO research provider request failed. Check the provider account, API balance, and request settings.");
  }
  const failedTask = result.tasks?.find((task) => task.status_code && task.status_code >= 40000);
  if (failedTask) throw new Error("SEO research provider could not complete the request. Check the location, language, and account limits.");
  return result;
}

export async function dataForSeoGet(path: string) {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new Error("SEO research is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the server environment.");
  if (!/^[a-z0-9/_-]+$/i.test(path) || path.startsWith("/") || path.includes("..")) throw new Error("Invalid SEO provider endpoint.");
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("SEO research provider returned an unexpected redirect.");
  let result: DataForSeoResponse;
  try { result = await readDataForSeoResponse(response); }
  catch { throw new Error("SEO research provider returned an invalid or oversized response."); }
  if (!response.ok || (result.status_code && result.status_code >= 40000)) throw accountError(result.status_code, response.status) ?? new Error("SEO research provider request failed. Check the provider account and API access.");
  const failedTask = result.tasks?.find((task) => task.status_code && task.status_code >= 40000);
  if (failedTask) throw new Error("SEO research provider could not load its location catalog.");
  return result;
}

export function getProviderItems(result: DataForSeoResponse): Array<Record<string, unknown>> {
  return result.tasks?.flatMap((task) => task.result?.flatMap((entry) => (entry.items || []).map((item) => ({ ...(typeof entry.target === "string" ? { target: entry.target } : {}), ...item }))) || []) || [];
}

export function buildDomainRankRows(tasks: NonNullable<DataForSeoResponse["tasks"]>, keywords: string[], websiteDomain: string) {
  const domain = websiteDomain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return keywords.map((keyword, index) => {
    const organicItems = tasks[index]?.result?.flatMap((entry) => entry.items || []) || [];
    const matching = organicItems.find((item) => {
      let candidate = typeof item.domain === "string" ? item.domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") : "";
      if (!candidate && typeof item.url === "string") {
        try { candidate = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); } catch {}
      }
      return candidate === domain || candidate.endsWith(`.${domain}`);
    });
    return matching ? { keyword, ...matching } : { keyword, rank_group: null, rank_absolute: null, url: null, title: null, domain: null };
  });
}

