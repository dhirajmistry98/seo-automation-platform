export type BlogCategory = "Getting started" | "Site audits" | "Performance" | "Research & rankings" | "AI search (GEO)" | "Integrations" | "Team workflow" | "Influencer marketing";

/**
 * Article body blocks. Text fields support three inline forms only:
 * `**bold**`, `` `code` `` and `[link text](/path or https://url)`. No raw HTML is ever rendered.
 */
export type BlogBlock =
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; title: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

export type BlogPost = {
  slug: string;
  /** Visible H1. */
  title: string;
  /** `<title>` tag, kept under ~60 characters. */
  metaTitle: string;
  /** Meta description, kept under ~160 characters. */
  description: string;
  excerpt: string;
  category: BlogCategory;
  /** Main search phrase the article targets. */
  primaryKeyword: string;
  /** Close variants and supporting phrases, used in content and metadata. */
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  /** Pillar article other posts link back to. */
  pillar?: boolean;
  takeaways: string[];
  body: BlogBlock[];
  faqs: { question: string; answer: string }[];
  related: string[];
};
