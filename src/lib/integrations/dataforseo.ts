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

/** Optional paid data provider. Free research features (keywords, questions, rank, cannibalization) work without it. */
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
export type DataForSeoAccountIssue = "unverified" | "bad_credentials" | "no_balance" | "rate_limited";

/** Where the account owner fixes each problem. */
export const DATAFORSEO_DASHBOARD_URL = "https://app.dataforseo.com/";

export class DataForSeoAccountError extends Error {
  providerCode: number;
  reason: DataForSeoAccountIssue;
  constructor(message: string, providerCode: number, reason: DataForSeoAccountIssue) {
    super(message);
    this.name = "DataForSeoAccountError";
    this.providerCode = providerCode;
    this.reason = reason;
  }
}

function accountError(statusCode: number | undefined, httpStatus: number) {
  const code = Number(statusCode) || 0;
  if (code === 40104) return new DataForSeoAccountError("Your DataForSEO account is not verified yet. Complete verification at app.dataforseo.com, then try again.", code, "unverified");
  if (code === 40100 || code === 40101 || httpStatus === 401) return new DataForSeoAccountError("DataForSEO rejected the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (use the API password from app.dataforseo.com, not your account password).", code, "bad_credentials");
  if (code === 40202 || code === 40209 || httpStatus === 429) return new DataForSeoAccountError("DataForSEO rate limit reached. Wait a minute and try again.", code, "rate_limited");
  if ((code >= 40200 && code < 40300) || httpStatus === 402) return new DataForSeoAccountError("Your DataForSEO balance is too low. Add funds at app.dataforseo.com, then try again.", code, "no_balance");
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

function bareHost(value: unknown) {
  let candidate = typeof value === "string" ? value : "";
  if (candidate.includes("/")) { try { candidate = new URL(candidate).hostname; } catch { candidate = ""; } }
  return candidate.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host: string, domain: string) { return Boolean(host) && (host === domain || host.endsWith(`.${domain}`)); }

function itemHost(item: Record<string, unknown>) { return bareHost(item.domain) || bareHost(item.url); }

/** Every AI Overview citation inside a SERP item, wherever the provider nests it. */
function aiOverviewReferences(item: unknown, found: Array<Record<string, unknown>> = [], depth = 0): Array<Record<string, unknown>> {
  if (!item || typeof item !== "object" || depth > 6) return found;
  if (Array.isArray(item)) { for (const entry of item) aiOverviewReferences(entry, found, depth + 1); return found; }
  const record = item as Record<string, unknown>;
  if (record.type === "ai_overview_reference" || (depth > 0 && typeof record.url === "string" && typeof record.source === "string")) found.push(record);
  for (const [key, value] of Object.entries(record)) if (key === "references" || key === "items") aiOverviewReferences(value, found, depth + 1);
  return found;
}

/**
 * One row per keyword: the website's best organic result plus Position Tracking extras from the same SERP
 * (no extra provider calls): saved competitors' positions, SERP features shown, AI Overview presence and
 * citation, and every URL of the website that ranks (two or more is keyword cannibalization).
 */
export function buildDomainRankRows(tasks: NonNullable<DataForSeoResponse["tasks"]>, keywords: string[], websiteDomain: string, competitorDomains: string[] = []) {
  const domain = bareHost(websiteDomain);
  const competitors = [...new Set(competitorDomains.map(bareHost).filter((value) => value && value !== domain))].slice(0, 20);
  return keywords.map((keyword, index) => {
    const entries = tasks[index]?.result || [];
    const allItems = entries.flatMap((entry) => entry.items || []);
    const organicItems = allItems.filter((item) => item.type === undefined || item.type === "organic");
    const ownResults = organicItems.filter((item) => hostMatches(itemHost(item), domain));
    const matching = ownResults[0];
    const competitorPositions: Record<string, number | null> = {};
    for (const competitor of competitors) {
      const hit = organicItems.find((item) => hostMatches(itemHost(item), competitor));
      competitorPositions[competitor] = hit && typeof hit.rank_group === "number" ? hit.rank_group : null;
    }
    const features = [...new Set(entries.flatMap((entry) => Array.isArray(entry.item_types) ? entry.item_types.filter((type): type is string => typeof type === "string") : []))];
    const overview = allItems.find((item) => item.type === "ai_overview");
    const references = overview ? aiOverviewReferences(overview) : [];
    const citation = references.find((reference) => hostMatches(bareHost(reference.domain) || bareHost(reference.url), domain));
    const extras = {
      competitor_positions: competitorPositions,
      serp_features: features.filter((type) => type !== "organic"),
      ai_overview: { present: Boolean(overview) || features.includes("ai_overview"), cited: Boolean(citation), cited_url: typeof citation?.url === "string" ? citation.url : null },
      own_urls: [...new Set(ownResults.map((item) => item.url).filter((url): url is string => typeof url === "string"))].slice(0, 5),
    };
    return matching ? { keyword, ...matching, ...extras } : { keyword, rank_group: null, rank_absolute: null, url: null, title: null, domain: null, ...extras };
  });
}

export type DataForSeoAccountStatus =
  | { state: "ready"; balance: number | null }
  | { state: "not_configured" }
  | { state: "unavailable"; message: string }
  | { state: DataForSeoAccountIssue; message: string };

const globalForProviderStatus = globalThis as typeof globalThis & { dataForSeoStatus?: { at: number; value: DataForSeoAccountStatus } };
const STATUS_CACHE_MS = 60_000;

/**
 * Checks the DataForSEO account with free endpoints (no report charge): verification/login, then balance.
 * Cached for a minute per server instance; pass `fresh` after the user says they fixed the account.
 */
export async function getDataForSeoAccountStatus(fresh = false): Promise<DataForSeoAccountStatus> {
  if (!isDataForSeoConfigured()) return { state: "not_configured" };
  const cached = globalForProviderStatus.dataForSeoStatus;
  if (!fresh && cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.value;
  let value: DataForSeoAccountStatus;
  try {
    // appendix/user_data answers even for unverified accounts, so first probe a small free endpoint
    // that DataForSEO blocks until the account is verified (it also catches wrong credentials).
    await dataForSeoGet("serp/google/languages");
    const result = await dataForSeoGet("appendix/user_data");
    const money = (result.tasks?.[0]?.result?.[0] as { money?: { balance?: unknown } } | undefined)?.money;
    const balance = typeof money?.balance === "number" ? money.balance : null;
    value = balance !== null && balance <= 0
      ? { state: "no_balance", message: "Your DataForSEO balance is empty. Add funds at app.dataforseo.com, then try again." }
      : { state: "ready", balance };
  } catch (error) {
    value = error instanceof DataForSeoAccountError
      ? { state: error.reason, message: error.message }
      : { state: "unavailable", message: "DataForSEO could not be reached. Try again in a moment." };
  }
  globalForProviderStatus.dataForSeoStatus = { at: Date.now(), value };
  return value;
}
