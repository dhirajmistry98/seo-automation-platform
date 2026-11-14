import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog";
import { siteUrl } from "@/lib/site-url";

/** /sitemap.xml — only pages a logged-out visitor can see (marketing pages and the blog). Everything else redirects to sign-in. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/guide`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/seo-checker`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${origin}/blog`, changeFrequency: "weekly", priority: 0.9 },
    ...BLOG_POSTS.map((post) => ({
      url: `${origin}/blog/${post.slug}`,
      lastModified: new Date(`${post.updatedAt}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: post.pillar ? 0.9 : 0.8,
    })),
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
