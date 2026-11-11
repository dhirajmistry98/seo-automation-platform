export const SEARCH_VISIBILITY_VERSION = "search-visibility-v1";

type SearchSignalRecord = {
  hasOrganizationIdentity?: boolean;
  hasAuthorAttribution?: boolean;
  hasPublicationDate?: boolean;
  hasFaqSchema?: boolean;
  questionHeadingCount?: number;
  directAnswerBlockCount?: number;
  structuredDataValid?: boolean;
};

type VisibilityPage = {
  url?: unknown;
  status?: unknown;
  title?: unknown;
  description?: unknown;
  robots?: unknown;
  headings?: unknown;
  wordCount?: unknown;
  externalLinks?: unknown;
  structuredData?: unknown;
  searchSignals?: SearchSignalRecord;
};

export type VisibilitySignal = {
  id: string;
  label: string;
  score: number;
  status: "supported" | "partial" | "needs_review";
  evidence: string;
  recommendation: string;
};

export type VisibilityDimension = { score: number; signals: VisibilitySignal[] };

type SearchCrawlerAccess = {
  robotsTxt: { available: boolean; statusCode: number | null };
  bots: Record<string, "allowed_on_root" | "blocked_on_root" | "not_specified" | "unknown">;
  llmsTxt: { status: "available" | "not_found" | "unavailable"; statusCode: number | null; bytes: number | null };
};

function sanitizeCrawlerAccess(input: unknown): SearchCrawlerAccess | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const robots = record.robotsTxt && typeof record.robotsTxt === "object" ? record.robotsTxt as Record<string, unknown> : null;
  const botsInput = record.bots && typeof record.bots === "object" ? record.bots as Record<string, unknown> : null;
  const llms = record.llmsTxt && typeof record.llmsTxt === "object" ? record.llmsTxt as Record<string, unknown> : null;
  if (!robots || !botsInput || !llms) return null;
  const bots = Object.fromEntries(["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"].map((name) => {
    const policy = botsInput[name];
    const valid = ["allowed_on_root", "blocked_on_root", "not_specified", "unknown"].includes(String(policy));
    return [name, valid ? policy : "unknown"];
  })) as SearchCrawlerAccess["bots"];
  const status = ["available", "not_found", "unavailable"].includes(String(llms.status)) ? llms.status as SearchCrawlerAccess["llmsTxt"]["status"] : "unavailable";
  return {
    robotsTxt: { available: robots.available === true, statusCode: Number.isInteger(robots.statusCode) ? Number(robots.statusCode) : null },
    bots,
    llmsTxt: { status, statusCode: Number.isInteger(llms.statusCode) ? Number(llms.statusCode) : null, bytes: Number.isInteger(llms.bytes) ? Number(llms.bytes) : null },
  };
}

export type SearchVisibilityReport = {
  version: string;
  pageCount: number;
  scores: { geo: number; aeo: number; llmo: number };
  dimensions: { geo: VisibilityDimension; aeo: VisibilityDimension; llmo: VisibilityDimension };
  recommendations: string[];
  limitations: string[];
  crawlerAccess: SearchCrawlerAccess | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function schemaTypes(value: unknown, output = new Set<string>(), depth = 0) {
  if (depth > 6) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) schemaTypes(item, output, depth + 1);
    return output;
  }
  const record = asRecord(value);
  if (!record) return output;
  const type = record["@type"];
  if (typeof type === "string") output.add(type.toLowerCase());
  if (Array.isArray(type)) for (const item of type) if (typeof item === "string") output.add(item.toLowerCase());
  for (const key of ["@graph", "mainEntity", "author", "publisher"]) if (record[key]) schemaTypes(record[key], output, depth + 1);
  return output;
}

