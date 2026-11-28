/** Local business checks: LocalBusiness structured data and name / address / phone consistency across a site's own pages. */
export type Nap = { name: string; address: string; phone: string };
export type Business = { type: string; name: string; address: string; phone: string; hasHours: boolean; hasGeo: boolean; hasUrl: boolean };

const BUSINESS_TYPE = /(LocalBusiness|Organization|Business|Store|Restaurant|Dentist|Physician|Clinic|Hotel|Salon|Agency|Service|Shop|Cafe|Bakery|Pharmacy|Hospital|School)$/;
const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function addressText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return addressText(value[0]);
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"].map((key) => asText(item[key])).filter(Boolean).join(", ");
}

export function extractBusinesses(html: string) {
  const found: Business[] = [];
  let invalid = 0;
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node.slice(0, 100)) visit(child, depth + 1); return; }
    const item = node as Record<string, unknown>;
    const types = (Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]).filter((type): type is string => typeof type === "string");
    const type = types.find((name) => BUSINESS_TYPE.test(name));
    if (type && (item.address || item.telephone)) {
      found.push({ type, name: asText(item.name), address: addressText(item.address), phone: asText(item.telephone), hasHours: Boolean(item.openingHours || item.openingHoursSpecification), hasGeo: Boolean(item.geo), hasUrl: Boolean(item.url) });
    }
    for (const value of Object.values(item)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  for (const [, body] of blocks) { try { visit(JSON.parse(body.trim()), 0); } catch { invalid += 1; } }
  return { businesses: found, invalid };
}

export function visibleText(html: string) {
  return html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

export const phoneDigits = (value: string) => value.replace(/\D/g, "").slice(-10);
const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);

export function samePhone(a: string, b: string) { const left = phoneDigits(a); return left.length >= 7 && left === phoneDigits(b); }
export function phoneInText(text: string, phone: string) {
  const target = phoneDigits(phone);
  return target.length >= 7 && (text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? []).some((candidate) => phoneDigits(candidate) === target);
}
export function nameMatches(text: string, name: string) { const target = words(name).join(" "); return Boolean(target) && ` ${words(text).join(" ")} `.includes(` ${target} `); }
/** Share (0–100) of the address words that appear in the text; tolerant of ordering and punctuation. */
export function addressMatch(text: string, address: string) {
  const target = [...new Set(words(address))], have = new Set(words(text));
  return target.length ? Math.round((target.filter((word) => have.has(word)).length / target.length) * 100) : 0;
}

export function checkPage(html: string, expected: Nap) {
  const text = visibleText(html);
  const { businesses, invalid } = extractBusinesses(html);
  return {
    visible: { name: nameMatches(text, expected.name), address: addressMatch(text, expected.address) >= 80, phone: phoneInText(text, expected.phone) },
    schema: businesses.map((business) => ({ ...business, nameOk: nameMatches(business.name, expected.name), addressOk: addressMatch(business.address, expected.address) >= 60, phoneOk: samePhone(business.phone, expected.phone) })),
    invalidSchema: invalid,
  };
}

export type PageCheck = ReturnType<typeof checkPage> & { url: string };

export function localFindings(pages: PageCheck[]) {
  const schemas = pages.flatMap((page) => page.schema);
  const findings: Array<{ ok: boolean; title: string; fix: string }> = [];
  const add = (ok: boolean, title: string, fix: string) => findings.push({ ok, title, fix });
  add(schemas.length > 0, "Business structured data is present", "Add LocalBusiness JSON-LD with your name, address and phone to your home or contact page.");
  if (schemas.length) {
    add(schemas.every((s) => s.nameOk), "Structured data name matches", "Use exactly the same business name everywhere.");
    add(schemas.every((s) => s.addressOk), "Structured data address matches", "Update the address in your structured data.");
    add(schemas.every((s) => s.phoneOk), "Structured data phone matches", "Update the telephone in your structured data.");
    add(schemas.some((s) => s.hasHours), "Opening hours are included", "Add openingHoursSpecification.");
    add(schemas.some((s) => s.hasGeo), "Map coordinates are included", "Add geo latitude and longitude.");
  }
  add(pages.some((p) => p.visible.name), "Business name is visible on the pages checked", "Show your business name as text, not only in a logo image.");
  add(pages.some((p) => p.visible.address), "Address is visible on the pages checked", "Show your full address as text on the contact page or footer.");
  add(pages.some((p) => p.visible.phone), "Phone number is visible on the pages checked", "Show your phone number as text.");
  add(pages.every((p) => !p.invalidSchema), "No broken structured data blocks", "Fix the JSON-LD that cannot be parsed.");
  return { findings, score: Math.round((findings.filter((item) => item.ok).length / findings.length) * 100) };
}
