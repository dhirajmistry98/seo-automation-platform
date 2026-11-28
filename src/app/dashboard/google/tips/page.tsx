import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CopyPrompt } from "@/components/workspace/copy-prompt";
import { PromptLibrary } from "@/components/workspace/prompt-library";
import { TIPS, TIP_TOPICS } from "@/lib/google/tips";
import { PROMPTS } from "@/lib/google/prompts";

export const instant = false;

export default function Page() {
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> PRACTICAL SEO</p><h1>SEO tips</h1><p>Useful ideas from marketers, with steps and what to double-check. These are not official Google guidelines.</p></div></header>
    <nav className="ggl-jump" aria-label="On this page"><a href="#tips">Tips <b>{TIPS.length}</b></a><a href="#prompts">AI prompts <b>{PROMPTS.length}</b></a></nav>
    <div id="tips" />
    {TIP_TOPICS.map((topic) => { const tips = TIPS.filter((tip) => tip.topic === topic); return <section key={topic} className="workspace-section ggl-tips" aria-label={topic}>
      <h2 className="ggl-topic">{topic}<span>{tips.length} {tips.length === 1 ? "tip" : "tips"}</span></h2>
      {tips.map((tip) => <details key={tip.id} className="ggl-tip">
        <summary><span><strong>{tip.title}</strong><small>{tip.idea}</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="gin ggl-tipbody">
          <div className="ggl-columns">
            <div><h3>Steps</h3><ol className="ggl-steps">{tip.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>
            <div className="ggl-check"><h3>Check before you rely on it</h3><ul>{tip.check.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          {tip.prompt && <CopyPrompt text={tip.prompt} />}
          <p className="ggl-actions">{tip.tools.map((tool) => <Link key={tool.href} href={tool.href}>{tool.label} →</Link>)}</p>
        </div>
      </details>)}
    </section>; })}
    <section className="workspace-section ggl-tips" id="prompts" aria-label="AI prompts"><h2 className="ggl-topic">AI prompt library<span>{PROMPTS.length} prompts</span></h2><PromptLibrary /></section>
  </>;
}
