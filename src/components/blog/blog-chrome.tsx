import { Suspense } from "react";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/marketing/site-header";

async function SessionHeader() {
  const session = await auth();
  return <SiteHeader currentUser={session?.user ? { name: session.user.name, email: session.user.email } : null} />;
}

/**
 * Header for static blog pages. The session is read inside a Suspense boundary so the article itself
 * stays in the prerendered static shell (fast for readers and crawlers); the signed-in header streams in.
 */
export function BlogHeader() {
  return <Suspense fallback={<SiteHeader />}><SessionHeader /></Suspense>;
}

/** JSON-LD structured data. `<` is escaped so content can never close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
