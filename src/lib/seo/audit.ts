export type SeoIssue = {
  ruleId: string;
  title: string;
  severity: "critical" | "warning" | "notice";
  description: string;
  recommendation: string;
  evidence: string;
};

export type CmsDetection = { name: string; confidence: "high" | "likely"; evidence: string };

export type AuditedPage = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  headings: Array<{ level: number; text: string }>;
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  images: Array<{ src: string; alt: string | null; decorative?: boolean }>;
  structuredData: string[];
  searchSignals?: {
    hasOrganizationIdentity: boolean;
    hasAuthorAttribution: boolean;
    hasPublicationDate: boolean;
    hasFaqSchema: boolean;
    questionHeadingCount: number;
    directAnswerBlockCount: number;
    structuredDataValid: boolean;
  };
  hreflang: Array<{ language: string; url: string }>;
  cmsDetection: CmsDetection | null;
  healthScore?: { score: number; components: Record<string, number> };
  issues: SeoIssue[];
};

const decode = (value: string) => value
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));

const strip = (html: string) => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim());

const attr = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decode(match[1] ?? match[2] ?? match[3] ?? "") : null;
};

const issue = (ruleId: string, title: string, severity: SeoIssue["severity"], description: string, recommendation: string, evidence: string): SeoIssue => ({ ruleId, title, severity, description, recommendation, evidence });

