import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** /sitemap.xml — only pages a logged-out visitor can see. Everything else redirects to sign-in. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/guide`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
