"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, UserRound, UsersRound, X } from "lucide-react";
import { BRAND, NAV_ITEMS, ROUTES } from "@/lib/marketing";
import { BrandLogo } from "./brand-logo";

type HeaderUser = { name?: string | null; email?: string | null };

export function SiteHeader({ currentUser = null }: { currentUser?: HeaderUser | null }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState<string | null>(() => pathname === ROUTES.home ? NAV_ITEMS[0].href : null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });

    const runEntrance = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const titleWords = Array.from(document.querySelectorAll<HTMLElement>(".landing-hero-copy h1 .landing-hero-word"));
      const heroIntro = Array.from(document.querySelectorAll<HTMLElement>(".landing-hero-copy > .landing-eyebrow"));
      const heroOutro = Array.from(document.querySelectorAll<HTMLElement>(
        ".landing-hero-copy > .landing-hero-lede, .landing-hero-copy > .landing-hero-actions, .landing-hero-copy > .landing-hero-note",
      ));

      // Keep the refresh entrance entirely inside the hero. The rest of the
      // landing page and the fixed navigation remain static.
      const sequence = [...heroIntro, ...titleWords, ...heroOutro];
      sequence.forEach((element, index) => {
        element.style.setProperty("--hero-sequence-delay", `${index * 120}ms`);
        element.dataset.heroSequence = "true";
      });
    };

    const frame = window.requestAnimationFrame(runEntrance);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (pathname !== ROUTES.home) return;

    // The selected item follows navigation, not scrolling. This keeps the
    // highlight stable while the fixed header remains visible on long pages.
    const updateFromLocation = () => {
      const item = NAV_ITEMS.find(({ href }) => href.endsWith(window.location.hash));
      setActiveNav(item?.href ?? NAV_ITEMS[0].href);
    };

    updateFromLocation();
    window.addEventListener("hashchange", updateFromLocation);
    return () => {
      window.removeEventListener("hashchange", updateFromLocation);
    };
  }, [pathname]);

  const currentActiveNav = pathname === ROUTES.home ? activeNav : null;

  return (
    <header className={`site-header fixed inset-x-0 top-0 z-50 ${scrolled ? "site-header-scrolled" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") setMobileMenuOpen(false); }}>
      <div className="site-header-inner mx-auto max-w-7xl px-5 sm:px-8">
        <Link href={ROUTES.home} className="site-header-brand flex shrink-0 items-center gap-3" aria-label={`${BRAND.name} home`}>
          <BrandLogo priority className="site-header-logo" />
          <span className="site-brand-copy block">
            <span className="block text-[15px] font-semibold tracking-[-0.04em] text-brand-cream">{BRAND.name}</span>
          </span>
        </Link>

        <nav id="primary-navigation" aria-label="Main navigation" className={`site-header-nav${mobileMenuOpen ? " is-open" : ""}`}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} aria-current={currentActiveNav === item.href ? "location" : undefined} className={`nav-link site-nav-link${currentActiveNav === item.href ? " is-active" : ""}`} onClick={() => { setActiveNav(item.href); setMobileMenuOpen(false); }}>{item.label}</Link>
          ))}
          {currentUser && <Link href="/influencer-marketing" className="nav-link site-nav-link site-nav-influencer-mobile" onClick={() => setMobileMenuOpen(false)}><UsersRound size={15} aria-hidden="true" /> Influencer Marketing</Link>}
        </nav>

        <div className="site-header-actions">
          {currentUser ? <>
            <Link href="/influencer-marketing" className="site-header-influencer" aria-label="Open Influencer Marketing"><UsersRound size={15} aria-hidden="true" /><span className="site-header-influencer-long">Influencer Marketing</span><span className="site-header-influencer-short">Influencer</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
            <Link href="/dashboard" className="site-header-profile" aria-label={`Open the workspace for ${currentUser.name || currentUser.email || "your account"}`}>
              <span className="site-header-profile-avatar" aria-hidden="true">{(currentUser.name?.trim() || currentUser.email || "").charAt(0).toUpperCase() || <UserRound size={15} strokeWidth={2} />}</span>
              <span className="site-header-profile-name">{currentUser.name?.trim() || currentUser.email?.split("@")[0] || "Your profile"}</span>
            </Link>
          </> : <>
            <Link href={ROUTES.signIn} className="nav-link site-sign-in">Sign in</Link>
            <Link href={ROUTES.signIn} className="button-primary site-header-cta !px-4 !py-2.5 text-[13px]">
              <span className="site-cta-full">Get started</span><span className="site-cta-short">Start</span><ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </>}
          <button type="button" className="site-header-menu-toggle" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}
