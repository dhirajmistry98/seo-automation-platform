import type { BlogPost } from "@/lib/blog/types";

export const seoActionPlan: BlogPost = {
  slug: "seo-action-plan",
  title: "How to Turn an SEO Audit into an Action Plan Your Team Will Finish",
  metaTitle: "SEO Action Plan: Turn Audit Findings into Team Tasks",
  description: "Create an SEO action plan from your audit in SEO Studio: generate tasks, assign owners and due dates, use team roles, and track every fix to done.",
  excerpt: "Audits only help when fixes get done. Generate tasks from findings, assign owners and due dates, give your team the right roles, and track progress.",
  category: "Team workflow",
  primaryKeyword: "SEO action plan",
  keywords: ["SEO action plan", "SEO task management", "SEO project management", "SEO workflow", "SEO team collaboration", "SEO roadmap", "fix SEO issues", "SEO agency workflow", "SEO client reporting"],
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  takeaways: [
    "Select Create SEO action plan after an audit to turn open findings into tasks.",
    "Each task can be assigned, given a due date, discussed in comments and moved from To do to In progress to Done.",
    "Seven team roles control who can view, edit, audit and manage each website.",
    "If an audit finds a fixed problem again, its task moves back to To do automatically.",
  ],
  body: [
    { type: "p", text: "Most SEO audits fail at the same point: a long list of issues that nobody owns. SEO Studio turns audit findings into an **SEO action plan** — a list of tracked tasks your team can assign, discuss and close." },

    { type: "h2", id: "create-plan", text: "Create your action plan" },
    { type: "ol", items: [
      "[Run a site audit](/blog/how-to-run-a-technical-seo-audit) on your verified website.",
      "Under the audit result, select **Create SEO action plan**.",
      "SEO Studio creates tasks from the open findings and tells you how many were added or reopened.",
      "Open the task list to start assigning work.",
    ] },

    { type: "h2", id: "manage-tasks", text: "Manage tasks" },
    { type: "ul", items: [
      "**Status** — move each task between **To do**, **In progress** and **Done**.",
      "**Assignee** — give every task one clear owner from your workspace.",
      "**Due date** — schedule work around releases and content calendars.",
      "**Comments** — record decisions, questions and links to fixes on the task itself.",
      "**History** — every change is recorded, so you can see who changed what and when.",
    ] },
    { type: "callout", title: "Fixes are verified by the next audit", text: "When a later audit detects a problem from a Done task again, the task is reopened as To do. Your plan always reflects the site as it really is, not as people remember it." },

    { type: "h2", id: "prioritize", text: "Prioritize the plan" },
    { type: "table", head: ["Order", "Work on", "Why"], rows: [
      ["1", "Critical findings: noindex, HTTP errors, canonical problems", "They stop pages appearing in search at all"],
      ["2", "Broken and redirecting internal links, orphan pages", "They waste crawling and hide pages"],
      ["3", "Titles, meta descriptions, headings", "They shape how pages rank and get clicked"],
      ["4", "Images, structured data, Open Graph", "Enhancements once the basics are solid"],
    ] },
    { type: "p", text: "Within each level, start with the pages that matter most to your business — those with the most traffic or conversions. [Connect Search Console and GA4](/blog/connect-google-search-console-and-ga4) to see which pages those are." },

    { type: "h2", id: "team-roles", text: "Give your team the right access" },
    { type: "p", text: "Invite people to your organization and choose a role for each:" },
    { type: "table", head: ["Role", "Typical use"], rows: [
      ["Owner", "Full control of the organization and its members"],
      ["Administrator", "Manages websites, members and settings"],
      ["SEO manager", "Runs audits and research, manages the action plan"],
      ["SEO specialist", "Runs audits and works on tasks"],
      ["Content editor", "Works on content and metadata tasks"],
      ["Analyst", "Reviews reports and data"],
      ["Viewer", "Read-only access, ideal for clients and stakeholders"],
    ] },
    { type: "p", text: "Agencies can keep each client's websites separate and give clients **Viewer** access so they can follow progress without changing anything." },

    { type: "h2", id: "report", text: "Report progress" },
    { type: "p", text: "Use **Export report** for a CSV of findings, compare SEO Health between audits in **Recent crawls**, and pair the plan with [rank tracking](/blog/keyword-research-and-rank-tracking) to show the impact of fixes on visibility." },
  ],
  faqs: [
    { question: "Can I create tasks without an audit?", answer: "The action plan is generated from audit findings so every task is tied to evidence on a specific page. Run an audit first, then create the plan." },
    { question: "What happens if I fix an issue but don't close the task?", answer: "Mark it Done when the fix is live. The next audit confirms it: if the problem is gone it stays resolved; if it is found again the task reopens." },
    { question: "Can clients see the plan without editing it?", answer: "Yes. Give clients the Viewer role so they can see websites, reports and progress without making changes." },
  ],
  related: ["how-to-run-a-technical-seo-audit", "getting-started-with-seo-studio", "keyword-research-and-rank-tracking"],
};
