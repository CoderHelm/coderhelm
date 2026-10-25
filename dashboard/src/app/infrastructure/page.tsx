"use client";

import { Time } from "@/components/list/time";
import { useCan } from "@/hooks/use-can";
import { CodeBlock } from "@/components/code-block";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { api, type InfraAnalysis, type InfraFinding, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Segmented } from "@/components/segmented";
import { RepoCombobox } from "@/components/repo-combobox";
import { AlertCircleIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { focusRing, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";

const SEVERITY_STYLES: Record<string, string> = {
  error: "border-red-500/20 bg-red-500/5 text-red-400",
  warning: "border-amber-500/20 bg-amber-500/5 text-amber-400",
  info: "border-zinc-700 bg-zinc-900/50 text-zinc-400",
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  error: <AlertCircleIcon />,
  warning: <WarningIcon />,
  info: <InfoIcon />,
};

const SEVERITY_GROUPS: { sev: InfraFinding["severity"]; title: string }[] = [
  { sev: "error", title: "Issues" },
  { sev: "warning", title: "Warnings" },
  { sev: "info", title: "Notes" },
];

const CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  performance: "Performance",
  cost: "Cost",
  reliability: "Reliability",
};

const SCOPES = [
  { value: "all" as const, label: "All repos" },
  { value: "repo" as const, label: "One repo" },
];

function FindingCard({ finding }: { finding: InfraFinding }) {
  return (
    <div className={`p-3 rounded-lg border ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex-shrink-0 scale-75" aria-hidden="true">{SEVERITY_ICONS[finding.severity] ?? SEVERITY_ICONS.info}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="min-w-0 text-xs font-semibold">{finding.title}</span>
            <StatusPill>{CATEGORY_LABELS[finding.category] ?? finding.category}</StatusPill>
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{finding.detail}</p>
          {finding.file && <p className="text-xs text-zinc-500 font-mono mt-1 wrap-anywhere">{finding.file}</p>}
        </div>
      </div>
    </div>
  );
}

/** Renders the findings for a given analysis result. */
function AnalysisView({
  analysis,
  refreshing,
  onRefresh,
  pollStart,
  stale,
  canScan,
}: {
  analysis: InfraAnalysis;
  refreshing: boolean;
  onRefresh: () => void;
  pollStart: number | null;
  stale: boolean;
  canScan: boolean;
}) {
  const askAdmin = <p className="text-zinc-500 text-sm mt-4">Ask a team admin to run a scan.</p>;

  // A record is written by every finished scan (with cached_at). No record
  // means the scope was never scanned, which is not the same as "no infra".
  if (analysis.status === "no_infra" && !analysis.cached_at) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center" data-testid="infra-not-scanned">
        <h2 className="text-lg font-semibold mb-2">Not scanned yet</h2>
        <p className="text-zinc-500 text-sm">
          Coderhelm reads your CDK, Terraform and Serverless files and points out security, cost and reliability problems.
        </p>
        {canScan ? (
          <button type="button" onClick={onRefresh} disabled={refreshing} className={`${secondaryButton} mt-5`}>
            {refreshing ? "Starting..." : "Scan now"}
          </button>
        ) : askAdmin}
      </div>
    );
  }

  if (analysis.status === "no_infra") {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <h2 className="text-lg font-semibold mb-2">No infrastructure code found</h2>
        <p className="text-zinc-500 text-sm mb-6">
          No CDK, Terraform or Serverless files were found{analysis.cached_at ? ` in the scan on ${new Date(analysis.cached_at).toLocaleDateString()}` : ""}.
          {canScan ? " Scan again after adding some." : ""}
          {analysis.suggested_prompt ? " To have Coderhelm write it, start a plan from the prompt below." : ""}
        </p>
        {analysis.suggested_prompt && (
          <div className="text-left">
            <CodeBlock code={analysis.suggested_prompt} title="Suggested plan prompt" wrap maxHeightClass="max-h-64" />
          </div>
        )}
      </div>
    );
  }

  if (analysis.status === "pending") {
    const elapsed = pollStart ? Date.now() - pollStart : 0;
    const showRetry = canScan && (elapsed > RETRY_SHOW_MS || stale);
    const slow = elapsed > POLL_TIMEOUT_MS || stale;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" role="status">
        {!slow && <div aria-hidden="true" className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-4" />}
        {slow ? (
          <>
            <p className="text-amber-400 text-sm font-medium">Taking longer than expected</p>
            <p className="text-zinc-500 text-xs mt-1">The scan may have stalled.</p>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm">Scanning your infrastructure...</p>
            <p className="text-zinc-500 text-xs mt-1">Looking for CDK, Terraform and Serverless code. This takes about 30 seconds.</p>
          </>
        )}
        {showRetry && (
          <button type="button" onClick={onRefresh} disabled={refreshing} className={`${secondaryButton} mt-4`}>
            {refreshing ? "Starting..." : "Try again"}
          </button>
        )}
      </div>
    );
  }

  if (analysis.status === "failed") {
    const { message, hint } = parseInfraError(analysis.error);
    return (
      <div className="max-w-xl mx-auto mt-12">
        <Callout variant="error" title={message}>
          {hint && <p>{hint}</p>}
          {canScan ? (
            <button type="button" onClick={onRefresh} disabled={refreshing} className={`mt-2 text-sm font-medium underline rounded disabled:opacity-50 ${focusRing}`}>
              {refreshing ? "Starting..." : "Try again"}
            </button>
          ) : <p>Ask a team admin to run the scan again.</p>}
        </Callout>
      </div>
    );
  }

  const findings = analysis.findings ?? [];
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warning").length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {errorCount > 0 && <StatusPill tone="error">{errorCount} issue{errorCount !== 1 ? "s" : ""}</StatusPill>}
        {warnCount > 0 && <StatusPill tone="warning">{warnCount} warning{warnCount !== 1 ? "s" : ""}</StatusPill>}
        {(analysis.cached_at || (analysis.scanned_repos && analysis.scanned_repos.length > 0)) && (
          <span className="text-sm text-zinc-400" data-testid="scan-summary">
            {analysis.cached_at ? <>Last scanned <Time iso={analysis.cached_at} mode="date" /></> : "Scanned"}
            {analysis.scanned_repos && analysis.scanned_repos.length > 0 && (
              <>
                {" · "}
                {analysis.scanned_repos.length} repo{analysis.scanned_repos.length !== 1 ? "s" : ""}
              </>
            )}
          </span>
        )}
      </div>

      {findings.length === 0 ? (
        <div className="p-6 text-center text-zinc-400 text-sm border border-zinc-800 rounded-xl">
          No problems found.
        </div>
      ) : (
        <div className="space-y-2">
          {SEVERITY_GROUPS.map(({ sev, title }) => {
            const group = findings.filter((f) => f.severity === sev);
            if (group.length === 0) return null;
            return (
              <section key={sev} aria-label={title}>
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 mt-3">{title}</h2>
                <div className="space-y-1.5">
                  {group.map((finding, i) => <FindingCard key={i} finding={finding} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function parseInfraError(raw: string | undefined): { message: string; hint?: string } {
  if (!raw) return { message: "The scan failed", hint: "No reason was recorded." };
  const lower = raw.toLowerCase();
  if (lower.includes("404"))
    return { message: "Repository not accessible", hint: "Check that the Coderhelm GitHub App has access to this repo." };
  if (lower.includes("rate limit"))
    return { message: "GitHub API rate limit reached", hint: "Try again in a few minutes." };
  if (lower.includes("timeout") || lower.includes("timed out"))
    return { message: "The scan timed out", hint: "It took too long to finish." };
  return { message: "The scan failed", hint: raw.slice(0, 200) };
}

const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_SHOW_MS = 30 * 1000;

export default function InfrastructurePage() {
  const [scope, setScope] = useState<"all" | "repo">("all");
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [analysis, setAnalysis] = useState<InfraAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pollStart, setPollStart] = useState<number | null>(null);
  const [pollStale, setPollStale] = useState(false);
  const { can } = useCan();
  const canScan = can("repos");
  const { toast } = useToast();

  useEffect(() => {
    // Starting a scan is admin only on the server; members only read.
    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setSelectedRepo(enabled[0].name);
    }).catch(() => setRepos([]));
  }, []);

  const loadAnalysis = useCallback(() => {
    if (scope === "repo" && !selectedRepo) {
      setAnalysis(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    const fetcher = scope === "all" ? api.getInfrastructure() : api.getRepoInfrastructure(selectedRepo);
    fetcher
      .then(setAnalysis)
      .catch((e: unknown) => {
        setAnalysis(null);
        setLoadError(e instanceof Error ? e.message : "The request failed.");
      })
      .finally(() => setLoading(false));
  }, [scope, selectedRepo]);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  useEffect(() => {
    if (analysis?.status === "pending") {
      if (pollStart === null) setPollStart(Date.now());
    } else {
      setPollStart(null);
      setPollStale(false);
    }
  }, [analysis?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (analysis?.status !== "pending" || pollStale) return;
    const fetcher = scope === "all"
      ? () => api.getInfrastructure()
      : selectedRepo
        ? () => api.getRepoInfrastructure(selectedRepo)
        : null;
    if (!fetcher) return;
    const timer = setInterval(() => {
      if (pollStart && Date.now() - pollStart > POLL_TIMEOUT_MS) {
        setPollStale(true);
        return;
      }
      fetcher().then(setAnalysis).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [analysis?.status, scope, selectedRepo, pollStart, pollStale]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (scope === "all") {
        await api.refreshInfrastructure();
      } else if (selectedRepo) {
        await api.refreshRepoInfrastructure(selectedRepo);
      }
      setAnalysis((prev) => ({ ...(prev ?? { has_infra: false }), status: "pending", error: undefined }));
      setPollStart(Date.now());
      setPollStale(false);
      toast("Scan started. It takes about 30 seconds.");
    } catch (e: unknown) {
      toast(e instanceof Error ? `Couldn't start the scan: ${e.message}` : "Couldn't start the scan", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshLabel = (!analysis || analysis.status === "no_infra") ? "Scan" : "Scan again";
  const noRepos = scope === "repo" && repos !== null && repos.length === 0;

  return (
    <Page>
      <PageHeader
        title="Infrastructure"
        lead="Security, cost and reliability review of the infrastructure code in your repos."
        actions={canScan && !noRepos ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading || (analysis?.status === "pending" && !pollStale)}
            className={secondaryButton}
          >
            {refreshing ? "Starting..." : refreshLabel}
          </button>
        ) : undefined}
      />

      <div className="mt-6 mb-5">
        <Segmented label="What to review" options={SCOPES} value={scope} onChange={setScope} />
      </div>
      {scope === "repo" && repos && repos.length > 0 && (
        <div className="max-w-md">
          <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
        </div>
      )}

      {noRepos ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400">
          No repos are turned on yet.{" "}
          <Link href="/settings/repos" className={`text-zinc-200 underline underline-offset-2 rounded ${focusRing}`}>Turn on a repo</Link>{" "}
          to review its infrastructure on its own.
        </div>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : loadError ? (
        <Callout variant="error" title="Couldn't load the infrastructure review">
          <p>{loadError}</p>
          <button type="button" onClick={loadAnalysis} className={`mt-2 text-sm font-medium underline rounded ${focusRing}`}>
            Try again
          </button>
        </Callout>
      ) : analysis ? (
        <AnalysisView analysis={analysis} refreshing={refreshing} onRefresh={handleRefresh} pollStart={pollStart} stale={pollStale} canScan={canScan} />
      ) : null}
    </Page>
  );
}
