// Lays out a diagram from lib/diagrams/graphs.mjs with ELK, at build time.
// The result is plain geometry; components/diagram.tsx draws it as SVG.
//
// A diagram is drawn twice: `wide` for the docs column and `narrow` for a
// phone. The shape is the same; the narrow one stacks everything in one
// column so no text has to shrink.
//
// The model has two levels, which keeps every diagram reading the same way:
//   - top-level items (nodes and groups) flow down the page in layers;
//   - a group is either a `row` (its nodes are a small flow of their own,
//     left to right when wide, top to bottom when narrow) or a `set` (things
//     of one kind, in a grid; edges attach to the set, not to its members).
// An edge joins two top-level items, or two nodes in the same row group.

import ELK from 'elkjs/lib/elk.bundled.js';

/** @typedef {import('./types').Graph} Graph */
/** @typedef {import('./types').Layout} Layout */

export const TEXT = {
  label: 13,
  detail: 11.5,
  group: 11,
  edge: 11,
};

const NODE = {
  padX: 12,
  icon: 16,
  iconGap: 9,
  lineLabel: 18,
  lineDetail: 15,
  padY: 11,
  minWidth: 96,
};

const MODES = {
  wide: { maxNode: 184, rowNode: 122, setColumns: 3, rowDirection: 'RIGHT', maxWidth: 680 },
  narrow: { maxNode: 148, rowNode: 148, setColumns: 1, rowDirection: 'DOWN', maxWidth: 340 },
};

const GROUP = { pad: 14, labelHeight: 22 };

// Rough advance widths for Geist, in em. Text is checked against the real
// font in the e2e tests (e2e/diagrams.spec.ts), so an estimate that runs
// short fails a test instead of clipping on the site.
const NARROW_CHARS = new Set([...'iljtfrI.,:;\'!|() ']);
const WIDE_CHARS = new Set([...'mwMW@']);
/** Estimated width of `text` at `size` px. */
export function textWidth(text, size, weight = 400) {
  let em = 0;
  for (const ch of text) {
    if (NARROW_CHARS.has(ch)) em += 0.3;
    else if (WIDE_CHARS.has(ch)) em += 0.86;
    else if (ch >= 'A' && ch <= 'Z') em += 0.66;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else em += 0.55;
  }
  return Math.ceil(em * size * (weight >= 500 ? 1.04 : 1));
}

/** Greedy word wrap to `max` px. */
export function wrap(text, size, max) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, size) > max) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Size a node's box and wrap its text for one mode. */
function measureNode(node, mode, inRow) {
  const iconSpace = node.icon ? NODE.icon + NODE.iconGap : 0;
  const maxText = (inRow ? mode.rowNode : mode.maxNode) - NODE.padX * 2 - iconSpace;
  const labelLines = wrap(node.label, TEXT.label, maxText);
  const detailLines = node.detail ? wrap(node.detail, TEXT.detail, maxText) : [];
  const textW = Math.max(
    ...labelLines.map((l) => textWidth(l, TEXT.label, 500)),
    ...detailLines.map((l) => textWidth(l, TEXT.detail)),
  );
  // Font rendering differs between systems (Linux draws Geist a few percent
  // wider than macOS), so the box leaves room beyond the estimate.
  const w = Math.max(NODE.minWidth, Math.ceil(textW * 1.06 + iconSpace + NODE.padX * 2));
  const h = NODE.padY * 2 + labelLines.length * NODE.lineLabel + detailLines.length * NODE.lineDetail;
  return { w, h, labelLines, detailLines };
}

function edgeLabel(text) {
  return { text, width: textWidth(text, TEXT.edge) + 12, height: 18 };
}

const BASE_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.edgeLabels.inline': 'true',
  'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'MEDIAN_LAYER',
  'elk.spacing.edgeLabel': '4',
  'elk.spacing.labelNode': '6',
  'elk.json.edgeCoords': 'ROOT',
  'elk.json.shapeCoords': 'ROOT',
};

const elk = new ELK();

