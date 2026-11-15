import Script from "next/script";
import { googleTagId } from "@/components/analytics/google-tag-id";

/**
 * Google tag loaded after the page is interactive, production builds only. A G-/GT- ID loads gtag.js and sends
 * page views straight to GA4; a GTM- ID loads that Tag Manager container instead (never both, to avoid double counting).
 */
export function GoogleTag() {
  const id = googleTagId();
  if (!id || process.env.NODE_ENV !== "production") return null;
  const isContainer = id.startsWith("GTM-");
  const src = isContainer ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}` : `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  const init = isContainer
    ? "window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});"
    : `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
  return (
    <>
      <Script id="google-tag-init">{init}</Script>
      <Script id="google-tag" src={src} />
    </>
  );
}
