"use client";

import { Fragment, useMemo, useState } from "react";
import { lineDiff, type DiffLine } from "@/lib/line-diff";
import { Segmented } from "./segmented";
import { focusRing } from "./ui";

// The one way to show what a change does to a text: the lines removed and
// added, with a few lines of context and the long unchanged runs folded away.
// Unified (one column) everywhere; side by side from `lg:` up when asked.
// The marks (+ and -) and the spoken words carry the meaning, not only colour.

export interface DiffProps {
  /** The text now. */
  before?: string;
  /** The text after the change. */
  after?: string;
  /** A unified diff, used when `before` and `after` aren't given. */
  unified?: string;
  /** Names the two sides, e.g. "Yours" and "Recommended". */
  beforeLabel?: string;
  afterLabel?: string;
  /** What the text is, for screen readers: "Review focus". */
  label: string;
  /** Lines of context kept around each change. */
  context?: number;
  /** Start side by side (from `lg:` up). */
  split?: boolean;
  /** Let the person switch between unified and side by side. */
  switchable?: boolean;
  maxHeightClass?: string;
  testId?: string;
}

interface Numbered extends DiffLine {
  a?: number;
  b?: number;
}

type Block = { kind: "lines"; lines: Numbered[] } | { kind: "fold"; lines: Numbered[] };

/** The lines of a unified diff (`@@` hunks), without its file headers. */
export function parseUnified(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const raw of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    if (raw.startsWith("@@")) continue;
    if (raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) out.push({ kind: "added", text: raw.slice(1) });
    else if (raw.startsWith("-")) out.push({ kind: "removed", text: raw.slice(1) });
    else out.push({ kind: "same", text: raw.startsWith(" ") ? raw.slice(1) : raw });
  }
  while (out.length && out[out.length - 1].kind === "same" && !out[out.length - 1].text) out.pop();
  return out;
}

function number(lines: DiffLine[]): Numbered[] {
  let a = 0;
  let b = 0;
  return lines.map((l) => {
    if (l.kind === "same") return { ...l, a: ++a, b: ++b };
    if (l.kind === "removed") return { ...l, a: ++a };
    return { ...l, b: ++b };
  });
}

/** Changed lines with `context` lines around them; longer unchanged runs fold. */
function blocks(lines: Numbered[], context: number): Block[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const kept = keep[i];
    const run: Numbered[] = [];
    while (i < lines.length && keep[i] === kept) run.push(lines[i++]);
    // A fold of one or two lines hides nothing worth hiding.
    if (!kept && run.length > 2) out.push({ kind: "fold", lines: run });
    else {
      const last = out[out.length - 1];
      if (last?.kind === "lines") last.lines.push(...run);
      else out.push({ kind: "lines", lines: run });
    }
  }
  return out;
}

const ROW_LOOK: Record<DiffLine["kind"], string> = {
  same: "text-zinc-300",
  added: "bg-emerald-500/10 text-emerald-100",
  removed: "bg-red-500/10 text-red-100",
};
const MARK: Record<DiffLine["kind"], string> = { same: " ", added: "+", removed: "-" };
const MARK_LOOK: Record<DiffLine["kind"], string> = { same: "text-zinc-400", added: "text-emerald-300", removed: "text-red-300" };
const SPOKEN: Record<DiffLine["kind"], string> = { same: "", added: "Added: ", removed: "Removed: " };

export function Diff({
  before,
  after,
  unified,
  beforeLabel = "Before",
  afterLabel = "After",
  label,
  context = 2,
  split: startSplit = false,
  switchable = true,
  maxHeightClass = "max-h-96",
  testId = "diff",
}: DiffProps) {
  const [view, setView] = useState<"unified" | "split">(startSplit ? "split" : "unified");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const lines = useMemo(
    () => number(before !== undefined || after !== undefined ? lineDiff(before ?? "", after ?? "") : parseUnified(unified ?? "")),
    [before, after, unified],
  );
  const parts = useMemo(() => blocks(lines, context), [lines, context]);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;
  const nothing = added === 0 && removed === 0;

  const unfold = (i: number) => setOpen((s) => new Set(s).add(i));
  const shown = (b: Block, i: number) => b.kind === "lines" || open.has(i);

  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950" data-testid={testId} data-view={view}>
      <figcaption className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="sr-only">{label}: </span>
          {nothing ? (
            <span className="text-zinc-400">No change</span>
          ) : (
            <>
              <span className="tabular-nums text-emerald-300" data-testid="diff-added">
                +{added} <span className="text-zinc-400">{added === 1 ? "line" : "lines"} added</span>
              </span>
              <span className="tabular-nums text-red-300" data-testid="diff-removed">
                -{removed} <span className="text-zinc-400">removed</span>
              </span>
            </>
          )}
        </span>
        {switchable && !nothing && (
          <span className="hidden lg:inline-flex">
            <Segmented
              label={`How to show the change to ${label}`}
              value={view}
              onChange={setView}
              options={[
                { value: "unified", label: "Unified" },
                { value: "split", label: "Side by side" },
              ]}
            />
          </span>
        )}
      </figcaption>
      <div className={`overflow-auto ${maxHeightClass}`}>
        {view === "split" ? (
          <>
            <div className="lg:hidden">
              <UnifiedRows parts={parts} shown={shown} unfold={unfold} />
            </div>
            <div className="hidden lg:block">
              <SplitRows parts={parts} shown={shown} unfold={unfold} beforeLabel={beforeLabel} afterLabel={afterLabel} />
            </div>
          </>
        ) : (
          <UnifiedRows parts={parts} shown={shown} unfold={unfold} />
        )}
      </div>
    </figure>
  );
}

