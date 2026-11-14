import type { BlogPost } from "@/lib/blog/types";

export const wordpressPlugin: BlogPost = {
  slug: "wordpress-seo-plugin",
  title: "Manage WordPress SEO Titles, Descriptions and Sitemaps from One Dashboard",
  metaTitle: "WordPress SEO Plugin: Edit Metadata & Sitemaps Remotely",
  description: "Connect WordPress to SEO Studio with the SEO Studio Connector plugin to edit SEO titles and meta descriptions with review, and manage the core sitemap.",
  excerpt: "Install the SEO Studio Connector, sync your published content, then review and send SEO title and description changes to WordPress — plus control the core sitemap.",
  category: "Integrations",
  primaryKeyword: "WordPress SEO plugin",
  keywords: ["WordPress SEO plugin", "WordPress meta description", "edit SEO title WordPress", "WordPress sitemap", "WordPress SEO management", "bulk edit WordPress SEO", "WordPress SEO audit", "manage multiple WordPress sites"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Install the SEO Studio Connector plugin and connect it with a token generated in SEO Studio.",
    "Sync published content, then edit SEO titles and descriptions and review changes before they are sent.",
    "SEO Studio can manage the WordPress core sitemap; existing SEO plugins keep control of their own sitemaps.",
    "Every change is recorded, so you always know what was updated and when.",
  ],
  body: [
    { type: "p", text: "Audits find missing or weak titles and descriptions; fixing them usually means logging in to WordPress and editing page by page. The **SEO Studio Connector** plugin lets you make those changes from SEO Studio, with a review step, for any verified HTTPS WordPress site." },

    { type: "h2", id: "connect", text: "Connect your WordPress site" },
    { type: "ol", items: [
      "Add and [verify your website](/blog/getting-started-with-seo-studio) in SEO Studio. It must use HTTPS.",
      "In **Integrations**, open **WordPress plugin** for that website and **generate a token**.",
      "Install the latest **SEO Studio Connector** plugin in your WordPress admin.",
      "In WordPress, go to **Settings → SEO Studio**, and enter the app URL and the token.",
      "Select **Sync published content now** so your posts and pages appear in SEO Studio.",
    ] },
    { type: "callout", title: "Keep the token private", text: "The token lets the plugin talk to your SEO Studio workspace. Treat it like a password, and generate a new one if you think it has been shared." },

    { type: "h2", id: "edit-metadata", text: "Edit SEO titles and descriptions" },
    { type: "ol", items: [
      "Open **Edit synced SEO metadata** for your website.",
      "Choose a published post or page.",
      "Update the SEO title and meta description — use the [audit findings](/blog/how-to-run-a-technical-seo-audit) to see which pages need it most.",
      "Review the changes, then send them. They are applied directly to your WordPress site.",
    ] },
    { type: "ul", items: [
      "**Titles** — main keyword near the start, around 50–60 characters, unique on every page.",
      "**Descriptions** — a clear summary and reason to click; the audit flags descriptions that may be too short or too long.",
    ] },

    { type: "h2", id: "sitemap", text: "Manage the sitemap" },
    { type: "p", text: "From **WordPress sitemap**, SEO Studio can manage WordPress's built-in (core) sitemap. If another SEO plugin already produces your sitemap, it keeps ownership — change its settings in WordPress to avoid duplicate sitemaps. If WordPress is set to discourage search engines, make the site public first." },

    { type: "h2", id: "workflow", text: "A simple weekly workflow" },
    { type: "ol", items: [
      "Run or review the latest site audit.",
      "Create an [action plan](/blog/seo-action-plan) and assign metadata tasks to your content editor.",
      "Edit titles and descriptions in SEO Studio and send them to WordPress.",
      "Re-run the audit to confirm the findings are resolved.",
    ] },
  ],
  faqs: [
    { question: "Will this conflict with Yoast or Rank Math?", answer: "Existing SEO plugins keep ownership of their own sitemap settings, and SEO Studio shows when another plugin controls sitemap output. Check how your current plugin handles titles before editing them from two places." },
    { question: "Does it work with WordPress.com or headless sites?", answer: "It needs a self-hosted WordPress site where you can install plugins, served over HTTPS and verified in SEO Studio." },
    { question: "Can I manage several WordPress sites?", answer: "Yes. Each verified website has its own connection and token, so agencies can manage many client sites from one workspace with the right team roles." },
  ],
  related: ["connect-google-search-console-and-ga4", "how-to-run-a-technical-seo-audit", "seo-action-plan"],
};
