import type { BlogPost } from "@/lib/blog/types";

export const technicalSeoAudit: BlogPost = {
  slug: "how-to-run-a-technical-seo-audit",
  title: "How to Run a Technical SEO Audit of Your Website (Step by Step)",
  metaTitle: "How to Run a Technical SEO Audit of Your Website",
  description: "Run a technical SEO audit with SEO Studio: crawl your site, read the SEO Health score, understand every check, and fix critical issues first.",
  excerpt: "Crawl your website, read your SEO Health score and fix what matters first — indexing blockers, broken links, canonicals, metadata, hreflang and more.",
  category: "Site audits",
  primaryKeyword: "website SEO audit",
  keywords: ["website SEO audit", "technical SEO audit", "SEO audit tool", "site audit", "SEO health check", "website crawler", "broken link checker", "noindex check", "canonical tag checker", "meta description checker", "hreflang checker"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Verify your site, then select Run site audit in SEO tools. Progress shows live and you can cancel a running crawl.",
    "Findings are grouped as critical, warning or notice, with an SEO Health score and a data-confidence note.",
    "Fix indexing blockers first (noindex, HTTP errors, canonical problems), then links, then metadata.",
    "Schedule weekly or monthly audits so new problems are caught early.",
  ],
  body: [
    { type: "p", text: "A **technical SEO audit** checks whether search engines can reach, read and index your pages, and whether each page sends clear signals about what it is. SEO Studio's site audit crawls your verified website and reports exactly which pages have which problems." },

    { type: "h2", id: "run-audit", text: "How to run the audit" },
    { type: "ol", items: [
      "[Add and verify your website](/blog/getting-started-with-seo-studio) with a DNS TXT record or the `seo-studio-verification` meta tag.",
      "Optional: in website settings, set the **maximum pages** to crawl and your **sitemap** and **robots.txt** URLs so the crawler finds every important page.",
      "Open **SEO tools** and select **Run site audit**.",
      "Watch the live progress as pages are scanned. You can **cancel** a crawl at any time; it stops safely after the current page.",
      "When it finishes, review your **SEO Health** score and the findings list.",
    ] },
    { type: "callout", title: "The crawler respects robots.txt", text: "Pages blocked by your robots.txt are skipped and listed as skipped, so you can confirm you are blocking only what you intend to." },

    { type: "h2", id: "score", text: "Understanding your SEO Health score" },
    { type: "p", text: "The score summarizes the issues found across crawled pages, weighted by severity. Next to it, SEO Studio shows a **data confidence** percentage: if some pages couldn't be fetched, confidence drops and the note tells you why. Use the score to track progress over time, but prioritize by severity, not by chasing a number." },

    { type: "h2", id: "checks", text: "What the audit checks" },
    { type: "table", head: ["Area", "Examples of findings"], rows: [
      ["Indexing", "Page is marked noindex · Page is marked nofollow · Page returns an HTTP error"],
      ["Canonicals", "Missing canonical URL · Multiple canonical links · Invalid canonical URL · Canonical points to another origin"],
      ["Links", "Broken internal link · Redirecting internal link · No incoming internal links in this crawl"],
      ["Metadata", "Missing page title · Missing meta description · Meta description may be too short or too long"],
      ["Content structure", "Page has little visible text · Heading levels are skipped · Empty heading element"],
      ["Images", "Images with missing or empty alt text · Duplicate image alt text"],
      ["International", "Invalid hreflang language code · Invalid hreflang URL · Missing hreflang return link"],
      ["Security and basics", "Page is not served over HTTPS · Page loads insecure resources · Missing viewport metadata · Missing document language · Missing character encoding"],
      ["Structured data and sharing", "Invalid JSON-LD · Missing Open Graph title, description or image · Missing X card metadata"],
    ] },
    { type: "p", text: "SEO Studio also detects common platforms — such as Shopify, BigCommerce, Magento, Squarespace, Drupal and Joomla — so you know where fixes need to be made." },

    { type: "h2", id: "prioritize", text: "What to fix first" },
    { type: "ol", items: [
      "**Critical** — anything that stops a page being indexed: unintended `noindex`, HTTP errors, canonicals pointing elsewhere.",
      "**Broken and redirecting internal links** — they waste crawling and send visitors to dead ends.",
      "**Orphan pages** with no internal links — link to them from related pages so search engines can find them.",
      "**Titles and meta descriptions** — unique and descriptive on every important page.",
      "**Content and accessibility** — thin pages, heading order, image alt text.",
    ] },
    { type: "p", text: "Then select **Create SEO action plan** to turn the open findings into tasks your team can work through — see [how to turn an audit into an action plan](/blog/seo-action-plan)." },

    { type: "h2", id: "issues", text: "Managing individual issues" },
    { type: "p", text: "Each issue can be **resolved** when fixed, **ignored** if it doesn't apply to your site, or **reopened**. If a later audit finds a resolved issue again, SEO Studio reopens it automatically, so nothing slips through." },

    { type: "h2", id: "schedule", text: "Schedule regular audits" },
    { type: "p", text: "In website settings, set **Crawl frequency** to **Weekly scheduled audit** or **Monthly scheduled audit**. Each completed audit is saved in the website's history and in **Recent crawls**, so you can compare results over time. Pair it with a [PageSpeed schedule](/blog/page-speed-core-web-vitals) for performance." },

    { type: "h2", id: "export", text: "Share the results" },
    { type: "p", text: "Use **Export report** on the website page to download a CSV of findings for clients, developers or your records." },
  ],
  faqs: [
    { question: "How many pages does the audit crawl?", answer: "You set the maximum pages for each website in its settings. Start with your most important pages and raise the limit as needed." },
    { question: "Why can't I run an audit?", answer: "The website must be verified first. Audits are also unavailable while another crawl is still running for that site, or if the website is paused in its settings." },
    { question: "Does the audit change my website?", answer: "No. The audit only reads public pages. Changes happen only if you make them yourself or approve them through the WordPress connector." },
    { question: "How often should I audit?", answer: "Monthly for most sites, weekly for large or frequently updated sites, and always after a redesign, migration or major content change." },
  ],
  related: ["seo-action-plan", "page-speed-core-web-vitals", "getting-started-with-seo-studio"],
};
