import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ButtonLoadingFeedback } from "@/components/ui/button-loading-feedback";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const publicSiteUrl = (() => { try { return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined; } catch { return undefined; } })();

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs to the public domain rather than a deployment URL.
  ...(publicSiteUrl ? { metadataBase: publicSiteUrl } : {}),
  title: "SEO STUDIO — SEO Automation Platform",
  description: "Analyze, optimize and automate your website SEO with one connected ecosystem.",
  icons: { icon: "/seo-studio-icon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}<ButtonLoadingFeedback /></body>
    </html>
  );
}
