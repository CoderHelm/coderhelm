"use client";

// The code graph explorer: one file in the middle, the files it imports, the
// files that use it and its symbols around it. Pick a file node to move to it.
//
// Motion follows what calm graph views do (d3's static force layout, Nx,
// Obsidian, Material and Apple motion guidance):
//   - The layout is computed to a settled state before the first paint, so
//     nothing jiggles into place. A new graph fades in where it will stay.
//   - Moving to another file keeps every node already on screen where it was
//     and glides the rest into place in one short ease-out (240ms), with no
//     bounce. Nodes that leave fade out; nodes that arrive fade in.
//   - Filtering a kind only fades it; nothing else moves.
//   - Hover or focus dims everything but the node and its neighbours; nodes
//     never grow or jump.
//   - Labels use the page's own font at one pixel size on every screen, sit on
//     a halo so lines don't cross them, and a label that would overlap another
//     waits for hover or focus.
//   - With reduced motion, every change is instant.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphNeighborhood } from "@/lib/api";
import { focusRing } from "@/components/ui";

export type NodeKind = "center" | "import" | "importer" | "symbol";
export type Filterable = Exclude<NodeKind, "center">;

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
}
interface GLink {
  source: string;
  target: string;
}
interface Pt {
  x: number;
  y: number;
}
/** What is drawn this frame: a position and an opacity. */
interface Shown extends Pt {
  o: number;
}

/** One look per kind, used by the nodes and the legend alike. */
export const KIND: Record<NodeKind, { fill: string; dot: string; label: string }> = {
  center: { fill: "#34d399", dot: "bg-emerald-400", label: "selected file" },
  import: { fill: "#a78bfa", dot: "bg-violet-400", label: "files it imports" },
  importer: { fill: "#60a5fa", dot: "bg-blue-400", label: "files that use it" },
  symbol: { fill: "#fbbf24", dot: "bg-amber-400", label: "its symbols" },
};

const RADIUS: Record<NodeKind, number> = { center: 8, import: 5.5, importer: 5.5, symbol: 4 };
const FONT_PX = 12;
const DURATION = 240;
const PAD = 24;

function shortName(path: string): string {
  const parts = path.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function buildGraph(n: GraphNeighborhood): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [];
  const links: GLink[] = [];
  const seen = new Set<string>();
  const add = (id: string, kind: NodeKind) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, label: kind === "symbol" ? id.replace(/^sym:/, "") : shortName(id), kind });
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

/** A stable number in [0, 1) for a string, so the same data lays out the same way. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Each kind starts in its own direction: imports right, users left, symbols below. */
const SECTOR: Record<Filterable, number> = { import: 0, importer: Math.PI, symbol: Math.PI / 2 };

/**
 * A force layout run to rest before anything is drawn (300 steps, cooling).
 * Nodes that were already on screen start where they were and are held near
 * there, so moving between files keeps the picture people have in their head.
 */
