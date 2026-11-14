import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogBlock } from "@/lib/blog/types";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

/** Renders `**bold**`, `` `code` `` and `[text](href)` as React elements. Everything else is plain text, so nothing can inject HTML. */
export function InlineText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={index}>{token.slice(1, -1)}</code>);
    } else {
      const label = token.slice(1, token.indexOf("]("));
      const href = token.slice(token.indexOf("](") + 2, -1);
      if (href.startsWith("/") || href.startsWith("#")) parts.push(<Link key={index} href={href}>{label}</Link>);
      else if (/^https:\/\//.test(href)) parts.push(<a key={index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>);
      else parts.push(label);
    }
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function BlogBody({ blocks }: { blocks: BlogBlock[] }) {
  return <>{blocks.map((block, index) => {
    switch (block.type) {
      case "h2": return <h2 key={index} id={block.id}>{block.text}</h2>;
      case "h3": return <h3 key={index}>{block.text}</h3>;
      case "p": return <p key={index}><InlineText text={block.text} /></p>;
      case "ul": return <ul key={index}>{block.items.map((item) => <li key={item}><InlineText text={item} /></li>)}</ul>;
      case "ol": return <ol key={index}>{block.items.map((item) => <li key={item}><InlineText text={item} /></li>)}</ol>;
      case "callout": return <aside key={index} className="blog-callout"><strong>{block.title}</strong><p><InlineText text={block.text} /></p></aside>;
      case "table": return <div key={index} className="blog-table-wrap"><table>
        <thead><tr>{block.head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row) => <tr key={row.join("|")}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row"><InlineText text={cell} /></th> : <td key={cellIndex}><InlineText text={cell} /></td>)}</tr>)}</tbody>
      </table></div>;
    }
  })}</>;
}

/** Plain text of a block's inline markup, for word counts and structured data. */
export function plainText(text: string) {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
