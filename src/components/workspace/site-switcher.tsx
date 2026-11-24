import Link from "next/link";

/** Pill links to switch the website a page is showing. Renders nothing when there is only one website. */
export function SiteSwitcher({ sites, current, path }: { sites: Array<{ domain: string; name?: string }>; current?: string; path: string }) {
  if (sites.length < 2) return null;
  return <nav className="site-tool-switcher" aria-label="Choose a website">{sites.map((item) => <Link key={item.domain} href={`${path}?site=${encodeURIComponent(item.domain)}`} aria-current={item.domain === current ? "page" : undefined} className={item.domain === current ? "is-current" : ""}>{item.name || item.domain}</Link>)}</nav>;
}
