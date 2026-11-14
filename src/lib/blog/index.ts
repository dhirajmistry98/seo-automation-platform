import type { BlogBlock, BlogCategory, BlogPost } from "@/lib/blog/types";
import { aiSearchReadiness } from "@/lib/blog/posts/ai-search-readiness";
import { gettingStarted } from "@/lib/blog/posts/getting-started";
import { googleIntegrations } from "@/lib/blog/posts/google-integrations";
import { influencerMarketing } from "@/lib/blog/posts/influencer-marketing";
import { keywordResearch } from "@/lib/blog/posts/keyword-research";
import { pageSpeed } from "@/lib/blog/posts/page-speed";
import { seoActionPlan } from "@/lib/blog/posts/seo-action-plan";
import { technicalSeoAudit } from "@/lib/blog/posts/technical-seo-audit";
import { wordpressPlugin } from "@/lib/blog/posts/wordpress-plugin";

/** Pillar first, then newest first. */
export const BLOG_POSTS: readonly BlogPost[] = [gettingStarted, technicalSeoAudit, pageSpeed, seoActionPlan, keywordResearch, aiSearchReadiness, googleIntegrations, wordpressPlugin, influencerMarketing]
  .sort((a, b) => Number(Boolean(b.pillar)) - Number(Boolean(a.pillar)) || b.publishedAt.localeCompare(a.publishedAt));

export const BLOG_CATEGORIES: readonly BlogCategory[] = ["Getting started", "Site audits", "Performance", "Research & rankings", "AI search (GEO)", "Integrations", "Team workflow", "Influencer marketing"];

export const BLOG_AUTHOR = { name: "SEO Studio Editorial Team", url: "/blog" };

export function getPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function relatedPosts(post: BlogPost) {
  return post.related.map(getPost).filter((item): item is BlogPost => Boolean(item));
}

function blockText(block: BlogBlock) {
  switch (block.type) {
    case "ul": case "ol": return block.items.join(" ");
    case "table": return [...block.head, ...block.rows.flat()].join(" ");
    case "callout": return `${block.title} ${block.text}`;
    default: return block.text;
  }
}

export function readingMinutes(post: BlogPost) {
  const words = [...post.body.map(blockText), ...post.faqs.map((faq) => `${faq.question} ${faq.answer}`)].join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function tableOfContents(post: BlogPost) {
  return post.body.flatMap((block) => block.type === "h2" ? [{ id: block.id, text: block.text }] : []);
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
