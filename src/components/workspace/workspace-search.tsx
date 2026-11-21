"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function WorkspaceSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/dashboard/research?q=${encodeURIComponent(q)}`);
  }

  return (
    <form className="workspace-search-form" onSubmit={handleSubmit} role="search">
      <Search size={14} className="workspace-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="workspace-search-input"
        placeholder="Search keywords, topics…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search workspace"
      />
      <kbd className="workspace-search-kbd">⌘K</kbd>
    </form>
  );
}
