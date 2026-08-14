"use client";

// Code Graph — its own section (the graph serves BOTH the reviewer and the PR
// maker). Per repo: index status, load-bearing files (PageRank), symbol search
// (definitions + callers), and an interactive force-directed neighborhood
// explorer (click a node to re-center on that file).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  GraphNeighborhood,
  GraphRepo,
  GraphStatus,
  GraphSymbolResult,
} from "@/lib/api";

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
      for (const l of links.length ? links : sim.links) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <svg viewBox="0 0 800 520" className="w-full rounded-lg border border-zinc-800 bg-zinc-950">
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
          className={n.kind !== "symbol" ? "cursor-pointer" : ""}
          onClick={() => n.kind !== "symbol" && onSelect(n.id)}
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

export default function GraphPage() {
  const [repos, setRepos] = useState<GraphRepo[]>([]);
  const [repo, setRepo] = useState<string>("");
  const [status, setStatus] = useState<GraphStatus | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GraphSymbolResult | null>(null);
  const [hood, setHood] = useState<GraphNeighborhood | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api.getGraphRepos().then((r) => {
      setRepos(r.repos);
      const first = r.repos.find((x) => x.indexed) ?? r.repos[0];
      if (first) setRepo(first.repo);
    });
  }, []);

  useEffect(() => {
    if (!repo) return;
    setStatus(null);
    setHood(null);
    setResult(null);
    api.getGraphStatus(repo).then(setStatus);
  }, [repo]);

  const explore = useCallback(
    (path: string) => {
      if (!repo) return;
      api.getGraphNeighborhood(repo, path).then(setHood);
    },
    [repo],
  );

  const search = useCallback(() => {
    if (!repo || !query.trim()) return;
    setBusy(true);
    api
      .searchGraphSymbol(repo, query.trim())
      .then(setResult)
      .finally(() => setBusy(false));
  }, [repo, query]);

  const current = repos.find((r) => r.repo === repo);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Code Graph</h1>
        <p className="text-sm text-zinc-500 mt-1">
          The repo&apos;s structure map — definitions, callers, imports — used by the reviewer
          <span className="text-zinc-400"> and </span>the PR maker. Kept fresh automatically by
          pushes to the default branch.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200"
        >
          {repos.map((r) => (
            <option key={r.repo} value={r.repo}>
              {r.repo} {r.indexed ? "" : "(not indexed)"}
            </option>
          ))}
        </select>
        {current && (
          <button
            onClick={() => {
              setToggling(true);
              api
                .setGraphEnabled(current.repo, !current.graph_enabled)
                .then(() => api.getGraphRepos().then((r) => setRepos(r.repos)))
                .finally(() => setToggling(false));
            }}
            disabled={toggling}
            className={`px-3 py-2 rounded text-sm border ${
              current.graph_enabled
                ? "border-emerald-700 text-emerald-400"
                : "border-zinc-700 text-zinc-400"
            } disabled:opacity-40`}
          >
            {current.graph_enabled ? "Indexing enabled" : "Enable indexing"}
          </button>
        )}
      </div>

      {status && !status.indexed && (
        <div className="text-sm text-zinc-500 border border-zinc-800 rounded-lg p-4">
          No graph yet for this repo.{" "}
          {current?.graph_enabled
            ? "The initial index is building — refresh shortly."
            : "Enable indexing to build it."}
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
              <div key={String(label)} className="border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="text-lg text-zinc-100 font-medium truncate">{String(val ?? "—")}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-600">
            Indexed at <code>{status.indexed_sha?.slice(0, 7)}</code> · {status.updated_at}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-medium text-zinc-300 mb-2">
                Load-bearing files <span className="text-zinc-600">(PageRank)</span>
              </h2>
              <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-96 overflow-y-auto">
                {(status.top_files ?? []).slice(0, 25).map((f) => (
                  <button
                    key={f.path}
                    onClick={() => explore(f.path)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-900 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-zinc-300 truncate">{f.path}</span>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {f.defs} defs · {(f.rank * 100).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Symbol search</h2>
              <div className="flex gap-2 mb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="function / class / type name…"
                  className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200"
                />
                <button
                  onClick={search}
                  disabled={busy}
                  className="px-3 py-2 rounded bg-emerald-700 text-sm text-white disabled:opacity-40"
                >
                  Search
                </button>
              </div>
              {result && (
                <div className="border border-zinc-800 rounded-lg p-3 space-y-3 max-h-80 overflow-y-auto">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">
                      Definitions ({result.definitions.length})
                    </div>
                    {result.definitions.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => explore(d.path)}
                        className="block w-full text-left text-sm text-zinc-300 hover:text-emerald-400 truncate"
                      >
                        <span className="text-emerald-500">{d.name}</span> — {d.path}:{d.line}{" "}
                        <span className="text-zinc-600">({d.kind})</span>
                      </button>
                    ))}
                    {result.definitions.length === 0 && (
                      <div className="text-sm text-zinc-600">none</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">
                      Referenced by ({result.callers.length} files)
                    </div>
                    {result.callers.slice(0, 20).map((c) => (
                      <button
                        key={c}
                        onClick={() => explore(c)}
                        className="block w-full text-left text-sm text-zinc-400 hover:text-emerald-400 truncate"
                      >
                        {c}
                      </button>
                    ))}
                    {result.callers.length === 0 && <div className="text-sm text-zinc-600">none</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-zinc-300 mb-2">
              Explorer{" "}
              <span className="text-zinc-600">
                {hood ? `— ${hood.path}` : "— pick a file above to explore its neighborhood"}
              </span>
            </h2>
            {hood ? (
              <>
                <GraphCanvas data={hood} onSelect={explore} />
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  <span><span className="text-emerald-400">●</span> selected file</span>
                  <span><span className="text-violet-400">●</span> it imports</span>
                  <span><span className="text-blue-400">●</span> depends on it</span>
                  <span><span className="text-amber-400">●</span> its symbols</span>
                  <span className="text-zinc-600">click a node to re-center</span>
                </div>
              </>
            ) : (
              <div className="border border-dashed border-zinc-800 rounded-lg h-40 flex items-center justify-center text-sm text-zinc-600">
                Click a load-bearing file or a search result
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
