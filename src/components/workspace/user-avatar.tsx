"use client";

import { useState } from "react";

// Google profile photos often reject requests that carry a referrer, so load
// them without one and fall back to the user's initial if the image fails.
export function UserAvatar({ src, name, className = "workspace-avatar" }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  if (!src || failed) return <span className={`${className} workspace-avatar-initial`} aria-hidden="true">{initial}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- external profile photo; next/image adds no value here
  return <img src={src} alt="" width={36} height={36} className={className} referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
