// CoderHelm's adapter for Floorplan's map viewer (vendor/floorplan, MIT),
// inside the App map page's sandboxed iframe. It waits for the map from the
// page (postMessage, checked and size-capped), then writes the viewer's page
// the way Floorplan's build.mjs does: the template with its layout engine,
// add-ons, fonts and the map's data filled in. The layout engine (ELK) runs
// in a Web Worker, so a large map never stalls this frame.
//
// Vendored files are never edited; the parts come from public/app-map/viewer.js
// (written by scripts/floorplan-frame.mjs).
(() => {
  'use strict';
  const MAX_BYTES = 25 * 1024 * 1024;
  const P = window.FLOORPLAN_PARTS;

  // The same escaping as Floorplan's page-safety.mjs: data and code can never
  // end the <script> block they go in.
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const JSON_ESCAPES = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', [LS]: '\\u2028', [PS]: '\\u2029' };
  const UNSAFE = new RegExp('[<>&' + LS + PS + ']', 'g');
  const scriptJson = (v) => String(JSON.stringify(v) ?? 'null').replace(UNSAFE, (c) => JSON_ESCAPES[c]);
  const scriptCode = (src) => String(src).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\x3C!--');
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** Whether a layout is the board present.js named (`opts.board`): the same cards. */
  function isBoard(graph, b) {
    const kids = (graph && graph.children) || [];
    return !!b && Array.isArray(b.items) && kids.length === b.items.length && kids.every((c) => b.items.includes(c.id));
  }
  /**
   * The viewer's graph with Coderhelm's layout options and room for each
   * card's lines. The System board (present.js names it in `opts.board`)
   * gets columns of at most `bound` cards, so a long list of outside
   * services doesn't make one column too tall to read at the first fit.
   */
  function tuneGraph(graph, opts) {
    if (!graph || !opts) return graph;
    const b = opts.board;
    const onBoard = isBoard(graph, b) && b.mode === 'system';
    const extra = onBoard ? {
      'elk.layered.layering.strategy': 'COFFMAN_GRAHAM',
      'elk.layered.layering.coffmanGraham.layerBound': String(b.bound || 7),
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.spacing.nodeNode': '40',
    } : {};
    const into = new Map(), out = new Map();
    const add = (m, id) => m.set(id, (m.get(id) || 0) + 1);
    for (const e of graph.edges || []) { for (const s of e.sources || []) add(out, s); for (const t of e.targets || []) add(into, t); }
    const children = (graph.children || []).map((c) => {
      const lines = Math.max(into.get(c.id) || 0, out.get(c.id) || 0);
      const need = lines > 1 ? (lines + 1) * opts.lineRoom : 0;
      // On the System board the column sizes decide, so no card is held to the last column.
      const lo = onBoard && c.layoutOptions ? { ...c.layoutOptions, 'elk.layered.layering.layerConstraint': 'NONE' } : c.layoutOptions;
      return { ...c, ...(lo ? { layoutOptions: lo } : {}), ...(need > (c.height || 0) ? { height: need } : {}) };
    });
    return { ...graph, children, layoutOptions: { ...(graph.layoutOptions || {}), ...opts.options, ...extra } };
  }
  /**
   * A journey's board, laid out here instead of by ELK: its cards in the
   * steps' order on a grid, read like text (left to right, then the next
   * row), with as many columns as make the cards largest in the free map
   * area (`b.w` by `b.h`). The viewer draws the cards; the step lines
   * (`ch-step-<i>`, from step i to step i + 1) are kept in `opts.lastBoard`
   * for present.js to draw, and the board's other lines are left out.
   */
  function journeyLayout(graph, b, opts) {
    const kids = graph.children || [];
    const byId = new Map(kids.map((c) => [c.id, c]));
    const order = [];
    for (const id of b.chain || []) if (byId.has(id) && !order.includes(id)) order.push(id);
    for (const c of kids) if (!order.includes(c.id)) order.push(c.id);
    const n = order.length, GX = 56, GY = 52, P = 22;
    const cw = Math.max(1, ...kids.map((c) => c.width || 0));
    const rowsOf = (cols) => {
      const rows = [];
      for (let i = 0; i < n; i += cols) rows.push(order.slice(i, i + cols));
      return rows.map((r) => ({ ids: r, h: Math.max(...r.map((id) => byId.get(id).height || 0)) }));
    };
    let best = null;
    for (let cols = 1; cols <= Math.min(n, 6); cols++) {
      const rows = rowsOf(cols);
      const W = cols * cw + (cols - 1) * GX + 2 * P;
      const H = rows.reduce((a, r) => a + r.h, 0) + (rows.length - 1) * GY + 2 * P;
      const k = Math.min((b.w || 800) / (W + 40), (b.h || 600) / (H + 20));
      if (!best || k > best.k + 1e-6) best = { cols, rows, W, H, k };
    }
    const at = new Map();
    let y = P;
    best.rows.forEach((r, ri) => {
      r.ids.forEach((id, ci) => { const c = byId.get(id); at.set(id, { ...c, x: P + ci * (cw + GX) + (cw - c.width) / 2, y, row: ri, col: ci, rowBottom: y + r.h }); });
      y += r.h + GY;
    });
    const steps = [];
    const chain = b.chain || [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = at.get(chain[i]), z = at.get(chain[i + 1]);
      if (!a || !z || a === z) continue;
      let pts;
      if (a.row === z.row && z.col > a.col) {
        // Along the row: side to side.
        pts = [{ x: a.x + a.width, y: a.y + a.height / 2 }, { x: z.x, y: z.y + z.height / 2 }];
        if (pts[0].y !== pts[1].y) { const mx = (pts[0].x + pts[1].x) / 2; pts.splice(1, 0, { x: mx, y: pts[0].y }, { x: mx, y: pts[1].y }); }
      } else if (z.row > a.row) {
        // To a later row: down into the gap under the row, across, and down onto the card.
        const cy = a.rowBottom + GY / 2;
        const sx = a.x + a.width / 2, ex = z.x + z.width / 2;
        pts = [{ x: sx, y: a.y + a.height }, { x: sx, y: cy }, { x: ex, y: cy }, { x: ex, y: z.y }];
        if (z.row > a.row + 1) { const lane = P / 2; pts.splice(2, 1, { x: lane, y: cy }, { x: lane, y: z.y - GY / 2 }, { x: ex, y: z.y - GY / 2 }); }
      } else {
        // Back to an earlier card: out along the left edge and in from above.
        const lane = P / 2, sx = a.x, sy = a.y + a.height / 2, ex = z.x + z.width / 2, ty = z.y - GY / 2;
        pts = [{ x: sx, y: sy }, { x: lane, y: sy }, { x: lane, y: ty }, { x: ex, y: ty }, { x: ex, y: z.y }];
      }
      steps.push({ id: 'ch-step-' + i, sources: [a.id], targets: [z.id], sections: [{ startPoint: pts[0], endPoint: pts[pts.length - 1], bendPoints: pts.slice(1, -1) }] });
    }
    opts.lastBoard = { edges: steps };
    const children = order.map((id) => { const c = at.get(id); return { id, x: c.x, y: c.y, width: c.width, height: c.height }; });
    return { id: graph.id, x: 0, y: 0, width: best.W, height: best.H, children, edges: [] };
  }

  // ELK in a worker: the viewer calls `new ELK()` and `elk.layout(graph)`.
  // In a worker, ELK's bundle is ELK's own layout worker: its worker part,
  // loaded by the first `new ELK()`, answers ELK's messages on the worker's
  // `onmessage` (that `new ELK()` then throws "_Worker is not a constructor",
  // which is expected there and caught). The page's ELK gets a
  // `workerFactory` that starts that worker, so layouts never run on this
  // frame's thread. (Before, the worker answered in a format of our own that
  // ELK's part never got to, the throw went uncaught, and every layout ran in
  // the frame: a large board froze it.) Where a worker can't start, or
  // fails, the engine runs in the frame.
  let elkWorkerUrl = null;
  try {
    elkWorkerUrl = URL.createObjectURL(new Blob([P.elk + '\n;try { new self.ELK(); } catch (e) { /* the worker part is loaded */ }'], { type: 'text/javascript' }));
  } catch (e) {
    elkWorkerUrl = null;
  }
  window.__coderhelmElkWorker = elkWorkerUrl;
  // Coderhelm's layout options, laid over the viewer's own on every layout
  // (the viewer's page is never edited; each layout passes through the
  // stand-in below). A team's real map is denser than Floorplan's examples:
  // lines ran along card edges and through the narrow gaps between stacked
  // cards, and many lines met one side of a busy card a few pixels apart.
  // So: more room between cards, lines kept well clear of cards they don't
  // join and of each other, cards placed so lines stay straight and out of
  // the gaps (Brandes-Koepf, balanced), and every card tall enough that the
  // lines meeting one side of it are at least LINE_ROOM apart.
  const LAYOUT = {
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.nodeNode': '56',
    'elk.layered.spacing.nodeNodeBetweenLayers': '170',
    'elk.spacing.edgeNode': '30',
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    'elk.spacing.edgeEdge': '16',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
    'elk.spacing.portPort': '18',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  };
  const LINE_ROOM = 18;
  window.__coderhelmLayout = { options: LAYOUT, lineRoom: LINE_ROOM };
  const elkShim = `(() => {
    const Real = window.ELK, url = window.__coderhelmElkWorker, tune = ${tuneGraph.toString()};
    const isBoard = ${isBoard.toString()}, journeyLayout = ${journeyLayout.toString()};
    const opts = window.__coderhelmLayout;
    if (!Real) return;
    // A journey's board never reaches ELK (see journeyLayout).
    const journey = (graph) => (opts.board && opts.board.mode === 'journey' && isBoard(graph, opts.board) ? journeyLayout(graph, opts.board, opts) : null);
    let broken = !url;
    const inFrame = (graph) => { window.__coderhelmElkRan = 'frame'; return new Real().layout(graph); };
    window.ELK = function () {
      let elk = null;
      const waiting = new Set();
      const start = () => {
        elk = new Real({ workerFactory: () => {
          const w = new Worker(url);
          w.addEventListener('error', () => {
            broken = true;
            for (const p of waiting) { waiting.delete(p); inFrame(p.graph).then(p.resolve, p.reject); }
          });
          return w;
        } });
      };
      return { layout(graph) {
        const j = journey(graph);
        if (j) return Promise.resolve(j);
        graph = tune(graph, opts);
        if (broken) return inFrame(graph);
        try { if (!elk) start(); } catch (e) { broken = true; return inFrame(graph); }
        return new Promise((resolve, reject) => {
          const p = { graph, resolve, reject };
          waiting.add(p);
          elk.layout(graph).then(
            (r) => { if (waiting.delete(p)) { window.__coderhelmElkRan = 'worker'; resolve(r); } },
            (e) => { if (waiting.delete(p)) reject(e); },
          );
        });
      } };
    };
  })();`;

  // Large maps, in boards a person can read. The viewer groups a part's files
  // by folder one level deep, so on a large real map one board held 1,008
  // cards (803 and 691 on others): opening it never finished and the frame
  // stopped answering. Before the viewer starts, each part with more files
  // than one board lists gets sub-parts, one per folder, recursively, so no
  // board has more than about BOARD_CAP cards: tests, mocks and fixtures
  // become one "Tests" sub-part, more folders than fit become alphabetical
  // ranges ("Billing … Leads"), and more than LEAF files in one folder
  // become runs. Only the map's `nodes` and each file's part (`n`) change,
  // in the frame's own copy; lines, endpoints and screens stay as they are.
  const BOARD_CAP = 30;
  const LEAF = 24; // the viewer lists up to 24 files flat, then groups by folder
  const TESTY = /(^|\/)(__tests__|__mocks__|tests?|e2e|spec|fixtures|mocks?|stories)(\/|$)|\.(test|spec|stories)\.[a-z]+$/i;
  const human = (s) => { s = s.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

  function capBoards(g) {
    if (!Array.isArray(g.files) || !Array.isArray(g.nodes)) return g;
    const nodes = g.nodes.slice();
    const ids = new Set(nodes.map((n) => n.id));
    const byNode = new Map();
    for (const f of g.files) { if (!byNode.has(f.n)) byNode.set(f.n, []); byNode.get(f.n).push(f); }
    const childCount = new Map();
    for (const n of nodes) if (n.parent) childCount.set(n.parent, (childCount.get(n.parent) || 0) + 1);
    const mk = (parent, idTail, label, summary) => {
      let id = `${parent.id}~${idTail}`.replace(/[^A-Za-z0-9_.~:-]/g, '_').slice(0, 120);
      for (let i = 2; ids.has(id); i++) id = `${id.slice(0, 114)}~${i}`;
      ids.add(id);
      const n = { id, parent: parent.id, label, kind: parent.kind, summary, details: '', tags: ['coderhelm-grouped'], paths: [], packages: [], hosts: [], stats: { files: 0, loc: 0, langs: {}, repos: [] } };
      nodes.push(n);
      return n;
    };
    const move = (fs, to) => { for (const f of fs) f.n = to.id; };
    function split(node, files, depth) {
      if (files.length <= LEAF || depth > 12) return;
      const room = BOARD_CAP - (childCount.get(node.id) || 0);
      if (!depth) {
        const tests = files.filter((f) => TESTY.test(f.p));
        if (tests.length >= 2 && tests.length < files.length) {
          const t = mk(node, 'tests', 'Tests', `${tests.length} test, mock and fixture files`);
          move(tests, t);
          split(t, tests, 1);
          files = files.filter((f) => !TESTY.test(f.p));
          if (files.length <= LEAF) return;
        }
      }
      // The folder they share, then one group per next folder.
      const dirs = files.map((f) => dirOf(f.p).split('/'));
      let common = dirs[0].slice();
      for (const d of dirs) { let i = 0; while (i < common.length && d[i] === common[i]) i++; common = common.slice(0, i); }
      const groups = new Map();
      files.forEach((f, i) => { const k = dirs[i][common.length] ?? ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
      let loose = groups.get('') || [];
      groups.delete('');
      let list = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [, fs] of list) if (fs.length < 2) loose = loose.concat(fs);
      list = list.filter(([, fs]) => fs.length >= 2);
      const runs = loose.length > LEAF ? Math.ceil(loose.length / LEAF) : 0;
      const slots = Math.max(2, room - (runs || loose.length));
      if (list.length <= slots) {
        for (const [seg, fs] of list) {
          const sub = mk(node, seg, human(seg), `${fs.length} files in ${[...common, seg].join('/')}/`);
          move(fs, sub);
          split(sub, fs, depth + 1);
        }
      } else {
        const per = Math.ceil(list.length / slots);
        for (let i = 0; i < list.length; i += per) {
          const chunk = list.slice(i, i + per);
          const a0 = chunk[0][0], a1 = chunk[chunk.length - 1][0];
          const fs = chunk.flatMap(([, x]) => x);
          const sub = mk(node, `${a0}--${a1}`, chunk.length > 1 ? `${human(a0)} … ${human(a1)}` : human(a0), `${chunk.length} folders, ${fs.length} files`);
          move(fs, sub);
          split(sub, fs, depth + 1);
        }
      }
      if (runs) {
        const sorted = loose.slice().sort((a, b) => a.p.localeCompare(b.p));
        for (let i = 0; i < runs; i++) {
          const fs = sorted.slice(i * LEAF, (i + 1) * LEAF);
          const first = fs[0].p.split('/').pop(), last = fs[fs.length - 1].p.split('/').pop();
          move(fs, mk(node, `files${i}`, `Files ${first.slice(0, 3)}…${last.slice(0, 3)}`, `${fs.length} files, ${first} to ${last}`));
        }
      }
    }
    for (const n of g.nodes) { const fs = byNode.get(n.id); if (fs && fs.length > LEAF) split(n, fs, 0); }
    // Each part's counts, its sub-parts' files included.
    const stats = new Map(nodes.map((n) => [n.id, (n.stats = { ...(n.stats || {}), files: 0, loc: 0 })]));
    const parent = new Map(nodes.map((n) => [n.id, n.parent]));
    for (const f of g.files) { for (let id = f.n, hops = 0; id && hops < 40; id = parent.get(id), hops++) { const st = stats.get(id); if (st) { st.files++; st.loc += f.loc || 0; } } }
    g.nodes = nodes;
    return g;
  }

  function page(graph, present) {
    const ui = P.ui.map((u) => `<script>/* ui/${u.name} */\n${scriptCode(u.code)}</script>`).join('\n')
      // Coderhelm's presentation (present.js), after the viewer's own add-ons.
      + (typeof window.CoderhelmPresent === 'function' ? `\n<script>/* coderhelm present.js */\n(${scriptCode(String(window.CoderhelmPresent))})(${scriptJson(present)});</script>` : '');
    const title = `${graph.project && graph.project.name ? graph.project.name : 'App'} map`;
    return P.template
      .replace('/*__GRAPH_QUERY__*/', () => scriptCode(P.graphQuery))
      .replace('<!--__ELK_SCRIPT__-->', () => `<script>${scriptCode(P.elk)}</script><script>${elkShim}</script>`)
      .replace('/*__FONTS__*/', () => P.fonts)
      .replace(/__FLOORPLAN_TITLE__/g, () => escapeHtml(title))
      .replace(/__FLOORPLAN_LOGO__/g, () => P.logo)
      .replace(/__FLOORPLAN_FAVICON__/g, () => P.favicon)
      .replace('<!--__UI_EXTENSIONS__-->', () => ui)
      .replace('/*__FLOORPLAN_DATA__*/null', () => scriptJson(graph));
  }

  // The frame has no storage of its own (sandboxed, opaque origin), so the
  // viewer's settings would fall back to their defaults: the device's color
  // scheme and an open side panel. A storage kept in memory for this frame,
  // set before the viewer starts, gives it the dashboard's theme (read by
  // Floorplan's own theme script) and a closed side panel, so the map is what
  // shows first (open when the frame was opened on a part). The viewer's own Theme and panel buttons still work.
  function useMemoryStorage(seed) {
    const data = new Map(Object.entries(seed));
    const storage = {
      getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
      setItem: (k, v) => { data.set(String(k), String(v)); },
      removeItem: (k) => { data.delete(String(k)); },
      clear: () => data.clear(),
      key: (i) => Array.from(data.keys())[i] ?? null,
      get length() { return data.size; },
    };
    try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }); } catch (err) { /* the viewer keeps its defaults */ }
  }

  // With the panel closed at first, selecting a part opens it (on a phone the
  // viewer already does this itself).
  function openPanelOnSelect() {
    const F = window.Floorplan;
    if (!F || typeof F.on !== 'function') return;
    let last = null;
    F.on('panel', (d) => {
      const sel = d && d.selected;
      const key = sel == null ? null : JSON.stringify(sel);
      if (key && key !== last && document.body.classList.contains('no-panel') && !matchMedia('(max-width: 700px)').matches) {
        last = key;
        const btn = document.getElementById('btn-panel');
        if (btn) btn.click();
      }
      last = key;
    });
  }

  // The viewer draws the title and description of what it shows (the app,
  // or the part opened) over the canvas, top left and large. On a real map
  // the first cards sit right under it, at the first fit and zoomed in, so
  // the text covered them. It is kept off the canvas: hidden here, and sent
  // to the page, which shows it above the map. The viewer's "Exported
  // <date>" tag is left out too: the page around the frame says when the map
  // was built, and on a phone the tag ran under the zoom buttons.
  function titleOffCanvas() {
    const style = document.createElement('style');
    style.textContent = '#context{display:none!important} .xtag{display:none}';
    document.head.appendChild(style);
    const ctx = document.getElementById('context');
    if (!ctx) return;
    const text = (el, max) => String((el && el.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, max);
    let last = '';
    const report = () => {
      const msg = { type: 'coderhelm:app-map-context', kind: text(ctx.querySelector('.k'), 80), name: text(ctx.querySelector('h1'), 300), desc: text(ctx.querySelector('p'), 2000) };
      const key = JSON.stringify(msg);
      if (key === last) return;
      last = key;
      window.parent.postMessage(msg, '*');
    };
    new MutationObserver(report).observe(ctx, { childList: true, subtree: true, characterData: true });
    report();
  }

  // Full screen: the viewer has none of its own (its corner-arrows button
  // fits the map to the frame). One more button in its zoom bar puts the
  // frame on the whole screen and back; Escape leaves too. The page gives
  // the frame `allow="fullscreen"`, so this works inside the sandbox.
  function addFullScreen() {
    const bar = document.getElementById('zoom');
    if (!bar || !document.fullscreenEnabled) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'ch-fullscreen';
    const ICON_ON = '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6"/></svg>';
    const ICON_OFF = '<svg class="i" viewBox="0 0 24 24"><path d="M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6"/></svg>';
    const show = () => {
      const on = !!document.fullscreenElement;
      b.title = on ? 'Leave full screen (Esc)' : 'Full screen';
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = on ? ICON_OFF : ICON_ON;
    };
    b.addEventListener('click', () => {
      const go = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      Promise.resolve(go).catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      show();
      // The map fills the new size.
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });
    show();
    bar.appendChild(b);
  }

  function fail(text) {
    document.body.textContent = '';
    const p = document.createElement('p');
    p.textContent = text;
    document.body.appendChild(p);
    window.parent.postMessage({ type: 'coderhelm:app-map-frame-error', text }, '*');
  }

  let shown = false;
  window.addEventListener('message', (e) => {
    // Only the page that holds this frame, only once, only a map.
    if (shown || e.source !== window.parent || !e.data || e.data.type !== 'coderhelm:app-map-graph') return;
    const text = e.data.json;
    if (typeof text !== 'string' || text.length > MAX_BYTES) return fail('The map is too large to show.');
    let graph;
    try { graph = JSON.parse(text); } catch (err) { return fail('The map could not be read.'); }
    if (!graph || graph.schema !== 'floorplan/graph@1' || !Array.isArray(graph.nodes)) return fail('This is not a map this viewer knows.');
    shown = true;
    const theme = ['dark', 'light'].includes(e.data.theme) ? e.data.theme : 'dark';
    // Opened on a part (`#s=`, from a chat answer's "Open in App map"): its
    // details show at once.
    const hash = new URLSearchParams(location.hash.slice(1));
    const focused = !!hash.get('s');
    // Lines: the map shows how parts call each other (web requests, data,
    // outside services); the many import lines between code files are off
    // at first, and the viewer's own Connection types menu turns them on.
    useMemoryStorage({ 'floorplan-theme': theme, 'floorplan:panel': focused ? 'true' : 'false', 'floorplan:kinds': JSON.stringify({ import: false }) });
    const t0 = performance.now();
    capBoards(graph);
    window.__coderhelmGroupMs = Math.round(performance.now() - t0);
    // The App map page (`full=1`) gets Coderhelm's levels, journeys and
    // screens panel (present.js); a chat answer's mini map only its lines.
    const present = { full: hash.get('full') === '1', flow: (hash.get('flow') || '').slice(0, 200), focus: focused };
    if (typeof window.CoderhelmPresentPrepare === 'function') {
      try { window.CoderhelmPresentPrepare(graph); } catch (err) { graph.flows = []; }
    }
    const html = page(graph, present);
    document.open();
    document.write(html);
    document.close();
    openPanelOnSelect();
    titleOffCanvas();
    addFullScreen();
  });

  if (!P) fail('The map viewer is missing.');
  else window.parent.postMessage({ type: 'coderhelm:app-map-frame-ready', floorplan: P.version }, '*');
})();
