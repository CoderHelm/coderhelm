// Two rules for the words on this site, shared by the unit tests (committed
// pages), check-output (every built Markdown twin, imported pages included)
// and the importer (text that comes from elsewhere):
//
//   1. No ASCII or box-drawing diagrams in code fences. A diagram is a
//      <Diagram> (components/diagram.tsx). File trees are fine, and so is real
//      code; anything else goes in scripts/prose-allow.json with the reason.
//   2. No arrow glyphs in prose. "Settings → Team" reads as machine output;
//      write "Settings, then Team". Code (fences and `inline code`) is exempt.

/** Box-drawing and arrow characters that make a fence a picture. */
export const DIAGRAM_CHARS = /[─━│┃┌┐└┘├┤┬┴┼╭╮╯╰═║╔╗╚╝▶►◀◄▲▼→←↑↓⇒➜]/;
/** Arrow glyphs that must not appear in prose. `->` counts when it stands alone between words. */
export const PROSE_ARROW = /[→⇒➜▶►]|(?<=\s)->(?=\s)/;
/** A file-tree line: indentation guides, then a branch and a name. */
const TREE_LINE = /^[\s│]*(?:[├└]──\s+\S.*)?$/;

/**
 * Split Markdown into fenced code and the rest.
 * @param {string} md
 * @returns {{ code: boolean, lang: string, text: string, line: number }[]}
 */
export function segments(md) {
  const lines = md.split('\n');
  const out = [];
  let buf = [];
  let start = 1;
  let fence = null;
  let lang = '';
  const flush = (code, at) => {
    if (buf.length) out.push({ code, lang, text: buf.join('\n'), line: start });
    buf = [];
    start = at;
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
    if (!fence && m) {
      flush(false, i + 2);
      fence = m[1];
      lang = (m[2] ?? '').toLowerCase();
      return;
    }
    if (fence && line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') {
      flush(true, i + 2);
      fence = null;
      lang = '';
      return;
    }
    buf.push(line);
  });
  flush(Boolean(fence), lines.length + 1);
  return out;
}

/** Prose with `inline code` blanked out (same length, so columns still line up). */
const withoutInlineCode = (text) => text.replace(/(`+)([\s\S]*?)\1/g, (m) => ' '.repeat(m.length));

/**
 * Everything on a page that breaks the two rules.
 * @param {string} md
 * @param {{ file?: string, allow?: { file: string, text: string }[] }} [opts]
 * @returns {{ line: number, rule: 'diagram-fence' | 'prose-arrow', text: string }[]}
 */
export function proseProblems(md, opts = {}) {
  const allow = (opts.allow ?? []).filter((a) => !opts.file || a.file === opts.file);
  const allowed = (text) => allow.some((a) => text.includes(a.text));
  const problems = [];
  for (const seg of segments(md)) {
    if (seg.code) {
      const lines = seg.text.split('\n');
      if (!lines.some((l) => DIAGRAM_CHARS.test(l))) continue;
      const isTree = lines.every((l) => !DIAGRAM_CHARS.test(l) || TREE_LINE.test(l));
      if (isTree || allowed(seg.text)) continue;
      const i = lines.findIndex((l) => DIAGRAM_CHARS.test(l));
      problems.push({ line: seg.line + i, rule: 'diagram-fence', text: lines[i].trim() });
      continue;
    }
    seg.text.split('\n').forEach((line, i) => {
      // JSX comments and HTML comments are not read.
      const visible = withoutInlineCode(line).replace(/\{\/\*.*?\*\/\}|<!--.*?-->/g, '');
      if (PROSE_ARROW.test(visible) && !allowed(line)) problems.push({ line: seg.line + i, rule: 'prose-arrow', text: line.trim() });
    });
  }
  return problems;
}

/** A word that starts like a menu item or a name: "Settings", "**Team**", "(GitHub". */
const looksLikeMenu = (w) => /^(\*\*|__)?["'(]?[A-Z]/.test(w);

/** One line of prose: arrows become ", then " in a menu path, " to " otherwise. Inline code is kept. */
function plainLine(line) {
  const parts = line.split(/(`+[^`]*`+)/);
  return parts
    .map((part) => {
      if (part.startsWith('`')) return part;
      return part.replace(/\s*(?:[→⇒➜]|(?<=\s)->(?=\s))\s*/g, (m, offset, whole) => {
        const before = whole.slice(0, offset).split(/\s+/).pop() ?? '';
        const after = whole.slice(offset + m.length).split(/\s+/)[0] ?? '';
        // A path is a menu path when either neighbour reads like a name, or an earlier hop did.
        const menu = looksLikeMenu(before) || looksLikeMenu(after) || part.slice(0, offset).includes(', then ');
        return menu ? ', then ' : ' to ';
      });
    })
    .join('');
}

/**
 * Rewrite arrow glyphs in prose as words, for text this site does not write
 * itself (pull request titles, imported guides). "Settings → Team" becomes
 * "Settings, then Team"; "alert → pull request" becomes "alert to pull
 * request". Fenced and inline code are kept byte for byte.
 * @param {string} md
 */
export function plainArrows(md) {
  let fence = null;
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(`{3,}|~{3,})/);
      if (!fence && m) {
        fence = m[1];
        return line;
      }
      if (fence) {
        if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') fence = null;
        return line;
      }
      return plainLine(line);
    })
    .join('\n');
}
