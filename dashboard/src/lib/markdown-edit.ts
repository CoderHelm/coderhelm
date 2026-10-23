// Pure text edits behind the markdown editor's toolbar and shortcuts. Each
// takes the text and the selection and returns one replacement: the range it
// replaces, the new text for that range, and where the selection lands. The
// editor applies it as a single native edit, so Undo takes it back in one step.

export interface Edit {
  /** Start of the replaced range. */
  from: number;
  /** End of the replaced range. */
  to: number;
  /** What goes in its place. */
  insert: string;
  /** The selection afterwards. */
  selStart: number;
  selEnd: number;
}

export type Action =
  | "heading"
  | "bold"
  | "italic"
  | "code"
  | "codeBlock"
  | "link"
  | "quote"
  | "bullet"
  | "numbered"
  | "task";

const URL_RE = /^https?:\/\/[^\s<>()]+$/i;

/** True when the whole string is one http(s) URL. */
export function isUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEnd(text: string, pos: number): number {
  const i = text.indexOf("\n", pos);
  return i === -1 ? text.length : i;
}

/** Wrap the selection in `mark` (bold, italic, inline code), or unwrap it when it is already wrapped. */
export function wrap(text: string, s: number, e: number, mark: string): Edit {
  const n = mark.length;
  // Already wrapped just outside the selection: remove the marks.
  if (s >= n && text.slice(s - n, s) === mark && text.slice(e, e + n) === mark) {
    const inner = text.slice(s, e);
    return { from: s - n, to: e + n, insert: inner, selStart: s - n, selEnd: e - n };
  }
  // The selection itself includes the marks: remove them.
  const sel = text.slice(s, e);
  if (sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(n, sel.length - n);
    return { from: s, to: e, insert: inner, selStart: s, selEnd: s + inner.length };
  }
  // Keep surrounding spaces outside the marks ("**word** " not "**word **").
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const core = sel.trim();
  const insert = `${sel.slice(0, lead)}${mark}${core}${mark}${trail ? sel.slice(sel.length - trail) : ""}`;
  const start = s + lead + n;
  return { from: s, to: e, insert, selStart: start, selEnd: start + core.length };
}

/** A fenced code block around the selection, on lines of its own. */
export function codeBlock(text: string, s: number, e: number): Edit {
  const sel = text.slice(s, e);
  const before = s > 0 && text[s - 1] !== "\n" ? "\n" : "";
  const after = e < text.length && text[e] !== "\n" ? "\n" : "";
  const insert = `${before}\`\`\`\n${sel}\n\`\`\`${after}`;
  const start = s + before.length + 4;
  return { from: s, to: e, insert, selStart: start, selEnd: start + sel.length };
}

/** Inline code for a selection on one line, a code block for one across lines. */
export function code(text: string, s: number, e: number): Edit {
  return text.slice(s, e).includes("\n") ? codeBlock(text, s, e) : wrap(text, s, e, "`");
}

/** A link: the selected words become its text with "url" selected to type over; a selected URL becomes its target. */
export function link(text: string, s: number, e: number): Edit {
  const sel = text.slice(s, e);
  if (sel && isUrl(sel)) {
    const insert = `[](${sel.trim()})`;
    return { from: s, to: e, insert, selStart: s + 1, selEnd: s + 1 };
  }
  const insert = `[${sel}](url)`;
  const urlAt = s + sel.length + 3;
  return { from: s, to: e, insert, selStart: urlAt, selEnd: urlAt + 3 };
}

