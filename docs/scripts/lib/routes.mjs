// Reads the gateway's router (services/gateway/src/main.rs in
// coderhelm-platform) and lists every route. The router is plain axum:
//
//   let api_routes = Router::new()
//       .route("/me", get(routes::api::me))
//       .route(
//           "/allowlist",
//           get(routes::api::list_allowlist)
//               .post(routes::api::add_to_allowlist),
//       )
//   ...
//   let app = Router::new().nest("/api", api_routes)
//
// Calls span lines, so this matches parentheses instead of using a line regex.

const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** Removes // comments that are not inside a string. */
export function stripComments(src) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += src[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

/** Index of the parenthesis that closes the one at `open`. */
export function matchParen(src, open) {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced parenthesis at ${open}`);
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === '\n') line++;
  return line;
}

/** The methods and handlers inside a `.route(path, ...)` call's second argument. */
function methodsIn(text) {
  const found = [];
  const re = new RegExp(`(^|[^\\w:])(${METHODS.join('|')})\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    const inner = text.slice(open + 1, close);
    const h = inner.match(/routes::(\w+)::(\w+)/);
    found.push({ method: m[2].toUpperCase(), handler: h ? `${h[1]}::${h[2]}` : 'inline' });
    re.lastIndex = close;
  }
  return found;
}

/**
 * Every route in main.rs: { method, path, handler, router, line }, with the
 * router's `.nest()` prefix applied.
 */
export function extractRoutes(rawSrc) {
  const src = stripComments(rawSrc);
  const lets = [...src.matchAll(/let\s+(\w+)\s*=\s*Router::new\(\)/g)].map((m) => ({ name: m[1], start: m.index }));
  if (lets.length === 0) throw new Error('No Router::new() found in main.rs');
  const prefixes = {};
  for (const m of src.matchAll(/\.nest\(\s*"([^"]*)"\s*,\s*(\w+)\s*\)/g)) prefixes[m[2]] = m[1];

  const routes = [];
  lets.forEach((block, i) => {
    const end = i + 1 < lets.length ? lets[i + 1].start : src.length;
    const body = src.slice(block.start, end);
    const prefix = prefixes[block.name] ?? '';
    let at = 0;
    for (;;) {
      const idx = body.indexOf('.route(', at);
      if (idx === -1) break;
      const open = idx + '.route'.length;
      const close = matchParen(body, open);
      const args = body.slice(open + 1, close);
      const pathMatch = args.match(/^\s*"([^"]*)"\s*,/);
      if (!pathMatch) throw new Error(`Route without a string path near line ${lineOf(src, block.start + idx)}`);
      const rest = args.slice(pathMatch[0].length);
      const methods = methodsIn(rest);
      if (methods.length === 0) throw new Error(`Route ${pathMatch[1]} has no method`);
      const path = (prefix + pathMatch[1]).replace(/\/+$/, '') || '/';
      for (const m of methods) {
        routes.push({ ...m, path, router: block.name, line: lineOf(src, block.start + idx) });
      }
      at = close;
    }
  });
  return routes;
}

/** The section a route belongs to on the API reference page. */
export function sectionOf(route) {
  if (route.router === 'webhook_routes') return 'Webhooks';
  if (route.router === 'auth_routes') return 'Sign-in';
  if (route.router === 'email_routes') return 'Email links';
  if (route.path.startsWith('/api/admin/')) return 'Platform admin';
  const seg = route.path.split('/')[route.path.startsWith('/api/') ? 2 : 1] ?? '';
  return SECTION_NAMES[seg] ?? 'Other';
}

const SECTION_NAMES = {
  '': 'Service',
  me: 'Account and teams', teams: 'Account and teams', allowlist: 'Account and teams', account: 'Account and teams',
  health: 'Health and failed messages', dlq: 'Health and failed messages',
  users: 'Users and roles',
  runs: 'Runs', search: 'Search',
  repos: 'Repos', github: 'Repos',
  integrations: 'Integrations', connectors: 'Integrations', 'aws-connections': 'Integrations',
  stats: 'Usage and analytics', analytics: 'Usage and analytics', usage: 'Usage and analytics', activity: 'Usage and analytics',
  reviewer: 'Reviewer and releases', releases: 'Reviewer and releases',
  'alert-routes': 'Alerts', 'alert-budget': 'Alerts', 'alert-notify': 'Alerts', alerts: 'Alerts', notify: 'Alerts',
  graph: 'Code graph',
  notifications: 'Settings and instructions', instructions: 'Settings and instructions', rules: 'Settings and instructions',
  voice: 'Settings and instructions', agents: 'Settings and instructions', settings: 'Settings and instructions', banners: 'Settings and instructions',
  plans: 'Plans',
  infrastructure: 'Infrastructure and logs', recommendations: 'Infrastructure and logs', 'log-findings': 'Infrastructure and logs',
  plugins: 'Connections (MCP)', tools: 'Team tools', skills: 'Skills',
  'data-sources': 'Data sources', tests: 'Tests', memories: 'Memories', support: 'Support',
};
