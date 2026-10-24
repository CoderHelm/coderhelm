"use client";

// Code graph: its own section (the planner, the coding agent, CI fixes and
// the reviewer all use it). Every repo Coderhelm works in is listed with its
// graph's status (off, not built, queued, indexing, ready, failed) and its
// Turn off / Rebuild actions. A ready repo opens below: load-bearing files
// (PageRank), symbol search (definitions + callers), and the neighbourhood
// explorer (explorer.tsx; click a node to re-center on it).

import { useCan } from "@/hooks/use-can";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  type GraphNeighborhood,
  type GraphRepo,
  type GraphState,
  type GraphStatus,
  type GraphSymbolResult,
} from "@/lib/api";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import {
  focusRing,
  inputClass,
  primaryButton,
  secondaryButton,
  smallSecondaryButton,
} from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSection,
  ListSkeleton,
  StatusText,
  type StatusLook,
} from "@/components/list";
import { GraphExplorer, GraphLegend, type Filterable } from "./explorer";

// ── Page ────────────────────────────────────────────────────────────────────

const errText = (e: unknown) => (e instanceof Error ? e.message : "The request failed.");

function ErrorBox({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Callout variant="error" title={title}>
      <p>{message}</p>
      <button type="button" onClick={onRetry} className={`mt-2 text-sm font-medium underline rounded ${focusRing}`}>
        Try again
      </button>
    </Callout>
  );
}

/** A repo's state, also from a gateway that predates `state`. */
function graphState(r: GraphRepo): GraphState {
  if (r.state) return r.state;
  if (!r.graph_enabled) return "off";
  return r.indexed ? "ready" : "not_built";
}

