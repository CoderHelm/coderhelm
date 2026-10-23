"use client";

// Code graph: its own section (the planner, the coding agent, CI fixes and
// the reviewer all use it). Every repo Coderhelm works in is listed with its
// graph's status (off, not built, queued, indexing, ready, failed) and its
// Turn off / Rebuild actions. A ready repo opens below: load-bearing files
// (PageRank), symbol search (definitions + callers), and an interactive
// force-directed neighborhood explorer (click a node to re-center on it).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Force layout (small, dependency-free) ───────────────────────────────────

interface Node {
  id: string;
  label: string;
  kind: "center" | "import" | "importer" | "symbol";
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Link {
  source: string;
  target: string;
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function buildSim(n: GraphNeighborhood): { nodes: Node[]; links: Link[] } {
  const nodes: Node[] = [];
  const links: Link[] = [];
  const seen = new Set<string>();
  const add = (id: string, kind: Node["kind"]) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({
      id,
      label: kind === "symbol" ? id.replace(/^sym:/, "") : shortName(id),
      kind,
      x: 400 + (Math.random() - 0.5) * 300,
      y: 260 + (Math.random() - 0.5) * 220,
      vx: 0,
      vy: 0,
    });
  };
  add(n.path, "center");
  for (const f of n.imports.slice(0, 20)) {
    add(f, "import");
    links.push({ source: n.path, target: f });
  }
  for (const f of n.importers.slice(0, 20)) {
    add(f, "importer");
    links.push({ source: f, target: n.path });
  }
  for (const s of n.symbols.slice(0, 8)) {
    const sid = `sym:${s.name}`;
    add(sid, "symbol");
    links.push({ source: n.path, target: sid });
    for (const c of s.callers.slice(0, 6)) {
      add(c, "importer");
      links.push({ source: c, target: sid });
    }
  }
  return { nodes, links };
}

function GraphCanvas({
  data,
  onSelect,
}: {
  data: GraphNeighborhood;
  onSelect: (path: string) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    const sim = buildSim(data);
    setLinks(sim.links);
    let ns = sim.nodes;
    let tick = 0;
    const step = () => {
      tick += 1;
      const byId = new Map(ns.map((n) => [n.id, n]));
      // Repulsion
      for (const a of ns) {
        for (const b of ns) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 40);
          const f = 1800 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
        }
      }
      // Springs
      for (const l of sim.links) {
        const s = byId.get(l.source);
        const t = byId.get(l.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - 110) * 0.02;
        s.vx += (dx / d) * f;
        s.vy += (dy / d) * f;
        t.vx -= (dx / d) * f;
        t.vy -= (dy / d) * f;
      }
      // Center gravity + integrate
      ns = ns.map((n) => {
        const gx = (400 - n.x) * (n.kind === "center" ? 0.08 : 0.004);
        const gy = (260 - n.y) * (n.kind === "center" ? 0.08 : 0.004);
        const vx = (n.vx + gx) * 0.82;
        const vy = (n.vy + gy) * 0.82;
        return {
          ...n,
          x: Math.max(30, Math.min(770, n.x + vx)),
          y: Math.max(24, Math.min(496, n.y + vy)),
          vx,
          vy,
        };
      });
      setNodes([...ns]);
      if (tick < 140) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [data]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const color = (k: Node["kind"]) =>
    k === "center"
      ? "#34d399"
      : k === "symbol"
        ? "#fbbf24"
        : k === "importer"
          ? "#60a5fa"
          : "#a78bfa";

  return (
    <svg
      viewBox="0 0 800 520"
      role="group"
      aria-label={`Files connected to ${data.path}`}
      className="w-full rounded-lg border border-zinc-800 bg-zinc-950"
    >
      {links.map((l, i) => {
        const s = byId.get(l.source);
        const t = byId.get(l.target);
        if (!s || !t) return null;
        return (
          <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#3f3f46" strokeWidth={1} />
        );
      })}
      {nodes.map((n) => (
        <g
          key={n.id}
          transform={`translate(${n.x},${n.y})`}
          className={n.kind !== "symbol" ? "cursor-pointer outline-none [&:focus-visible>circle]:stroke-zinc-100 [&:focus-visible>circle]:stroke-2" : ""}
          {...(n.kind !== "symbol"
            ? {
                role: "button",
                tabIndex: 0,
                "aria-label": `Explore ${n.id}`,
                onClick: () => onSelect(n.id),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                },
              }
            : {})}
        >
          <circle
            r={n.kind === "center" ? 11 : n.kind === "symbol" ? 5 : 7}
            fill={color(n.kind)}
            fillOpacity={0.9}
          />
          <text
            y={n.kind === "center" ? 26 : 18}
            textAnchor="middle"
            className="select-none"
            fill="#a1a1aa"
            fontSize={10}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState("");
  const [canManage, setCanManage] = useState(false);
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
    api.me().then((u) => setCanManage(u.role === "admin" || u.role === "owner")).catch(() => {});
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
        <h2 className="text-sm font-medium text-zinc-300 break-words" data-testid="graph-exploring">
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
            <h2 className="text-sm font-medium text-zinc-300 mb-2 break-words">
              Explorer{hood && <span className="text-zinc-500 font-normal">: {hood.path}</span>}
            </h2>
            {hoodError && (
              <div className="mb-2">
                <Callout variant="error">{hoodError}</Callout>
              </div>
            )}
            {hood ? (
              <>
                <GraphCanvas data={hood} onSelect={explore} />
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
                  <span><span aria-hidden="true" className="text-emerald-400">●</span> selected file</span>
                  <span><span aria-hidden="true" className="text-violet-400">●</span> files it imports</span>
                  <span><span aria-hidden="true" className="text-blue-400">●</span> files that use it</span>
                  <span><span aria-hidden="true" className="text-amber-400">●</span> its symbols</span>
                  <span>Pick a file node to move to it.</span>
                </div>
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
