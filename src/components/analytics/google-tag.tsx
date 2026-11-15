import Script from "next/script";
import { googleTagId } from "@/components/analytics/google-tag-id";

/** Google tag exactly as Google's install screen provides it, loaded after the page is interactive. Production builds only. */
export function GoogleTag() {
  const id = googleTagId();
  if (!id || process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script id="google-tag-init">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());`}</Script>
      <Script id="google-tag" src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`} />
    </>
  );
}