function layout(nodes: GNode[], links: GLink[], prev: Map<string, Pt>): Map<string, Pt> {
  const center = nodes[0];
  const origin = (center && prev.get(center.id)) || { x: 0, y: 0 };
  const anchor = new Map<string, Pt>();
  const pos = new Map<string, Pt & { vx: number; vy: number }>();
  const count: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const n of nodes) totals[n.kind] = (totals[n.kind] ?? 0) + 1;
  for (const n of nodes) {
    const p = prev.get(n.id);
    if (n.kind === "center") {
      pos.set(n.id, { x: 0, y: 0, vx: 0, vy: 0 });
      continue;
    }
    if (p) {
      const a = { x: p.x - origin.x, y: p.y - origin.y };
      anchor.set(n.id, a);
      pos.set(n.id, { ...a, vx: 0, vy: 0 });
      continue;
    }
    const i = (count[n.kind] = (count[n.kind] ?? 0) + 1) - 1;
    const total = totals[n.kind] ?? 1;
    const spread = n.kind === "symbol" ? Math.PI * 0.6 : Math.PI * 0.9;
    const angle = SECTOR[n.kind as Filterable] + (total > 1 ? (i / (total - 1) - 0.5) * spread : 0) + (hash(n.id) - 0.5) * 0.2;
    const r = (n.kind === "symbol" ? 110 : 150) + hash(`${n.id}#r`) * 40;
    pos.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 });
  }
  const list = [...pos.entries()];
  let alpha = 1;
  for (let tick = 0; tick < 300; tick++) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i][1];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j][1];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const d = Math.sqrt(d2);
        const f = (2600 / d2) * alpha;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
    }
    for (const l of links) {
      const s = pos.get(l.source);
      const t = pos.get(l.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - 130) * 0.03 * alpha;
      s.vx += (dx / d) * f;
      s.vy += (dy / d) * f;
      t.vx -= (dx / d) * f;
      t.vy -= (dy / d) * f;
    }
    for (const [id, p] of list) {
      if (id === center?.id) {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      const a = anchor.get(id);
      if (a) {
        p.vx += (a.x - p.x) * 0.06 * alpha;
        p.vy += (a.y - p.y) * 0.06 * alpha;
      }
      p.vx -= p.x * 0.006 * alpha;
      p.vy -= p.y * 0.006 * alpha;
      p.vx *= 0.6;
      p.vy *= 0.6;
      p.x += p.vx;
      p.y += p.vy;
    }
    alpha *= 0.985;
  }
  return new Map(list.map(([id, p]) => [id, { x: p.x, y: p.y }]));
}

