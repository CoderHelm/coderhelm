"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { api, type InfraAnalysis, type InfraFinding, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

import { RepoCombobox } from "@/components/repo-combobox";

const SEVERITY_STYLES: Record<string, string> = {
  error: "border-red-500/20 bg-red-500/5 text-red-400",
  warning: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
  info: "border-zinc-700 bg-zinc-900/50 text-zinc-400",
};

const SEVERITY_ICONS: Record<string, string> = {
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  performance: "Performance",
  reliability: "Reliability",
};

function FindingCard({ finding }: { finding: InfraFinding }) {
  return (
    <div className={`p-3 rounded-lg border ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info}`}>
      <div className="flex items-start gap-2">
        <span className="text-xs mt-0.5 flex-shrink-0">{SEVERITY_ICONS[finding.severity]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">{finding.title}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">{CATEGORY_LABELS[finding.category] ?? finding.category}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{finding.detail}</p>
          {finding.file && <p className="text-xs text-zinc-600 font-mono mt-1">{finding.file}</p>}
        </div>
      </div>
    </div>
  );
}

function ScopeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
        active ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

/** Renders the diagram + findings for a given analysis result. */
function AnalysisView({
  analysis,
  refreshing,
  onRefresh,
}: {
  analysis: InfraAnalysis;
  refreshing: boolean;
  onRefresh: () => void;
}) {

  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // No infra
  if (analysis.status === "no_infra") {
    const handleCopy = () => {
      if (!analysis.suggested_prompt) return;
      navigator.clipboard.writeText(analysis.suggested_prompt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => toast("Failed to copy to clipboard", "error"));
    };
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-2xl">⬡</div>
        <h2 className="text-lg font-semibold mb-2">No infrastructure code found</h2>
        <p className="text-zinc-500 text-sm mb-6">
          No CDK, Terraform, or Serverless files detected. Click <b>Scan</b> to retry, or use the prompt below to generate infrastructure.
        </p>
        {analysis.suggested_prompt && (
          <div className="text-left">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Suggested plan prompt</p>
              <button onClick={handleCopy} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed text-left overflow-auto max-h-64">
              {analysis.suggested_prompt}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Pending
  if (analysis.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Analyzing your infrastructure...</p>
        <p className="text-zinc-600 text-xs mt-1">Scanning for CDK/Terraform/Serverless code</p>
      </div>
    );
  }

  // Failed
  if (analysis.status === "failed") {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">✕</div>
        <h2 className="text-lg font-semibold text-red-400 mb-2">Analysis failed</h2>
        <p className="text-zinc-500 text-sm mb-2">Something went wrong while scanning your infrastructure code.</p>
        {analysis.error && (
          <p className="text-red-400/70 text-xs font-mono bg-zinc-900 border border-zinc-800 rounded-lg p-3 inline-block max-w-md">
            {analysis.error.slice(0, 300)}
          </p>
        )}
      </div>
    );
  }

  // Ready — diagram + findings
  const errorCount = analysis.findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnCount = analysis.findings?.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <>
      {/* Meta: scanned repos, cache date */}
      <div className="flex items-center gap-3 mb-4">
        {analysis.scanned_repos && analysis.scanned_repos.length > 0 && (
          <span className="text-xs text-zinc-600">
            {analysis.scanned_repos.length} file{analysis.scanned_repos.length !== 1 ? "s" : ""} scanned
          </span>
        )}
        {analysis.cached_at && (
          <span className="text-xs text-zinc-700">
            cached {new Date(analysis.cached_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Summary badges */}
      {(errorCount > 0 || warnCount > 0) && (
        <div className="flex gap-2 mb-4">
          {errorCount > 0 && (
            <span className="px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full text-xs">
              {errorCount} issue{errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-full text-xs">
              {warnCount} warning{warnCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Findings */}
      <div className="space-y-2">
          {!analysis.findings || analysis.findings.length === 0 ? (
            <div className="p-6 text-center text-zinc-600 text-sm border border-zinc-800 rounded-xl">
              No findings — looks great!
            </div>
          ) : (
            <>
              {(["error", "warning"] as const).map((sev) => {
                const group = analysis.findings!.filter((f) => f.severity === sev);
                if (group.length === 0) return null;
                return (
                  <div key={sev}>
                    <p className="text-xs text-zinc-600 uppercase tracking-wider mb-1.5 mt-3">
                      {sev === "error" ? "Issues" : sev === "warning" ? "Warnings" : "Notes"}
                    </p>
                    <div className="space-y-1.5">
                      {group.map((finding, i) => (
                        <FindingCard key={i} finding={finding} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
    </>
  );
}

function InfrastructureContent() {
  const [scope, setScope] = useState<"all" | "repo">("all");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [analysis, setAnalysis] = useState<InfraAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setSelectedRepo(enabled[0].name);
    }).catch(() => {});
  }, []);

  const loadAnalysis = useCallback(() => {
    setLoading(true);
    const fetcher = scope === "all"
      ? api.getInfrastructure()
      : selectedRepo
        ? api.getRepoInfrastructure(selectedRepo)
        : Promise.resolve(null);
    fetcher
      .then((data) => {
        setAnalysis(data);
        // Auto-trigger scan for per-repo when no analysis exists yet
        if (data?.status === "no_infra" && scope === "repo" && selectedRepo) {
          api.refreshRepoInfrastructure(selectedRepo).then(() => {
            setAnalysis((prev) => prev ? { ...prev, status: "pending" } : null);
          }).catch(() => {});
        }
      })
      .catch(() => toast("Failed to load infrastructure analysis", "error"))
      .finally(() => setLoading(false));
  }, [scope, selectedRepo, toast]);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  // Poll while pending
  useEffect(() => {
    if (analysis?.status !== "pending") return;
    const fetcher = scope === "all"
      ? () => api.getInfrastructure()
      : selectedRepo
        ? () => api.getRepoInfrastructure(selectedRepo)
        : null;
    if (!fetcher) return;
    const timer = setInterval(() => { fetcher().then(setAnalysis).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [analysis?.status, scope, selectedRepo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (scope === "all") {
        await api.refreshInfrastructure();
      } else if (selectedRepo) {
        await api.refreshRepoInfrastructure(selectedRepo);
      }
      setAnalysis((prev) => prev ? { ...prev, status: "pending", error: undefined } : null);
      toast("Analysis started — this takes about 30 seconds");
    } catch {
      toast("Failed to start analysis", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshLabel = analysis?.status === "failed" ? "Retry" :
    (!analysis || analysis.status === "no_infra") ? "Scan repos" : "Refresh";

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure</h1>
          <p className="text-zinc-500 text-sm mt-1">Security and reliability analysis of your connected repos</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || (analysis?.status === "pending")}
          className="px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-50"
        >
          {refreshing ? "Starting..." : refreshLabel}
        </button>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-5">
        <ScopeTab label="All Repos" active={scope === "all"} onClick={() => setScope("all")} />
        <ScopeTab label="Per Repo" active={scope === "repo"} onClick={() => setScope("repo")} />
      </div>

      {/* Repo selector (per-repo scope only) */}
      {scope === "repo" && repos.length > 0 && (
        <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
      )}

      {/* Content */}
      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : analysis ? (
        <AnalysisView analysis={analysis} refreshing={refreshing} onRefresh={handleRefresh} />
      ) : (
        <div className="text-center py-16 text-zinc-600 text-sm">No data</div>
      )}
    </div>
  );
}

export default function InfrastructurePage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>}>
      <InfrastructureContent />
    </Suspense>
  );
}
