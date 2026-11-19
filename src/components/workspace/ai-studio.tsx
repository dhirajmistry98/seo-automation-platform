"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Bot, ChevronDown, Cpu, Layers, Loader2, MessageSquare, RefreshCw, Send, Settings2, Sparkles, Zap } from "lucide-react";
import type { AiConfig, AiMode, AiTask } from "@/lib/ai/types";
import type { GeminiModel } from "@/lib/ai/models";

type UsageStats = {
  totalRequests: number;
  successCount: number;
  totalTokens: number;
  totalCostUsd: number;
  byTask: Record<string, number>;
  recent: Array<{ task: string; mode: string; model: string; tokens: number; costUsd: number; durationMs: number; success: boolean; error?: string; createdAt: string | Date }>;
} | null;

interface Props {
  initialConfig: AiConfig;
  initialStats: UsageStats;
  models: GeminiModel[];
  websites: Array<{ domain: string; name: string }>;
  hasApiKey: boolean;
}

type Tab = "tools" | "chat" | "config" | "usage";

const TASKS: Array<{ id: AiTask; label: string; description: string; fields: string[] }> = [
  { id: "seo-titles", label: "SEO Titles", description: "Generate 5 optimised title tags.", fields: ["keyword", "title", "description", "url"] },
  { id: "meta-description", label: "Meta Description", description: "Write 3 click-worthy meta descriptions.", fields: ["keyword", "title", "content"] },
  { id: "keywords", label: "Keyword Ideas", description: "Suggest 15 keywords in three tiers.", fields: ["description", "title"] },
  { id: "content-optimize", label: "Content Optimisation", description: "Analyse content for SEO improvements.", fields: ["keyword", "content"] },
  { id: "audit-summary", label: "Audit Summary", description: "Plain-language summary of audit findings.", fields: ["domain"] },
  { id: "report-narrative", label: "Report Narrative", description: "Executive summary for a client report.", fields: ["domain"] },
];

