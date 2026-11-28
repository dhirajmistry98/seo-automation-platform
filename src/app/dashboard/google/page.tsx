import { GoogleSectionPage } from "@/components/workspace/google-section-page";

export const instant = false;

export default function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  return <GoogleSectionPage searchParams={searchParams} view="shortcuts" path="/dashboard/google" title="Search Console shortcuts" description="Open any Search Console report or Google tool for your website in one click." />;
}