function Fold({ n, onClick, colSpan }: { n: number; onClick: () => void; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-y border-zinc-800/80 bg-zinc-900/40 p-0">
        <button type="button" onClick={onClick} className={`flex min-h-8 w-full items-center px-3 text-left font-sans text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 ${focusRing} focus-visible:outline-offset-[-2px]`}>
          Show {n} unchanged {n === 1 ? "line" : "lines"}
        </button>
      </td>
    </tr>
  );
}

const cell = "whitespace-pre-wrap px-2 py-px align-top [overflow-wrap:anywhere]";
const gutter = "w-px select-none whitespace-nowrap px-2 py-px text-right align-top tabular-nums text-zinc-500";

function UnifiedRows({ parts, shown, unfold }: { parts: Block[]; shown: (b: Block, i: number) => boolean; unfold: (i: number) => void }) {
  return (
    <table className="w-full border-collapse font-mono text-xs leading-5">
      <tbody>
        {parts.map((b, i) =>
          shown(b, i) ? (
            <Fragment key={i}>
              {b.lines.map((l, j) => (
                <tr key={j} className={ROW_LOOK[l.kind]} data-kind={l.kind}>
                  <td aria-hidden="true" className={`${gutter} hidden sm:table-cell`}>{l.a ?? ""}</td>
                  <td aria-hidden="true" className={gutter}>{l.b ?? ""}</td>
                  <td aria-hidden="true" className={`w-px select-none px-1 py-px align-top ${MARK_LOOK[l.kind]}`}>{MARK[l.kind]}</td>
                  <td className={cell}>
                    <span className="sr-only">{SPOKEN[l.kind]}</span>
                    {l.text || " "}
                  </td>
                </tr>
              ))}
            </Fragment>
          ) : (
            <Fold key={i} n={b.lines.length} onClick={() => unfold(i)} colSpan={4} />
          ),
        )}
      </tbody>
    </table>
  );
}

/** Removed lines on the left, added on the right, paired up row by row. */
function pairs(lines: Numbered[]): [Numbered | null, Numbered | null][] {
  const out: [Numbered | null, Numbered | null][] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "same") {
      out.push([lines[i], lines[i]]);
      i++;
      continue;
    }
    const rem: Numbered[] = [];
    const add: Numbered[] = [];
    while (i < lines.length && lines[i].kind === "removed") rem.push(lines[i++]);
    while (i < lines.length && lines[i].kind === "added") add.push(lines[i++]);
    for (let k = 0; k < Math.max(rem.length, add.length); k++) out.push([rem[k] ?? null, add[k] ?? null]);
  }
  return out;
}

function SplitRows({
  parts,
  shown,
  unfold,
  beforeLabel,
  afterLabel,
}: {
  parts: Block[];
  shown: (b: Block, i: number) => boolean;
  unfold: (i: number) => void;
  beforeLabel: string;
  afterLabel: string;
}) {
  const side = (l: Numbered | null, which: "a" | "b") =>
    l ? (
      <>
        <td aria-hidden="true" className={gutter}>{l[which]}</td>
        <td aria-hidden="true" className={`w-px select-none px-1 py-px align-top ${MARK_LOOK[l.kind]}`}>{MARK[l.kind]}</td>
        <td className={`${cell} w-1/2 ${ROW_LOOK[l.kind]}`}>
          <span className="sr-only">{SPOKEN[l.kind]}</span>
          {l.text || " "}
        </td>
      </>
    ) : (
      <td colSpan={3} className="w-1/2 bg-zinc-900/40" />
    );
  return (
    <table className="w-full table-fixed border-collapse font-mono text-xs leading-5">
      <colgroup>
        <col className="w-10" />
        <col className="w-5" />
        <col />
        <col className="w-10" />
        <col className="w-5" />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b border-zinc-800 font-sans text-xs text-zinc-400">
          <th scope="col" colSpan={3} className="px-3 py-1.5 text-left font-medium">{beforeLabel}</th>
          <th scope="col" colSpan={3} className="border-l border-zinc-800 px-3 py-1.5 text-left font-medium">{afterLabel}</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((b, i) =>
          shown(b, i) ? (
            <Fragment key={i}>
              {pairs(b.lines).map(([l, r], j) => (
                <tr key={j}>
                  {side(l?.kind === "added" ? null : l, "a")}
                  {side(r?.kind === "removed" ? null : r, "b")}
                </tr>
              ))}
            </Fragment>
          ) : (
            <Fold key={i} n={b.lines.length} onClick={() => unfold(i)} colSpan={6} />
          ),
        )}
      </tbody>
    </table>
  );
}
