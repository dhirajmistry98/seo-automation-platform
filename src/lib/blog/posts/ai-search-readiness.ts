import type { BlogPost } from "@/lib/blog/types";

export const aiSearchReadiness: BlogPost = {
  slug: "check-ai-search-readiness-geo-aeo-llmo",
  title: "How to Check if Your Website Is Ready for AI Search (GEO, AEO & LLMO)",
  metaTitle: "AI Search Readiness Check: GEO, AEO & LLMO for Websites",
  description: "Check how ready your website is for Google AI Overviews, ChatGPT and other answer engines with SEO Studio's GEO, AEO and LLMO readiness signals.",
  excerpt: "Check the 12 crawl-based signals that help AI answer engines understand and cite your pages, then track real brand mentions in AI Overviews and ChatGPT.",
  category: "AI search (GEO)",
  primaryKeyword: "generative engine optimization",
  keywords: ["generative engine optimization", "GEO", "AEO", "answer engine optimization", "LLMO", "AI search optimization", "AI Overviews optimization", "ChatGPT SEO", "AI search visibility", "LLM SEO", "AI readiness check"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "GEO, AEO and LLMO all depend on pages that machines can read clearly and trust.",
    "SEO Studio's readiness report checks 12 signals from your latest site crawl, such as direct answer blocks, question-led headings and entity markup.",
    "AI search mention reports show whether your brand actually appears in Google AI Overviews and ChatGPT answers.",
    "The SEO Authority Index combines backlink, Search Console and crawl evidence into one trackable estimate.",
  ],
  body: [
    { type: "p", text: "More and more searches end in an AI-written answer: Google AI Overviews, ChatGPT, Perplexity, Copilot. **Generative engine optimization (GEO)**, **answer engine optimization (AEO)** and **LLM optimization (LLMO)** are about making your pages easy for these systems to understand, trust and cite." },
    { type: "p", text: "SEO Studio checks this in two ways: crawl-based **readiness signals** for your own pages, and provider-based **AI search mention** reports that show what AI answers actually say." },

    { type: "h2", id: "open-report", text: "Open your readiness report" },
    { type: "ol", items: [
      "[Run a site audit](/blog/how-to-run-a-technical-seo-audit) — readiness uses your latest crawl.",
      "Open **Visibility** and choose your website.",
      "Review each signal and the pages that need work.",
    ] },

    { type: "h2", id: "signals", text: "The 12 readiness signals" },
    { type: "table", head: ["Signal", "What it looks for"], rows: [
      ["Direct answer blocks", "Short, self-contained answers near the top of sections"],
      ["Question-led headings", "Headings phrased as the questions people ask"],
      ["Semantic content structure", "Clear headings, lists and logical page structure"],
      ["Page summary metadata", "Titles and descriptions that summarize the page"],
      ["Structured page context", "Structured data describing the page"],
      ["Machine-readable context", "Valid JSON-LD that machines can parse"],
      ["Entity identity markup", "Organization or Person markup that identifies who you are"],
      ["FAQ or Q&A schema", "Question-and-answer markup for FAQ content"],
      ["Author attribution", "A named author for content"],
      ["Authorship and provenance", "Signals about who published the content and when"],
      ["Outbound reference links", "Links to sources that support your claims"],
      ["HTTP and index directives", "Pages that are reachable and allowed to be indexed"],
    ] },
    { type: "callout", title: "Most of it is good SEO", text: "AI answer engines retrieve from search indexes and quote clear, trustworthy passages. Fixing these signals usually improves classic rankings and featured snippets at the same time." },

    { type: "h2", id: "improve", text: "How to improve weak signals" },
    { type: "ul", items: [
      "Start each important page and section with a one-to-three-sentence direct answer.",
      "Rewrite key headings as the questions customers ask — use [AEO question keywords](/blog/keyword-research-and-rank-tracking) to find them.",
      "Add Organization structured data with your name, logo and profiles; add FAQ markup where you have FAQs.",
      "Show a named author with real expertise and an accurate publish or update date.",
      "Support statistics and claims with links to their original sources.",
      "Make sure important pages aren't blocked by `noindex` or robots.txt — check the [site audit](/blog/how-to-run-a-technical-seo-audit).",
    ] },

    { type: "h2", id: "ai-mentions", text: "Track real AI mentions" },
    { type: "p", text: "In **Research**, choose **AI search mentions**, pick **Google AI Overviews** or **ChatGPT**, and enter the questions your customers ask. The report shows whether your brand is mentioned in the answers for your selected market. Re-run it monthly to see whether your readiness work is paying off." },

    { type: "h2", id: "authority", text: "Measure trust with the SEO Authority Index" },
    { type: "p", text: "The **SEO Authority Index** calculates a versioned authority estimate from your saved backlink, Search Console and crawl evidence. It doesn't make new paid provider requests; refresh the source reports to update it. Track it alongside readiness to see your site's overall trust grow." },
  ],
  faqs: [
    { question: "Is GEO different from SEO?", answer: "GEO builds on SEO. AI answer engines mostly retrieve from search indexes, so crawlable, indexed, trustworthy pages come first. GEO adds a focus on clear answers, structure, sources and consistent brand information." },
    { question: "Why is my readiness report empty?", answer: "Readiness uses your latest crawl. Verify the website and run a site audit, then open Visibility again." },
    { question: "Can SEO Studio guarantee my site appears in AI Overviews?", answer: "No tool can guarantee that. AI systems choose sources themselves. SEO Studio shows which signals to improve and tracks whether you are being mentioned." },
  ],
  related: ["keyword-research-and-rank-tracking", "how-to-run-a-technical-seo-audit", "getting-started-with-seo-studio"],
};
