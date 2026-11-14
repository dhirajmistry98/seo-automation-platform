import { BLOG_POSTS } from "@/lib/blog";

// llms.txt (https://llmstxt.org): a plain summary of the site for AI assistants and crawlers.
export function GET() {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const lines = [
    "# SEO STUDIO",
    "",
    "> SEO automation platform: website audits, PageSpeed, keyword research and rank tracking, Google Search Console and GA4 reports, GEO/AEO/LLMO (AI search) readiness, a WordPress SEO plugin and influencer marketing collaboration.",
    "",
    "## Main pages",
    `- [Home](${origin}/): Product overview`,
    `- [Practical guide](${origin}/guide): How to use SEO Studio step by step`,
    `- [Blog](${origin}/blog): SEO and AI search guides`,
    `- [Terms](${origin}/terms): Terms and conditions`,
    "",
    "## Guides",
    ...BLOG_POSTS.map((post) => `- [${post.title}](${origin}/blog/${post.slug}): ${post.description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
