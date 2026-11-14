import type { BlogPost } from "@/lib/blog/types";

export const pageSpeed: BlogPost = {
  slug: "page-speed-core-web-vitals",
  title: "How to Test Page Speed and Improve Core Web Vitals",
  metaTitle: "Page Speed Test & Core Web Vitals: How to Improve Them",
  description: "Test your website's page speed on mobile and desktop with SEO Studio, understand Lighthouse and Core Web Vitals scores, and fix what slows pages down.",
  excerpt: "Run Google Lighthouse tests for mobile and desktop, understand LCP, INP and CLS, and fix the issues that slow your pages down.",
  category: "Performance",
  primaryKeyword: "page speed test",
  keywords: ["page speed test", "website speed test", "Core Web Vitals", "PageSpeed Insights", "Lighthouse score", "LCP", "INP", "CLS", "mobile page speed", "improve website speed"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Select Mobile or Desktop and Run PageSpeed to load Google Lighthouse scores and opportunities.",
    "Good Core Web Vitals: LCP within 2.5 s, INP within 200 ms, CLS below 0.1.",
    "Test mobile first — most visitors and Google's indexing use the mobile version.",
    "Schedule a weekly or monthly mobile homepage check to catch slowdowns early.",
  ],
  body: [
    { type: "p", text: "Slow pages lose visitors and can hold back rankings. SEO Studio runs **Google PageSpeed (Lighthouse)** tests for your verified website and saves every result to the site's history." },

    { type: "h2", id: "run-test", text: "How to run a page speed test" },
    { type: "ol", items: [
      "Open **SEO tools** and find your verified website.",
      "Choose **PageSpeed device**: **Mobile** or **Desktop**.",
      "Select **Run PageSpeed**. Results load directly from Google.",
      "Review the performance score, Core Web Vitals and the list of opportunities.",
    ] },
    { type: "callout", title: "Test both devices", text: "Mobile results are usually lower because tests simulate a slower device and network. Fix mobile first: it is what most visitors use and what Google primarily indexes." },

    { type: "h2", id: "metrics", text: "The metrics that matter" },
    { type: "table", head: ["Metric", "What it measures", "Good", "Typical fixes"], rows: [
      ["LCP — Largest Contentful Paint", "How fast the main content appears", "≤ 2.5 s", "Compress and resize images, preload the main image, use a CDN, reduce server response time"],
      ["INP — Interaction to Next Paint", "How quickly the page responds to taps and clicks", "≤ 200 ms", "Reduce JavaScript, break up long tasks, delay non-essential third-party scripts"],
      ["CLS — Cumulative Layout Shift", "How much the layout jumps while loading", "≤ 0.1", "Set width and height on images and embeds, reserve space for ads, load fonts carefully"],
    ] },
    { type: "p", text: "Lighthouse is a **lab test**: one simulated visit. Real-user (field) data comes from Chrome users over the previous 28 days and appears when your site has enough traffic. [Connect Google Search Console](/blog/connect-google-search-console-and-ga4) to watch Core Web Vitals trends across your whole site." },

    { type: "h2", id: "fix", text: "Fix the biggest wins first" },
    { type: "ul", items: [
      "**Images** — serve modern formats (WebP or AVIF), at the size they display, and lazy-load images below the fold.",
      "**JavaScript** — remove unused scripts and plugins; load chat widgets, trackers and embeds after the main content.",
      "**Fonts** — use fewer font files and `font-display: swap`.",
      "**Caching and CDN** — cache static files and serve them from a CDN close to your visitors, especially if you serve several countries.",
      "**Hosting** — slow server response time limits every other improvement.",
    ] },

    { type: "h2", id: "schedule", text: "Schedule automatic checks" },
    { type: "p", text: "In website settings, set **PageSpeed schedule** to **Weekly mobile homepage check** or **Monthly mobile homepage check**. Combined with [scheduled site audits](/blog/how-to-run-a-technical-seo-audit), you'll spot regressions after theme updates or new plugins before they hurt traffic." },
  ],
  faqs: [
    { question: "Why is my mobile score lower than desktop?", answer: "Mobile tests simulate a mid-range phone on a slower network, so heavy images and scripts have a bigger effect. That's normal; use the opportunities list to close the gap." },
    { question: "Does page speed affect Google rankings?", answer: "Page experience, including Core Web Vitals, is one of many ranking signals. Relevance and content quality matter more, but speed can make the difference between similar pages and strongly affects conversions." },
    { question: "Why do scores change between tests?", answer: "Network conditions, server load and third-party scripts vary between runs. Compare several tests and focus on trends rather than one result." },
    { question: "Can I test pages other than my homepage?", answer: "Manual tests run for your website's URL, and the scheduled check tests the mobile homepage. The page must belong to your verified website." },
  ],
  related: ["how-to-run-a-technical-seo-audit", "connect-google-search-console-and-ga4", "seo-action-plan"],
};
