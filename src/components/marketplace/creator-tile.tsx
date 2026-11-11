import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Camera, MapPin, Star, UserRound } from "lucide-react";

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
  return <Link className="mp-creator-tile" href={`${basePath}/creators/${encodeURIComponent(str(creator._id))}`}>
    <div className="mp-creator-tile-cover">
      {cover ? <Image src={cover} alt="" fill sizes="(max-width: 700px) 50vw, 260px" unoptimized /> : <span className="mp-creator-tile-cover-empty"><Camera size={22} /></span>}
      <span className="mp-creator-tile-followers"><Camera size={12} /> {compactCount(instagram.verifiedFollowers)}</span>
    </div>
    <div className="mp-creator-tile-body">
      <div className="mp-creator-tile-head">
        {avatar ? <Image className="mp-creator-tile-avatar" src={avatar} alt="" width={30} height={30} unoptimized /> : <span className="mp-creator-tile-avatar is-empty"><UserRound size={14} /></span>}
        <strong>{str(creator.displayName)}</strong><BadgeCheck size={14} aria-label="Instagram verified" />
        <RatingBadge rating={creator.rating} />
      </div>
      <small className="mp-creator-tile-meta">{categories.slice(0, 2).join(" · ") || "Creator"}</small>
      <small className="mp-creator-tile-meta"><MapPin size={12} /> {str(creator.location) || "India"}</small>
      <span className="mp-creator-tile-price">From <b>{formatInr(typeof creator.fromPricePaise === "number" ? creator.fromPricePaise : creator.ratePaise)}</b></span>
    </div>
  </Link>;
}
