import type { BlogPost } from "@/lib/blog/types";

export const keywordResearch: BlogPost = {
  slug: "keyword-research-and-rank-tracking",
  title: "Keyword Research and Rank Tracking with Google Search Console",
  metaTitle: "Keyword Research & Rank Tracking with Search Console",
  description: "Find keyword and question ideas for any country and language, and track your own keyword positions, clicks and impressions using your Google Search Console data.",
  excerpt: "Get keyword and question ideas from Google autocomplete, then use your real Search Console data to see where you rank, which keywords are close to page one, and where pages compete with each other.",
  category: "Research & rankings",
  primaryKeyword: "keyword research tool",
  keywords: ["keyword research tool", "free keyword research", "question keywords", "keyword position tracking", "Search Console keywords", "keyword cannibalization", "quick win keywords", "international keyword ideas"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-25",
  takeaways: [
    "Keyword ideas and question keywords come from Google autocomplete for the country and language you choose.",
    "Positions, clicks and impressions come from your own Google Search Console data, so you need to connect Search Console first.",
    "Quick wins show keywords that already sit just outside the top 10; cannibalization shows pages competing for the same keyword.",
    "SEO Studio does not provide search volume, keyword difficulty, cost-per-click, backlink or competitor data.",
  ],
  body: [
    { type: "p", text: "Good keyword work answers two questions: what are people searching for, and where does my site already show up? SEO Studio answers the first with Google autocomplete suggestions and the second with your own Google Search Console data." },

    { type: "h2", id: "reports", text: "Step 1: Pick a research report" },
    { type: "table", head: ["Report", "Use it to"], rows: [
      ["Keyword ideas", "Get keyword suggestions for a topic, in the country and language you choose"],
      ["AEO question keywords", "Find the questions people ask, to answer in headings, FAQs and content"],
      ["Quick wins", "See keywords you already rank for just outside the top 10 — the fastest ones to improve"],
      ["Keyword positions", "Check your average Google position, clicks and impressions for chosen keywords"],
      ["Keyword cannibalization", "Find keywords where several of your pages compete against each other"],
    ] },
    { type: "p", text: "Open **Research**, choose your website, select a report type, add your keyword or topic and run it. Each report is saved to the website's history." },
    { type: "callout", title: "What these numbers are", text: "Keyword ideas are suggestions, not measured search volume. Positions are the impression-weighted average from Search Console over the last 28 days, not a live check of Google, so they are not filtered by device or city." },

    { type: "h2", id: "connect", text: "Step 2: Connect Search Console" },
    { type: "ol", items: [
      "Open **Integrations** and connect Google Search Console for your verified website.",
      "Run a Search Console report so your keywords, clicks and impressions are saved.",
      "Return to **Research** to see quick wins, positions and cannibalization for your site.",
    ] },

    { type: "h2", id: "keyword-strategy", text: "Step 3: Turn research into a keyword plan" },
    { type: "ul", items: [
      "Group keywords by **search intent** — learning, comparing, buying or finding a local business — and assign one page per group.",
      "Use **question keywords** for FAQ sections and how-to content; they also help with AI answers.",
      "Improve the pages behind your **quick wins** first: better titles, clearer headings and internal links often move them onto page one.",
      "Fix **cannibalization** by merging pages or making each page target a clearly different keyword.",
      "Research **each country and language separately** — direct translations often miss the words people really use.",
    ] },

    { type: "h2", id: "rank-tracking", text: "Step 4: Track your keyword positions" },
    { type: "ol", items: [
      "Add up to 30 **primary keywords** in website settings. Scheduled tracking checks the first 10.",
      "Set **Rank tracking frequency** to **Daily**, **Weekly** or **Monthly** (or keep **Manual only**). Scheduled checks need the scheduler to be set up.",
      "Review position changes over time and pair them with your [action plan](/blog/seo-action-plan) to see which fixes moved rankings.",
    ] },
    { type: "p", text: "A keyword that shows no impressions in Search Console has not been seen in Google results for your site in the last 28 days, so SEO Studio reports it as not ranking yet rather than guessing a position." },
  ],
  faqs: [
    { question: "Does SEO Studio show search volume or keyword difficulty?", answer: "No. Search volume, keyword difficulty and cost-per-click need a paid data source, which SEO Studio does not use. Use keyword ideas for inspiration and your Search Console impressions as a real measure of demand for keywords you already appear for." },
    { question: "Can I research several countries for one website?", answer: "Yes. Choose a different country and language when you run a keyword ideas or question report." },
    { question: "Why do my positions differ from what I see in Google?", answer: "Your own searches are affected by your location, language, device and search history. Search Console reports an average across all searches that showed your site over 28 days, which is a more consistent view but is not a live ranking check." },
    { question: "Does it check backlinks or competitors?", answer: "No. SEO Studio focuses on your own site: audits, on-page checks, Search Console data and AI search readiness." },
  ],
  related: ["check-ai-search-readiness-geo-aeo-llmo", "seo-action-plan", "getting-started-with-seo-studio"],
};