/** Validate a graph: ids unique, every reference resolves, edges legal. Throws with what is wrong. */
export function validateGraph(id, graph) {
  const problems = [];
  const where = new Map(); // node id -> group id or null
  const seen = new Set();
  const add = (x) => {
    if (seen.has(x)) problems.push(`duplicate id "${x}"`);
    seen.add(x);
  };
  for (const n of graph.nodes) {
    add(n.id);
    where.set(n.id, null);
  }
  for (const g of graph.groups ?? []) {
    add(g.id);
    if (!['row', 'set'].includes(g.kind)) problems.push(`group "${g.id}": kind must be "row" or "set"`);
    for (const c of g.nodes) {
      if (!where.has(c)) problems.push(`group "${g.id}": no node "${c}"`);
      else if (where.get(c)) problems.push(`node "${c}" is in two groups`);
      else where.set(c, g.id);
    }
  }
  const groupIds = new Set((graph.groups ?? []).map((g) => g.id));
  const kindOf = new Map((graph.groups ?? []).map((g) => [g.id, g.kind]));
  for (const e of graph.edges) {
    for (const end of [e.from, e.to]) if (!seen.has(end)) problems.push(`edge ${e.from} to ${e.to}: no "${end}"`);
    if (!seen.has(e.from) || !seen.has(e.to)) continue;
    const a = groupIds.has(e.from) ? null : where.get(e.from);
    const b = groupIds.has(e.to) ? null : where.get(e.to);
    if (a !== b) problems.push(`edge ${e.from} to ${e.to}: crosses into a group; point it at the group ("${a ?? b}") instead`);
    else if (a && kindOf.get(a) === 'set') problems.push(`edge ${e.from} to ${e.to}: members of a set have no edges between them`);
  }
  if (!graph.title) problems.push('no title');
  if (!graph.description) problems.push('no description');
  if (problems.length) throw new Error(`diagram "${id}": ${problems.join('; ')}`);
}

function edgesOf(result, labels) {
  return (result.edges ?? []).map((e) => {
    const s = e.sections?.[0];
    const points = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: p.x, y: p.y })) : [];
    const l = e.labels?.[0];
    const meta = labels.get(e.id);
    return {
      id: e.id,
      points,
      dashed: meta.dashed ?? false,
      label: l ? { text: l.text, x: l.x, y: l.y, w: l.width, h: l.height } : undefined,
    };
  });
}

/** Lay out a row group's nodes; positions relative to the group's content box. */
async function layoutRow(group, graph, mode, measured) {
  const members = new Set(group.nodes);
  // Steps of one flow share a size, so the row reads as a sequence.
  const w = Math.max(...group.nodes.map((id) => measured.get(id).w));
  const h = Math.max(...group.nodes.map((id) => measured.get(id).h));
  for (const id of group.nodes) Object.assign(measured.get(id), { w, h });
  const edges = graph.edges.filter((e) => members.has(e.from) && members.has(e.to));
  const meta = new Map();
  const result = await elk.layout({
    id: group.id,
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': mode.rowDirection,
      'elk.spacing.nodeNode': '14',
      'elk.layered.spacing.nodeNodeBetweenLayers': mode.rowDirection === 'RIGHT' ? '6' : '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '4',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: group.nodes.map((id) => ({ id, width: measured.get(id).w, height: measured.get(id).h })),
    edges: edges.map((e, i) => {
      const id = `${group.id}:e${i}`;
      meta.set(id, e);
      return { id, sources: [e.from], targets: [e.to], labels: e.label ? [edgeLabel(e.label)] : [] };
    }),
  });
  return {
    w: result.width,
    h: result.height,
    nodes: result.children.map((c) => ({ id: c.id, x: c.x, y: c.y })),
    edges: edgesOf(result, meta),
  };
}

/** Lay out a set group as a grid; positions relative to the group's content box. */
function layoutSet(group, mode, measured) {
  const cols = Math.min(group.nodes.length, group.columns?.[mode === MODES.wide ? 'wide' : 'narrow'] ?? mode.setColumns);
  const gap = 8;
  const cellW = Math.max(...group.nodes.map((id) => measured.get(id).w));
  const rows = Math.ceil(group.nodes.length / cols);
  const rowH = [];
  group.nodes.forEach((id, i) => {
    const r = Math.floor(i / cols);
    rowH[r] = Math.max(rowH[r] ?? 0, measured.get(id).h);
  });
  const nodes = group.nodes.map((id, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const y = rowH.slice(0, r).reduce((a, b) => a + b + gap, 0);
    // Every member of a set takes the same width, so the grid reads as one thing.
    measured.get(id).w = cellW;
    measured.get(id).h = rowH[r];
    return { id, x: c * (cellW + gap), y };
  });
  return { w: cols * cellW + (cols - 1) * gap, h: rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap, nodes, edges: [] };
}

