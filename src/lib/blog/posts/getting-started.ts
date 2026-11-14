import type { BlogPost } from "@/lib/blog/types";

export const gettingStarted: BlogPost = {
  slug: "getting-started-with-seo-studio",
  title: "Getting Started with SEO Studio: From First Audit to Search Growth",
  metaTitle: "How to Use SEO Studio: Complete Getting Started Guide",
  description: "Set up SEO Studio step by step: add and verify your website, run a technical SEO audit, test page speed, research keywords in any country and track progress.",
  excerpt: "The complete walkthrough: add and verify your site, run your first audit, test page speed, research your market, check AI-search readiness and build an action plan.",
  category: "Getting started",
  primaryKeyword: "SEO platform",
  keywords: ["SEO platform", "SEO tool", "SEO software", "website SEO checker", "SEO audit tool", "how to improve SEO", "SEO workflow", "all-in-one SEO tool", "SEO for any country", "SEO Studio"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  pillar: true,
  takeaways: [
    "Everything in SEO Studio is organized by website. Add your site first, then verify you own it.",
    "Your first site audit shows what is stopping pages from ranking, grouped by severity with an SEO Health score.",
    "Set the country, city or region and language once per website; research and rank tracking use it.",
    "Turn findings into tasks, assign them to your team, and re-audit to confirm the fixes worked.",
  ],
  body: [
    { type: "p", text: "**SEO Studio** is an SEO platform that brings technical audits, page speed tests, keyword and rank research, AI-search readiness checks, Google data, WordPress updates and an influencer marketplace into one workspace. This guide takes you from a new account to a working SEO routine." },

    { type: "h2", id: "create-workspace", text: "Step 1: Create your account and workspace" },
    { type: "p", text: "[Sign in](/login) with Google or with a one-time code sent to your email — there is no password to remember. Your workspace holds your websites, reports and team. If you work with colleagues or clients, you can invite them later and give each person a role." },

    { type: "h2", id: "add-website", text: "Step 2: Add your website" },
    { type: "p", text: "Open **Websites** and enter your domain, such as `example.com`. Then open the website's settings to tell SEO Studio about it:" },
    { type: "ul", items: [
      "**Website type and business category** — so findings and research fit your business.",
      "**Primary keywords** — up to 30, comma separated. Scheduled rank tracking checks the first 10.",
      "**Search market** — the target country, city or region and the language your customers search in.",
      "**Competitor domains** — used by competitor research.",
      "**Sitemap and robots.txt URLs**, the **maximum pages** to crawl, and your **time zone**.",
    ] },

    { type: "h2", id: "verify", text: "Step 3: Verify that you own the site" },
    { type: "p", text: "Before SEO Studio crawls a site, it confirms you control it. Choose one method:" },
    { type: "ol", items: [
      "**DNS TXT record** — add the TXT record SEO Studio shows you at `_seo-studio.yourdomain.com` in your domain's DNS settings.",
      "**HTML meta tag** — add the `seo-studio-verification` meta tag to your home page's `<head>`.",
    ] },
    { type: "p", text: "Then select **Verify**. DNS changes can take a little while to appear; if the record isn't found yet, wait a few minutes and try again." },

    { type: "h2", id: "first-audit", text: "Step 4: Run your first site audit" },
    { type: "p", text: "Open **SEO tools** and select **Run site audit**. SEO Studio crawls your pages, shows live progress, and returns an **SEO Health** score with every finding grouped as critical, warning or notice. Read [how to run a technical SEO audit](/blog/how-to-run-a-technical-seo-audit) for what each check means and what to fix first." },

    { type: "h2", id: "page-speed", text: "Step 5: Test page speed" },
    { type: "p", text: "Choose **Mobile** or **Desktop** and select **Run PageSpeed** to load Google Lighthouse scores and performance opportunities. See [how to test page speed and Core Web Vitals](/blog/page-speed-core-web-vitals)." },

    { type: "h2", id: "research", text: "Step 6: Research your market" },
    { type: "p", text: "In **Research**, pick a report — keyword demand, AEO question keywords, live organic positions, backlink summary, competitor keyword gaps or AI search mentions — for any supported country, city and language. See [keyword research and rank tracking for any country](/blog/keyword-research-and-rank-tracking)." },

    { type: "h2", id: "ai-search", text: "Step 7: Check AI-search readiness" },
    { type: "p", text: "Open **Visibility** to see how ready your crawled pages are for Google AI Overviews, ChatGPT and other answer engines. See [how to check GEO, AEO and LLMO readiness](/blog/check-ai-search-readiness-geo-aeo-llmo)." },

    { type: "h2", id: "connect-data", text: "Step 8: Connect your data" },
    { type: "p", text: "Connect Google Search Console, Google Analytics 4, Merchant Center or Business Profile per website to see real search and traffic data next to your audits ([guide](/blog/connect-google-search-console-and-ga4)). If your site runs on WordPress, install the SEO Studio Connector plugin to edit titles, descriptions and sitemaps from SEO Studio ([guide](/blog/wordpress-seo-plugin))." },

    { type: "h2", id: "action-plan", text: "Step 9: Turn findings into an action plan" },
    { type: "p", text: "Select **Create SEO action plan** after an audit to turn open findings into tasks. Assign them, set due dates, discuss them in comments and mark them done. See [how to turn an audit into an action plan](/blog/seo-action-plan)." },

    { type: "h2", id: "grow-reach", text: "Step 10: Grow reach with creators" },
    { type: "p", text: "Brands can also use SEO Studio's **Influencer Marketing** workspace to publish campaigns and invite verified Instagram creators. See [how influencer marketing works in SEO Studio](/blog/influencer-marketing-for-brands-and-creators)." },

    { type: "h2", id: "routine", text: "Your monthly SEO routine" },
    { type: "table", head: ["When", "What to do in SEO Studio"], rows: [
      ["Weekly", "Review open tasks; check Search Console data for sudden drops"],
      ["Monthly", "Re-run the site audit and PageSpeed; review rank tracking and AI search mentions"],
      ["Quarterly", "Refresh keyword research and competitor gaps; update your primary keywords"],
    ] },
    { type: "callout", title: "Automate the checks", text: "In website settings, set **Crawl frequency** to a weekly or monthly scheduled audit, **PageSpeed schedule** to a weekly or monthly mobile homepage check, and **Rank tracking frequency** to weekly or monthly, so fresh data is waiting for you." },
  ],
  faqs: [
    { question: "Do I need technical skills to use SEO Studio?", answer: "No. Each finding explains what is wrong and which page it affects. Some fixes, such as DNS verification or template changes, may need whoever manages your website or hosting." },
    { question: "Does SEO Studio work for websites outside my country?", answer: "Yes. Audits and page speed tests work for any public website. Research and rank tracking let you choose the country, city or region and language, subject to the search data provider's coverage for that market." },
    { question: "Why do I need to verify my website?", answer: "Verification proves you control the site before SEO Studio crawls it and connects data to it. It protects site owners from others running audits or linking data to sites they don't own." },
    { question: "Can my team use the same workspace?", answer: "Yes. Invite teammates to your organization and give each a role — owner, administrator, SEO manager, SEO specialist, content editor, analyst or viewer — so everyone sees and changes only what they should." },
  ],
  related: ["how-to-run-a-technical-seo-audit", "keyword-research-and-rank-tracking", "check-ai-search-readiness-geo-aeo-llmo"],
};