/** Label widths in the page's own font, measured once per label. */
const widths = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null | undefined;
function labelWidth(text: string, bold: boolean): number {
  const key = `${bold ? "b" : "r"}${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (measureCtx === undefined && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  let w = text.length * FONT_PX * 0.56;
  if (measureCtx && typeof document !== "undefined") {
    measureCtx.font = `${bold ? 500 : 400} ${FONT_PX}px ${getComputedStyle(document.body).fontFamily}`;
    w = measureCtx.measureText(text).width;
  }
  widths.set(key, w);
  return w;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function GraphExplorer({
  data,
  hidden,
  onSelect,
}: {
  data: GraphNeighborhood;
  /** Kinds filtered out by the legend. They fade; nothing else moves. */
  hidden: ReadonlySet<Filterable>;
  onSelect: (path: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const height = Math.round(Math.min(520, Math.max(360, width * 0.62)));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // The graph and its settled layout. Positions carry over between files.
  const placed = useRef(new Map<string, Pt>());
  const graph = useMemo(() => {
    const g = buildGraph(data);
    return { ...g, at: layout(g.nodes, g.links, placed.current) };
  }, [data]);
  useEffect(() => {
    placed.current = graph.at;
  }, [graph]);

  // Fit the whole graph, labels included, into the box. Only positions scale:
  // nodes and text stay the same size on every screen.
  const target = useMemo(() => {
    const out = new Map<string, Pt>();
    if (!width) return out;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of graph.nodes) {
      const p = graph.at.get(n.id)!;
      const half = Math.min(labelWidth(n.label, n.kind === "center"), 180) / 2;
      x0 = Math.min(x0, p.x - half);
      x1 = Math.max(x1, p.x + half);
      y0 = Math.min(y0, p.y - RADIUS[n.kind]);
      y1 = Math.max(y1, p.y + RADIUS[n.kind] + FONT_PX + 8);
    }
    const scale = Math.min((width - PAD * 2) / Math.max(x1 - x0, 1), (height - PAD * 2) / Math.max(y1 - y0, 1), 1.6);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    for (const [id, p] of graph.at) out.set(id, { x: width / 2 + (p.x - cx) * scale, y: height / 2 + (p.y - cy) * scale });
    return out;
  }, [graph, width, height]);

  // What is on screen, and what was on screen a moment ago (nodes and links
  // that are leaving, kept until they have faded).
  const meta = useRef(new Map<string, GNode>());
  for (const n of graph.nodes) meta.current.set(n.id, n);
  const [shown, setShown] = useState<Map<string, Shown>>(new Map());
  const [leavingLinks, setLeavingLinks] = useState<GLink[]>([]);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const lastGraph = useRef<typeof graph | null>(null);
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    if (!target.size) return;
    const from = shownRef.current;
    const newGraph = lastGraph.current !== graph;
    const before = lastGraph.current;
    lastGraph.current = graph;
    const end = new Map<string, Shown>();
    for (const [id, p] of target) end.set(id, { ...p, o: 1 });

    // A resize, reduced motion, or nothing drawn yet with nothing to fade: snap.
    if (!newGraph || reduced) {
      setLeavingLinks([]);
      setShown(end);
      setMoving(false);
      return;
    }

    const start = new Map<string, Shown>();
    for (const [id, p] of target) {
      const was = from.get(id);
      start.set(id, was ? { ...was } : { ...p, o: 0 });
    }
    const gone = [...from.entries()].filter(([id]) => !target.has(id));
    for (const [id, p] of gone) start.set(id, { ...p });
    const keep = new Set(graph.links.map((l) => `${l.source}>${l.target}`));
    setLeavingLinks((before?.links ?? []).filter((l) => !keep.has(`${l.source}>${l.target}`)));

    let raf = 0;
    const t0 = performance.now();
    setMoving(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      const k = ease(t);
      const frame = new Map<string, Shown>();
      for (const [id, s] of start) {
        const e = end.get(id) ?? { x: s.x, y: s.y, o: 0 };
        frame.set(id, { x: s.x + (e.x - s.x) * k, y: s.y + (e.y - s.y) * k, o: s.o + (e.o - s.o) * k });
      }
      if (t < 1) {
        setShown(frame);
        raf = requestAnimationFrame(step);
      } else {
        setShown(end);
        setLeavingLinks([]);
        setMoving(false);
      }
    };
    setShown(start);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph, target, reduced]);

  // Hover and focus: the node and its neighbours stay, the rest dims.
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => setHover(null), [data]);
  const neighbours = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const l of graph.links) {
      if (l.source === hover) s.add(l.target);
      if (l.target === hover) s.add(l.source);
    }
    return s;
  }, [hover, graph]);

  const isHidden = (id: string) => {
    const n = meta.current.get(id);
    return !!n && n.kind !== "center" && hidden.has(n.kind as Filterable);
  };

  // Labels: most important first; one that would overlap a label already
  // placed waits for hover or focus. Worked out on the settled positions, so
  // labels don't flicker while nodes move.
  const labelled = useMemo(() => {
    const out = new Set<string>();
    const order: NodeKind[] = ["center", "import", "importer", "symbol"];
    const nodes = [...graph.nodes]
      .filter((n) => n.kind === "center" || !hidden.has(n.kind as Filterable))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    // Every visible node is in the way too: a label never covers a dot.
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = nodes.flatMap((n) => {
      const p = target.get(n.id);
      const r = RADIUS[n.kind] + 2;
      return p ? [{ x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r }] : [];
    });
    for (const n of nodes) {
      const p = target.get(n.id);
      if (!p) continue;
      const w = labelWidth(n.label, n.kind === "center");
      const top = p.y + RADIUS[n.kind] + 3;
      const b = { x0: p.x - w / 2 - 3, x1: p.x + w / 2 + 3, y0: top, y1: top + FONT_PX + 3 };
      const hits = boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      const offscreen = b.x0 < 0 || b.x1 > width;
      if (!hits && !offscreen) {
        out.add(n.id);
        boxes.push(b);
      }
    }
    return out;
  }, [graph, target, hidden, width]);

  const links = [...graph.links, ...leavingLinks];
  const ids = [...shown.keys()];

  return (
    <div ref={box} className="relative w-full rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`Files connected to ${data.path}`}
          data-testid="graph-explorer"
          data-motion={reduced ? "reduced" : "full"}
          data-moving={moving ? "true" : "false"}
          className="block font-sans"
          onPointerLeave={() => setHover(null)}
        >
          <g>
            {links.map((l) => {
              const s = shown.get(l.source);
              const t = shown.get(l.target);
              if (!s || !t) return null;
              const off = isHidden(l.source) || isHidden(l.target);
              const lit = !!hover && (l.source === hover || l.target === hover);
              const base = off ? 0 : neighbours ? (lit ? 0.9 : 0.12) : 0.55;
              return (
                <line
                  key={`${l.source}>${l.target}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={lit ? "#a1a1aa" : "#52525b"}
                  strokeWidth={1}
                  style={{ opacity: base * Math.min(s.o, t.o) }}
                  className="transition-opacity duration-150 ease-out motion-reduce:transition-none"
                />
              );
            })}
          </g>
          {ids.map((id) => {
            const n = meta.current.get(id);
            const p = shown.get(id);
            if (!n || !p) return null;
            const clickable = n.kind !== "symbol";
            const off = isHidden(id) || !target.has(id);
            const dim = !!neighbours && !neighbours.has(id);
            const showLabel = !off && (neighbours ? neighbours.has(id) : labelled.has(id));
            const final = target.get(id);
            return (
              <g
                key={id}
                transform={`translate(${p.x},${p.y})`}
                data-testid="graph-node"
                data-id={id}
                data-kind={n.kind}
                data-x={final ? final.x.toFixed(1) : undefined}
                data-y={final ? final.y.toFixed(1) : undefined}
                style={{ opacity: (off ? 0 : dim ? 0.25 : 1) * p.o, pointerEvents: off ? "none" : undefined }}
                className={`transition-opacity duration-150 ease-out motion-reduce:transition-none ${clickable ? "cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-zinc-100" : ""}`}
                onPointerEnter={() => setHover(id)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                aria-hidden={off ? true : undefined}
                {...(clickable && !off
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Explore ${id}`,
                      onClick: () => onSelect(id),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(id);
                        }
                      },
                    }
                  : {})}
              >
                <circle r={RADIUS[n.kind] + 3} fill="transparent" stroke="transparent" strokeWidth={2} />
                <circle r={RADIUS[n.kind]} fill={KIND[n.kind].fill} stroke="#09090b" strokeWidth={1.5} />
                <text
                  y={RADIUS[n.kind] + 3 + FONT_PX}
                  textAnchor="middle"
                  fontSize={FONT_PX}
                  fontWeight={n.kind === "center" ? 500 : 400}
                  fill={n.kind === "center" ? "#f4f4f5" : "#a1a1aa"}
                  stroke="#09090b"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  style={{ paintOrder: "stroke", opacity: showLabel ? 1 : 0, pointerEvents: showLabel ? undefined : "none" }}
                  className="select-none transition-opacity duration-150 ease-out motion-reduce:transition-none"
                  aria-hidden="true"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** The legend, which doubles as the filter: each kind but the selected file toggles. */
export function GraphLegend({
  hidden,
  onToggle,
}: {
  hidden: ReadonlySet<Filterable>;
  onToggle: (kind: Filterable) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-2 text-xs text-zinc-400" role="group" aria-label="Show in the explorer">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${KIND.center.dot}`} />
        {KIND.center.label}
      </span>
      {(["import", "importer", "symbol"] as const).map((k) => {
        const on = !hidden.has(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(k)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 transition-colors duration-150 motion-reduce:transition-none ${focusRing} ${
              on ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span aria-hidden="true" className={`size-2 rounded-full ${KIND[k].dot} ${on ? "" : "opacity-30"}`} />
            {KIND[k].label}
          </button>
        );
      })}
      <span className="text-zinc-500 px-2">Pick a file node to move to it.</span>
    </div>
  );
}