const LOOK: Record<GraphState, StatusLook> = {
  ready: { label: "Ready", tone: "success" },
  indexing: { label: "Indexing", tone: "live", live: true },
  queued: { label: "Queued", tone: "queued", live: true },
  not_built: { label: "Not built yet", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  off: { label: "Off", tone: "muted" },
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The meta line under a repo: what its graph holds, or what happens next. */
function repoMeta(r: GraphRepo, state: GraphState): string[] {
  const stats = r.indexed
    ? [plural(r.files, "file", "files"), plural(r.symbols, "symbol", "symbols"), r.indexed_sha ? `at ${r.indexed_sha.slice(0, 7)}` : ""]
    : [];
  switch (state) {
    case "ready":
      return r.updating ? [...stats, "updating now"] : stats;
    case "queued":
      return ["Queued to build"];
    case "indexing":
      return ["Building from the default branch"];
    case "not_built":
      return ["Builds when work starts on this repo, or rebuild now"];
    case "off":
      return ["Turned off: agents don't use it and pushes don't update it", ...stats];
    case "failed":
      return stats;
  }
}

export default function GraphPage() {
  const [repos, setRepos] = useState<GraphRepo[] | null>(null);
  const [reposError, setReposError] = useState("");
  const [repo, setRepo] = useState<string>("");
  const [status, setStatus] = useState<GraphStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GraphSymbolResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [hood, setHood] = useState<GraphNeighborhood | null>(null);
  const [hoodError, setHoodError] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<Filterable>>(new Set());
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState("");
  const { can } = useCan();
  const canManage = can("repos");
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadRepos = useCallback((keepSelection: boolean) => {
    setReposError("");
    return api
      .getGraphRepos()
      .then((r) => {
        setRepos(r.repos);
        if (!keepSelection) {
          const first = r.repos.find((x) => graphState(x) === "ready") ?? r.repos.find((x) => x.indexed);
          setRepo(first ? first.repo : "");
        }
      })
      .catch((e) => setReposError(errText(e)));
  }, []);

  useEffect(() => {
    // Turning a graph off or rebuilding it is admin only on the server.
    void loadRepos(false);
  }, [loadRepos]);

  // While a build is queued or running, check again every few seconds.
  const building = (repos ?? []).some((r) => {
    const st = graphState(r);
    return st === "queued" || st === "indexing" || !!r.updating;
  });
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => void loadRepos(true), 8000);
    return () => clearInterval(t);
  }, [building, loadRepos]);

  const loadStatus = useCallback(() => {
    if (!repo) return;
    setStatus(null);
    setStatusError("");
    api.getGraphStatus(repo).then(setStatus).catch((e) => setStatusError(errText(e)));
  }, [repo]);

  useEffect(() => {
    setHood(null);
    setHoodError("");
    setResult(null);
    setSearchError("");
    loadStatus();
  }, [loadStatus]);

  const explore = useCallback(
    (path: string) => {
      if (!repo) return;
      setHoodError("");
      api
        .getGraphNeighborhood(repo, path)
        .then(setHood)
        .catch((e) => setHoodError(`Couldn't load ${path}: ${errText(e)}`));
    },
    [repo],
  );

  const search = useCallback(() => {
    if (!repo || !query.trim()) return;
    setBusy(true);
    setSearchError("");
    api
      .searchGraphSymbol(repo, query.trim())
      .then(setResult)
      .catch((e) => setSearchError(errText(e)))
      .finally(() => setBusy(false));
  }, [repo, query]);

  const setEnabled = async (r: GraphRepo, on: boolean) => {
    if (!on) {
      const ok = await confirm({
        title: `Turn off the code graph for ${r.repo}?`,
        message:
          "The planner, the coding agent, the reviewer and CI fixes stop using it for this repo, and pushes stop updating it. You can turn it back on at any time.",
        confirmLabel: "Turn off",
        destructive: true,
      });
      if (!ok) return;
    }
    setActing(r.repo);
    try {
      await api.setGraphEnabled(r.repo, on);
      await loadRepos(true);
      toast(on ? `Code graph on for ${r.repo}.` : `Code graph off for ${r.repo}.`);
    } catch (e) {
      toast(`Couldn't change the code graph: ${errText(e)}`, "error");
    } finally {
      setActing("");
    }
  };

  const rebuild = async (r: GraphRepo) => {
    setActing(r.repo);
    try {
      await api.rebuildGraph(r.repo);
      await loadRepos(true);
      toast(`Rebuilding the code graph for ${r.repo}.`);
    } catch (e) {
      toast(`Couldn't start the rebuild: ${errText(e)}`, "error");
    } finally {
      setActing("");
    }
  };

  const current = repos?.find((r) => r.repo === repo);
  const updated = status?.updated_at ? new Date(status.updated_at) : null;

  return (
    <Page className="space-y-6">
      <PageHeader
        title="Code graph"
        lead="A map of each repo: where things are defined, who calls them and what imports what. The planner, the coding agent, the reviewer and CI fixes all use it. Every repo Coderhelm works in gets one, and it updates on every push to the default branch."
      />

      <ListSection id="graph-repos" title="Repositories" count={repos?.length}>
        {reposError ? (
          <ListError title="Couldn't load your repos" onRetry={() => void loadRepos(false)}>
            {reposError}
          </ListError>
        ) : repos === null ? (
          <ListSkeleton rows={3} label="Loading repositories" />
        ) : repos.length === 0 ? (
          <ListEmpty
            title="No repositories yet"
            action={
              <Link href="/settings/repos" className={secondaryButton}>
                Connect repositories
              </Link>
            }
          >
            Turn a repository on and Coderhelm builds its code graph for the planner, the coding agent, the reviewer and CI fixes.
          </ListEmpty>
        ) : (
          <List label="Repositories and their code graphs">
            {repos.map((r) => {
              const state = graphState(r);
              const look = LOOK[state];
              const busyRow = acting === r.repo;
              return (
                <ListRow
                  key={r.repo}
                  testId="graph-repo"
                  data={{ repo: r.repo, state }}
                  status={look}
                  title={r.repo}
                  quiet={state === "off"}
                  meta={repoMeta(r, state)}
                  summary={state === "failed" ? r.reason || "The build failed." : undefined}
                  summaryTone="danger"
                  chips={<StatusText look={look} />}
                  time={r.indexed ? r.updated_at : null}
                  actions={
                    <>
                      {r.indexed && state !== "off" && (
                        <button
                          type="button"
                          onClick={() => setRepo(r.repo)}
                          aria-pressed={repo === r.repo}
                          className={smallSecondaryButton}
                        >
                          {repo === r.repo ? "Exploring" : "Explore"}
                        </button>
                      )}
                      {canManage && state !== "off" && (
                        <button
                          type="button"
                          onClick={() => void rebuild(r)}
                          disabled={busyRow || state === "queued" || state === "indexing"}
                          aria-label={`Rebuild the code graph for ${r.repo}`}
                          className={smallSecondaryButton}
                        >
                          Rebuild
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void setEnabled(r, state === "off")}
                          disabled={busyRow}
                          aria-label={`${state === "off" ? "Turn on" : "Turn off"} the code graph for ${r.repo}`}
                          className={smallSecondaryButton}
                        >
                          {state === "off" ? "Turn on" : "Turn off"}
                        </button>
                      )}
                    </>
                  }
                />
              );
            })}
          </List>
        )}
      </ListSection>

      {current && (
        <h2 className="text-sm font-medium text-zinc-300" data-testid="graph-exploring">
          Exploring <span className="text-zinc-100">{current.repo}</span>
        </h2>
      )}

      {statusError && <ErrorBox title="Couldn't load the graph" message={statusError} onRetry={loadStatus} />}

      {repo && !status && !statusError && (repos?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {status?.indexed && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Files", status.files],
              ["Symbols", status.symbols],
              ["Names referenced", status.names_referenced],
              ["Branch", status.branch],
            ].map(([label, val]) => (
              <div key={String(label)} className="min-w-0 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="text-lg text-zinc-100 font-medium truncate">
                  {typeof val === "number" ? val.toLocaleString() : String(val || "—")}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-500">
            Indexed at commit <code>{status.indexed_sha?.slice(0, 7) || "—"}</code>
            {updated && !isNaN(updated.getTime()) ? ` · ${updated.toLocaleString()}` : ""}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-zinc-300 mb-1">Most connected files</h2>
              <p className="text-xs text-zinc-500 mb-2">Files the rest of the code leans on most. Pick one to explore it.</p>
              {(status.top_files ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500 border border-zinc-800 rounded-lg p-3">No files ranked yet.</p>
              ) : (
                <ul className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-96 overflow-y-auto">
                  {(status.top_files ?? []).slice(0, 25).map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => explore(f.path)}
                        className={`w-full text-left px-3 py-2 hover:bg-zinc-900 flex items-center justify-between gap-2 ${focusRing}`}
                      >
                        <span className="text-sm text-zinc-300 truncate">{f.path}</span>
                        <span className="text-xs text-zinc-500 shrink-0">
                          {f.defs} definition{f.defs === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Find a symbol</h2>
              <form
                className="flex gap-2 mb-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  search();
                }}
              >
                <label htmlFor="graph-symbol" className="sr-only">Function, class or type name</label>
                <input
                  id="graph-symbol"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Function, class or type name"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <button type="submit" disabled={busy || !query.trim()} className={primaryButton}>
                  {busy ? "Searching..." : "Search"}
                </button>
              </form>
              {searchError && <ErrorBox title="Search failed" message={searchError} onRetry={search} />}
              {result && (
                <div className="border border-zinc-800 rounded-lg p-3 space-y-3 max-h-80 overflow-y-auto">
                  <div>
                    <h3 className="text-xs text-zinc-500 mb-1">Definitions ({result.definitions.length})</h3>
                    {result.definitions.map((d, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => explore(d.path)}
                        className={`block w-full text-left text-sm text-zinc-300 hover:text-emerald-400 truncate rounded ${focusRing}`}
                      >
                        <span className="text-emerald-500">{d.name}</span> in {d.path}:{d.line}{" "}
                        <span className="text-zinc-500">({d.kind})</span>
                      </button>
                    ))}
                    {result.definitions.length === 0 && <p className="text-sm text-zinc-500">None found.</p>}
                  </div>
                  <div>
                    <h3 className="text-xs text-zinc-500 mb-1">
                      Used in ({result.callers.length} file{result.callers.length === 1 ? "" : "s"})
                    </h3>
                    {result.callers.slice(0, 20).map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => explore(c)}
                        className={`block w-full text-left text-sm text-zinc-400 hover:text-emerald-400 truncate rounded ${focusRing}`}
                      >
                        {c}
                      </button>
                    ))}
                    {result.callers.length === 0 && <p className="text-sm text-zinc-500">None found.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-medium text-zinc-300 mb-2">
              Explorer{hood && <span className="text-zinc-500 font-normal">: {hood.path}</span>}
            </h2>
            {hoodError && (
              <div className="mb-2">
                <Callout variant="error">{hoodError}</Callout>
              </div>
            )}
            {hood ? (
              <>
                <GraphExplorer data={hood} hidden={hiddenKinds} onSelect={explore} />
                <GraphLegend
                  hidden={hiddenKinds}
                  onToggle={(k) =>
                    setHiddenKinds((prev) => {
                      const next = new Set(prev);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      return next;
                    })
                  }
                />
              </>
            ) : (
              <div className="border border-dashed border-zinc-800 rounded-lg h-40 flex items-center justify-center px-4 text-center text-sm text-zinc-500">
                Pick a file from the list or a search result to see what it connects to.
              </div>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
