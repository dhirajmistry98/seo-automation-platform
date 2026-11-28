import Link from "next/link";
import { CopyPrompt } from "@/components/workspace/copy-prompt";
import { TIPS, TIP_TOPICS } from "@/lib/google/tips";

export const instant = false;

export default function Page() {
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> PRACTICAL SEO</p><h1>SEO tips</h1><p>Useful ideas from marketers, with steps and what to double-check. These are not official Google guidelines.</p></div></header>
    {TIP_TOPICS.map((topic) => <section key={topic} className="workspace-section ggl-tips" aria-label={topic}><h2 className="ggl-topic">{topic}</h2>{TIPS.filter((tip) => tip.topic === topic).map((tip) => <details key={tip.id} className="workspace-panel gin ggl-tip">
      <summary><span className="ggl-badge">Unofficial tip</span><strong>{tip.title}</strong><small>{tip.idea}</small></summary>
      <h3>Steps</h3><ol>{tip.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {tip.prompt && <CopyPrompt text={tip.prompt} />}
      <h3>Check before you rely on it</h3><ul>{tip.check.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="ggl-links is-flush">{tip.tools.map((tool) => <Link key={tool.href} href={tool.href}>{tool.label}</Link>)}</p>
    </details>)}</section>)}
  </>;
}
