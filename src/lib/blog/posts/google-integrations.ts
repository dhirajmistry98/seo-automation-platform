import type { BlogPost } from "@/lib/blog/types";

export const googleIntegrations: BlogPost = {
  slug: "connect-google-search-console-and-ga4",
  title: "Connect Google Search Console, GA4, Merchant Center and Business Profile",
  metaTitle: "Connect Google Search Console & GA4 to SEO Studio",
  description: "Connect Google Search Console, Google Analytics 4, Merchant Center and Business Profile to SEO Studio per website and see real search data next to audits.",
  excerpt: "See real clicks, impressions, queries and traffic next to your audits by connecting Google Search Console, GA4, Merchant Center and Business Profile per website.",
  category: "Integrations",
  primaryKeyword: "Google Search Console integration",
  keywords: ["Google Search Console integration", "GA4 integration", "Google Analytics 4 SEO", "Search Console data", "Merchant Center", "Google Business Profile", "SEO reporting dashboard", "organic search performance", "SEO data integration"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Connections are made per website, so each site only shows its own data.",
    "Search Console shows real clicks, impressions, queries and positions from Google Search.",
    "GA4 shows what organic visitors do on your site; Merchant Center and Business Profile cover shopping and local.",
    "SEO Studio only shows data your connected Google account can already access.",
  ],
  body: [
    { type: "p", text: "Audits tell you what could be better. Google's own data tells you what is actually happening: which searches bring visitors, which pages earn clicks, and what those visitors do. SEO Studio connects four Google services per website." },

    { type: "h2", id: "services", text: "What each connection adds" },
    { type: "table", head: ["Service", "What you see"], rows: [
      ["Google Search Console", "Clicks, impressions, click-through rate, average position, top queries and pages from Google Search"],
      ["Google Analytics 4", "Traffic and engagement from organic search and other channels"],
      ["Google Merchant Center", "Product feed information for ecommerce sites"],
      ["Google Business Profile", "Your local business listing information"],
    ] },

    { type: "h2", id: "connect", text: "How to connect" },
    { type: "ol", items: [
      "Make sure your website is added and verified in SEO Studio.",
      "Open **Integrations** and find your website under **Available sites**.",
      "Open **Google integrations & reports** and choose the service to connect.",
      "Sign in with the Google account that has access to that property and approve the requested access.",
      "Choose the property (for example your Search Console property or GA4 property). Data appears once Google returns it.",
    ] },
    { type: "callout", title: "Only data you already have access to", text: "SEO Studio can only show data your Google account can already see. If a property doesn't appear, ask its owner in Google to add your account first." },

    { type: "h2", id: "use-data", text: "How to use the data" },
    { type: "ul", items: [
      "**Find quick wins** — queries with many impressions but a low click-through rate usually need a better title and meta description.",
      "**Prioritize audit fixes** — fix issues on the pages with the most clicks and conversions first, using your [action plan](/blog/seo-action-plan).",
      "**Spot drops early** — a sudden fall in clicks on a page is a reason to re-run the [site audit](/blog/how-to-run-a-technical-seo-audit).",
      "**Feed the SEO Authority Index** — saved Search Console data is one of its evidence sources.",
    ] },

    { type: "h2", id: "privacy", text: "Managing access" },
    { type: "p", text: "Each connection belongs to one website and organization. You can see each connection's status on the Integrations page, and you can remove SEO Studio's access at any time from your Google account's security settings." },
  ],
  faqs: [
    { question: "Why does it say 0 connected?", answer: "No Google service has been connected for that website yet. Open Google integrations & reports for the site and connect the services you use." },
    { question: "Can SEO Studio change my Google settings?", answer: "SEO Studio uses the connection to load reports for your website. Changes to your Google properties are made in Google's own tools." },
    { question: "Do I need all four services?", answer: "No. Connect only what you use. Search Console is the most useful for SEO; add GA4 for visitor behaviour, Merchant Center for online stores and Business Profile for local businesses." },
  ],
  related: ["getting-started-with-seo-studio", "page-speed-core-web-vitals", "wordpress-seo-plugin"],
};
