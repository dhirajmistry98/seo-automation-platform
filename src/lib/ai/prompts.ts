import { truncate } from "./config";
import type { AiGenContext, AiTask } from "./types";

export const SYSTEM_PROMPT =
  "You are an expert SEO consultant inside SEO Studio. Your responses are professional, specific, and actionable. You focus on practical improvements backed by search engine best practices. Never invent metrics or claim data you have not been given is accurate. Keep answers concise and structured.";

export function buildPrompt(task: AiTask, ctx: AiGenContext): string {
  switch (task) {
    case "seo-titles":
      return `Generate 5 SEO-optimised title tags for a web page.

Domain: ${ctx.domain ?? "unknown"}
URL: ${ctx.url ?? "unknown"}
Current title: ${ctx.title || "none"}
Target keyword: ${ctx.keyword || "unknown"}
Description: ${ctx.description || "none"}

Requirements:
- 50-60 characters each
- Include the target keyword naturally near the front
- Compelling, click-worthy phrasing
- Avoid keyword stuffing
- Output format: numbered list of titles only, no extra commentary`;

    case "meta-description":
      return `Write 3 meta descriptions for this web page.

URL: ${ctx.url ?? "unknown"}
Title: ${ctx.title || "none"}
Target keyword: ${ctx.keyword || "unknown"}
Content summary: ${truncate(ctx.content || ctx.description || "none", 500)}

Requirements:
- 120-160 characters each
- Include the keyword naturally
- Include a call to action
- Highlight a unique benefit
- Output: numbered list only`;

    case "keywords":
      return `Suggest 15 target keywords for this website.

Domain: ${ctx.domain ?? "unknown"}
Description: ${truncate(ctx.description || "none", 400)}
Current title: ${ctx.title || "none"}

Group into three sections:
1. Primary keywords (3-5): high-intent, transactional
2. Secondary keywords (5-7): informational, mid-funnel
3. Long-tail keywords (5-7): specific questions and phrases

Include the likely search intent (buy / learn / navigate / compare) after each keyword in parentheses.`;

    case "content-optimize":
      return `Analyse this content and give specific SEO improvement recommendations.

Target keyword: ${ctx.keyword || "unknown"}
Current content:
${truncate(ctx.content || "none", 2000)}

Provide exactly these five sections:
1. Keyword density assessment (current density and recommendation)
2. Missing semantic keywords to add (list 5-8 phrases)
3. Content structure improvements (headings, word count, sections)
4. Internal linking opportunities (types of pages to link to/from)
5. Schema markup recommendation (which type and why)
Keep each point specific and actionable.`;

    case "audit-summary":
      return `Summarise these SEO audit findings in plain language for a non-technical client.

Domain: ${ctx.domain ?? "unknown"}
Audit data:
${truncate(ctx.auditData || {}, 3000)}

Write a 3-paragraph executive summary:
1. Overall health (score, key strengths)
2. Critical issues requiring immediate attention
3. Recommended next steps in priority order
Use clear, jargon-free language. Do not invent data not present in the audit.`;

    case "report-narrative":
      return `Write a professional SEO performance narrative for a client report.

Domain: ${ctx.domain ?? "unknown"}
Report data:
${truncate(ctx.reportData || {}, 3000)}

Write 2-3 paragraphs:
- Highlight wins and improvements shown in the data
- Explain the most important metrics in context
- Identify clear opportunities for the next period
Professional, positive but honest tone. Do not fabricate numbers.`;

    case "chat":
      return ctx.question?.trim() || "Hello, how can you help with SEO?";

    default:
      return ctx.question?.trim() || "Hello";
  }
}

export function taskOutputTokens(task: AiTask): number {
  if (task === "chat") return 2048;
  if (task === "keywords" || task === "content-optimize") return 1024;
  return 768;
}

export function taskTemperature(task: AiTask): number {
  if (task === "keywords" || task === "chat") return 0.7;
  return 0.4;
}
