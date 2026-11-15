export type InfluencerTier = "nano" | "micro" | "mid" | "macro" | "mega";

export function influencerTier(verifiedFollowers: number | null | undefined): InfluencerTier | null {
  // No minimum audience: every Meta-verified creator gets a size label. Tiers are descriptive only.
  if (!Number.isSafeInteger(verifiedFollowers) || (verifiedFollowers ?? -1) < 0) return null;
  if (verifiedFollowers! < 10_000) return "nano";
  if (verifiedFollowers! < 50_000) return "micro";
  if (verifiedFollowers! < 100_000) return "mid";
  if (verifiedFollowers! < 500_000) return "macro";
  return "mega";
}
