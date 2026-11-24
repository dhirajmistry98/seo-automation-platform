"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

type Turn = { role: "user" | "assistant"; content: string };
const GREETING: Turn = { role: "assistant", content: "Hi! Ask me anything about SEO Studio: features, integrations, the marketplace or how to get started." };

export function SiteAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, open]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const history = turns.slice(1).slice(-8);
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history }) });
      const data = (await response.json().catch(() => ({}))) as { answer?: string; error?: string };
      setTurns((t) => [...t, { role: "assistant", content: data.answer || data.error || "Something went wrong. Please try again." }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
    } finally { setBusy(false); }
  }

  return <>
    {open && <section className="ws-assistant" aria-label="SEO Studio assistant">
      <header><strong>Ask SEO Studio</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={16} /></button></header>
      <div className="ws-assistant-log" role="log" aria-live="polite">
        {turns.map((t, i) => <p key={i} className={t.role === "user" ? "is-user" : ""}>{t.content}</p>)}
        {busy && <p className="is-typing">Thinking…</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={600} placeholder="Ask about SEO Studio…" aria-label="Your question" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
      </form>
    </section>}
    <button type="button" className="ws-assistant-fab" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close assistant" : "Open assistant"} aria-expanded={open}><MessageCircle size={22} /></button>
  </>;
}
