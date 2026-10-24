// Helpers shared by the checks that read the static export.
import fs from 'node:fs';
import path from 'node:path';

export function files(dir, pred = () => true) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (pred(p)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The file a site path is served from, as the CloudFront function does it; null if none. */
export function resolvePath(outDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const candidates = clean.endsWith('/')
    ? [path.join(outDir, clean, 'index.html')]
    : path.extname(clean)
      ? [path.join(outDir, clean)]
      : [path.join(outDir, clean, 'index.html'), path.join(outDir, clean)];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/** Ids in an HTML file, for checking #fragments. */
export function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}
