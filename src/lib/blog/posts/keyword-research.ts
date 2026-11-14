import type { BlogPost } from "@/lib/blog/types";

export const keywordResearch: BlogPost = {
  slug: "keyword-research-and-rank-tracking",
  title: "Keyword Research and Rank Tracking for Any Country, City and Language",
  metaTitle: "Keyword Research & Rank Tracking in Any Country or City",
  description: "Research keywords, questions, backlinks and competitors, and track Google rankings for any country, city or region and language with SEO Studio.",
  excerpt: "Pick your exact market — country, city or region and language — then research demand, questions, competitors and backlinks, and track rankings on mobile or desktop.",
  category: "Research & rankings",
  primaryKeyword: "rank tracker",
  keywords: ["rank tracker", "keyword research tool", "local rank tracking", "keyword rank checker", "Google rank checker", "competitor keyword gap", "backlink checker", "question keywords", "international keyword research", "city level rank tracking", "mobile rank tracking"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Set the target country, city or region and language once per website; reports and rank tracking use it.",
    "Six report types: keyword demand, AEO question keywords, live organic positions, backlink summary, competitor keyword gaps and AI search mentions.",
    "Track rankings on mobile or desktop, manually or on a weekly or monthly schedule.",
    "Local results differ street by street — track from the exact city or area your customers search from.",
  ],
  body: [
    { type: "p", text: "Rankings depend on where and how people search. The same keyword shows different results in Mumbai and London, in English and Hindi, on mobile and desktop. SEO Studio lets you research and track each market exactly." },

    { type: "h2", id: "set-market", text: "Step 1: Choose your search market" },
    { type: "ol", items: [
      "Open your website's settings and go to **Search market**.",
      "Choose the **country**. The language list updates to the languages searched in that country.",
      "Search for a **city, region or local area** to target a specific place — essential for local businesses.",
      "Choose the **language** your customers search in, and the **search device** (mobile or desktop).",
    ] },
    { type: "callout", title: "Coverage varies by market", text: "Research data comes from a live search data provider. Most countries and major cities are covered; smaller locations may have less data." },

    { type: "h2", id: "reports", text: "Step 2: Pick the right research report" },
    { type: "table", head: ["Report", "Use it to"], rows: [
      ["Keyword demand", "See search volume, competition and cost-per-click for keywords in your market"],
      ["AEO question keywords", "Find the questions people ask, to answer in content and FAQs"],
      ["Live organic positions", "Check where your pages rank right now for chosen keywords"],
      ["Backlink summary", "Review the links pointing to your site"],
      ["Competitor keyword gaps", "Find keywords a competitor ranks for that you don't"],
      ["AI search mentions", "See whether your brand is mentioned in Google AI Overviews or ChatGPT answers"],
    ] },
    { type: "p", text: "Open **Research**, choose your website, select a report type, add keywords (or a competitor domain) and run it. Each report is saved to the website's history and shared with teammates who can view reports." },

    { type: "h2", id: "keyword-strategy", text: "Step 3: Turn research into a keyword plan" },
    { type: "ul", items: [
      "Group keywords by **search intent** — learning, comparing, buying or finding a local business — and assign one page per group.",
      "Use **question keywords** for FAQ sections and how-to content; they also help with AI answers.",
      "Use **competitor gaps** to find topics your site doesn't cover yet.",
      "Research **each country and language separately** — direct translations often miss the words people really use.",
    ] },

    { type: "h2", id: "rank-tracking", text: "Step 4: Track rankings automatically" },
    { type: "ol", items: [
      "Add up to 30 **primary keywords** in website settings. Scheduled tracking checks the first 10.",
      "Set **Rank tracking frequency** to **Weekly** or **Monthly** (or keep **Manual only**).",
      "Choose the **search device**: mobile or desktop.",
      "Review position changes over time and pair them with your [action plan](/blog/seo-action-plan) to see which fixes moved rankings.",
    ] },

    { type: "h2", id: "local", text: "Tip: track local rankings precisely" },
    { type: "p", text: "For shops, clinics, restaurants and service businesses, choose the specific city or area rather than the whole country. You'll see the results your nearby customers actually see — and whether you appear for searches like \"dentist in Pune\"." },
  ],
  faqs: [
    { question: "Can I research several countries for one website?", answer: "Yes. Choose a different market when you run a research report. Scheduled rank tracking uses the market saved in the website's settings." },
    { question: "Why do my rankings differ from what I see in Google?", answer: "Your own searches are affected by your location, language, device and search history. SEO Studio checks from the market and device you choose, without personalization, which gives a more consistent view." },
    { question: "What does AI search mentions show?", answer: "It checks whether your brand appears in Google AI Overviews or ChatGPT answers for chosen prompts, in the selected market. It is a snapshot from a provider, separate from the crawl-based readiness checks." },
  ],
  related: ["check-ai-search-readiness-geo-aeo-llmo", "seo-action-plan", "getting-started-with-seo-studio"],
};
