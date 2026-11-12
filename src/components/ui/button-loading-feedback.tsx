"use client";

import { useEffect } from "react";

/** How soon after a click the button must become disabled for it to count as "work started". */
const START_WINDOW_MS = 1500;
/** Safety limit: never show a spinner longer than this. */
const MAX_LOADING_MS = 60_000;

/**
 * Site-wide loading feedback for client buttons.
 *
 * Most client components run async work behind a shared `busy` flag that disables their buttons
 * (`disabled={busy}`) but never says which button was clicked. This watches the button you clicked:
 * if it becomes disabled right after the click, it gets `data-loading` (a spinner from globals.css)
 * and `aria-busy` until it is enabled again or removed.
 *
 * Skipped automatically when the button shows its own feedback (its text changes, e.g. "Sending…",
 * or it renders a spinner). Opt a button out with `data-no-loader`.
 */
export function ButtonLoadingFeedback() {
  useEffect(() => {
    const active = new Map<HTMLButtonElement, () => void>();

    function track(button: HTMLButtonElement) {
      active.get(button)?.();
      const label = button.textContent;
      const clickedAt = performance.now();
      let loading = false;

      const finish = () => {
        observer.disconnect();
        window.clearInterval(poll);
        window.clearTimeout(limit);
        if (loading) {
          button.removeAttribute("data-loading");
          button.removeAttribute("aria-busy");
        }
        active.delete(button);
      };

      const check = () => {
        if (!button.isConnected) return finish();
        if (!loading) {
          if (performance.now() - clickedAt > START_WINDOW_MS) return finish();
          if (!button.disabled) return;
          const hasOwnFeedback = button.textContent !== label || button.querySelector('[class*="spin"]') !== null;
          if (hasOwnFeedback) return finish();
          loading = true;
          button.setAttribute("data-loading", "");
          button.setAttribute("aria-busy", "true");
        } else if (!button.disabled) {
          finish();
        }
      };

      const observer = new MutationObserver(check);
      observer.observe(button, { attributes: true, attributeFilter: ["disabled"], childList: true, subtree: true, characterData: true });
      // Catches the button being unmounted, which a MutationObserver on the button itself cannot see.
      const poll = window.setInterval(check, 250);
      const limit = window.setTimeout(finish, MAX_LOADING_MS);
      active.set(button, finish);
    }

    function onClick(event: MouseEvent) {
      const button = (event.target as Element | null)?.closest?.("button");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      if (button.type === "reset" || button.hasAttribute("data-no-loader") || button.hasAttribute("data-loading")) return;
      track(button);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      for (const finish of [...active.values()]) finish();
    };
  }, []);

  return null;
}
