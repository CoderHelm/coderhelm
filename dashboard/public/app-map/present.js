// CoderHelm's presentation of the App map, on top of Floorplan's viewer
// (vendor/floorplan, MIT). The viewer's files are never edited: frame.js
// writes the viewer's page and adds this file's add-on after the viewer's own
// add-ons, and the add-on talks to the viewer only through its extension API
// (window.Floorplan), its own DOM and its own stylesheet.
//
// Two pieces:
// - `CoderhelmPresentPrepare(graph)`, run by frame.js on the map before the
//   viewer sees it: journeys (graph.flows) whose steps name a node, a screen
//   or a file are turned into the viewer's refs, and journeys that are hidden
//   or have fewer than two drawable steps are left out.
// - `CoderhelmPresent(opts)`, the add-on. Everywhere: links of kinds the
//   viewer doesn't know (nav, trigger, deploy, webhook) are drawn, and links
//   that were inferred (joined by a name, an env var or infrastructure code,
//   not found as a call in the code) are dashed, with a small key. On the
//   App map page itself (`opts.full`): the System, Parts and Code levels, the
//   System board first, a left panel with Journeys and Screens by app, and a
//   journey played on one stable board with a numbered step list.
//
// How this survives a Floorplan update: everything here hangs on the
// extension API (Floorplan.on('render'), showBoard, go, state.edgeEls,
// state.chipEls, state.kinds, freeArea) and on the class names `.edge`,
// `.trace`, `.node`, `#stage`, `#zoom` and `#flows-btn`. The viewer draws
// each line as `<g class="edge k-<kind>">` and ignores a link's `inferred`
// field (viewer.html, draw()); the dashes come from our stylesheet and a
// class this add-on sets on those groups after each render, so a new viewer
// that keeps the extension API keeps the dashes. After a Floorplan bump,
// scripts/update-floorplan.sh says to run e2e/app-map-present.spec.ts, which
// checks the dashes, the System board, a journey and the screens list, and
// fails if any of the names above stop matching.
(() => {
  'use strict';

  /** The map's journeys in the viewer's own form ({ref, note}), or left out. */
  function prepare(graph) {
    if (!graph || !Array.isArray(graph.flows)) return graph;
    const nodeIds = new Set((graph.nodes || []).map((n) => n && n.id));
    const filePaths = new Set((graph.files || []).map((f) => f && f.p));
    const routes = Array.isArray(graph.routes) ? graph.routes : [];
    const screens = new Map((Array.isArray(graph.screens) ? graph.screens : []).filter((s) => s && s.id).map((s) => [s.id, s]));
    const resolve = (x) => {
      if (typeof x !== 'string' || !x) return null;
      const sc = screens.get(x);
      if (sc) return sc.file && filePaths.has(sc.file) ? 'f:' + sc.file : null;
      if (x.startsWith('n:')) return nodeIds.has(x.slice(2)) ? x : null;
      if (x.startsWith('f:')) return filePaths.has(x.slice(2)) ? x : null;
      if (x.startsWith('r:')) return routes[Number(x.slice(2))] ? x : null;
      if (x.startsWith('s:') || x.startsWith('d:')) return x;
      if (nodeIds.has(x)) return 'n:' + x;
      if (filePaths.has(x)) return 'f:' + x;
      return null;
    };
    graph.flows = graph.flows
      .filter((f) => f && typeof f === 'object' && f.hidden !== true && f.visible !== false && Array.isArray(f.steps))
      .map((f) => {
        const steps = f.steps
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({ ...s, ref: resolve(s.ref) || resolve(s.node) || '', note: String(s.note || '') }))
          .filter((s) => s.ref);
        return { ...f, id: String(f.id || ''), title: String(f.title || 'Journey'), description: String(f.description || ''), steps };
      })
      .filter((f) => f.id && f.steps.length >= 2);
    return graph;
  }

  // The add-on. It runs inside the viewer's page, written there by frame.js
  // as source text, so it uses nothing from outside its own body.
  function present(opts) {
    const F = window.Floorplan;
    if (!F) return;
    opts = opts || {};
    const G = F.graph, { h, hk } = F;
    const css = document.createElement('style');
    css.id = 'ch-present-css';
    document.head.appendChild(css);
    const add = (s) => { css.textContent += s; };
    const svg = document.getElementById('svg');
    const layoutOpts = window.__coderhelmLayout || {};

    // ---------- link kinds the viewer doesn't know ----------
    // Floorplan draws only the kinds in its filter list; the map's newer
    // kinds (screen to screen, infrastructure to code, deploys, webhooks) are
    // added to it, so they are drawn and can be turned off like the others.
    const NEW_KINDS = { nav: '#7cc4ff', trigger: '#f0a35e', deploy: '#a3aab5', webhook: '#e98bc0' };
    const kindsUsed = new Set((G.links || []).map((l) => l.k));
    for (const k of Object.keys(NEW_KINDS)) if (kindsUsed.has(k) && !(k in F.state.kinds)) F.state.kinds[k] = true;
    add(`:root{${Object.entries(NEW_KINDS).map(([k, c]) => `--k-${k}:${c}`).join(';')}}`);

    // ---------- found in code (solid) or inferred (dashed) ----------
    // A map with the newer fields (a node `level`, a link `evidence`) sets
    // `inferred` only where a link was joined by a name, an env var or
    // infrastructure code. Older maps set it on every web request matched to
    // an endpoint by its path, so there only `ev: "inferred"` counts.
    const v2 = (G.nodes || []).some((n) => n && n.level) || (G.links || []).some((l) => l && Array.isArray(l.evidence));
    const inferred = (l) => l.ev === 'inferred' || (v2 && l.inferred === true);
    const anyInferred = (G.links || []).some(inferred);
    add(`.edge.ch-inferred .trace{stroke-dasharray:7 6}
      #ch-key{position:absolute;right:calc(var(--pw, 0px) + 16px);top:calc(var(--hh, 64px) + 8px);padding:7px 12px;border-radius:12px;font-size:12px;color:var(--text-2);display:flex;gap:14px;z-index:4;pointer-events:none}
      #ch-key span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      @media (max-width:700px){#ch-key{display:none}}`);
    const markInferred = () => {
      for (const x of F.state.edgeEls ? F.state.edgeEls.values() : []) {
        const ls = (x.e.links || []).filter((l) => l && l.k !== 'contains');
        x.g.classList.toggle('ch-inferred', ls.length > 0 && ls.every(inferred));
      }
    };
    if (anyInferred) {
      const key = document.createElement('div');
      key.id = 'ch-key';
      key.className = 'glass';
      key.setAttribute('aria-label', 'Line styles');
      key.innerHTML = '<span><svg width="26" height="6" aria-hidden="true"><path d="M0 3H26" stroke="currentColor" stroke-width="2"/></svg>Found in code</span>'
        + '<span><svg width="26" height="6" aria-hidden="true"><path d="M0 3H26" stroke="currentColor" stroke-width="2" stroke-dasharray="6 5"/></svg>Inferred</span>';
      (document.getElementById('stage') || document.body).appendChild(key);
    }
    F.on('render', () => { if (anyInferred) markInferred(); });

    if (!opts.full) return;

    // ======================= the App map page =======================
    const nodes = G.nodes || [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const tops = nodes.filter((n) => !n.parent);
    const name = (ref) => { try { return F.info(ref).name; } catch (e) { return ref; } };
    const topOf = (ref) => { const c = F.chain(ref); const t = c[c.length - 2]; return t && t.startsWith('n:') ? t : null; };
    /** The part a step belongs to as the System board shows it: its nearest System node, else its top part. */
    const partOf = (ref) => {
      for (const x of F.chain(ref)) { const n = x.startsWith('n:') && byId.get(x.slice(2)); if (n && n.level === 'system') return x; }
      return topOf(ref);
    };
    const words = (list) => list.length <= 1 ? list.join('') : list.length === 2 ? `${list[0]}, then ${list[1]}` : `${list.slice(0, -1).join(', then ')}, then ${list[list.length - 1]}`;
    /** The parts a journey passes through, in words and in order: "Mobile app, then Main server, then Member system". */
    const through = (fl) => { const seen = []; for (const s of fl.steps) { const t = partOf(s.ref); const nm = t ? name(t) : name(s.ref); if (nm && !seen.includes(nm)) seen.push(nm); } return words(seen); };

    // ---------- the System board ----------
    // What people use, what runs behind it, where it runs and keeps data, and
    // the outside services it calls. A map with `level` says which nodes
    // those are; an older map's are its top parts of those kinds and the
    // infrastructure resources inside its cloud setup. Infrastructure that
    // starts or deploys code (trigger and deploy links) is always on it, with
    // the part its code is in, so that path is drawn connected.
    const ORDER = { ui: 0, service: 1, worker: 2, library: 3, data: 4, database: 4, queue: 4, infra: 5, external: 6 };
    const shaped = (n) => (n.tags || []).some((t) => t === 'coderhelm-shaped' || t === 'coderhelm-grouped') || n.level === 'code' || n.level === 'part';
    function systemItems() {
      const hasLevel = nodes.some((n) => n.level);
      let list = hasLevel
        ? nodes.filter((n) => n.level === 'system')
        : [
          ...tops.filter((n) => ['ui', 'service', 'worker', 'data', 'database', 'queue', 'external'].includes(n.kind)),
          ...nodes.filter((n) => n.parent && !shaped(n) && byId.get(n.parent) && !byId.get(n.parent).parent && byId.get(n.parent).kind === 'infra'),
        ];
      const on = new Set(list.map((n) => 'n:' + n.id));
      const must = new Set();
      for (const l of G.links || []) {
        if (l.k !== 'trigger' && l.k !== 'deploy') continue;
        for (const r of [l.a, l.b]) {
          if (!F.exists(r)) continue;
          const chain = F.chain(r);
          const hit = chain.find((x) => on.has(x));
          const keep = hit || topOf(r);
          if (keep && keep.startsWith('n:')) { must.add(keep); if (!on.has(keep)) { on.add(keep); const n = byId.get(keep.slice(2)); if (n) list.push(n); } }
        }
      }
      const rank = (n) => (must.has('n:' + n.id) ? 0 : 1) * 10 + (ORDER[n.kind] ?? 9) / 10;
      list = list.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 24);
      return list.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9)).map((n) => ({ id: 'n:' + n.id, note: '' }));
    }
    const systemTitle = (G.project && G.project.name) || 'System';
    const SYSTEM_Q = 'The apps, the servers behind them, where they run and keep data, and the outside services they call';

    // ---------- state ----------
    const flows = (G.flows || []).filter((f) => f && Array.isArray(f.steps) && f.steps.filter((s) => F.exists(s.ref)).length >= 2);
    let level = 'parts', board = null; // board: 'system' | 'journey' | null
    let journey = null; // { fl, i, items }
    let q = '';

    // ---------- panel ----------
    add(`
      body.ch-start #stage{left:332px}
      body.ch-start #flowbar{display:none!important}
      body.ch-full #flows-btn, body.ch-full #screens-btn{display:none!important}
      #ch-start{position:fixed;left:10px;top:calc(var(--hh,64px) + 4px);bottom:10px;width:312px;border-radius:18px;display:none;flex-direction:column;z-index:5;overflow:hidden}
      body.ch-start #ch-start{display:flex}
      @media (min-width:761px){body.ch-start #madewith,body.ch-start #loading,body.ch-start #toast{left:calc(332px + (100% - 332px - var(--pw)) / 2)}}
      @media (max-width:760px){body.ch-start #stage{left:0}#ch-start{width:auto;right:10px}}
      #ch-start .hd{padding:12px 12px 6px}
      #ch-start .lv{display:flex;gap:4px;background:rgba(var(--ink),.05);border-radius:12px;padding:3px;margin-bottom:10px}
      #ch-start .lv button{flex:1;border:0;background:none;color:var(--text-2);height:30px;border-radius:9px;cursor:pointer;font:inherit;font-size:13px}
      #ch-start .lv button[aria-pressed="true"]{background:rgba(var(--ink),.13);color:var(--text)}
      #ch-start input{width:100%;box-sizing:border-box;height:34px;border:0;border-radius:12px;padding:0 12px;background:rgba(var(--ink),.07);color:var(--text);outline:none;font:inherit}
      #ch-start input:focus{box-shadow:0 0 0 1px rgba(var(--ink),.2)}
      #ch-start .bd{overflow:auto;padding:0 6px 12px;flex:1;overscroll-behavior:contain}
      #ch-start h4{margin:14px 8px 6px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3)}
      #ch-start .it{display:block;width:100%;text-align:left;border:0;background:none;color:var(--text);padding:8px 10px;border-radius:11px;cursor:pointer;font:inherit}
      #ch-start .it:hover,#ch-start .it:focus-visible{background:rgba(var(--ink),.08);outline:none}
      #ch-start .it b{display:block;font-weight:500;font-size:13.5px;overflow-wrap:anywhere}
      #ch-start .it span{display:block;font-size:12px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #ch-start .none{padding:8px 10px;color:var(--text-3);font-size:12.5px}
      #ch-start details{margin:0 2px}
      #ch-start summary{cursor:pointer;padding:7px 8px;border-radius:10px;font-size:13px;color:var(--text-2);list-style:none;display:flex;justify-content:space-between;gap:8px}
      #ch-start summary::-webkit-details-marker{display:none}
      #ch-start summary:hover{background:rgba(var(--ink),.05)}
      #ch-start summary .c{color:var(--text-3);flex:none}
      #ch-start .gate{margin:8px 10px 2px;font-size:11.5px;color:var(--text-3)}
      #ch-start details details summary{padding-left:18px;font-size:12.5px}
      #ch-start details details .it{padding-left:26px}
      #ch-start .jt{margin:6px 8px 2px;font-size:15px;font-weight:600;color:var(--text)}
      #ch-start .js{margin:0 8px 10px;color:var(--text-3);font-size:12px;line-height:1.45}
      #ch-start .st{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;border:0;background:none;color:var(--text-2);padding:8px 8px;border-radius:11px;cursor:pointer;font:inherit}
      #ch-start .st:hover{background:rgba(var(--ink),.05)}
      #ch-start .st i{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11.5px;background:rgba(var(--ink),.08);color:var(--text-2)}
      #ch-start .st[aria-current="step"]{background:rgba(var(--ink),.09);color:var(--text)}
      #ch-start .st[aria-current="step"] i{background:var(--on,#6aa3ff);color:#000}
      #ch-start .st.done i{background:rgba(var(--ink),.2);color:var(--text)}
      #ch-start .st .tx{min-width:0;flex:1}
      #ch-start .st b{display:block;font-weight:500;color:var(--text);font-size:13px;overflow-wrap:anywhere}
      #ch-start .st em{display:block;font-style:normal;font-size:12px;color:var(--text-2);line-height:1.4;margin-top:1px}
      #ch-start .st small{display:block;font-size:11.5px;color:var(--text-3);margin-top:2px}
      #ch-start .ev{display:inline-block;margin-top:3px;font:11px var(--mono,monospace);color:var(--text-3);overflow-wrap:anywhere;text-align:left}
      #ch-start button.ev{border:0;background:none;padding:0;cursor:pointer;color:var(--on,#6aa3ff);text-decoration:underline;text-underline-offset:2px}
      #ch-start .back{border:0;background:none;color:var(--text-3);cursor:pointer;padding:4px 6px;font:inherit;font-size:12.5px}
      #ch-start .back:hover{color:var(--text)}
      #ch-start .nav{display:flex;gap:6px;padding:8px 12px 12px}
      #ch-start .nav button{flex:1;height:34px;border-radius:10px;border:0;background:rgba(var(--ink),.09);color:var(--text);cursor:pointer;font:inherit}
      #ch-start .nav button:disabled{opacity:.4;cursor:default}
      /* a journey's board: the step lines only, the steps seen lit, the next ones quieter */
      svg.ch-play .edges .edge{display:none}
      svg.ch-play .node .card>*{opacity:.5;transition:opacity .25s}
      svg.ch-play .node.ch-seen .card>*{opacity:1}
      svg.ch-play .node.ch-now .card{box-shadow:0 0 0 2px var(--on,#6aa3ff),0 8px 28px rgba(0,0,0,.35)}
      .card{position:relative}
      .card .ch-n{position:absolute;top:10px;right:10px;min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:999px;display:grid;place-items:center;font:600 12px Inter,system-ui,sans-serif;background:rgba(var(--ink),.12);color:var(--text);opacity:1!important}
      svg.ch-play .node.ch-seen .card .ch-n{background:var(--on,#6aa3ff);color:#000}
      .ch-step{fill:none;stroke:var(--text-3);stroke-width:2;stroke-opacity:.35;stroke-linecap:round;stroke-linejoin:round}
      .ch-step.inferred{stroke-dasharray:7 6}
      .ch-step.seen{stroke:var(--on,#6aa3ff);stroke-opacity:.75}
      .ch-step.now{stroke:var(--on,#6aa3ff);stroke-opacity:1;stroke-width:3}
      .ch-step-n{font:600 12px Inter,system-ui,sans-serif;fill:var(--text-2)}
    `);
    document.body.classList.add('ch-full');
    const box = document.createElement('nav');
    box.id = 'ch-start';
    box.className = 'glass';
    box.setAttribute('aria-label', 'Journeys and screens');
    document.body.appendChild(box);
    const setOpen = (on) => { document.body.classList.toggle('ch-start', on); btn.setAttribute('aria-pressed', String(on)); setTimeout(() => window.dispatchEvent(new Event('resize')), 30); };
    const btn = F.addHeaderButton({ id: 'ch-browse', label: flows.length ? 'Journeys' : 'Screens', icon: 'search', title: 'Journeys and screens', onClick: () => setOpen(!document.body.classList.contains('ch-start')) });
    // Beside the map from the start where there's room; on a narrow screen it waits for its button.
    if (innerWidth > 760) { document.body.classList.add('ch-start'); btn.setAttribute('aria-pressed', 'true'); } else btn.setAttribute('aria-pressed', 'false');

    // ---------- screens: app, then signed out or signed in, then group ----------
    const allScreens = (Array.isArray(G.screens) ? G.screens : []).filter((s) => s && s.id && s.name);
    const shownScreens = new Map(((window.FloorplanScreens && window.FloorplanScreens.list) || []).map((s) => [s.id, s]));
    const appLabel = (id) => (byId.get(id) && byId.get(id).label) || (id === 'unassigned' ? 'Other' : String(id || 'Other'));
    const nav = (s) => (s.nav && typeof s.nav === 'object' ? s.nav : {});
    const gateOf = (s) => {
      const g = nav(s).gate;
      if (g === 'signed_in' || g === 'signed_out') return g;
      const grp = String(nav(s).group || s.group || '');
      return /^signed out/i.test(grp) ? 'signed_out' : /^signed in/i.test(grp) ? 'signed_in' : '';
    };
    const groupOf = (s) => String(nav(s).group || s.group || '').replace(/^signed (in|out)\s*[:·-]\s*/i, '').trim().replace(/^./, (c) => c.toUpperCase());
    const GATE = { signed_out: 'Signed out', signed_in: 'Signed in', '': 'Screens' };
    const GATE_ORDER = { signed_out: 0, signed_in: 1, '': 2 };
    const screenRow = (s) => `<button class="it" data-sc="${hk(s.id)}"><b>${h(s.name)}</b><span>${h(s.url || s.file || '')}</span></button>`;

    function matcher() {
      const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
      return (text) => !ws.length || ws.every((w) => text.toLowerCase().includes(w));
    }
    function listHTML() {
      const hit = matcher();
      const searching = q.trim().length > 0;
      let html = '';
      if (flows.length) {
        const fs = flows.filter((f) => hit(`${f.title} ${f.description} ${through(f)}`));
        html += '<h4>Journeys</h4>' + (fs.length
          ? fs.map((f) => `<button class="it" data-flow="${hk(f.id)}"><b>${h(f.title)}</b><span>${f.steps.length} steps: ${h(through(f))}</span></button>`).join('')
          : '<div class="none">No journey matches.</div>');
      }
      const byApp = new Map();
      for (const s of allScreens) {
        if (searching && !hit(`${s.name} ${s.url || ''} ${groupOf(s)} ${GATE[gateOf(s)]} ${appLabel(nav(s).app || s.app)}`)) continue;
        const app = nav(s).app || s.app || 'unassigned';
        if (!byApp.has(app)) byApp.set(app, []);
        byApp.get(app).push(s);
      }
      if (allScreens.length) {
        html += '<h4>Screens</h4>';
        if (!byApp.size) html += '<div class="none">No screen matches.</div>';
        for (const [app, list] of byApp) {
          html += `<details data-app="${hk(app)}" ${searching || byApp.size === 1 ? 'open' : ''}><summary><span>${h(appLabel(app))}</span><span class="c">${list.length}</span></summary>`;
          const gates = new Map();
          for (const s of list) { const g = gateOf(s); if (!gates.has(g)) gates.set(g, new Map()); const gm = gates.get(g); const k = groupOf(s); if (!gm.has(k)) gm.set(k, []); gm.get(k).push(s); }
          for (const [g, gm] of [...gates.entries()].sort((a, b) => GATE_ORDER[a[0]] - GATE_ORDER[b[0]])) {
            const n = [...gm.values()].reduce((a, b) => a + b.length, 0);
            if (gates.size > 1 || g) html += `<div class="gate" data-gate="${hk(g || 'none')}">${GATE[g]} (${n})</div>`;
            for (const [k, rows] of gm) {
              // Rows are written when a group is opened, so a map with a thousand screens stays light.
              if (!k && gm.size === 1) { html += rows.slice(0, searching ? 50 : 200).map(screenRow).join(''); continue; }
              html += `<details data-group="${hk(g + '|' + k)}" ${searching ? 'open' : ''}><summary><span>${h(k || 'Other')}</span><span class="c">${rows.length}</span></summary>${searching ? rows.slice(0, 50).map(screenRow).join('') : ''}</details>`;
            }
          }
          html += '</details>';
        }
      }
      return html || '<div class="none">This map has no journeys or screens yet.</div>';
    }
    function fillGroup(det) {
      if (det.dataset.filled) return;
      det.dataset.filled = '1';
      const [g, k] = det.dataset.group.split('|');
      const app = det.closest('[data-app]').dataset.app;
      const rows = allScreens.filter((s) => (nav(s).app || s.app || 'unassigned') === app && gateOf(s) === g && groupOf(s) === k);
      det.insertAdjacentHTML('beforeend', rows.slice(0, 400).map(screenRow).join(''));
      bindRows(det);
    }
    function bindRows(root) {
      root.querySelectorAll('[data-flow]').forEach((b) => { b.onclick = () => playJourney(b.dataset.flow); });
      root.querySelectorAll('[data-sc]').forEach((b) => { b.onclick = () => showScreen(b.dataset.sc); });
      root.querySelectorAll('details[data-group]').forEach((d) => { if (d.open) d.dataset.filled = '1'; d.addEventListener('toggle', () => { if (d.open) fillGroup(d); }); });
    }
    function showScreen(id) {
      const s = allScreens.find((x) => x.id === id);
      if (!s) return;
      endJourney();
      board = null;
      const shown = shownScreens.get(id);
      if (shown && window.FloorplanScreens) window.FloorplanScreens.show(shown);
      else if (s.file && F.exists('f:' + s.file)) F.reveal('f:' + s.file);
      else F.toast('This screen has nothing on the map to show yet.');
    }

    const levelsHTML = () => `<div class="lv" role="group" aria-label="Level">${[['system', 'System'], ['parts', 'Parts'], ['code', 'Code']].map(([k, t]) => `<button type="button" data-lv="${k}" aria-pressed="${level === k}">${t}</button>`).join('')}</div>`;
    const evOf = (s) => {
      const e = Array.isArray(s.evidence) ? s.evidence[0] : s.evidence;
      if (e && typeof e === 'object' && typeof e.file === 'string') return { file: e.file, line: Number(e.line) || 0, how: e.how };
      const r = s.ref;
      try {
        const i = F.info(r);
        if (i.type === 'route') return { file: i.r.f, line: i.r.l || 0 };
        if (i.type === 'symbol') return { file: i.f.p, line: i.s[2] || 0 };
        if (i.type === 'file' || i.type === 'module') return { file: i.f.p, line: 0 };
      } catch (e2) { /* a node: no single place in the code */ }
      return null;
    };
    const repos = (G.coderhelm && typeof G.coderhelm === 'object' && G.coderhelm.repos && typeof G.coderhelm.repos === 'object') ? G.coderhelm.repos : {};
    const linkable = (file) => Object.prototype.hasOwnProperty.call(repos, String(file).split('/')[0]);
    function evHTML(s) {
      const e = evOf(s);
      if (!e) return '';
      const text = `${e.file}${e.line ? ':' + e.line : ''}`;
      return linkable(e.file)
        ? `<button type="button" class="ev" data-file="${hk(e.file)}" data-line="${e.line}" title="Open on GitHub">${h(text)}</button>`
        : `<span class="ev">${h(text)}</span>`;
    }
    function stepsHTML() {
      const { fl, i } = journey;
      return `<button type="button" class="back" data-back>All journeys</button><div class="jt">${h(fl.title)}</div><div class="js">${h(fl.description ? fl.description + ' ' : '')}${h(through(fl))}.</div><ol style="list-style:none;margin:0;padding:0">`
        + fl.steps.map((s, k) => {
          const t = partOf(s.ref);
          return `<li><button type="button" class="st ${k < i ? 'done' : ''}" data-step="${k}" ${k === i ? 'aria-current="step"' : ''}><i>${k + 1}</i><span class="tx"><b>${h(name(s.ref))}</b>${s.note ? `<em>${h(s.note)}</em>` : ''}${t && t !== s.ref ? `<small>${h(name(t))}</small>` : ''}</span></button><div style="padding:0 8px 4px 40px">${evHTML(s)}</div></li>`;
        }).join('') + '</ol>';
    }
    function draw() {
      if (journey) {
        box.innerHTML = `<div class="hd">${levelsHTML()}</div><div class="bd" data-steps>${stepsHTML()}</div><div class="nav"><button type="button" data-prev ${journey.i === 0 ? 'disabled' : ''}>Back</button><button type="button" data-next ${journey.i >= journey.fl.steps.length - 1 ? 'disabled' : ''}>Next</button></div>`;
        box.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => goStep(Number(b.dataset.step)); });
        box.querySelectorAll('[data-file]').forEach((b) => { b.onclick = () => window.parent.postMessage({ type: 'coderhelm:app-map-source', file: b.dataset.file, line: Number(b.dataset.line) || 0 }, '*'); });
        box.querySelector('[data-back]').onclick = () => { endJourney(); showSystem(); };
        box.querySelector('[data-prev]').onclick = () => goStep(journey.i - 1);
        box.querySelector('[data-next]').onclick = () => goStep(journey.i + 1);
        const cur = box.querySelector('[aria-current="step"]');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
      } else {
        const label = flows.length ? 'Find a journey or screen' : 'Find a screen';
        box.innerHTML = `<div class="hd">${levelsHTML()}<input id="ch-q" type="search" placeholder="${label}" aria-label="${label}" value="${hk(q)}" spellcheck="false" autocomplete="off"></div><div class="bd" data-list>${listHTML()}</div>`;
        const input = box.querySelector('#ch-q');
        input.oninput = () => { q = input.value; const bd = box.querySelector('[data-list]'); bd.innerHTML = listHTML(); bindRows(bd); };
        input.onkeydown = (ev) => { if (ev.key === 'Enter') { const first = box.querySelector('[data-list] .it'); if (first) first.click(); } ev.stopPropagation(); };
        bindRows(box.querySelector('[data-list]'));
      }
      box.querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => setLevel(b.dataset.lv); });
    }

    // ---------- levels ----------
    function showSystem() {
      endJourney();
      board = 'system';
      level = 'system';
      const items = systemItems();
      // Columns of at most `bound` cards, so the board's shape follows the free area's.
      const a = F.freeArea();
      const aspect = Math.max(0.6, Math.min(3, a.w / Math.max(1, a.h)));
      layoutOpts.board = { mode: 'system', items: items.map((x) => x.id), bound: Math.max(3, Math.ceil(Math.sqrt(items.length / (aspect * 0.45)))) };
      F.showBoard({ kind: 'System', icon: 'service', title: systemTitle, question: (G.project && G.project.summary) || SYSTEM_Q, items });
      draw();
    }
    function biggestPart() {
      let best = null;
      for (const n of tops) if (n.kind !== 'external' && (!best || ((n.stats && n.stats.files) || 0) > ((best.stats && best.stats.files) || 0))) best = n;
      return best;
    }
    function setLevel(lv) {
      if (lv === 'system') return showSystem();
      endJourney();
      board = null;
      if (lv === 'parts') { level = 'parts'; F.go('root'); }
      else {
        const sel = F.state.selected;
        const part = typeof sel === 'string' && sel.startsWith('n:') && F.children(sel).length ? sel : (biggestPart() ? 'n:' + biggestPart().id : null);
        if (!part) return;
        level = 'code';
        F.go(part);
      }
      draw();
    }

    // ---------- a journey on one board ----------
    // Every step's card and nothing else, on a grid in the steps' order that
    // fills the map's free area (frame.js journeyLayout), so the cards are
    // readable at the first fit. The board never changes while the journey
    // plays: Back and Next only light the steps.
    function playJourney(id) {
      const fl = flows.find((f) => f.id === id);
      if (!fl) { F.toast('That journey is not on this map any more.'); return false; }
      endJourney();
      const steps = fl.steps.filter((s) => F.exists(s.ref));
      const items = [];
      // The notes are in the step list; the cards carry only their step numbers (see lightSteps),
      // so they stay the viewer's usual size and the board fits larger.
      for (const s of steps) if (!items.some((x) => x.id === s.ref)) items.push({ id: s.ref, note: '' });
      const a = F.freeArea();
      const chain = steps.map((s) => s.ref);
      // A hop is dashed when the step it reaches was inferred.
      const how = steps.slice(1).map((s) => { const e = evOf(s); return !!e && e.how === 'inferred'; });
      layoutOpts.board = { mode: 'journey', items: items.slice(0, 24).map((x) => x.id), chain, w: a.w, h: a.h };
      journey = { fl: { ...fl, steps }, i: 0, items, how };
      board = 'journey';
      draw();
      F.showBoard({ kind: 'Journey', icon: 'route', title: fl.title, question: fl.description || through(fl), items });
      return true;
    }
    function endJourney() {
      layoutOpts.board = null;
      if (svg) svg.classList.remove('ch-play');
      const fx = F.state.fxLayer;
      if (fx) fx.querySelectorAll('.ch-stepfx').forEach((x) => x.remove());
      if (journey) { journey = null; draw(); }
    }
    function goStep(k) {
      if (!journey) return;
      journey.i = Math.max(0, Math.min(journey.fl.steps.length - 1, k));
      lightSteps();
      draw();
    }
    const NS = 'http://www.w3.org/2000/svg';
    function pathOf(sec) {
      const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
      return 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L');
    }
    function drawSteps() {
      const fx = F.state.fxLayer;
      if (!fx || !journey) return;
      fx.querySelectorAll('.ch-stepfx').forEach((x) => x.remove());
      const edges = (layoutOpts.lastBoard && layoutOpts.lastBoard.edges) || [];
      for (const e of edges) {
        const k = Number(String(e.id).slice('ch-step-'.length));
        const sec = e.sections && e.sections[0];
        if (!sec || Number.isNaN(k)) continue;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('class', `ch-step ch-stepfx${journey.how[k] ? ' inferred' : ''}`);
        p.setAttribute('d', pathOf(sec));
        p.dataset.k = String(k);
        fx.appendChild(p);
      }
    }
    function lightSteps() {
      if (!journey || !svg) return;
      svg.classList.add('ch-play');
      const { fl, i } = journey;
      const seen = new Set(fl.steps.slice(0, i + 1).map((s) => s.ref));
      for (const [id, g] of F.state.chipEls ? F.state.chipEls.entries() : []) {
        g.classList.toggle('ch-seen', seen.has(id));
        g.classList.toggle('ch-now', id === fl.steps[i].ref);
        // The card's step numbers ("2" or "3 and 6"), on the card itself.
        const card = g.querySelector('.card');
        if (card && !card.querySelector('.ch-n')) {
          const ns = fl.steps.map((s, k) => (s.ref === id ? k + 1 : 0)).filter(Boolean);
          if (ns.length) {
            const b = document.createElement('span');
            b.className = 'ch-n';
            b.textContent = ns.length === 1 ? String(ns[0]) : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
            card.appendChild(b);
          }
        }
      }
      for (const p of (F.state.fxLayer ? F.state.fxLayer.querySelectorAll('.ch-step') : [])) {
        const k = Number(p.dataset.k);
        p.classList.toggle('seen', k < i - 1);
        p.classList.toggle('now', k === i - 1);
      }
    }

    // ---------- following the viewer ----------
    F.on('render', ({ container }) => {
      if (container === 'q:answer') {
        if (board === 'journey' && journey) { drawSteps(); lightSteps(); }
        return;
      }
      // The person moved on by themselves (a double-click, the crumbs, Back).
      if (journey) endJourney();
      board = null;
      const lv = container === 'root' ? 'parts' : 'code';
      if (lv !== level) { level = lv; draw(); }
    });
    window.addEventListener('keydown', (ev) => {
      if (!journey || ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
      if (ev.key === 'ArrowRight') { ev.stopImmediatePropagation(); goStep(journey.i + 1); }
      else if (ev.key === 'ArrowLeft') { ev.stopImmediatePropagation(); goStep(journey.i - 1); }
    }, true);

    // ---------- first view ----------
    // The System board, unless the page was opened on a part (a chat
    // answer's "Open in App map") or on a journey (`flow=`). No tour.
    F.on('ready', () => {
      if (opts.flow && playJourney(opts.flow)) return;
      if (opts.focus) { level = F.state.container === 'root' ? 'parts' : 'code'; draw(); return; }
      showSystem();
    });
    draw();
    window.CoderhelmMap = { showSystem, setLevel, playJourney, goStep, systemItems, journey: () => journey && { id: journey.fl.id, step: journey.i, steps: journey.fl.steps.length }, level: () => level };
  }

  window.CoderhelmPresentPrepare = prepare;
  window.CoderhelmPresent = present;
})();
