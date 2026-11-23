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

  /** The viewer's graph with Coderhelm's layout options and room for each card's lines. */
  function tuneGraph(graph, opts) {
    if (!graph || !opts) return graph;
    const into = new Map(), out = new Map();
    const add = (m, id) => m.set(id, (m.get(id) || 0) + 1);
    for (const e of graph.edges || []) { for (const s of e.sources || []) add(out, s); for (const t of e.targets || []) add(into, t); }
    const children = (graph.children || []).map((c) => {
      const lines = Math.max(into.get(c.id) || 0, out.get(c.id) || 0);
      const need = lines > 1 ? (lines + 1) * opts.lineRoom : 0;
      return need > (c.height || 0) ? { ...c, height: need } : c;
    });
    return { ...graph, children, layoutOptions: { ...(graph.layoutOptions || {}), ...opts.options } };
  }

  // ELK in a worker: the viewer calls `new ELK()` and `elk.layout(graph)`.
  // The worker runs the same bundled engine and answers each layout; the
  // page's ELK becomes a thin stand-in that posts the graph to it. Where a
  // worker can't start, or fails, the engine runs in the frame as before.
  const workerSrc = P.elk + `
;(() => { const elk = new self.ELK();
  self.onmessage = (e) => { const d = e.data || {};
    elk.layout(d.graph).then((r) => self.postMessage({ id: d.id, ok: r }), (err) => self.postMessage({ id: d.id, err: String((err && err.message) || err) })); };
})();`;
  let elkWorkerUrl = null;
  try {
    elkWorkerUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
    new Worker(elkWorkerUrl).terminate();
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
    const opts = window.__coderhelmLayout;
    if (!Real) return;
    if (!url) {
      window.ELK = function () { const elk = new Real(); return { layout: (graph) => elk.layout(tune(graph, opts)) }; };
      return;
    }
    let worker = null, broken = false, n = 0;
    const waiting = new Map();
    const inFrame = (graph) => new Real().layout(graph);
    const start = () => {
      worker = new Worker(url);
      worker.onmessage = (e) => { const p = waiting.get(e.data.id); if (!p) return; waiting.delete(e.data.id); if (e.data.err) p.reject(new Error(e.data.err)); else p.resolve(e.data.ok); };
      worker.onerror = () => { broken = true; for (const [id, p] of waiting) { waiting.delete(id); inFrame(p.graph).then(p.resolve, p.reject); } };
    };
    window.ELK = function () { return { layout(graph) {
      graph = tune(graph, opts);
      if (broken) return inFrame(graph);
      if (!worker) start();
      const id = ++n;
      return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject, graph }); worker.postMessage({ id, graph }); });
    } }; };
  })();`;

  function page(graph) {
    const ui = P.ui.map((u) => `<script>/* ui/${u.name} */\n${scriptCode(u.code)}</script>`).join('\n');
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
    const focused = !!new URLSearchParams(location.hash.slice(1)).get('s');
    useMemoryStorage({ 'floorplan-theme': theme, 'floorplan:panel': focused ? 'true' : 'false' });
    const html = page(graph);
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
