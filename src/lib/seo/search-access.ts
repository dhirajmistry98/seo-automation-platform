export const AI_SEARCH_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;
export type HomepageCrawlerPolicy = "allowed_on_root" | "blocked_on_root" | "not_specified" | "unknown";
export type SearchCrawlerAccess = {
  robotsTxt: { available: boolean; statusCode: number | null };
  bots: Record<(typeof AI_SEARCH_CRAWLERS)[number], HomepageCrawlerPolicy>;
  llmsTxt: { status: "available" | "not_found" | "unavailable"; statusCode: number | null; bytes: number | null };
};

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[] };

function parseGroups(robotsText: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent" && value) {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && value && current) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  return groups;
}

function matchesRoot(rulePath: string) {
  const escaped = rulePath.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try { return new RegExp(`^${escaped}`).test("/"); } catch { return false; }
}

export function robotsHomepagePolicy(robotsText: string, crawler: string): HomepageCrawlerPolicy {
  const groups = parseGroups(robotsText);
  const agent = crawler.toLowerCase();
  const exact = groups.filter((group) => group.agents.includes(agent));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  if (!selected.length) return "not_specified";
  const rules = selected.flatMap((group) => group.rules).filter((rule) => matchesRoot(rule.path));
  if (!rules.length) return "allowed_on_root";
  rules.sort((a, b) => b.path.replace(/[*$]/g, "").length - a.path.replace(/[*$]/g, "").length || Number(b.allow) - Number(a.allow));
  return rules[0].allow ? "allowed_on_root" : "blocked_on_root";
}

export function summarizeSearchCrawlerAccess(input: unknown): SearchCrawlerAccess | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const robots = record.robotsTxt && typeof record.robotsTxt === "object" ? record.robotsTxt as Record<string, unknown> : null;
  const botsInput = record.bots && typeof record.bots === "object" ? record.bots as Record<string, unknown> : null;
  const llms = record.llmsTxt && typeof record.llmsTxt === "object" ? record.llmsTxt as Record<string, unknown> : null;
  if (!robots || !botsInput || !llms) return null;
  const bots = Object.fromEntries(AI_SEARCH_CRAWLERS.map((name) => {
    const value = botsInput[name];
    const allowed = ["allowed_on_root", "blocked_on_root", "not_specified", "unknown"].includes(String(value));
    return [name, allowed ? value : "unknown"];
  })) as SearchCrawlerAccess["bots"];
  const llmsStatus = ["available", "not_found", "unavailable"].includes(String(llms.status)) ? llms.status as SearchCrawlerAccess["llmsTxt"]["status"] : "unavailable";
  return {
    robotsTxt: { available: robots.available === true, statusCode: Number.isInteger(robots.statusCode) ? Number(robots.statusCode) : null },
    bots,
    llmsTxt: { status: llmsStatus, statusCode: Number.isInteger(llms.statusCode) ? Number(llms.statusCode) : null, bytes: Number.isInteger(llms.bytes) ? Number(llms.bytes) : null },
  };
}
