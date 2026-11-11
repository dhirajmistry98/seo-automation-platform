"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { WorkspaceActionDialog } from "./workspace-action-dialog";

type Post = { wordpressPostId: number; title: string; url: string; postType: string; status: string; meta?: Record<string, string> };
type PendingUpdate = { postId: number; title: string; metadata: Record<string, string> };
const editableFields = ["title", "description", "canonical", "robots"] as const;
export function WordPressContentEditor({ domain }: { domain: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  function notify(text: string, tone: "info" | "success" | "error" = "info") { setMessage(text); setMessageTone(tone); }
  const load = useCallback(async () => {
    const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/wordpress-content`, { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load synced WordPress content.");
    const next = data.posts as Post[];
    const nextId = postId && next.some((post) => String(post.wordpressPostId) === postId) ? postId : next[0] ? String(next[0].wordpressPostId) : "";
    const nextPost = next.find((post) => String(post.wordpressPostId) === nextId);
    setPosts(next);
    setPostId(nextId);
    setValues(Object.fromEntries(editableFields.map((field) => [field, nextPost?.meta?.[field] || ""])));
  }, [domain, postId]);
  useEffect(() => { void Promise.resolve().then(load).catch((error) => notify(error.message, "error")); }, [load]);
  const selected = posts.find((post) => String(post.wordpressPostId) === postId);
  async function save() {
    if (!selected) return;
    const metadata = Object.fromEntries(editableFields.filter((field) => values[field] !== (selected.meta?.[field] || "")).map((field) => [field, values[field]]));
    if (!Object.keys(metadata).length) { notify("No metadata changes to apply."); return; }
    setPendingUpdate({ postId: selected.wordpressPostId, title: selected.title, metadata });
  }

  async function applyReviewedChanges() {
    if (!pendingUpdate) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(domain)}/wordpress-metadata`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: pendingUpdate.postId, metadata: pendingUpdate.metadata, approved: true }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "WordPress update failed.");
      notify("Approved metadata update applied to WordPress.", "success");
      try { await load(); } catch { notify("Metadata was applied, but the synced content list could not refresh.", "success"); }
    } catch (error) { throw new Error(error instanceof Error ? error.message : "WordPress update failed."); } finally { setBusy(false); }
  }
  return <><details className="wordpress-content-editor"><summary><Save size={14} /> Edit synced SEO metadata <span>{posts.length} posts</span></summary><div className="wordpress-content-editor-body"><div className="wordpress-editor-refresh"><p>Changes are reviewed here and sent directly to the verified HTTPS WordPress site.</p><button type="button" onClick={() => load().then(() => notify("Synced WordPress content refreshed.", "success")).catch((error) => notify(error.message, "error"))}><RefreshCw size={12} /> Refresh sync</button></div>
    {!posts.length ? <p className="site-control-message">Sync published content from the WordPress administrator to load posts here.</p> : <><label className="wordpress-editor-post">Published post<select value={postId} onChange={(event) => { const nextId = event.target.value; const nextPost = posts.find((post) => String(post.wordpressPostId) === nextId); setPostId(nextId); setValues(Object.fromEntries(editableFields.map((field) => [field, nextPost?.meta?.[field] || ""]))); }}>{posts.map((post) => <option value={post.wordpressPostId} key={post.wordpressPostId}>{post.title} · {post.postType}</option>)}</select></label>{selected && <a className="wordpress-editor-url" href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a>}<div className="wordpress-editor-fields">{editableFields.map((field) => <label key={field}>{field === "title" ? "SEO title" : field === "description" ? "Meta description" : field === "canonical" ? "Canonical URL" : "Robots directives"}<textarea maxLength={field === "title" ? 300 : field === "description" ? 500 : field === "canonical" ? 2048 : 100} rows={field === "description" ? 3 : 2} value={values[field] || ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div><button className="wordpress-editor-save" type="button" onClick={save} disabled={busy || !selected}>{busy ? <LoaderCircle className="site-spin" size={13} /> : <Check size={13} />} Apply reviewed changes</button></>}
    {message && <p className={`site-control-message workspace-feedback${messageTone === "info" ? "" : ` is-${messageTone}`}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p>}
  </div></details>
    <WorkspaceActionDialog
      open={!!pendingUpdate}
      eyebrow="WORDPRESS LIVE UPDATE"
      title="Review SEO metadata changes"
      description={`These changes will be written to “${pendingUpdate?.title || "the selected post"}” on the connected WordPress site.`}
      details={pendingUpdate ? Object.entries(pendingUpdate.metadata).map(([field, value]) => ({ label: field === "title" ? "SEO title" : field === "description" ? "Meta description" : field === "canonical" ? "Canonical URL" : "Robots directives", before: selected?.meta?.[field] || "(empty)", after: value || "(empty)" })) : []}
      confirmLabel="Apply live changes"
      onCancel={() => setPendingUpdate(null)}
      onConfirm={applyReviewedChanges}
    />
  </>;
}