function pageSignals(page: VisibilityPage) {
  const stored = page.searchSignals;
  const headings = Array.isArray(page.headings)
    ? page.headings.flatMap((item) => {
      const heading = asRecord(item);
      return heading && typeof heading.text === "string" ? [heading.text] : [];
    })
    : [];
  const structuredData = Array.isArray(page.structuredData) ? page.structuredData : [];
  const parsedSchemas: unknown[] = [];
  for (const raw of structuredData.slice(0, 30)) {
    if (typeof raw !== "string" || raw.length > 100_000) continue;
    try { parsedSchemas.push(JSON.parse(raw)); } catch { /* Invalid schema is measured as absent. */ }
  }
  const types = new Set<string>();
  for (const schema of parsedSchemas) schemaTypes(schema, types);
  const hasOrganizationIdentity = stored?.hasOrganizationIdentity ?? [...types].some((type) => ["organization", "localbusiness", "corporation", "brand", "person", "website"].includes(type));
  const hasAuthorAttribution = stored?.hasAuthorAttribution ?? parsedSchemas.some((schema) => JSON.stringify(schema).toLowerCase().includes('"author"'));
  const hasFaqSchema = stored?.hasFaqSchema ?? [...types].some((type) => type === "faqpage" || type === "qapage");
  const questionHeadingCount = Number.isFinite(stored?.questionHeadingCount)
    ? Math.max(0, Number(stored?.questionHeadingCount))
    : headings.filter((text) => /\?|^(who|what|when|where|why|how|which|can|does|do|is|are|should|will|could|would)\b/i.test(text.trim())).length;
  const directAnswerBlockCount = Number.isFinite(stored?.directAnswerBlockCount) ? Math.max(0, Number(stored?.directAnswerBlockCount)) : 0;
  const structuredDataValid = stored?.structuredDataValid ?? parsedSchemas.length > 0;
  const links = Array.isArray(page.externalLinks) ? page.externalLinks.filter((item) => typeof item === "string") : [];
  const h1Count = headings.filter((_, index) => {
    const item = asRecord((page.headings as unknown[] | undefined)?.[index]);
    return item?.level === 1;
  }).length;
  const hasPageSummary = typeof page.title === "string" && page.title.trim().length >= 15 && typeof page.description === "string" && page.description.trim().length >= 40;
  const semanticStructure = h1Count === 1 && headings.some((_, index) => asRecord((page.headings as unknown[] | undefined)?.[index])?.level === 2);
  const isIndexable = Number(page.status) < 400 && !/\bnoindex\b/i.test(typeof page.robots === "string" ? page.robots : "");
  const wordCount = Number.isFinite(page.wordCount) ? Number(page.wordCount) : 0;
  return {
    hasOrganizationIdentity,
    hasAuthorAttribution,
    hasPublicationDate: Boolean(stored?.hasPublicationDate),
    hasFaqSchema,
    questionHeadingCount,
    directAnswerBlockCount,
    structuredDataValid,
    hasOutboundReferences: links.length > 0,
    hasPageSummary,
    semanticStructure,
    isIndexable,
    hasUsefulContent: wordCount >= 80,
  };
}

function makeSignal(id: string, label: string, coverage: number, count: number, total: number, evidence: string, recommendation: string): VisibilitySignal {
  return {
    id,
    label,
    score: coverage,
    status: coverage >= 80 ? "supported" : coverage >= 35 ? "partial" : "needs_review",
    evidence: `${count} of ${total} sampled pages · ${evidence}`,
    recommendation,
  };
}

function dimension(pages: VisibilityPage[], definitions: Array<{ id: string; label: string; test: (page: ReturnType<typeof pageSignals>) => boolean; evidence: string; recommendation: string }>): VisibilityDimension {
  const signals = definitions.map((definition) => {
    const count = pages.filter((page) => definition.test(pageSignals(page))).length;
    const coverage = pages.length ? Math.round(count * 100 / pages.length) : 0;
    return makeSignal(definition.id, definition.label, coverage, count, pages.length, definition.evidence, definition.recommendation);
  });
  return { score: signals.length ? Math.round(signals.reduce((sum, signal) => sum + signal.score, 0) / signals.length) : 0, signals };
}

