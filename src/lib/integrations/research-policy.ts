/**
 * Which data source a research report may use. Paid provider calls (optional — requires DATAFORSEO_LOGIN)
 * are only allowed for verified websites to prevent unverified sites from incurring provider costs.
 * Free kinds use Google Autocomplete + Search Console and always work without a paid provider.
 */
export const FREE_CAPABLE_KINDS = ["keywords", "questions", "rank"] as const;

export function researchSource(kind: string, options: { paidConfigured: boolean; verified: boolean }): "paid" | "free" | "blocked" {
  const freeCapable = (FREE_CAPABLE_KINDS as readonly string[]).includes(kind);
  if (options.paidConfigured && options.verified) return "paid";
  return freeCapable ? "free" : "blocked";
}
