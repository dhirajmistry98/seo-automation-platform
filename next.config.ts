import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: path.join(__dirname),
  // The plugin zip route reads these files at request time, so they must ship with the deployment.
  outputFileTracingIncludes: { "/api/plugin/download": ["./wordpress-plugin/seo-studio/**/*"] },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [{ source: "/:path*", headers }];
  },
  async redirects() {
    // seostudio.vercel.app is the main address. Pages on the old Vercel address move there; /api/ stays
    // reachable on both so the scheduler, webhooks, OAuth callbacks and WordPress plugins keep working.
    // Removed Google Search pages: send saved links to SEO tips.
    const removed = ["/dashboard/google", "/dashboard/google/checklist"].map((source) => ({ source, destination: "/dashboard/google/tips", permanent: false }));
    return [...removed, {
      source: "/:path((?!api/).*)",
      has: [{ type: "host", value: "seo-automation-platform-ten.vercel.app" }],
      destination: "https://seostudio.vercel.app/:path",
      permanent: true,
    }];
  },
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
