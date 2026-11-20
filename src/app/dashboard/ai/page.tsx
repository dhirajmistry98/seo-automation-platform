import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import clientPromise from "@/lib/mongodb";
import { getAiConfig, getUsageStats } from "@/lib/ai/config";
import { GEMINI_MODELS } from "@/lib/ai/models";
import { getWorkspaceData } from "@/lib/workspace-data";
import { AiStudio } from "@/components/workspace/ai-studio";

export const instant = false;

export default async function AiStudioPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const db = (await clientPromise).db();
  const [config, stats, workspace] = await Promise.all([
    getAiConfig(db, session.user.id),
    getUsageStats(db, session.user.id, 30).catch(() => null),
    getWorkspaceData(session.user.id),
  ]);

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

  return <>
    <header className="workspace-page-heading">
      <div>
        <p className="workspace-eyebrow"><span /> AI STUDIO</p>
        <h1>AI Studio</h1>
        <p>Generate SEO content, analyse audits and chat with an AI assistant that knows your website data.</p>
      </div>
    </header>
    <AiStudio
      initialConfig={config}
      initialStats={stats}
      models={GEMINI_MODELS}
      websites={workspace.websites.map((s) => ({ domain: s.domain, name: s.name ?? s.domain }))}
      hasApiKey={hasApiKey}
    />
  </>;
}
