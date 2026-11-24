/** Free, provider-independent research helpers (Search Console data, CSV export, input checks). */

export type SearchDevice = "desktop" | "mobile";

export function normalizeSearchDevice(value: unknown): SearchDevice {
  return value === "mobile" ? "mobile" : "desktop";
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

export type GscRow = { keys?: string[]; clicks?: number; impressions?: number; position?: number };

/**
 * Keyword cannibalization from the site's own Search Console data: queries where two or more of its pages
 * each earn a meaningful share (at least 10%) of the impressions, so the pages compete with each other.
 */
export function findCannibalization(rows: GscRow[], minImpressions = 10) {
  const byQuery = new Map<string, Array<{ page: string; clicks: number; impressions: number; position: number }>>();
  for (const row of rows) {
    const [query, page] = row.keys || [];
    if (!query || !page) continue;
    const list = byQuery.get(query) || [];
    list.push({ page, clicks: row.clicks || 0, impressions: row.impressions || 0, position: Math.round((row.position || 0) * 10) / 10 });
    byQuery.set(query, list);
  }
  const results: Array<{ keyword: string; impressions: number; clicks: number; pages: Array<{ page: string; clicks: number; impressions: number; position: number; share: number }> }> = [];
  for (const [keyword, pages] of byQuery) {
    const impressions = pages.reduce((sum, page) => sum + page.impressions, 0);
    if (impressions < minImpressions) continue;
    const competing = pages
      .map((page) => ({ ...page, share: Math.round((page.impressions / impressions) * 1000) / 10 }))
      .filter((page) => page.share >= 10)
      .sort((a, b) => b.impressions - a.impressions);
    if (competing.length >= 2) results.push({ keyword, impressions, clicks: pages.reduce((sum, page) => sum + page.clicks, 0), pages: competing.slice(0, 5) });
  }
  return results.sort((a, b) => b.impressions - a.impressions).slice(0, 200);
}

export function reportCsv(rows: Array<Record<string, unknown>>) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Neutralise spreadsheet formulas in exported text.
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
}
