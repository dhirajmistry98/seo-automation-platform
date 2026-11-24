/** Pure helpers for importing and exporting a website's keyword list. */
export const MAX_KEYWORDS = 30;
export const MAX_IMPORT_CHARS = 100_000;

/** Neutralise spreadsheet formulas (CSV injection) and control characters. */
export function cleanKeyword(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  let text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/^[=+\-@]+\s*/, "");
  return text.slice(0, 80);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === "," || char === "\t" || char === ";") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      if (rows.length >= 5000) break;
    } else cell += char;
  }
  row.push(cell);
  if (row.some((c) => c.trim()) && rows.length < 5000) rows.push(row);
  return rows;
}

const KEYWORD_HEADERS = ["keyword", "keywords", "query", "queries", "top queries", "search term", "term"];

/** Reads keywords from JSON (array / {primaryKeywords} / array of objects) or CSV/plain lines. */
export function parseKeywords(input: string): string[] {
  const text = input.slice(0, MAX_IMPORT_CHARS).trim();
  if (!text) return [];
  let raw: unknown[] = [];
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text) as unknown;
      const list = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).primaryKeywords ?? (data as Record<string, unknown>).keywords : []);
      raw = (Array.isArray(list) ? list : []).map((item) => {
        if (item && typeof item === "object") { const o = item as Record<string, unknown>; return o.keyword ?? o.query ?? o.term ?? ""; }
        return item;
      });
    } catch { return []; }
  } else {
    const rows = parseCsvRows(text);
    if (!rows.length) return [];
    // Our own export: "type,value" rows. Only the keyword rows are keywords.
    if (rows[0].length >= 2 && rows[0][0].trim().toLowerCase() === "type" && rows[0][1].trim().toLowerCase() === "value") {
      raw = rows.slice(1).filter((r) => (r[0] ?? "").trim().toLowerCase() === "keyword").map((r) => r[1] ?? "");
      return dedupe(raw);
    }
    const headerIndex = rows[0].findIndex((cell) => KEYWORD_HEADERS.includes(cell.trim().toLowerCase()));
    const column = headerIndex >= 0 ? headerIndex : 0;
    raw = rows.slice(headerIndex >= 0 ? 1 : 0).map((r) => r[column] ?? "");
  }
  return dedupe(raw);
}

function dedupe(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of raw) {
    const keyword = cleanKeyword(item);
    const key = keyword.toLowerCase();
    if (keyword.length < 2 || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

export function mergeKeywords(existing: string[], incoming: string[]) {
  const seen = new Set(existing.map((k) => k.toLowerCase()));
  const toAdd: string[] = [];
  const duplicates: string[] = [];
  for (const keyword of incoming) (seen.has(keyword.toLowerCase()) ? duplicates : toAdd).push(keyword);
  const room = Math.max(0, MAX_KEYWORDS - existing.length);
  return { toAdd: toAdd.slice(0, room), duplicates, overLimit: toAdd.slice(room) };
}

function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function keywordsToCsv(keywords: string[], competitors: string[]): string {
  const lines = ["type,value", ...keywords.map((k) => `keyword,${csvCell(k)}`), ...competitors.map((c) => `competitor,${csvCell(c)}`)];
  return lines.join("\n") + "\n";
}
