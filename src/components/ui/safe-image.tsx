"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

// Instagram CDN links are signed and expire; show a neutral tile instead of a broken image.
export function SafeImage(props: ImageProps) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={`safe-image-fallback${props.fill ? " is-fill" : ""} ${props.className ?? ""}`} style={props.fill ? undefined : { width: Number(props.width) || undefined, height: Number(props.height) || undefined }} aria-hidden="true" />;
  return <Image {...props} alt={props.alt} onError={() => setBroken(true)} />;
}
