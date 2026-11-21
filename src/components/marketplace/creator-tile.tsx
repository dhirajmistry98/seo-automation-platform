import { SafeImage } from "@/components/ui/safe-image";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";

const InstagramGlyph = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;

type Item = Record<string, unknown>;
const obj = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
const arr = (value: unknown): Item[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";

export const formatInr = (paise: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(typeof paise === "number" ? paise / 100 : 0);
export const compactCount = (value: unknown) => typeof value === "number" ? new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value) : "—";

/** "★ 4.8 (12)" — or "New" when the creator has no completed, reviewed work yet. */
export function RatingBadge({ rating, size = 13 }: { rating: unknown; size?: number }) {
  const value = obj(rating);
  const count = typeof value.count === "number" ? value.count : 0;
  if (!count) return <span className="mp-rating is-new">New</span>;
  return <span className="mp-rating" aria-label={`Rated ${Number(value.average).toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}`}><Star size={size} fill="currentColor" aria-hidden="true" />{Number(value.average).toFixed(1)}<small>({count})</small></span>;
}

export function StarRow({ rating }: { rating: number }) {
  return <span className="mp-star-row" aria-label={`${rating} out of 5`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={14} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true" />)}</span>;
}

/** Collabstr-style creator tile: cover image, name, niche, location, rating and "From" price. */
export function CreatorTile({ creator, basePath = "/influencer-marketing" }: { creator: Item; basePath?: string }) {
  const instagram = obj(creator.instagram);
  const cover = arr(instagram.recentMedia).map((media) => str(media.thumbnailUrl) || str(media.mediaUrl)).find(Boolean) || "";
  const avatar = str(instagram.profilePictureUrl);
  const categories = Array.isArray(creator.categories) ? creator.categories.map(String) : [];
  const name = str(creator.displayName) || "Creator";
  const image = cover || avatar;
  return <Link className="mp-creator-tile mp-creator-tile-v2" href={`${basePath}/creators/${encodeURIComponent(str(creator._id))}`} aria-label={`${name}, ${compactCount(instagram.verifiedFollowers)} Instagram followers, from ${formatInr(typeof creator.fromPricePaise === "number" ? creator.fromPricePaise : creator.ratePaise)}`}>
    {image ? <SafeImage className="mp-tile-photo" src={image} alt="" fill sizes="(max-width: 700px) 50vw, 300px" unoptimized /> : <span className="mp-tile-photo mp-tile-initials" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
    <span className="mp-tile-shade" aria-hidden="true" />
    <span className="mp-tile-badge"><InstagramGlyph />{compactCount(instagram.verifiedFollowers)}<BadgeCheck size={13} aria-label="Instagram verified" /></span>
    {Boolean(creator.rating) && <span className="mp-tile-rating"><RatingBadge rating={creator.rating} /></span>}
    <span className="mp-tile-info">
      <span className="mp-tile-text"><strong>{name}</strong><small>{categories.slice(0, 3).map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ") || "Creator"}{str(creator.location) ? ` · ${str(creator.location)}` : ""}</small></span>
      <b className="mp-tile-price">{formatInr(typeof creator.fromPricePaise === "number" ? creator.fromPricePaise : creator.ratePaise)}</b>
    </span>
  </Link>;
}
