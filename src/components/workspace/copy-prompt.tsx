"use client";

import { useState } from "react";

export function CopyPrompt({ text }: { text: string }) {
  const [note, setNote] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setNote("Copied."); }
    catch { setNote("Copying was blocked. Select the text and copy it."); }
  }
  return <div className="ggl-prompt"><blockquote>{text}</blockquote><p><button type="button" onClick={() => void copy()}>Copy prompt</button> <span role="status">{note}</span></p></div>;
}
