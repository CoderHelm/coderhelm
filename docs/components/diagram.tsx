// <Diagram id="..."> draws a diagram from lib/diagrams/graphs.mjs as inline
// SVG, laid out at build time (lib/diagrams/layout.mjs). Nothing runs in the
// browser: colors are the docs theme's CSS variables, text is the page font,
// and a container query swaps the wide drawing for the stacked one on a phone.
//
// The children are the same diagram written as a short list. They are shown
// under "Diagram as text" and are what the Markdown twin of the page carries.

import type { ReactNode } from 'react';
import { GRAPHS } from '@/lib/diagrams/graphs.mjs';
import { layoutGraph, TEXT, LAYOUT_CONSTANTS } from '@/lib/diagrams/layout.mjs';
import { ICONS } from '@/lib/diagrams/icons';
import type { Graph, Layout, Point } from '@/lib/diagrams/types';

const { NODE } = LAYOUT_CONSTANTS;
const ARROW = 6;
const RADIUS = 6;

/** An orthogonal polyline with rounded corners, stopping short of the arrowhead. */
function edgePath(points: Point[]): { d: string; head: string } {
  const pts = points.map((p) => ({ ...p }));
  const n = pts.length;
  const a = pts[n - 2];
  const b = pts[n - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const tip = { x: b.x, y: b.y };
  pts[n - 1] = { x: b.x - ux * ARROW, y: b.y - uy * ARROW };

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const q = pts[i + 1];
    const r = Math.min(RADIUS, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(q.x - c.x, q.y - c.y) / 2);
    const inX = c.x - Math.sign(c.x - p.x) * r;
    const inY = c.y - Math.sign(c.y - p.y) * r;
    const outX = c.x + Math.sign(q.x - c.x) * r;
    const outY = c.y + Math.sign(q.y - c.y) * r;
    d += ` L${inX},${inY} Q${c.x},${c.y} ${outX},${outY}`;
  }
  d += ` L${pts[n - 1].x},${pts[n - 1].y}`;
  const back = { x: tip.x - ux * ARROW, y: tip.y - uy * ARROW };
  const half = ARROW * 0.62;
  const head = `M${tip.x},${tip.y} L${back.x - uy * half},${back.y + ux * half} L${back.x + uy * half},${back.y - ux * half} Z`;
  return { d, head };
}

/** The middle of the edge's longest segment, where its label sits. */
function labelSpot(points: Point[]): Point {
  let best = { len: -1, x: points[0].x, y: points[0].y };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { len, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return best;
}

function Drawing({ id, variant, graph, layout }: { id: string; variant: 'wide' | 'narrow'; graph: Graph; layout: Layout }) {
  const titleId = `dg-${id}-${variant}-title`;
  const descId = `dg-${id}-${variant}-desc`;
  const pad = 1;
  return (
    <svg
      className={`ch-dg-svg ch-dg-${variant}`}
      data-diagram={id}
      data-variant={variant}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`}
      width={layout.width + pad * 2}
      height={layout.height + pad * 2}
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      <title id={titleId}>{graph.title}</title>
      <desc id={descId}>{graph.description}</desc>

      {layout.groups.map((g) => (
        <g key={g.id} className="ch-dg-group" data-kind={g.kind} data-tone={g.tone}>
          <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={12} />
          <text x={g.x + 14} y={g.y + 14 + 7} dominantBaseline="central" fontSize={TEXT.group}>
            {g.label}
          </text>
        </g>
      ))}

      {layout.edges.map((e) => {
        if (e.points.length < 2) return null;
        const { d, head } = edgePath(e.points);
        return (
          <g key={e.id} className="ch-dg-edge" data-dashed={e.dashed || undefined}>
            <path d={d} fill="none" />
            <path d={head} className="ch-dg-head" />
          </g>
        );
      })}

      {layout.nodes.map((n) => {
        const Icon = n.icon ? ICONS[n.icon] : null;
        const textX = n.x + NODE.padX + (Icon ? NODE.icon + NODE.iconGap : 0);
        const block = n.labelLines.length * NODE.lineLabel + n.detailLines.length * NODE.lineDetail;
        const top = n.y + (n.h - block) / 2;
        return (
          <g key={n.id} className="ch-dg-node" data-tone={n.tone ?? 'default'} data-node={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={9} />
            {Icon ? (
              <Icon
                x={n.x + NODE.padX}
                y={top + NODE.lineLabel / 2 - NODE.icon / 2}
                width={NODE.icon}
                height={NODE.icon}
                strokeWidth={1.75}
                className="ch-dg-icon"
                aria-hidden="true"
              />
            ) : null}
            {n.labelLines.map((line, i) => (
              <text key={`l${i}`} className="ch-dg-label" x={textX} y={top + i * NODE.lineLabel + NODE.lineLabel / 2} dominantBaseline="central" fontSize={TEXT.label}>
                {line}
              </text>
            ))}
            {n.detailLines.map((line, i) => (
              <text
                key={`d${i}`}
                className="ch-dg-detail"
                x={textX}
                y={top + n.labelLines.length * NODE.lineLabel + i * NODE.lineDetail + NODE.lineDetail / 2}
                dominantBaseline="central"
                fontSize={TEXT.detail}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {layout.edges.map((e) => {
        if (!e.label || e.points.length < 2) return null;
        const spot = labelSpot(e.points);
        return (
          <g key={`${e.id}-label`} className="ch-dg-edge-label">
            <rect x={spot.x - e.label.w / 2} y={spot.y - e.label.h / 2} width={e.label.w} height={e.label.h} rx={e.label.h / 2} />
            <text x={spot.x} y={spot.y} textAnchor="middle" dominantBaseline="central" fontSize={TEXT.edge}>
              {e.label.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export async function Diagram({ id, children }: { id: string; children?: ReactNode }) {
  const graph = (GRAPHS as Record<string, Graph>)[id];
  if (!graph) throw new Error(`<Diagram id="${id}">: no such diagram in lib/diagrams/graphs.mjs`);
  if (!children) throw new Error(`<Diagram id="${id}">: write the diagram as a short list inside the tag, for readers who can't see it`);
  const [wide, narrow] = await Promise.all([layoutGraph(graph, 'wide'), layoutGraph(graph, 'narrow')]);
  return (
    <figure className="ch-dg not-prose" data-diagram={id}>
      <figcaption className="ch-dg-caption">{graph.title}</figcaption>
      <div className="ch-dg-canvas">
        <Drawing id={id} variant="wide" graph={graph} layout={wide} />
        <Drawing id={id} variant="narrow" graph={graph} layout={narrow} />
      </div>
      <details className="ch-dg-text">
        <summary>Diagram as text</summary>
        <div className="prose">{children}</div>
      </details>
    </figure>
  );
}