function detectCms(html: string, headers: Headers): CmsDetection | null {
  const normalized = html.toLowerCase();
  const generatorTag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag).find((tag) => /\bname\s*=\s*["']?generator\b/i.test(tag));
  const generator = generatorTag?.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const generatorValue = (generator?.[1] ?? generator?.[2] ?? generator?.[3] ?? headers.get("x-generator") ?? "").trim();
  const evidence = (pattern: RegExp, fallback: string) => normalized.match(pattern)?.[0] || fallback;
  const matches: Array<[RegExp, string, string]> = [
    [/wordpress|wp-content|wp-includes|wp-json/, "WordPress", "WordPress generator or wp-content/wp-includes markers"],
    [/cdn\.shopify\.com|shopifyanalytics|shopify\.theme/, "Shopify", "Shopify storefront assets or runtime markers"],
    [/wixstatic\.com|wix\.com\/wix-data|wix-viewer-model/, "Wix", "Wix runtime or static assets"],
    [/squarespace\.com|static1\.squarespace|squarespace-cdn/, "Squarespace", "Squarespace runtime or static assets"],
    [/drupalsettings|drupal\.js|\/sites\/default\/files\//, "Drupal", "Drupal settings or default public file path"],
    [/joomla|\/media\/system\/js\//, "Joomla", "Joomla generator or system assets"],
    [/data-wf-page|webflow\.io|website-files\.com/, "Webflow", "Webflow page or hosted asset markers"],
    [/magento|mage\/cookies|data-mage-init/, "Magento", "Magento runtime markers"],
    [/bigcommerce|cdn11\.bigcommerce\.com|stencil-utils/, "BigCommerce", "BigCommerce storefront markers"],
  ];
  if (generatorValue) {
    const direct = matches.find(([pattern]) => pattern.test(generatorValue.toLowerCase()));
    if (direct) return { name: direct[1], confidence: "high", evidence: `Generator: ${generatorValue.slice(0, 120)}` };
  }
  for (const [pattern, name, marker] of matches) {
    if (pattern.test(normalized)) return { name, confidence: "likely", evidence: evidence(pattern, marker) };
  }
  if (headers.has("x-powered-by") && /next\.js/i.test(headers.get("x-powered-by") || "")) return { name: "Next.js", confidence: "likely", evidence: `X-Powered-By: ${headers.get("x-powered-by")}` };
  return null;
}

export function auditHtml(url: string, finalUrl: string, status: number, html: string, headers: Headers, options: { primaryKeywords?: string[] } = {}): AuditedPage {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch ? strip(titleMatch[1]) : "";
  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? "";
  const descriptionTag = metaTags.find((tag) => /\bname\s*=\s*["']?description\b/i.test(tag));
  const description = descriptionTag ? attr(descriptionTag, "content") ?? "" : "";
  const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag);
  const canonicalTags = linkTags.filter((tag) => (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const canonical = canonicalTags.length ? attr(canonicalTags[0], "href") ?? "" : "";
  const hreflang = linkTags.flatMap((tag) => {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const language = attr(tag, "hreflang")?.trim() ?? "";
    const href = attr(tag, "href")?.trim() ?? "";
    if (!rel.includes("alternate") || !language || !href) return [];
    try { const parsed = new URL(href, finalUrl); return [ { language, url: parsed.href } ]; } catch { return [{ language, url: href }]; }
  });
  const robotsTag = metaTags.find((tag) => /\bname\s*=\s*["']?robots\b/i.test(tag));
  const robots = `${robotsTag ? attr(robotsTag, "content") ?? "" : ""} ${headers.get("x-robots-tag") ?? ""}`.trim();
  const rawHeadings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map(([, level, text]) => ({ level: Number(level), text: strip(text) }));
  const headings = rawHeadings.filter((h) => h.text);
  const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(([tag]) => attr(tag, "href")).filter((href): href is string => Boolean(href));
  const base = new URL(finalUrl);
  const internalLinks = [...new Set(links.flatMap((href) => {
    try { const link = new URL(href, base); return link.hostname === base.hostname && ["http:", "https:"].includes(link.protocol) ? [link.href.split("#")[0]] : []; } catch { return []; }
  }))];
  const externalLinks = [...new Set(links.flatMap((href) => {
    try { const link = new URL(href, base); return ["http:", "https:"].includes(link.protocol) && link.hostname !== base.hostname ? [link.href.split("#")[0]] : []; } catch { return []; }
  }))];
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => {
    const src = attr(tag, "src");
    const alt = attr(tag, "alt");
    // alt="" together with aria-hidden or role="presentation"/"none" marks an intentionally decorative image.
    const decorative = alt !== null && !alt.trim() && (attr(tag, "aria-hidden") === "true" || /^(presentation|none)$/i.test(attr(tag, "role") ?? ""));
    return src ? [{ src, alt, decorative }] : [];
  });
  const structuredData = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)].map(([, json]) => json.trim());
  const schemaNodes: Array<Record<string, unknown>> = [];
  const visitSchema = (value: unknown, depth = 0) => {
    if (depth > 6 || schemaNodes.length >= 100) return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) visitSchema(item, depth + 1); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node["@type"]) schemaNodes.push(node);
    for (const key of ["@graph", "mainEntity", "author", "publisher"]) if (node[key]) visitSchema(node[key], depth + 1);
  };
  let structuredDataValid = structuredData.length > 0;
  for (const json of structuredData.slice(0, 30)) {
    try { visitSchema(JSON.parse(json)); } catch { structuredDataValid = false; }
  }
  const schemaTypes = schemaNodes.flatMap((node) => typeof node["@type"] === "string" ? [node["@type"].toLowerCase()] : Array.isArray(node["@type"]) ? node["@type"].filter((type): type is string => typeof type === "string").map((type) => type.toLowerCase()) : []);
  const metaAuthors = metaTags.some((tag) => ["author", "article:author"].includes((attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase()) && Boolean(attr(tag, "content")?.trim()));
  const hasAuthorAttribution = metaAuthors || schemaNodes.some((node) => Boolean(node.author));
  const hasPublicationDate = schemaNodes.some((node) => Boolean(node.datePublished || node.dateModified));
  const hasOrganizationIdentity = schemaTypes.some((type) => ["organization", "localbusiness", "corporation", "brand", "person", "website"].includes(type));
  const hasFaqSchema = schemaTypes.some((type) => ["faqpage", "qapage"].includes(type));
  const questionHeadingCount = headings.filter((heading) => /\?|^(who|what|when|where|why|how|which|can|does|do|is|are|should|will|could|would)\b/i.test(heading.text.trim())).length;
  const directAnswerBlockCount = [...html.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]\s*>\s*<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .filter(([, question, answer]) => /\?|^(who|what|when|where|why|how|which|can|does|do|is|are|should|will|could|would)\b/i.test(strip(question).trim()) && strip(answer).length >= 40 && strip(answer).length <= 700).length;
  const searchSignals = { hasOrganizationIdentity, hasAuthorAttribution, hasPublicationDate, hasFaqSchema, questionHeadingCount, directAnswerBlockCount, structuredDataValid };
  const cmsDetection = detectCms(html, headers);
  const body = strip((html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html));
  const wordCount = body ? body.split(/\s+/).length : 0;
  const issues: SeoIssue[] = [];
  const resourceTags = [...html.matchAll(/<(?:script|img|iframe|video|audio|source|link)\b[^>]*>/gi)].map(([tag]) => tag);
  const hasMixedContent = new URL(finalUrl).protocol === "https:" && resourceTags.some((tag) => {
    const isStylesheet = /<link\b/i.test(tag) && (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet");
    const resourceUrl = attr(tag, /<link\b/i.test(tag) ? "href" : "src");
    if (!resourceUrl || (/^<link\b/i.test(tag) && !isStylesheet)) return false;
    try { return new URL(resourceUrl, finalUrl).protocol === "http:"; } catch { return false; }
  });
  if (hasMixedContent) issues.push(issue("technical.mixed_content", "Page loads insecure resources", "warning", "One or more scripts, images, frames, media files, or stylesheets use HTTP on an HTTPS page.", "Serve page resources over HTTPS or remove unused insecure resources.", "HTTP subresources detected on an HTTPS page"));
  if (hreflang.some((item) => !/^(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*|x-default)$/i.test(item.language))) issues.push(issue("hreflang.language_invalid", "Invalid hreflang language code", "warning", "At least one alternate link uses a language label that does not match a common language-tag format.", "Use a valid BCP 47 language tag or x-default for the intended alternate.", hreflang.map((item) => item.language).join(", ")));
  if (hreflang.some((item) => { try { return !["http:", "https:"].includes(new URL(item.url).protocol); } catch { return true; } })) issues.push(issue("hreflang.url_invalid", "Invalid hreflang URL", "warning", "At least one alternate-language URL is not a valid HTTP or HTTPS URL.", "Use a public HTTP or HTTPS URL for each alternate language page.", "An invalid alternate URL was found"));
  if (wordCount > 0 && wordCount < 150) issues.push(issue("content.thin", "Page has little visible text", "notice", "This page has fewer than 150 visible words; treat this as a review signal, not a search-engine minimum.", "Check whether the page fully answers its purpose and add useful detail only where it helps visitors.", `${wordCount} visible words`));
  const normalizedTitleAndH1 = [title, ...rawHeadings.filter((heading) => heading.level === 1).map((heading) => heading.text)].join(" ").toLowerCase();
  const missingPrimaryKeywords = [...new Set((options.primaryKeywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 1))]
    .filter((keyword) => !normalizedTitleAndH1.includes(keyword.toLowerCase()))
    .slice(0, 30);
  if (missingPrimaryKeywords.length) issues.push(issue("content.primary_keyword_missing", "Configured keywords are absent from the title and H1", "notice", "Some website keywords configured by the user were not found in this page’s title or main heading. This is a review prompt, not a requirement to force keywords into copy.", "Review whether this page should target these terms. Keep titles and headings accurate and natural.", missingPrimaryKeywords.join(", ")));
  if (status >= 400) issues.push(issue("technical.http_error", "Page returns an HTTP error", "critical", "The requested page did not return a successful response.", "Fix the page or its redirect so it returns the intended status.", `HTTP ${status}`));
  if (!title) issues.push(issue("metadata.title_missing", "Missing page title", "critical", "Search engines and browsers receive no title for this page.", "Write a clear, page-specific title that describes the main topic.", "No <title> element found"));
  else if (title.length < 15) issues.push(issue("metadata.title_short", "Title may be too short", "notice", "A very short title may not give searchers enough context.", "Check that the title names the page topic and is distinct from other pages.", `${title.length} characters`));
  else if (title.length > 60) issues.push(issue("metadata.title_long", "Title may be too long", "notice", "Long titles can be truncated in search results.", "Review whether the most useful wording can fit earlier in the title.", `${title.length} characters`));
  if (!description) issues.push(issue("metadata.description_missing", "Missing meta description", "warning", "This page has no meta description.", "Add a concise description that accurately summarizes the page.", "No meta description found"));
  else if (description.trim().length < 70) issues.push(issue("metadata.description_short", "Meta description may be too short", "notice", "A short description may not communicate enough page context.", "Add a useful summary while keeping it accurate and specific to this page.", `${description.trim().length} characters`));
  else if (description.trim().length > 160) issues.push(issue("metadata.description_long", "Meta description may be too long", "notice", "Long descriptions may be truncated in search results.", "Move the most useful information earlier and consider shortening the description.", `${description.trim().length} characters`));
  const openGraph = (name: string) => metaTags.find((tag) => (attr(tag, "property") ?? "").toLowerCase() === `og:${name}`);
  if (!openGraph("title")) issues.push(issue("metadata.og_title_missing", "Missing Open Graph title", "notice", "Social previews may not have a dedicated title.", "Add an og:title that accurately describes the page.", "No og:title meta tag found"));
  if (!openGraph("description")) issues.push(issue("metadata.og_description_missing", "Missing Open Graph description", "notice", "Social previews may not have a dedicated description.", "Add an og:description that summarizes this page.", "No og:description meta tag found"));
  if (!openGraph("image")) issues.push(issue("metadata.og_image_missing", "Missing Open Graph image", "notice", "Social previews may lack a page image.", "Add an absolute, crawlable og:image for this page.", "No og:image meta tag found"));
  if (!metaTags.some((tag) => (attr(tag, "name") ?? "").toLowerCase() === "twitter:card")) issues.push(issue("metadata.twitter_card_missing", "Missing X card metadata", "notice", "X may not use a large-image card for this page.", "Add a twitter:card value that matches the intended preview.", "No twitter:card meta tag found"));
  if (!/\bcharset\s*=/i.test(head)) issues.push(issue("metadata.charset_missing", "Missing character encoding", "warning", "The document head does not declare its character encoding.", "Declare UTF-8 near the start of the document head.", "No charset declaration found"));
  if (!/\bname\s*=\s*["']?viewport\b/i.test(head)) issues.push(issue("metadata.viewport_missing", "Missing viewport metadata", "warning", "Mobile browsers may render the page at a desktop width.", "Add a viewport declaration suitable for responsive layouts.", "No viewport meta tag found"));
  if (!(attr(htmlTag, "lang") ?? "").trim()) issues.push(issue("metadata.language_missing", "Missing document language", "warning", "Assistive technology and search engines cannot infer the page language reliably.", "Add the primary content language to the html lang attribute.", "No html lang attribute found"));
  if (canonicalTags.length > 1) issues.push(issue("technical.canonical_duplicate", "Multiple canonical links", "warning", "More than one canonical link was found.", "Keep one canonical link that identifies the preferred URL.", `${canonicalTags.length} canonical links found`));
  if (canonical) {
    try {
      const canonicalUrl = new URL(canonical, finalUrl);
      if (!(["http:", "https:"].includes(canonicalUrl.protocol))) throw new Error("invalid protocol");
      if (canonicalUrl.origin !== new URL(finalUrl).origin) issues.push(issue("technical.canonical_cross_origin", "Canonical points to another origin", "warning", "The canonical link declares a different origin as the preferred page.", "Confirm the cross-origin canonical is intentional and controlled by you.", canonicalUrl.href));
    } catch { issues.push(issue("technical.canonical_invalid", "Invalid canonical URL", "warning", "The canonical link is not a valid HTTP or HTTPS URL.", "Replace it with the intended absolute or same-site relative URL.", canonical.slice(0, 300))); }
  }
  const h1s = headings.filter((h) => h.level === 1);
  if (!h1s.length) issues.push(issue("headings.h1_missing", "Missing H1 heading", "critical", "The page has no non-empty H1 heading.", "Add one visible, descriptive H1 that identifies the page's main subject.", "No non-empty H1 found"));
  else if (h1s.length > 1) issues.push(issue("headings.h1_multiple", "Multiple H1 headings", "warning", "The page contains more than one H1 heading.", "Review the heading structure and use a clear primary heading.", `${h1s.length} H1 headings`));
  if (rawHeadings.some((h) => !h.text)) issues.push(issue("headings.empty", "Empty heading element", "warning", "At least one heading element has no readable text.", "Add a meaningful heading or remove the empty element.", `${rawHeadings.filter((h) => !h.text).length} empty heading elements`));
  const h1Names = h1s.map((h) => h.text.toLowerCase());
  if (new Set(h1Names).size < h1Names.length) issues.push(issue("headings.h1_duplicate", "Duplicate H1 text", "notice", "The same H1 text appears more than once on this page.", "Keep the primary heading distinct and review repeated headings for accessibility.", "Repeated H1 text found"));
  if (!headings.some((h) => h.level === 2)) issues.push(issue("headings.h2_missing", "Missing H2 headings", "warning", "The page has no non-empty H2 headings.", "Add section headings where they help readers understand the content structure.", "No non-empty H2 found"));
  if (headings.some((heading, index) => index > 0 && heading.level > headings[index - 1].level + 1)) issues.push(issue("headings.level_skipped", "Heading levels are skipped", "notice", "A heading jumps over one or more levels after the previous heading.", "Use heading levels in order to make the document structure easier to navigate.", "A skipped heading level was found"));
  const missingAlt = images.filter((img) => !img.decorative && (img.alt === null || !img.alt.trim()));
  if (missingAlt.length) issues.push(issue("images.alt_missing", "Images with missing or empty alt text", "warning", "Some images have no descriptive alt text.", "Add useful alt text to informative images. Mark decorative images with alt=\"\" and aria-hidden=\"true\".", `${missingAlt.length} of ${images.length} images`));
  const nonemptyAlt = images.map((img) => img.alt?.trim().toLowerCase()).filter((alt): alt is string => Boolean(alt));
  if (new Set(nonemptyAlt).size < nonemptyAlt.length) issues.push(issue("images.alt_duplicate", "Duplicate image alt text", "notice", "Some images share the same non-empty alt text.", "Review repeated alt text and describe each informative image in its context.", "Repeated alt text found"));
  if (/\bnoindex\b/i.test(robots)) issues.push(issue("technical.noindex", "Page is marked noindex", "warning", "A robots directive prevents this page from appearing in search results.", "Confirm this page should remain excluded; otherwise remove the noindex directive.", robots));
  if (/\bnofollow\b/i.test(robots)) issues.push(issue("technical.nofollow", "Page is marked nofollow", "notice", "A robots directive tells crawlers not to follow links on this page.", "Confirm the nofollow directive is intentional for this page.", robots));
  if (!canonical) issues.push(issue("technical.canonical_missing", "Missing canonical URL", "notice", "No canonical link was detected.", "Add a canonical URL if this page has duplicate or parameterized versions.", "No canonical link found"));
  if (structuredData.some((json) => { try { JSON.parse(json); return false; } catch { return true; } })) issues.push(issue("schema.jsonld_invalid", "Invalid JSON-LD", "warning", "At least one JSON-LD block is not valid JSON.", "Correct the JSON syntax and validate the structured data against its schema type.", "JSON.parse failed for a JSON-LD block"));
  if (new URL(finalUrl).protocol === "http:") issues.push(issue("technical.https_missing", "Page is not served over HTTPS", "warning", "This page is served over an unencrypted HTTP connection.", "Enable HTTPS and redirect public HTTP requests to the secure URL.", finalUrl));
  return { url, finalUrl, status, title, description, canonical, robots, headings, wordCount, internalLinks, externalLinks, images, structuredData, searchSignals, hreflang, cmsDetection, issues };
}

export function addCrossPageIssues(pages: AuditedPage[]) {
  const normalizeInternalUrl = (value: string) => {
    try {
      const url = new URL(value);
      url.hash = "";
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      return url.href;
    } catch {
      return null;
    }
  };
  const duplicateValues = (field: "title" | "description", ruleId: string, label: string) => {
    const groups = new Map<string, AuditedPage[]>();
    for (const page of pages) {
      const value = page[field].trim().toLowerCase();
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), page]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const page of group) page.issues.push(issue(ruleId, `Duplicate ${label}`, "warning", `This ${label} is shared by ${group.length} crawled pages.`, `Write unique ${label}s that describe the individual pages.`, group.map((item) => item.url).join(", ")));
    }
  };
  duplicateValues("title", "metadata.title_duplicate", "title");
  duplicateValues("description", "metadata.description_duplicate", "meta description");
  const byUrl = new Map(pages.flatMap((page) => {
    const normalized = normalizeInternalUrl(page.url);
    return normalized ? [[normalized, page] as const] : [];
  }));
  for (const page of pages) {
    for (const link of page.internalLinks) {
      const normalizedLink = normalizeInternalUrl(link);
      const destination = normalizedLink ? byUrl.get(normalizedLink) : undefined;
      if (destination?.status && destination.status >= 400) page.issues.push(issue("internal.broken_link", "Broken internal link", "critical", "A page on this site links to a URL that returned an HTTP error.", "Update the link or restore the destination page.", `${link} returned HTTP ${destination.status}`));
      else if (destination && destination.finalUrl !== destination.url) page.issues.push(issue("internal.redirecting_link", "Redirecting internal link", "notice", "An internal link points to a URL that redirects.", "Update the link to point to the final destination.", `${link} redirects to ${destination.finalUrl}`));
    }
    for (const alternate of page.hreflang) {
      const alternateUrl = normalizeInternalUrl(alternate.url);
      const normalizedPageUrl = normalizeInternalUrl(page.url);
      const destination = alternateUrl ? byUrl.get(alternateUrl) : undefined;
      if (destination && normalizedPageUrl && !destination.hreflang.some((item) => normalizeInternalUrl(item.url) === normalizedPageUrl)) {
        page.issues.push(issue("hreflang.return_missing", "Missing hreflang return link", "notice", "A crawled alternate page does not link back to this page in its hreflang annotations.", "Add reciprocal hreflang links for alternate pages you control, using the matching language codes.", `${alternate.language} → ${alternate.url}`));
      }
    }
  }
  const incoming = new Set(pages.flatMap((page) => page.internalLinks.flatMap((link) => {
    const normalized = normalizeInternalUrl(link);
    return normalized ? [normalized] : [];
  })));
  const root = pages[0];
  for (const page of pages) {
    const normalized = normalizeInternalUrl(page.url);
    if (page !== root && normalized && !incoming.has(normalized)) {
      page.issues.push(issue("internal.not_linked_from_crawl", "No internal link found from crawled pages", "notice", "No other page in this crawl linked to this URL. This can indicate a discoverability gap, but does not prove the page is an orphan because the crawl may be limited.", "Check whether important pages have descriptive internal links from relevant pages and navigation.", "No incoming internal links in this crawl"));
    }
  }
}

const severityPenalty: Record<SeoIssue["severity"], number> = { critical: 30, warning: 12, notice: 3 };
const scoreCategories = [
  { key: "technical", weight: 25, matches: (id: string) => id === "technical.http_error" || id.startsWith("technical.server") || id.startsWith("technical.https") || id.startsWith("technical.redirect") },
  { key: "onPage", weight: 25, matches: (id: string) => id.startsWith("metadata.") || id.startsWith("headings.") || id.startsWith("images.") || id.startsWith("schema.") },
  { key: "indexabilityAndCrawlability", weight: 20, matches: (id: string) => id.startsWith("indexability.") || id.startsWith("technical.noindex") || id.startsWith("technical.canonical") || id.startsWith("technical.robots") || id.startsWith("technical.sitemap") || id.startsWith("technical.duplicate") },
  { key: "content", weight: 15, matches: (id: string) => id.startsWith("content.") },
  { key: "internalLinking", weight: 10, matches: (id: string) => id.startsWith("internal.") },
];

export function getPageHealthScore(page: AuditedPage) {
  const components: Record<string, number> = {};
  for (const definition of scoreCategories) {
    const relevantIssues = new Map(page.issues.filter((item) => definition.matches(item.ruleId)).map((item) => [item.ruleId, item]));
    const penalties = [...relevantIssues.values()].reduce((sum, item) => sum + severityPenalty[item.severity], 0);
    components[definition.key] = Math.max(0, 100 - penalties);
  }
  // External link quality needs provider data. Keep its specified 5% neutral and expose the gap through confidence.
  components.externalLinkQuality = 100;
  const score = Math.round(
    components.technical * 0.25 + components.onPage * 0.25 + components.indexabilityAndCrawlability * 0.2 +
    components.content * 0.15 + components.internalLinking * 0.1 + components.externalLinkQuality * 0.05,
  );
  return { score, components };
}

export function getHealthScoreDetails(pages: AuditedPage[]) {
  if (!pages.length) return null;
  const pageScores = pages.map(getPageHealthScore);
  const components = Object.fromEntries(scoreCategories.map(({ key }) => [key, Math.round(pageScores.reduce((sum, item) => sum + item.components[key], 0) / pageScores.length)]));
  components.externalLinkQuality = 100;
  const score = Math.round(
    components.technical * 0.25 + components.onPage * 0.25 + components.indexabilityAndCrawlability * 0.2 +
    components.content * 0.15 + components.internalLinking * 0.1 + components.externalLinkQuality * 0.05,
  );
  return { score, components, confidence: 83, confidenceNote: "External link quality is not included until a backlink or link provider is connected." };
}

export function calculateHealthScore(pages: AuditedPage[]) {
  return getHealthScoreDetails(pages)?.score ?? null;
}
