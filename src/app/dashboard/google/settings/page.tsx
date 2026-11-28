import { GoogleSectionPage } from "@/components/workspace/google-section-page";

export const instant = false;

export default function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  return <GoogleSectionPage searchParams={searchParams} view="settings" path="/dashboard/google/settings" title="Search Console settings" description="What each setting does, the steps to change it and what to be careful about." />;
}