function fmt(n: number, digits = 0) { return n.toLocaleString("en-IN", { maximumFractionDigits: digits }); }
function fmtCost(usd: number) { return usd < 0.001 ? "<$0.001" : `$${usd.toFixed(4)}`; }
function elapsed(ms: number) { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

export function AiStudio({ initialConfig, initialStats, models, websites, hasApiKey }: Props) {
  const [tab, setTab] = useState<Tab>("tools");
  const [config, setConfig] = useState<AiConfig>(initialConfig);
  const [stats, setStats] = useState<UsageStats>(initialStats);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; error?: string } | null>(null);

  // Tools tab
  const [selectedTask, setSelectedTask] = useState<AiTask>("seo-titles");
  const [taskDomain, setTaskDomain] = useState(websites[0]?.domain ?? "");
  const [taskFields, setTaskFields] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [taskResult, setTaskResult] = useState("");
  const [taskError, setTaskError] = useState("");
  const [taskMeta, setTaskMeta] = useState<{ model: string; mode: string; tokens: number; costUsd: number; durationMs: number } | null>(null);

  // Chat tab
  const [chatDomain, setChatDomain] = useState(websites[0]?.domain ?? "");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const saveConfig = useCallback(async (patch: Partial<Pick<AiConfig, "mode" | "model">>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } finally { setSaving(false); }
  }, []);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setConnectionStatus(null);
    try {
      const res = await fetch("/api/ai/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testConnection: true }) });
      const data = await res.json();
      if (data.connectionStatus) setConnectionStatus(data.connectionStatus);
    } finally { setTesting(false); }
  }, []);

  const refreshUsage = useCallback(async () => {
    const res = await fetch("/api/ai/usage?days=30");
    if (res.ok) setStats(await res.json());
  }, []);

  const runTask = useCallback(async () => {
    setGenerating(true);
    setTaskResult("");
    setTaskError("");
    setTaskMeta(null);
    try {
      const context: Record<string, string> = { domain: taskDomain, ...taskFields };
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: selectedTask, context }),
      });
      const data = await res.json();
      if (!res.ok) { setTaskError(data.error ?? "Generation failed."); return; }
      setTaskResult(data.result ?? "");
      setTaskMeta({ model: data.model, mode: data.mode, tokens: data.usage?.totalTokens ?? 0, costUsd: data.usage?.estimatedCostUsd ?? 0, durationMs: data.durationMs ?? 0 });
      void refreshUsage();
    } catch { setTaskError("Network error. Please try again."); }
    finally { setGenerating(false); }
  }, [selectedTask, taskDomain, taskFields, refreshUsage]);

  const sendChat = useCallback(async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput("");
    const newHistory = [...chatHistory, { role: "user" as const, content: q }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, domain: chatDomain || undefined, history: chatHistory.slice(-10) }),
      });
      const data = await res.json();
      const answer = res.ok ? (data.answer ?? "") : (data.error ?? "Error.");
      setChatHistory([...newHistory, { role: "assistant", content: answer }]);
      void refreshUsage();
    } catch { setChatHistory([...newHistory, { role: "assistant", content: "Network error. Please try again." }]); }
    finally { setChatLoading(false); }
  }, [chatInput, chatHistory, chatDomain, chatLoading, refreshUsage]);

  const task = TASKS.find((t) => t.id === selectedTask)!;

  return (
    <div className="workspace-section">
      {!hasApiKey && (
        <div className="workspace-alert" role="alert">
          <strong>GEMINI_API_KEY is not set.</strong> Add it to your <code>.env</code> file, then restart the server.
        </div>
      )}

      <nav className="ai-tabs" role="tablist" aria-label="AI Studio sections">
        {(["tools", "chat", "config", "usage"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={tab === t ? "is-active" : ""}>
            {t === "tools" && <Sparkles size={14} />}
            {t === "chat" && <MessageSquare size={14} />}
            {t === "config" && <Settings2 size={14} />}
            {t === "usage" && <Zap size={14} />}
            {t === "tools" ? "SEO Tools" : t === "config" ? "Configuration" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {/* ── TOOLS TAB ── */}
      {tab === "tools" && (
        <div className="ai-panel">
          <div className="ai-task-grid">
            {TASKS.map((t) => (
              <button key={t.id} className={`ai-task-card${selectedTask === t.id ? " is-active" : ""}`} onClick={() => { setSelectedTask(t.id); setTaskResult(""); setTaskError(""); setTaskMeta(null); }}>
                <strong>{t.label}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>

          <div className="ai-generate-form">
            <div className="ai-form-row">
              <label>Website</label>
              <div className="ai-select-wrap">
                <select value={taskDomain} onChange={(e) => setTaskDomain(e.target.value)} disabled={!websites.length}>
                  {!websites.length && <option value="">No websites added</option>}
                  {websites.map((w) => <option key={w.domain} value={w.domain}>{w.name}</option>)}
                </select>
                <ChevronDown size={14} />
              </div>
            </div>

            {task.fields.includes("keyword") && (
              <div className="ai-form-row">
                <label>Target keyword</label>
                <input type="text" placeholder="e.g. handcrafted wooden furniture" value={taskFields.keyword ?? ""} onChange={(e) => setTaskFields((p) => ({ ...p, keyword: e.target.value }))} />
              </div>
            )}
            {task.fields.includes("title") && (
              <div className="ai-form-row">
                <label>Current page title</label>
                <input type="text" placeholder="Current or draft title" value={taskFields.title ?? ""} onChange={(e) => setTaskFields((p) => ({ ...p, title: e.target.value }))} />
              </div>
            )}
            {task.fields.includes("url") && (
              <div className="ai-form-row">
                <label>Page URL</label>
                <input type="url" placeholder="https://example.com/page" value={taskFields.url ?? ""} onChange={(e) => setTaskFields((p) => ({ ...p, url: e.target.value }))} />
              </div>
            )}
            {task.fields.includes("description") && (
              <div className="ai-form-row">
                <label>Page description</label>
                <textarea placeholder="Brief description of the page or website" rows={2} value={taskFields.description ?? ""} onChange={(e) => setTaskFields((p) => ({ ...p, description: e.target.value }))} />
              </div>
            )}
            {task.fields.includes("content") && (
              <div className="ai-form-row">
                <label>Page content</label>
                <textarea placeholder="Paste the page body text to analyse" rows={5} value={taskFields.content ?? ""} onChange={(e) => setTaskFields((p) => ({ ...p, content: e.target.value }))} />
              </div>
            )}

            <div className="ai-form-actions">
              <span className="ai-mode-badge">
                {config.mode === "langchain" ? <><Layers size={12} /> LangChain</> : <><Cpu size={12} /> Raw LLM</>}
                <span>{models.find((m) => m.id === config.model)?.label ?? config.model}</span>
              </span>
              <button className="workspace-primary-link ai-run-btn" onClick={runTask} disabled={generating || !hasApiKey}>
                {generating ? <><Loader2 size={14} className="ai-spin" /> Generating…</> : <><Sparkles size={14} /> Generate</>}
              </button>
            </div>

            {taskError && <p className="ai-error" role="alert">{taskError}</p>}

            {taskResult && (
              <div className="ai-result">
                {taskMeta && (
                  <p className="ai-result-meta">
                    {taskMeta.model} · {taskMeta.mode} · {fmt(taskMeta.tokens)} tokens · {fmtCost(taskMeta.costUsd)} · {elapsed(taskMeta.durationMs)}
                  </p>
                )}
                <pre className="ai-result-text">{taskResult}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CHAT TAB ── */}
      {tab === "chat" && (
        <div className="ai-panel ai-chat-panel">
          <div className="ai-chat-header">
            <Bot size={16} />
            <strong>AI SEO Assistant</strong>
            <span className="ai-mode-badge">
              {config.mode === "langchain" ? <><Layers size={12} /> LangChain + RAG</> : <><Cpu size={12} /> Raw LLM</>}
            </span>
            <div className="ai-select-wrap ai-chat-domain">
              <select value={chatDomain} onChange={(e) => setChatDomain(e.target.value)}>
                <option value="">No website context</option>
                {websites.map((w) => <option key={w.domain} value={w.domain}>{w.name}</option>)}
              </select>
              <ChevronDown size={12} />
            </div>
          </div>

          <div className="ai-chat-messages">
            {!chatHistory.length && (
              <div className="ai-chat-empty">
                <Bot size={28} />
                <p>Ask me anything about SEO — keyword strategy, technical fixes, content improvements, or how to read your audit data.</p>
                {config.mode === "langchain" && chatDomain && <p className="ai-chat-rag-hint">RAG active: answers will be grounded in your ingested data for <strong>{chatDomain}</strong>.</p>}
              </div>
            )}
            {chatHistory.map((turn, i) => (
              <div key={i} className={`ai-message ai-message-${turn.role}`}>
                <div className="ai-message-bubble">{turn.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="ai-message ai-message-assistant">
                <div className="ai-message-bubble ai-typing"><Loader2 size={13} className="ai-spin" /> Thinking…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="ai-chat-input" onSubmit={(e) => { e.preventDefault(); void sendChat(); }}>
            <input type="text" placeholder="Ask an SEO question…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} disabled={chatLoading || !hasApiKey} />
            <button type="submit" disabled={!chatInput.trim() || chatLoading || !hasApiKey} aria-label="Send">
              <Send size={15} />
            </button>
          </form>

          {chatHistory.length > 0 && (
            <button className="ai-clear-chat" onClick={() => setChatHistory([])}>Clear conversation</button>
          )}
        </div>
      )}

      {/* ── CONFIG TAB ── */}
      {tab === "config" && (
        <div className="ai-panel ai-config-panel">
          <div className="ai-config-section">
            <h3>AI provider</h3>
            <p>Google Gemini is the model provider for all generation in SEO Studio.</p>
            <div className="ai-status-row">
              <span className={`ai-status-dot ${hasApiKey ? "is-green" : "is-red"}`} />
              <span>{hasApiKey ? "GEMINI_API_KEY configured" : "GEMINI_API_KEY missing — add it to .env"}</span>
            </div>
          </div>

          <div className="ai-config-section">
            <h3>Execution mode</h3>
            <p>Raw LLM calls Gemini directly — faster and simpler. LangChain adds prompt chains, tools, and RAG context from your website data.</p>
            <div className="ai-mode-toggle">
              {(["raw", "langchain"] as AiMode[]).map((m) => (
                <button key={m} className={config.mode === m ? "is-active" : ""} onClick={() => { setConfig((c) => ({ ...c, mode: m })); void saveConfig({ mode: m }); }} disabled={saving}>
                  {m === "raw" ? <><Cpu size={14} /> Raw LLM</> : <><Layers size={14} /> LangChain</>}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-config-section">
            <h3>Gemini model</h3>
            <p>Select the model used for generation. Preview models may change without notice.</p>
            <div className="ai-model-list">
              {models.map((m) => (
                <label key={m.id} className={`ai-model-row${config.model === m.id ? " is-selected" : ""}`}>
                  <input type="radio" name="model" value={m.id} checked={config.model === m.id} onChange={() => { setConfig((c) => ({ ...c, model: m.id })); void saveConfig({ model: m.id }); }} />
                  <span>
                    <strong>{m.label}{m.recommended ? " ✓" : ""}{m.preview ? " (preview)" : ""}</strong>
                    <small>In: ${(m.inputPerMillion).toFixed(3)}/M · Out: ${(m.outputPerMillion).toFixed(3)}/M tokens</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="ai-config-section">
            <h3>Connection test</h3>
            <p>Sends a single test prompt to verify the API key and model are working.</p>
            <div className="ai-test-row">
              <button className="workspace-outline-link" onClick={testConnection} disabled={testing || !hasApiKey}>
                {testing ? <><Loader2 size={13} className="ai-spin" /> Testing…</> : <><RefreshCw size={13} /> Test connection</>}
              </button>
              {connectionStatus && (
                <span className={`ai-connection-result ${connectionStatus.ok ? "is-ok" : "is-err"}`}>
                  {connectionStatus.ok ? "Connected ✓" : `Failed: ${connectionStatus.error}`}
                </span>
              )}
            </div>
          </div>

          {saving && <p className="ai-saving">Saving…</p>}
        </div>
      )}

      {/* ── USAGE TAB ── */}
      {tab === "usage" && (
        <div className="ai-panel">
          <div className="ai-usage-header">
            <h3>Last 30 days</h3>
            <button className="workspace-outline-link ai-refresh-btn" onClick={refreshUsage}><RefreshCw size={13} /> Refresh</button>
          </div>

          {stats ? (
            <>
              <div className="ai-kpi-row">
                <div className="ai-kpi"><strong>{fmt(stats.totalRequests)}</strong><span>Requests</span></div>
                <div className="ai-kpi"><strong>{fmt(stats.successCount)}</strong><span>Successful</span></div>
                <div className="ai-kpi"><strong>{fmt(stats.totalTokens)}</strong><span>Tokens</span></div>
                <div className="ai-kpi"><strong>{fmtCost(stats.totalCostUsd)}</strong><span>Est. cost</span></div>
              </div>

              {Object.keys(stats.byTask).length > 0 && (
                <div className="ai-usage-tasks">
                  <h4>By task</h4>
                  {Object.entries(stats.byTask).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                    <div key={t} className="ai-usage-task-row">
                      <span>{t}</span><span>{fmt(n)}</span>
                    </div>
                  ))}
                </div>
              )}

              {stats.recent.length > 0 && (
                <div className="ai-usage-log">
                  <h4>Recent requests</h4>
                  <table>
                    <thead><tr><th>Task</th><th>Mode</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                      {stats.recent.map((r, i) => (
                        <tr key={i} className={r.success ? "" : "ai-row-err"}>
                          <td>{r.task}</td>
                          <td>{r.mode}</td>
                          <td>{r.model.replace("gemini-", "").replace("-preview", "…")}</td>
                          <td>{fmt(r.tokens)}</td>
                          <td>{fmtCost(r.costUsd)}</td>
                          <td>{elapsed(r.durationMs)}</td>
                          <td>{r.success ? "✓" : r.error ?? "err"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="ai-empty">No usage data yet. Run an AI task or chat to see statistics here.</p>
          )}
        </div>
      )}
    </div>
  );
}
