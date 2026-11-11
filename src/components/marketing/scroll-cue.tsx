"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { ArrowDown } from "lucide-react";

const SECTION_SELECTOR = "#main-content > section, #main-content > footer, body > footer";

function headerOffset() {
  return (document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 72) + 8;
}

function sections() {
  return Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)).filter((element) => element.offsetHeight > 0);
}

function nextSection() {
  const threshold = headerOffset() + 12;
  return sections().find((element) => element.getBoundingClientRect().top > threshold) ?? null;
}

// Floating cue: each click moves to the next homepage section; at the end it
// returns to the top. Falls back to a normal #products link without JavaScript.
export function ScrollCue() {
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const update = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setAtEnd(nearBottom || !nextSection());
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const target = atEnd ? null : nextSection();
    const top = target ? target.getBoundingClientRect().top + window.scrollY - headerOffset() : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth });
  };

  const label = atEnd ? "Back to top" : "Scroll to the next section";
  return (
    <a href="#products" className={`landing-scroll-cue${atEnd ? " is-top" : ""}`} aria-label={label} title={label} onClick={onClick}>
      <span className="landing-scroll-cue-ring" aria-hidden="true"><ArrowDown size={18} strokeWidth={1.75} /></span>
      <span className="landing-scroll-cue-label" aria-hidden="true">{atEnd ? "Top" : "Scroll"}</span>
    </a>
  );
}