export function analyzeSearchVisibility(input: unknown, crawlerAccessInput?: unknown): SearchVisibilityReport {
  const pages = Array.isArray(input)
    ? input.slice(0, 100).map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) as VisibilityPage[]
    : [];
  const geo = dimension(pages, [
    { id: "geo.entity_identity", label: "Entity identity markup", test: (page) => page.hasOrganizationIdentity, evidence: "Organization, LocalBusiness, Person, Brand or WebSite JSON-LD was found.", recommendation: "Use accurate Organization or LocalBusiness structured data to identify the real entity behind this site." },
    { id: "geo.authorship", label: "Author attribution", test: (page) => page.hasAuthorAttribution, evidence: "Author attribution was present in saved metadata or structured data.", recommendation: "Add accurate author or responsible organization information where it helps readers assess expertise." },
    { id: "geo.references", label: "Outbound reference links", test: (page) => page.hasOutboundReferences, evidence: "At least one external link was found; its quality and factual support are not evaluated.", recommendation: "Link to primary sources for claims where citations help readers verify the information." },
    { id: "geo.structured_data", label: "Machine-readable context", test: (page) => page.structuredDataValid, evidence: "At least one JSON-LD block parsed successfully.", recommendation: "Add valid structured data that describes the page and real entities without inventing reviews, prices or claims." },
  ]);
  const aeo = dimension(pages, [
    { id: "aeo.questions", label: "Question-led headings", test: (page) => page.questionHeadingCount > 0, evidence: "A question-form heading was found.", recommendation: "Use question headings only where they match real audience questions, then answer them directly." },
    { id: "aeo.faq_schema", label: "FAQ or Q&A schema", test: (page) => page.hasFaqSchema, evidence: "FAQPage or QAPage JSON-LD was found; correctness beyond JSON parsing is not validated.", recommendation: "Use FAQ or Q&A structured data only for visible, accurate questions and answers that follow current search policies." },
    { id: "aeo.direct_answers", label: "Direct answer blocks", test: (page) => page.directAnswerBlockCount > 0, evidence: "A question heading followed by a concise paragraph was detected by a first-party HTML pattern check.", recommendation: "Place a concise, evidence-supported answer immediately after the relevant question heading." },
    { id: "aeo.page_summary", label: "Page summary metadata", test: (page) => page.hasPageSummary, evidence: "A descriptive title and meta description were present.", recommendation: "Write a page-specific title and summary that answer what the page is about without promising a featured result." },
  ]);
  const llmo = dimension(pages, [
    { id: "llmo.structured_context", label: "Structured page context", test: (page) => page.structuredDataValid, evidence: "At least one JSON-LD block parsed successfully.", recommendation: "Keep structured data accurate, visible-content-aligned and free of duplicate/conflicting entities." },
    { id: "llmo.semantic_structure", label: "Semantic content structure", test: (page) => page.semanticStructure, evidence: "One H1 and at least one H2 were found in the saved crawl.", recommendation: "Use a clear heading hierarchy so people and software can identify the page topic and sections." },
    { id: "llmo.provenance", label: "Authorship and provenance", test: (page) => page.hasAuthorAttribution && page.hasPublicationDate, evidence: "Author and publication-date signals were both present in saved metadata or structured data.", recommendation: "Identify the responsible author or organization and dates where they are genuine and useful." },
    { id: "llmo.accessible_page", label: "HTTP and index directives", test: (page) => page.isIndexable, evidence: "The response succeeded and no page-level noindex directive was recorded; robots.txt and AI crawler policies are not inspected here.", recommendation: "Review page-level robots directives intentionally. This does not confirm AI crawler access or model retrieval." },
  ]);
  const dimensions = { geo, aeo, llmo };
  const recommendations = pages.length ? [...new Set(Object.values(dimensions).flatMap((item) => item.signals.filter((signal) => signal.status !== "supported").map((signal) => signal.recommendation)))].slice(0, 12) : [];
  return {
    version: SEARCH_VISIBILITY_VERSION,
    pageCount: pages.length,
    scores: { geo: geo.score, aeo: aeo.score, llmo: llmo.score },
    dimensions,
    recommendations,
    limitations: [
      "These are first-party technical and content-structure heuristics from the sampled crawl, not search rankings or measured AI citations.",
      "Outbound links are not verified for authority or factual support. Scores do not predict inclusion, citations, traffic or ranking changes.",
      "Robots.txt observations cover only homepage directives in the fetched file. They do not confirm bot behavior, other paths, off-site mentions, model training or retrieval.",
    ],
    crawlerAccess: sanitizeCrawlerAccess(crawlerAccessInput),
  };
}
