import type { ICONS } from './icons';

export type IconName = keyof typeof ICONS;

/** How a box reads: a step, something a person does, where data is kept, or the result. */
export type Tone = 'default' | 'person' | 'store' | 'result' | 'muted';

export type GraphNode = {
  id: string;
  label: string;
  /** One short line under the label. */
  detail?: string;
  icon?: IconName;
  tone?: Tone;
};

export type GraphGroup = {
  id: string;
  label: string;
  /** `row`: a small flow of its own. `set`: things of one kind, shown as a grid. */
  kind: 'row' | 'set';
  nodes: string[];
  /** Grid columns for a set, per mode. */
  columns?: { wide?: number; narrow?: number };
  tone?: 'default' | 'boundary';
};

export type GraphEdge = {
  from: string;
  to: string;
  /** What moves along the edge, in two or three words. */
  label?: string;
  dashed?: boolean;
};

export type Graph = {
  /** Read by screen readers as the image's name, and shown above the diagram. */
  title: string;
  /** One or two sentences: what the picture says. */
  description: string;
  direction?: 'DOWN' | 'RIGHT';
  nodes: GraphNode[];
  groups?: GraphGroup[];
  edges: GraphEdge[];
  /** Top-level order, when it should differ from the declaration order. */
  order?: string[];
};

export type Point = { x: number; y: number };

export type Layout = {
  width: number;
  height: number;
  maxWidth: number;
  nodes: (GraphNode & { x: number; y: number; w: number; h: number; labelLines: string[]; detailLines: string[] })[];
  groups: { id: string; kind: 'row' | 'set'; label: string; tone: string; x: number; y: number; w: number; h: number }[];
  edges: { id: string; points: Point[]; dashed: boolean; label?: { text: string; x: number; y: number; w: number; h: number } }[];
};