/** Pasting a URL over selected words links them: `[words](url)`. Null when it should paste as usual. */
export function pasteLink(text: string, s: number, e: number, pasted: string): Edit | null {
  const sel = text.slice(s, e);
  if (!sel || sel.includes("\n") || isUrl(sel) || !isUrl(pasted)) return null;
  const insert = `[${sel}](${pasted.trim()})`;
  return { from: s, to: e, insert, selStart: s + insert.length, selEnd: s + insert.length };
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;

const PREFIX: Record<"heading" | "quote" | "bullet" | "numbered" | "task", { re: RegExp; make: (i: number) => string }> = {
  heading: { re: /^#{1,6}\s+/, make: () => "### " },
  quote: { re: /^>\s?/, make: () => "> " },
  bullet: { re: /^\s*[-*+]\s+(?!\[[ xX]\])/, make: () => "- " },
  numbered: { re: /^\s*\d+[.)]\s+/, make: (i) => `${i + 1}. ` },
  task: { re: /^\s*[-*+]\s+\[[ xX]\]\s+/, make: () => "- [ ] " },
};

/**
 * Start every selected line with a heading, quote or list marker, or take the
 * marker off when every non-empty line already has it. A list replaces any
 * other list marker the line had.
 */
export function prefixLines(text: string, s: number, e: number, kind: keyof typeof PREFIX): Edit {
  const from = lineStart(text, s);
  const to = lineEnd(text, e > s && text[e - 1] === "\n" ? e - 1 : e);
  const lines = text.slice(from, to).split("\n");
  const { re, make } = PREFIX[kind];
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => re.test(l));
  let i = 0;
  const out = lines.map((l) => {
    if (remove) return l.replace(re, "");
    if (!l.trim() && lines.length > 1) return l;
    const bare = kind === "heading" ? l.replace(PREFIX.heading.re, "") : kind === "quote" ? l : l.replace(LIST_RE, "$1");
    const indent = kind === "heading" || kind === "quote" ? "" : (/^\s*/.exec(bare)?.[0] ?? "");
    return `${indent}${make(i++)}${bare.slice(indent.length)}`;
  });
  const insert = out.join("\n");
  // One line: keep the caret where it was in the words. Several: select them all.
  if (lines.length === 1) {
    const shift = insert.length - (to - from);
    const caret = Math.max(from, Math.min(from + insert.length, e + shift));
    const start = s === e ? caret : Math.max(from, s + shift);
    return { from, to, insert, selStart: start, selEnd: caret };
  }
  return { from, to, insert, selStart: from, selEnd: from + insert.length };
}

/** The edit for a toolbar button or shortcut. */
export function applyAction(action: Action, text: string, s: number, e: number): Edit {
  switch (action) {
    case "bold":
      return wrap(text, s, e, "**");
    case "italic":
      return wrap(text, s, e, "_");
    case "code":
      return code(text, s, e);
    case "codeBlock":
      return codeBlock(text, s, e);
    case "link":
      return link(text, s, e);
    default:
      return prefixLines(text, s, e, action);
  }
}

/**
 * Enter inside a list item: continue the list on the next line (the next
 * number, an unchecked box). Enter on an empty item ends the list instead.
 * Null when the caret is not in a list item.
 */
export function continueList(text: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const start = lineStart(text, s);
  const line = text.slice(start, lineEnd(text, s));
  const m = LIST_RE.exec(line);
  if (!m || s - start < m[0].length) return null;
  if (!line.slice(m[0].length).trim()) {
    // An empty item: drop its marker and stop the list.
    return { from: start, to: start + line.length, insert: "", selStart: start, selEnd: start };
  }
  const [, indent, marker, gap, box] = m;
  const num = /^(\d+)([.)])$/.exec(marker);
  const next = num ? `${Number(num[1]) + 1}${num[2]}` : marker;
  const insert = `\n${indent}${next}${gap}${box ? "[ ] " : ""}`;
  return { from: s, to: s, insert, selStart: s + insert.length, selEnd: s + insert.length };
}

/** True when the caret's line (or every selected line) is a list item. */
export function inList(text: string, s: number, e: number): boolean {
  const from = lineStart(text, s);
  const to = lineEnd(text, e);
  return text
    .slice(from, to)
    .split("\n")
    .every((l) => LIST_RE.test(l));
}

/** Tab and Shift+Tab in a list: indent the selected items by two spaces, or take two away. */
export function indentList(text: string, s: number, e: number, out: boolean): Edit {
  const from = lineStart(text, s);
  const to = lineEnd(text, e);
  const lines = text.slice(from, to).split("\n");
  let firstShift = 0;
  const changed = lines.map((l, i) => {
    if (!out) {
      if (i === 0) firstShift = 2;
      return `  ${l}`;
    }
    const strip = l.startsWith("  ") ? 2 : l.startsWith(" ") || l.startsWith("\t") ? 1 : 0;
    if (i === 0) firstShift = -strip;
    return l.slice(strip);
  });
  const insert = changed.join("\n");
  const delta = insert.length - (to - from);
  return {
    from,
    to,
    insert,
    selStart: Math.max(from, s + firstShift),
    selEnd: Math.max(from, e + delta),
  };
}

/** Put a block (a template) at the caret, or after what is there with a blank line between. */
export function insertBlock(text: string, s: number, block: string): Edit {
  if (!text.trim()) return { from: 0, to: text.length, insert: block, selStart: block.length, selEnd: block.length };
  const at = s;
  const before = at > 0 && text[at - 1] !== "\n" ? "\n\n" : at > 1 && text[at - 2] !== "\n" ? "\n" : "";
  const insert = `${before}${block}`;
  return { from: at, to: at, insert, selStart: at + insert.length, selEnd: at + insert.length };
}
