import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPHS } from '../lib/diagrams/graphs.mjs';
import { layoutGraph, validateGraph, textWidth } from '../lib/diagrams/layout.mjs';
import { diagramsAsText } from '../lib/diagrams/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content/docs');

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pages(p);
    return /\.mdx?$/.test(e.name) ? [p] : [];
  });
}

/** Every <Diagram id="..."> on the site, with the text written inside it. */
function uses() {
  const out = [];
  for (const file of pages(CONTENT)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<Diagram\s+id="([^"]+)"\s*>([\s\S]*?)<\/Diagram>/g)) out.push({ file: path.relative(ROOT, file), id: m[1], inner: m[2] });
    const opened = (text.match(/<Diagram\b/g) ?? []).length;
    const closed = (text.match(/<\/Diagram>/g) ?? []).length;
    assert.equal(opened, closed, `${path.relative(ROOT, file)}: every <Diagram> needs the steps inside it and a closing tag`);
  }
  return out;
}

test('every diagram is a valid graph: unique ids, real references, edges that can be drawn', () => {
  for (const [id, graph] of Object.entries(GRAPHS)) validateGraph(id, graph);
});

test('a broken graph is refused with what is wrong', () => {
  assert.throws(
    () => validateGraph('x', { title: 't', description: 'd', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], groups: [{ id: 'g', label: 'G', kind: 'row', nodes: ['b'] }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'zz' }] }),
    (err) => /crosses into a group/.test(err.message) && /no "zz"/.test(err.message),
  );
});

test('every <Diagram> on a page names a real diagram and carries its steps as text; every diagram is used', () => {
  const found = uses();
  for (const u of found) {
    assert.ok(GRAPHS[u.id], `${u.file}: no diagram "${u.id}" in lib/diagrams/graphs.mjs`);
    const steps = u.inner.split('\n').filter((l) => /^\s*(\d+\.|-)\s+\S/.test(l));
    assert.ok(steps.length >= 2, `${u.file}: <Diagram id="${u.id}"> needs the diagram written as a list of at least two steps inside it`);
  }
  for (const id of Object.keys(GRAPHS)) assert.ok(found.some((u) => u.id === id), `diagram "${id}" is not used on any page`);
});

test('every diagram lays out within the docs column, and stacks to phone width', async () => {
  for (const [id, graph] of Object.entries(GRAPHS)) {
    const wide = await layoutGraph(graph, 'wide');
    const narrow = await layoutGraph(graph, 'narrow');
    // The docs column is about 680px at 1280px; a little more scales to at least 85%.
    assert.ok(wide.width <= 800, `${id}: wide drawing is ${wide.width}px`);
    // A 390px phone leaves 358px of column; the figure pads 8px each side.
    assert.ok(narrow.width <= 342, `${id}: narrow drawing is ${narrow.width}px, wider than a phone`);
    for (const l of [wide, narrow]) {
      assert.equal(l.nodes.length, graph.nodes.length, `${id}: every node is placed`);
      for (const n of l.nodes) {
        assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= l.width + 1 && n.y + n.h <= l.height + 1, `${id}: ${n.id} sits outside the drawing`);
      }
      for (const e of l.edges) assert.ok(e.points.length >= 2, `${id}: an edge has no route`);
    }
  }
});

test('nodes in a drawing never overlap', async () => {
  for (const [id, graph] of Object.entries(GRAPHS)) {
    for (const mode of ['wide', 'narrow']) {
      const { nodes } = await layoutGraph(graph, mode);
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!overlap, `${id} (${mode}): ${a.id} overlaps ${b.id}`);
        }
    }
  }
});

test('the Markdown twin gets the diagram title and its steps, not a JSX tag', () => {
  const md = 'Intro.\n\n<Diagram id="how-it-works">\n\n1. One.\n2. Two.\n\n</Diagram>\n\nAfter.';
  const out = diagramsAsText(md);
  assert.match(out, /\*\*Diagram: How work moves through CoderHelm\*\*/);
  assert.match(out, /1\. One\.\n2\. Two\./);
  assert.doesNotMatch(out, /<\/?Diagram/);
  assert.throws(() => diagramsAsText('<Diagram id="nope">\n</Diagram>'), /no such diagram/);
});

test('text width estimates grow with the text', () => {
  assert.ok(textWidth('Gateway', 13) < textWidth('Gateway and more', 13));
  assert.ok(textWidth('iiii', 13) < textWidth('MMMM', 13));
});
