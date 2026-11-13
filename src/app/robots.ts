import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** /robots.txt — public marketing pages are crawlable; signed-in areas and APIs are not. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/marketplace", "/influencer-marketing", "/login"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
