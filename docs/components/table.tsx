import { Children, cloneElement, isValidElement, type ComponentProps, type CSSProperties, type ReactElement, type ReactNode } from 'react';

/*
 * Every Markdown table on the site (hand-written MDX and the imported
 * self-host guides) renders through this. Styles are in app/global.css
 * (.ch-table).
 *
 * The columns are sized from what is in them, the way a person laying the
 * table out would do it:
 *   - a column whose cells are all short (a key, a type, "Yes") stays on one
 *     line, so `models.provider` or "Required" never breaks;
 *   - a column of longer text gets a minimum width, so on a phone it scrolls
 *     inside its box instead of squeezing into one word a line.
 * The box scrolls sideways only when the table is wider than the page, with
 * a fade on the side that has more.
 */

type El = ReactElement<{ children?: ReactNode; style?: CSSProperties; 'data-fit'?: string }>;

/** The text of a cell, as a reader sees it. */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node as El).props.children);
  return '';
}

const elements = (children: ReactNode): El[] => Children.toArray(children).filter(isValidElement) as El[];

/** A cell that holds only identifiers: inline code, with commas or spaces between. */
function codeOnly(children: ReactNode): boolean {
  const parts = Children.toArray(children);
  return parts.length > 0 && parts.every((p) => (typeof p === 'string' ? /^[\s,]*$/.test(p) : isValidElement(p) && p.type === 'code'));
}

type Column = { length: number; code: boolean };

/** Per column: the longest cell (header included), and whether every body cell is code. */
function columns(sections: El[]): Column[] {
  const cols: Column[] = [];
  for (const section of sections) {
    const body = section.type !== 'thead';
    for (const row of elements(section.props.children)) {
      elements(row.props.children).forEach((cell, i) => {
        const col = (cols[i] ??= { length: 0, code: true });
        const text = textOf(cell.props.children).trim();
        col.length = Math.max(col.length, text.length);
        if (body && text && !codeOnly(cell.props.children)) col.code = false;
      });
    }
  }
  return cols;
}

/** Short enough to keep on one line: keys, types, defaults, yes and no. */
const NOWRAP_MAX = 22;

/** How a column is laid out, from its longest cell. */
/** Identifiers up to this long stay whole when a column holds nothing else. */
const CODE_NOWRAP_MAX = 36;

export function columnFit({ length, code }: Column, columns: number): { fit: 'key' | 'text'; minWidth?: string } {
  if (length <= NOWRAP_MAX || (code && length <= CODE_NOWRAP_MAX)) return { fit: 'key' };
  // Two columns share the width well on their own; a minimum would only make
  // a phone scroll.
  if (columns < 3) return { fit: 'text' };
  if (length > 90) return { fit: 'text', minWidth: '15rem' };
  if (length > 50) return { fit: 'text', minWidth: '11rem' };
  return { fit: 'text', minWidth: '8rem' };
}

export function Table({ children, ...props }: ComponentProps<'table'>) {
  const sections = elements(children);
  const cols = columns(sections);
  const fits = cols.map((col) => columnFit(col, cols.length));
  const laidOut = sections.map((section) =>
    cloneElement(section, {
      children: elements(section.props.children).map((row) =>
        cloneElement(row, {
          children: elements(row.props.children).map((cell, i) =>
            cloneElement(cell, {
              // Chrome breaks at <wbr> even under nowrap: key columns get none.
              children: fits[i]?.fit === 'key' ? cell.props.children : withBreaks(cell.props.children),
              'data-fit': fits[i]?.fit,
              style: fits[i]?.minWidth ? { ...cell.props.style, minWidth: fits[i].minWidth } : cell.props.style,
            }),
          ),
        }),
      ),
    }),
  );
  const header = textOf(sections[0]).trim();
  return (
    // Focusable so a keyboard can scroll a wide table (WCAG 2.1.1).
    <div className="ch-table" role="region" tabIndex={0} aria-label={header ? `Table: ${header.slice(0, 80)}` : 'Table'}>
      <table {...props}>{laidOut}</table>
    </div>
  );
}

/**
 * Break points in a long identifier: before a dot, after a slash, hyphen,
 * underscore and the like, and never in its first two characters. So
 * `coderhelm-<stage>-data-<account>` wraps at a hyphen and `doctor.json` at
 * its dot, never mid-word.
 */
const BREAKS = /(?<=..)(?=\.[^\s.])|(?<=..[/_\-:,=@])(?=\S)/g;

export function breakable(text: string): ReactNode[] {
  if (text.length < 14) return [text];
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(BREAKS)) {
    const at = m.index ?? 0;
    if (at === last || at >= text.length) continue;
    parts.push(text.slice(last, at), <wbr key={at} />);
    last = at;
  }
  parts.push(text.slice(last));
  return parts;
}

/** A cell's content with break points added to its inline code. */
function withBreaks(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as El;
    if (el.type === 'code' && typeof el.props.children === 'string') return cloneElement(el, { children: breakable(el.props.children) });
    return el.props.children === undefined ? el : cloneElement(el, { children: withBreaks(el.props.children) });
  });
}
