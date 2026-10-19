"use client";

// Code graph: its own section (the graph serves BOTH the reviewer and the
// coding agent). Per repo: index status, load-bearing files (PageRank), symbol search
// (definitions + callers), and an interactive force-directed neighborhood
// explorer (click a node to re-center on that file).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type GraphNeighborhood,
  type GraphRepo,
  type GraphStatus,
  type GraphSymbolResult,
} from "@/lib/api";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { focusRing, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";

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
  const [toggling, setToggling] = useState(false);
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
          const first = r.repos.find((x) => x.indexed) ?? r.repos[0];
          setRepo(first ? first.repo : "");
        }
      })
      .catch((e) => setReposError(errText(e)));
  }, []);

  useEffect(() => {
    // Turning indexing on or off is admin only on the server.
    api.me().then((u) => setCanManage(u.role === "admin" || u.role === "owner")).catch(() => {});
    void loadRepos(false);
  }, [loadRepos]);

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

  const current = repos?.find((r) => r.repo === repo);

  const toggleIndexing = async () => {
    if (!current) return;
    const turnOn = !current.graph_enabled;
    if (!turnOn) {
      const ok = await confirm({
        title: "Turn off indexing?",
        message: `The graph for ${current.repo} stops updating on pushes. The reviewer and coding agent keep using the last index.`,
        confirmLabel: "Turn off",
        destructive: true,
      });
      if (!ok) return;
    }
    setToggling(true);
    try {
      await api.setGraphEnabled(current.repo, turnOn);
      await loadRepos(true);
      if (turnOn) toast("Indexing turned on. The first index is building.");
      loadStatus();
    } catch (e) {
      toast(`Couldn't change indexing: ${errText(e)}`, "error");
    } finally {
      setToggling(false);
    }
  };

  const updated = status?.updated_at ? new Date(status.updated_at) : null;

  return (
    <Page className="space-y-6">
      <PageHeader
        title="Code graph"
        lead="A map of each repo: where things are defined, who calls them and what imports what. The reviewer and the coding agent both use it. It updates on every push to the default branch."
      />

      {reposError ? (
        <ErrorBox title="Couldn't load your repos" message={reposError} onRetry={() => void loadRepos(false)} />
      ) : repos === null ? (
        <Skeleton className="h-10 w-72" />
      ) : repos.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400" data-testid="graph-empty">
          No repos have a code graph yet. A repo appears here once the reviewer is set up for it.{" "}
          <Link href="/reviewer/config" className={`text-zinc-200 underline underline-offset-2 rounded ${focusRing}`}>
            Set up the reviewer
          </Link>
        </div>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-zinc-400">
            Repository
            <select
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className={`max-w-full min-h-9 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 ${focusRing}`}
            >
              {repos.map((r) => (
                <option key={r.repo} value={r.repo}>
                  {r.repo}{r.indexed ? "" : " (no graph yet)"}
                </option>
              ))}
            </select>
          </label>
          {current && canManage && (
            <button type="button" onClick={() => void toggleIndexing()} disabled={toggling} className={secondaryButton}>
              {toggling ? "Saving..." : current.graph_enabled ? "Turn off indexing" : "Turn on indexing"}
            </button>
          )}
          {current && (
            <StatusPill tone={current.graph_enabled ? "success" : "neutral"}>
              {current.graph_enabled ? "Indexing on" : "Indexing off"}
            </StatusPill>
          )}
        </div>
      )}

      {statusError && <ErrorBox title="Couldn't load the graph" message={statusError} onRetry={loadStatus} />}

      {repo && !status && !statusError && (repos?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {status && !status.indexed && (
        <div className="text-sm text-zinc-400 border border-zinc-800 rounded-lg p-4">
          No graph yet for this repo.{" "}
          {current?.graph_enabled ? (
            <>
              The first index is building.{" "}
              <button type="button" onClick={loadStatus} className={`underline underline-offset-2 text-zinc-200 rounded ${focusRing}`}>
                Check again
              </button>
            </>
          ) : canManage ? (
            "Turn on indexing to build it."
          ) : (
            "Ask a team admin to turn on indexing."
          )}
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