/**
 * Lay out one graph in one mode.
 * @param {Graph} graph
 * @param {'wide' | 'narrow'} modeName
 * @returns {Promise<Layout>}
 */
export async function layoutGraph(graph, modeName) {
  const mode = MODES[modeName];
  const groups = graph.groups ?? [];
  const inRow = new Set(groups.filter((g) => g.kind === 'row').flatMap((g) => g.nodes));
  const measured = new Map(graph.nodes.map((n) => [n.id, measureNode(n, mode, inRow.has(n.id))]));
  const grouped = new Set(groups.flatMap((g) => g.nodes));

  const inner = new Map();
  for (const g of groups) {
    inner.set(g.id, g.kind === 'row' ? await layoutRow(g, graph, mode, measured) : layoutSet(g, mode, measured));
  }
  const groupBox = (g) => {
    const i = inner.get(g.id);
    const labelW = textWidth(g.label, TEXT.group, 500) + GROUP.pad * 2;
    return { w: Math.max(i.w + GROUP.pad * 2, labelW), h: i.h + GROUP.pad * 2 + GROUP.labelHeight };
  };

  const topItems = [
    ...graph.nodes.filter((n) => !grouped.has(n.id)).map((n) => ({ id: n.id, ...measured.get(n.id) })),
    ...groups.map((g) => ({ id: g.id, ...groupBox(g) })),
  ];
  // Keep the author's order: nodes and groups as they first appear in `order`, else as declared.
  const order = graph.order ?? [...graph.nodes.map((n) => n.id), ...groups.map((g) => g.id)];
  topItems.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const top = new Set(topItems.map((t) => t.id));
  const topEdges = graph.edges.filter((e) => top.has(e.from) && top.has(e.to));
  const meta = new Map();
  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      ...BASE_OPTIONS,
      'elk.direction': graph.direction ?? 'DOWN',
      'elk.spacing.nodeNode': modeName === 'wide' ? '28' : '16',
      'elk.layered.spacing.nodeNodeBetweenLayers': '34',
      'elk.layered.spacing.edgeNodeBetweenLayers': '12',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
      'elk.padding': '[top=2,left=2,bottom=2,right=2]',
    },
    children: topItems.map((t) => ({ id: t.id, width: t.w, height: t.h })),
    edges: topEdges.map((e, i) => {
      const id = `e${i}`;
      meta.set(id, e);
      return { id, sources: [e.from], targets: [e.to], labels: e.label ? [edgeLabel(e.label)] : [] };
    }),
  });

  const pos = new Map(result.children.map((c) => [c.id, c]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outNodes = [];
  const outGroups = [];
  const outEdges = edgesOf(result, meta);

  for (const n of graph.nodes) {
    if (grouped.has(n.id)) continue;
    const p = pos.get(n.id);
    const m = measured.get(n.id);
    outNodes.push({ ...n, x: p.x, y: p.y, w: m.w, h: m.h, labelLines: m.labelLines, detailLines: m.detailLines });
  }
  for (const g of groups) {
    const p = pos.get(g.id);
    const box = groupBox(g);
    const i = inner.get(g.id);
    outGroups.push({ id: g.id, kind: g.kind, label: g.label, tone: g.tone ?? 'default', x: p.x, y: p.y, w: box.w, h: box.h });
    // Center the content under the label when the label is the wider of the two.
    const ox = p.x + (box.w - i.w) / 2;
    const oy = p.y + GROUP.pad + GROUP.labelHeight;
    for (const c of i.nodes) {
      const m = measured.get(c.id);
      outNodes.push({ ...nodeById.get(c.id), x: ox + c.x, y: oy + c.y, w: m.w, h: m.h, labelLines: m.labelLines, detailLines: m.detailLines });
    }
    for (const e of i.edges) {
      outEdges.push({
        ...e,
        points: e.points.map((pt) => ({ x: pt.x + ox, y: pt.y + oy })),
        label: e.label ? { ...e.label, x: e.label.x + ox, y: e.label.y + oy } : undefined,
      });
    }
  }

  return { width: Math.ceil(result.width), height: Math.ceil(result.height), maxWidth: mode.maxWidth, nodes: outNodes, groups: outGroups, edges: outEdges };
}

export const LAYOUT_CONSTANTS = { NODE, GROUP, MODES };
