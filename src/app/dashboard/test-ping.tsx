"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Server } from "lucide-react";
import { readJson } from "@/lib/read-json";

type HealthResponse = {
  status: string;
  database?: { latencyMs?: number };
  roundTripMs: number;
};

export function BackendTestPing() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const start = performance.now();
      const res = await fetch("/api/health");
      const data = await readJson(res) as Omit<HealthResponse, "roundTripMs">;
      const roundTrip = Math.round(performance.now() - start);
      setResult({ ...data, roundTripMs: roundTrip });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to contact backend health API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-cream bg-brand-cream p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-brand-coral" />
            <h3 className="text-base font-semibold text-brand-cream">
              Live Backend & Database Ping
            </h3>
          </div>
          <p className="mt-1 text-xs text-brand-cream">
            Send an instant test request to verify API routes, MongoDB connectivity, and session status.
          </p>
        </div>

        <button
          onClick={runTest}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-coral px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-coral disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Testing..." : "Test Backend Now"}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-navy p-3 text-xs text-brand-coral border border-brand-cream">
          <AlertCircle className="h-4 w-4 shrink-0 text-brand-coral" />
          <span>Error connecting to backend: {error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-brand-navy p-3 text-xs text-brand-cream border border-brand-cream">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-coral" />
            <span>
              Backend is <strong>{result.status.toUpperCase()}</strong>! MongoDB responded in{" "}
              <strong>{result.database?.latencyMs ?? 0}ms</strong> (roundtrip: {result.roundTripMs}ms).
            </span>
          </div>

          <div className="rounded-lg bg-brand-navy p-4 text-xs font-mono text-brand-coral overflow-x-auto">
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

