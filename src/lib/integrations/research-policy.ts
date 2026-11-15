/**
 * Which data source a research report may use. Paid provider calls (DataForSEO, billed to the operator)
 * are only allowed for verified websites: website creation is unlimited, so unverified sites must never
 * reach the paid provider. Free kinds fall back to Google autocomplete + Search Console.
 */
export const FREE_CAPABLE_KINDS = ["keywords", "questions", "rank"] as const;

export function researchSource(kind: string, options: { paidConfigured: boolean; verified: boolean }): "paid" | "free" | "blocked" {
  const freeCapable = (FREE_CAPABLE_KINDS as readonly string[]).includes(kind);
  if (options.paidConfigured && options.verified) return "paid";
  return freeCapable ? "free" : "blocked";
}
