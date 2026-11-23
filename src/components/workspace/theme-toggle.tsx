"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export type WorkspaceTheme = "light" | "dark";

/** Light/dark switch for the workspace. The server renders the saved theme from a cookie, so there is no flash. */
export function ThemeToggle({ initialTheme, className = "ws2-theme-toggle" }: { initialTheme: WorkspaceTheme; className?: string }) {
  const [theme, setTheme] = useState<WorkspaceTheme>(initialTheme);
  const dark = theme === "dark";

  function toggle(button: HTMLButtonElement) {
    const next: WorkspaceTheme = dark ? "light" : "dark";
    const shell = button.closest<HTMLElement>("[data-ws-theme]");
    if (shell) {
      shell.classList.add("is-theme-switching");
      shell.dataset.wsTheme = next;
      window.setTimeout(() => shell.classList.remove("is-theme-switching"), 320);
    }
    document.cookie = `ws-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <button type="button" className={className} aria-pressed={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} onClick={(event) => toggle(event.currentTarget)}>
      <Moon className="is-moon" size={17} aria-hidden="true" />
      <Sun className="is-sun" size={17} aria-hidden="true" />
    </button>
  );
}
