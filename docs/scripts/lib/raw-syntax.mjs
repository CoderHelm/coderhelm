// Finds source syntax that leaked onto a built page as visible text: an MDX
// comment, a component tag that was printed instead of rendered, an escaped
// brace, an admonition marker, or an HTML entity that was escaped twice.
// Code blocks and inline code are left out: showing syntax there is the point.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  });

/** The text a reader sees in an HTML document, without scripts, styles and code. */
export function visibleText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return decode(
    body
      .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(pre|code|kbd|samp)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t\r\n]+/g, ' ');
}

/** Markdown with fenced code blocks and inline code removed. */
export function markdownProse(md) {
  return md.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, ' ').replace(/`[^`\n]*`/g, ' ');
}

const COMPONENTS = 'Callout|Cards?|Tabs?|Steps?|Accordions?|Files?|Folder|TypeTable|Diagram|Badge|Paths?|Tiles?|include';

export const RULES = [
  { rule: 'mdx-comment', re: /\{\/\*|\*\/\}/ },
  { rule: 'jsx-tag', re: new RegExp(`</?(?:${COMPONENTS})\\b[^<>]*>?`) },
  { rule: 'escaped-brace', re: /\\[{}]/ },
  { rule: 'admonition', re: /(?:^|\s):::\s*\w*|\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/ },
  { rule: 'html-entity', re: /&(?:#x[0-9a-f]+|#\d+|[a-z]{2,8});/i },
];

/** Raw syntax in already-extracted text; each finding with some context around it. */
export function rawSyntax(text) {
  const found = [];
  for (const { rule, re } of RULES) {
    const m = text.match(re);
    if (m) found.push({ rule, text: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).trim() });
  }
  return found;
}
