"use client";

import { Time } from "@/components/list/time";
import { useCan } from "@/hooks/use-can";
import { CodeBlock } from "@/components/code-block";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { api, type InfraAnalysis, type InfraFinding, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { StatusPill } from "@/components/status-pill";
import { AlertCircleIcon, CheckIcon, ExternalLinkIcon, HexagonIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { buttonClass, focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { cardClass, Page, PageHeader, SectionHeading } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { Problem } from "@/components/problem";
import { ListSkeleton, RepoFilter } from "@/components/list";
import { formatDate } from "@/components/list/time";
import { Code } from "@/components/settings";

const SEVERITY: Record<InfraFinding["severity"], { label: string; tone: "error" | "warning" | "neutral"; icon: React.ReactNode; color: string }> = {
  error: { label: "Issue", tone: "error", icon: <AlertCircleIcon />, color: "text-red-400" },
  warning: { label: "Warning", tone: "warning", icon: <WarningIcon />, color: "text-amber-400" },
  info: { label: "Note", tone: "neutral", icon: <InfoIcon />, color: "text-zinc-400" },
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

/** A plan prompt that asks Coderhelm to fix one finding. */
function fixPrompt(f: InfraFinding, repo: string | null): string {
  return [`Fix this infrastructure ${f.severity === "error" ? "issue" : "finding"}${repo ? ` in ${repo}` : ""}: ${f.title}.`, f.detail, f.file ? `File: ${f.file}` : ""]
    .filter(Boolean)
    .join("\n");
}

function FindingCard({ finding, repo }: { finding: InfraFinding; repo: string | null }) {
  const sev = SEVERITY[finding.severity] ?? SEVERITY.info;
  const fileHref = repo && finding.file ? `https://github.com/${repo}/blob/HEAD/${finding.file.replace(/^\/+/, "")}` : null;
  return (
    <li className={`${cardClass} flex gap-3`} data-testid="infra-finding">
      <span className={`mt-0.5 shrink-0 ${sev.color}`} aria-hidden="true">{sev.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 text-sm font-semibold text-zinc-100">{finding.title}</span>
          <StatusPill tone={sev.tone}>{sev.label}</StatusPill>
          <StatusPill>{CATEGORY_LABELS[finding.category] ?? finding.category}</StatusPill>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-300">{finding.detail}</p>
        {finding.file && (
          <p className="mt-1.5 text-sm text-zinc-400">
            <Code>{finding.file}</Code>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/plans/new?prefill=${encodeURIComponent(fixPrompt(finding, repo))}`} className={buttonClass("secondary", "sm")}>
            Start a plan to fix
          </Link>
          {fileHref && (
            <a href={fileHref} target="_blank" rel="noreferrer" className={`${buttonClass("ghost", "sm")} gap-1.5`}>
              Open file
              <ExternalLinkIcon />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/** Renders the findings for a given analysis result. */
function AnalysisView({
  analysis,
  repo,
  refreshing,
  onRefresh,
  pollStart,
  stale,
  canScan,
}: {
  analysis: InfraAnalysis;
  /** The repository the findings are for, when it is known (one repo picked, or only one scanned). */
  repo: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  pollStart: number | null;
  stale: boolean;
  canScan: boolean;
}) {
  const whichFiles = (
    <details className="group mx-auto mt-3 max-w-prose text-left text-sm text-zinc-400">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        Which files?
      </summary>
      <p className="mt-1">AWS CDK stacks, Terraform (.tf) files and Serverless Framework (serverless.yml) files on each repository&apos;s default branch.</p>
    </details>
  );

  // A record is written by every finished scan (with cached_at). No record
  // means the scope was never scanned, which is not the same as "no infra".
  if (analysis.status === "no_infra" && !analysis.cached_at) {
    return (
      <div data-testid="infra-not-scanned">
        <EmptyState
          icon={<HexagonIcon />}
          title="Not scanned yet"
          action={
            canScan ? (
              <button type="button" onClick={onRefresh} disabled={refreshing} className={primaryButton}>
                {refreshing ? "Starting…" : "Scan now"}
              </button>
            ) : undefined
          }
        >
          Coderhelm reads the code that sets up your cloud servers, databases and storage, and points out security, cost and reliability problems.
          {!canScan && " Ask a team admin to run a scan."}
          {whichFiles}
        </EmptyState>
      </div>
    );
  }

  if (analysis.status === "no_infra") {
    return (
      <div className="space-y-4">
        <EmptyState icon={<HexagonIcon />} title="No infrastructure code found">
          Nothing that sets up cloud resources was found
          {analysis.cached_at ? <> in the scan on {formatDate(analysis.cached_at)}</> : null}.{canScan ? " Scan again after adding some." : ""}
          {analysis.suggested_prompt ? " To have Coderhelm write it, start a plan from the prompt below." : ""}
          {whichFiles}
        </EmptyState>
        {analysis.suggested_prompt && (
          <div className="space-y-3">
            <CodeBlock code={analysis.suggested_prompt} title="Suggested plan prompt" wrap maxHeightClass="max-h-64" />
            <Link href={`/plans/new?prefill=${encodeURIComponent(analysis.suggested_prompt)}`} className={secondaryButton}>
              Start a plan from this prompt
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (analysis.status === "pending") {
    const elapsed = pollStart ? Date.now() - pollStart : 0;
    const showRetry = canScan && (elapsed > RETRY_SHOW_MS || stale);
    const slow = elapsed > POLL_TIMEOUT_MS || stale;
    if (slow) {
      return (
        <Problem tone="warning" title="The scan is taking longer than expected" onRetry={showRetry ? onRefresh : undefined} retryLabel={refreshing ? "Starting…" : "Try again"}>
          It may have stalled. {showRetry ? "Start it again; if it keeps stalling, contact support." : "Ask a team admin to start it again."}
        </Problem>
      );
    }
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-zinc-300">Scanning your infrastructure... This takes about 30 seconds.</p>
        <ListSkeleton rows={3} label="Scanning" />
        {showRetry && (
          <button type="button" onClick={onRefresh} disabled={refreshing} className={secondaryButton}>
            {refreshing ? "Starting…" : "Try again"}
          </button>
        )}
      </div>
    );
  }

  if (analysis.status === "failed") {
    const { message, hint, action } = parseInfraError(analysis.error);
    return (
      <Problem
        title={message}
        details={analysis.error}
        onRetry={canScan ? onRefresh : undefined}
        retryLabel={refreshing ? "Starting…" : "Try again"}
        action={action}
      >
        {hint}
        {!canScan && " Ask a team admin to run the scan again."}
      </Problem>
    );
  }

  const findings = analysis.findings ?? [];
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warning").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <EmptyState icon={<CheckIcon />} title="No problems found">
          The last scan found nothing to fix in the security, cost or reliability of your infrastructure code.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {SEVERITY_GROUPS.map(({ sev, title }) => {
            const group = findings.filter((f) => f.severity === sev);
            if (group.length === 0) return null;
            return (
              <section key={sev} aria-label={title}>
                <SectionHeading count={group.length}>{title}</SectionHeading>
                <ul className="mt-2 space-y-2">
                  {group.map((finding, i) => (
                    <FindingCard key={i} finding={finding} repo={repo} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function parseInfraError(raw: string | undefined): { message: string; hint: string; action?: React.ReactNode } {
  const lower = (raw ?? "").toLowerCase();
  if (lower.includes("404"))
    return {
      message: "Coderhelm can't open this repo",
      hint: "Ask an admin to give the Coderhelm GitHub App access to it, then scan again.",
      action: (
        <Link href="/settings/repos" className={buttonClass("ghost")}>
          Open Repositories
        </Link>
      ),
    };
  if (lower.includes("rate limit"))
    return { message: "GitHub is limiting how fast Coderhelm can read", hint: "Try again in a few minutes." };
  if (lower.includes("timeout") || lower.includes("timed out"))
    return { message: "The scan timed out", hint: "It took too long to finish. Try again; a smaller scope (one repo) is quicker." };
  return { message: "The scan failed", hint: "Try again, or contact support if it keeps failing." };
}

const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_SHOW_MS = 30 * 1000;

export default function InfrastructurePage() {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  // "" means every repository.
  const [selectedRepo, setSelectedRepo] = useState("");
  const scope: "all" | "repo" = selectedRepo ? "repo" : "all";
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
    api.listRepos().then((data) => setRepos(data.repos.filter((r) => r.enabled))).catch(() => setRepos([]));
  }, []);

  const loadAnalysis = useCallback(() => {
    setLoading(true);
    setLoadError("");
    const fetcher = selectedRepo ? api.getRepoInfrastructure(selectedRepo) : api.getInfrastructure();
    fetcher
      .then(setAnalysis)
      .catch((e: unknown) => {
        setAnalysis(null);
        setLoadError(e instanceof Error ? e.message : "");
      })
      .finally(() => setLoading(false));
  }, [selectedRepo]);

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
    const fetcher = selectedRepo ? () => api.getRepoInfrastructure(selectedRepo) : () => api.getInfrastructure();
    const timer = setInterval(() => {
      if (pollStart && Date.now() - pollStart > POLL_TIMEOUT_MS) {
        setPollStale(true);
        return;
      }
      fetcher().then(setAnalysis).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [analysis?.status, selectedRepo, pollStart, pollStale]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (scope === "all") {
        await api.refreshInfrastructure();
      } else {
        await api.refreshRepoInfrastructure(selectedRepo);
      }
      setAnalysis((prev) => ({ ...(prev ?? { has_infra: false }), status: "pending", error: undefined }));
      setPollStart(Date.now());
      setPollStale(false);
      toast("Scan started. It takes about 30 seconds.");
    } catch {
      toast("Couldn't start the scan. Check your connection and try again.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshLabel = (!analysis || analysis.status === "no_infra") ? "Scan" : "Scan again";
  const repoNames = (repos ?? []).map((r) => r.name);
  // Findings carry a file but no repo: a link to the file is only possible when the repo is known.
  const knownRepo = selectedRepo || (analysis?.scanned_repos?.length === 1 && repoNames.includes(analysis.scanned_repos[0]) ? analysis.scanned_repos[0] : null);

  return (
    <Page>
      <PageHeader
        title="Infrastructure"
        lead="Security, cost and reliability review of the code that sets up your cloud infrastructure."
        actions={canScan ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading || (analysis?.status === "pending" && !pollStale)}
            className={secondaryButton}
          >
            {refreshing ? "Starting…" : refreshLabel}
          </button>
        ) : undefined}
      />

      {repos && repos.length > 1 && (
        <div className="mt-6">
          <RepoFilter value={selectedRepo} onChange={setSelectedRepo} repos={repoNames} />
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <ListSkeleton rows={4} label="Loading the infrastructure review" />
        ) : loadError || loadError === "" && !analysis ? (
          <Problem title="Couldn't load the infrastructure review" onRetry={loadAnalysis} details={loadError || undefined}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        ) : analysis ? (
          <AnalysisView analysis={analysis} repo={knownRepo} refreshing={refreshing} onRefresh={handleRefresh} pollStart={pollStart} stale={pollStale} canScan={canScan} />
        ) : null}
      </div>
      {repos !== null && repos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-400">
          No repos are turned on yet.{" "}
          <Link href="/settings/repos" className={linkButton}>Turn on a repo</Link> to review its infrastructure on its own.
        </p>
      )}
    </Page>
  );
}
