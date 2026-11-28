import { GoogleGuideLibrary } from "@/components/workspace/google-guide-library";

export const instant = false;

export default function Page() {
  return <>
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow"><span /> GOOGLE SEARCH</p><h1>Google guidelines</h1><p>Google’s official rules and guides for Search, in one searchable place.</p></div></header>
    <section className="workspace-section"><GoogleGuideLibrary /></section>
  </>;
}
