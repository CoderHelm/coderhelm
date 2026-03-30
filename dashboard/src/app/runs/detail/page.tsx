"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type RunDetail, type Openspec } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";

const PASSES = ["triage", "plan", "implement", "review", "pr"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; text: string; bg: string }> = {
    running: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    completed: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    failed: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    pending: { dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  };
  const s = map[status] ?? { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

function PassProgress({ currentPass, status }: { currentPass?: string; status: string }) {
  const doneIdx = status === "completed" ? PASSES.length : PASSES.indexOf(currentPass ?? "");
  return (
    <div className="flex items-start">
      {PASSES.map((pass, i) => {
        const done = i < doneIdx;
        const active = i === doneIdx && status === "running";
        const failed = status === "failed" && i === doneIdx;
        return (
          <div key={pass} className="flex items-center">
            {i > 0 && (
              <div className="flex items-center h-8">
                <div className={`w-8 h-0.5 ${done ? "bg-emerald-500/60" : "bg-zinc-700"}`} />
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border ${
                  done
                    ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                    : active
                      ? "bg-blue-500/20 border-blue-500/30 text-blue-400 animate-pulse"
                      : failed
                        ? "bg-red-500/20 border-red-500/30 text-red-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-xs whitespace-nowrap ${done ? "text-emerald-400" : active ? "text-blue-400" : failed ? "text-red-400" : "text-zinc-600"}`}>
                {pass}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTokens(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function RunDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl"><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-96 mb-6" /></div>}>
      <RunDetailInner />
    </Suspense>
  );
}

function RunDetailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const runId = searchParams.get("id") ?? "";
  const [run, setRun] = useState<RunDetail | null>(null);
  const [openspec, setOpenspec] = useState<Openspec | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [specTab, setSpecTab] = useState<keyof Openspec>("proposal");
  const { toast } = useToast();

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId)
      .then((r) => {
        setRun(r);
        // Load openspec only for completed/failed runs that went past triage
        if (r.status !== "running" || PASSES.indexOf(r.current_pass ?? "") >= 1) {
          api.getRunOpenspec(runId).then(setOpenspec).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  if (!runId) {
    return (
      <div className="max-w-3xl">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>
        <p className="text-zinc-500 mt-4">No run selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="h-4 w-16 mb-4" />
        <Skeleton className="h-6 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-3xl">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>
        <p className="text-zinc-500 mt-4">Run not found.</p>
      </div>
    );
  }

  const specTabs = openspec
    ? (Object.keys(openspec) as (keyof Openspec)[]).filter((k) => openspec[k])
    : [];

  return (
    <div className="max-w-3xl">
      <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-zinc-100">{run.title}</h1>
          <StatusBadge status={run.status} />
        </div>
        <p className="text-sm text-zinc-500 font-mono">{run.repo}</p>
        {run.ticket_id && (
          <p className="text-xs text-zinc-600 mt-1">
            {run.ticket_source === "jira" ? "Jira" : "Issue"}: {run.ticket_id}
          </p>
        )}
      </div>

      {/* Pass progress */}
      <div className="mb-6">
        <PassProgress currentPass={run.current_pass} status={run.status} />
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-red-400 mb-1">Error</p>
              <pre className="text-sm text-red-300/80 whitespace-pre-wrap font-mono leading-relaxed">{run.error}</pre>
            </div>
            {run.status === "failed" && (
              <button
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await api.retryRun(runId);
                    toast("Run retried — redirecting to runs list");
                    router.push("/");
                  } catch {
                    toast("Failed to retry run", "error");
                    setRetrying(false);
                  }
                }}
                disabled={retrying}
                className="flex-shrink-0 ml-4 px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 cursor-pointer"
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Retry for runs that failed without an error message */}
      {run.status === "failed" && !run.error && (
        <div className="mb-6">
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await api.retryRun(runId);
                toast("Run retried — redirecting to runs list");
                router.push("/");
              } catch {
                toast("Failed to retry run", "error");
                setRetrying(false);
              }
            }}
            disabled={retrying}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white disabled:opacity-50 cursor-pointer"
          >
            {retrying ? "Retrying..." : "Retry this run"}
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Duration" value={formatDuration(run.duration_s)} />
        <StatCard label="Tokens In" value={formatTokens(run.tokens_in)} />
        <StatCard label="Tokens Out" value={formatTokens(run.tokens_out)} />
      </div>

      {/* Links */}
      {(run.pr_url || run.branch) && (
        <div className="flex gap-4 mb-6">
          {run.pr_url && (
            <a href={run.pr_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300">
              View Pull Request →
            </a>
          )}
          {run.branch && (
            <span className="text-sm text-zinc-500">
              Branch: <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">{run.branch}</code>
            </span>
          )}
        </div>
      )}

      {/* Files modified */}
      {run.files_modified && run.files_modified.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">Files modified ({run.files_modified.length})</h2>
          <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {run.files_modified.map((file) => (
              <div key={file} className="px-3 py-2 text-sm text-zinc-400 font-mono">{file}</div>
            ))}
          </div>
        </div>
      )}

      {/* Openspec */}
      {specTabs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">OpenSpec</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex border-b border-zinc-800 bg-zinc-900">
              {specTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSpecTab(tab)}
                  className={`px-4 py-2 text-sm capitalize transition-colors ${
                    specTab === tab
                      ? "text-zinc-100 border-b-2 border-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                {openspec![specTab]}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-zinc-600 space-y-1">
        <p>Run ID: {run.run_id}</p>
        <p>Created: {new Date(run.created_at).toLocaleString()}</p>
        {run.updated_at && <p>Updated: {new Date(run.updated_at).toLocaleString()}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
