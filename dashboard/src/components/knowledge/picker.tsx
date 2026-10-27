"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useModalLayer } from "@/components/modal";
import { buttonClass, focusRing, inputClass, linkButton, smallSecondaryButton } from "@/components/ui";
import { errorMessage, shortAgo } from "@/lib/data-sources";
import { KIND_LABEL, fileSize, knowledge, type PickerNode, type Selected, type SourceKind, type Via } from "@/lib/knowledge";

// Picking what to bring in from an app: a tree that opens one level at a
// time, with a search box and, beside it (under it on a phone), what is
// picked so far. Ticking something takes everything inside it, including
// what is added there later. A website takes addresses instead.
//
// The tree is an ARIA treegrid: one row is in the Tab order, the arrow keys
// move between rows and open or close them, Space or Enter ticks.

/** How many rows a level shows before "Show more". */
const PAGE = 100;

type Children = PickerNode[] | "loading" | { error: string };

/** One line of the tree: a node, or a note under an open one. */
type Row =
  | {
      type: "node";
      key: string;
      node: PickerNode;
      depth: number;
      /** Titles above it. */
      path: string[];
      /** Ids above it (empty for a search result). */
      ancestors: string[];
      pos: number;
      size: number;
    }
  | { type: "loading"; key: string; depth: number; parent: PickerNode }
  | { type: "empty"; key: string; depth: number; parent: PickerNode }
  | { type: "error"; key: string; depth: number; parent: PickerNode; message: string }
  | { type: "more"; key: string; depth: number; parentId: string; left: number };

/** What the picker has learned about a node, kept for the selection list. */
interface Seen {
  node: PickerNode;
  ancestors: string[];
}

// ── Words ────────────────────────────────────────────────────────────

const NOUN: Record<string, [string, string]> = {
  page: ["page", "pages"],
  database: ["database", "databases"],
  space: ["space", "spaces"],
  folder: ["folder", "folders"],
  file: ["file", "files"],
  repo: ["repository", "repositories"],
  dataset: ["dataset", "datasets"],
  type: ["content type", "content types"],
  project: ["project", "projects"],
  url: ["page", "pages"],
  sitemap: ["sitemap", "sitemaps"],
};

const TYPE: Record<string, string> = {
  page: "Page",
  database: "Database",
  space: "Space",
  folder: "Folder",
  file: "File",
  repo: "Repository",
  dataset: "Dataset",
  type: "Content type",
  project: "Project",
};

const count = (n: number, [one, many]: [string, string]) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "3 pages", "1 space", or "4 items" when the kinds differ. */
export function pickedWords(value: Selected[]): string {
  const kinds = new Set(value.map((v) => v.kind));
  const noun = kinds.size === 1 ? (NOUN[[...kinds][0]] ?? ["item", "items"]) : (["item", "items"] as [string, string]);
  return count(value.length, noun);
}

/** The main button of the picking step: "Continue with 3 pages". */
export function continueLabel(value: Selected[]): string {
  return value.length ? `Continue with ${pickedWords(value)}` : "Continue";
}

/** What sits inside a node, by what it is. */
function insideNoun(node: PickerNode): [string, string] {
  if (node.kind === "database") return ["entry", "entries"];
  if (node.kind === "space") return ["page", "pages"];
  if (node.kind === "page") return ["subpage", "subpages"];
  return ["item", "items"];
}

/** How many items it brings in besides itself, when known. */
function insideCount(node: PickerNode): number | null {
  if (node.item_count == null) return null;
  return node.kind === "page" ? Math.max(0, node.item_count - 1) : node.item_count;
}

function typeOf(node: PickerNode): string {
  return node.detail || TYPE[node.kind] || "";
}

/** When it was last edited, short: "3h ago" this month, else the date. */
function edited(iso: string): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  if (Date.now() - t < 30 * 86_400_000) return `Edited ${shortAgo(iso)}`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
}

/** The muted line under a row's title: what it is (a plain page goes
 * without saying), what is inside, its size, its last edit. */
function metaLine(node: PickerNode): string {
  const parts: string[] = [];
  const type = node.kind === "page" && !node.detail ? "" : typeOf(node);
  if (type) parts.push(type);
  if (node.child_count != null && node.child_count > 0) parts.push(count(node.child_count, insideNoun(node)));
  if (node.bytes != null) parts.push(fileSize(node.bytes));
  const when = edited(node.updated_at);
  if (when) parts.push(when);
  return parts.join(" · ");
}

// ── Pieces ───────────────────────────────────────────────────────────

const KIND_ICON: Record<string, string> = {
  page: "M7 3h7l5 5v13H7z M14 3v5h5",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  space: "M4 5h16v14H4z M4 9h16",
  project: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8 13h8",
  repo: "M6 3h11a1 1 0 0 1 1 1v16H7a2 2 0 0 1 0-4h11 M9 7h5",
  dataset: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
  type: "M5 5h14v4H5z M5 13h9 M5 17h6",
  file: "M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h4",
  url: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sitemap: "M12 3v6 M5 15v-3h14v3 M3 15h4v5H3z M10 15h4v5h-4z M17 15h4v5h-4z M9 3h6v6H9z",
};

function KindIcon({ kind }: { kind: string }) {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={KIND_ICON[kind] ?? KIND_ICON.page} />
    </svg>
  );
}

/** An image address the page may load: https, or this site's own. */
const imageUrl = (icon: string) => icon.startsWith("https://") || (icon.startsWith("/") && !icon.startsWith("//"));

/** The provider's icon (a page's emoji, a file type's image), else the kind's own. */
function NodeIcon({ kind, icon }: { kind: string; icon?: string }) {
  const [broken, setBroken] = useState(false);
  const box = "inline-flex h-5 w-5 shrink-0 items-center justify-center";
  if (icon && imageUrl(icon) && !broken) {
    return (
      <span className={box} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a provider's icon, from its own host */}
        <img src={icon} alt="" width={18} height={18} loading="lazy" referrerPolicy="no-referrer" className="h-[18px] w-[18px] rounded-sm object-contain" onError={() => setBroken(true)} data-testid="node-icon-img" />
      </span>
    );
  }
  if (icon && !imageUrl(icon)) {
    return (
      <span className={`${box} text-[17px] leading-none`} aria-hidden="true" data-testid="node-icon-emoji">
        {icon}
      </span>
    );
  }
  return (
    <span className={box}>
      <KindIcon kind={kind} />
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A native checkbox that can show "some inside are picked". */
function TriCheck({ checked, partial, disabled, label, onChange }: { checked: boolean; partial: boolean; disabled: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      tabIndex={-1}
      aria-label={label}
      className="h-4 w-4 shrink-0 accent-emerald-500"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      data-testid="picker-check"
    />
  );
}

/** The title with the searched words marked. */
function Marked({ text, q }: { text: string; q: string }) {
  const term = q.trim().toLowerCase();
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-300/20 text-amber-100" data-testid="picker-match">
        {text.slice(at, at + term.length)}
      </mark>
      {text.slice(at + term.length)}
    </>
  );
}

// ── Sharing more ─────────────────────────────────────────────────────

/** How to let Coderhelm see more, in each app's own words. */
const SHARE: Partial<Record<SourceKind, { lead: string; steps: string[]; note?: string }>> = {
  notion: {
    lead: "Coderhelm sees only the Notion pages shared with it. To share one:",
    steps: [
      "Open the page in Notion.",
      "Select ••• at the top right, then Connections.",
      "Select Add connection, choose Coderhelm (or the integration whose token your team saved) and confirm.",
    ],
    note: "Pages inside a shared page are shared with it.",
  },
  confluence: {
    lead: "Coderhelm sees the spaces and pages the connected Atlassian account can see. To add one:",
    steps: [
      "In Confluence, open the space and select Space settings.",
      "Under Permissions, give the connected account (or a group it is in) View.",
      "For a restricted page, open it, select ••• then Restrictions, and add that account.",
    ],
  },
  google_drive: {
    lead: "Coderhelm sees what the connected Google account can open. To add a folder or file:",
    steps: [
      "In Google Drive, right-click the folder or file and select Share.",
      "Add the Google account connected to Coderhelm as a Viewer.",
      "For a shared drive, add that account as a member of the drive.",
    ],
    note: "Images and videos aren't listed; documents, sheets, slides, PDFs and text files are.",
  },
  github: {
    lead: "Coderhelm sees the repositories its GitHub App is installed on. To add one:",
    steps: [
      "On GitHub, open the organization's Settings, then GitHub Apps (for a personal account: Settings, then Applications).",
      "Select Configure next to Coderhelm.",
      "Under Repository access, add the repository and save.",
    ],
    note: "Only Markdown and text files are listed.",
  },
  sanity: {
    lead: "Coderhelm sees the Sanity projects your sign-in or the saved token can read. To add one:",
    steps: ["In Sanity, open the project's settings (sanity.io/manage).", "Under Members, add your account, or under API, give the saved token read access.", "Check the dataset under Datasets."],
  },
};

function ShareSteps({ kind }: { kind: SourceKind }) {
  const s = SHARE[kind];
  if (!s) return null;
  return (
    <div className="text-sm leading-relaxed text-zinc-300" data-testid="share-steps">
      <p>{s.lead}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 marker:text-zinc-400">
        {s.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {s.note && <p className="mt-2 text-zinc-400">{s.note}</p>}
    </div>
  );
}

// ── The picker ───────────────────────────────────────────────────────

export function Picker({
  kind,
  value,
  onChange,
  via = "team",
}: {
  kind: SourceKind;
  value: Selected[];
  onChange: (v: Selected[]) => void;
  /** Browse with your own sign-in (Sanity) instead of the team's connection. */
  via?: Via;
}) {
  if (kind === "web") return <AddressPicker value={value} onChange={onChange} />;
  return <TreePicker kind={kind} value={value} onChange={onChange} via={via} />;
}

/** `a` starts with every title of `b`. */
const startsWith = (a: string[], b: string[]) => b.length <= a.length && b.every((t, i) => a[i] === t);

function TreePicker({ kind, value, onChange, via }: { kind: SourceKind; value: Selected[]; onChange: (v: Selected[]) => void; via: Via }) {
  const [roots, setRoots] = useState<PickerNode[] | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, Children>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PickerNode[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const label = KIND_LABEL[kind];
  const seen = useRef(new Map<string, Seen>());
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const grid = useRef<HTMLDivElement | null>(null);
  const searchBox = useRef<HTMLInputElement | null>(null);
  const treeScroll = useRef(0);
  const searchMode = q.trim() !== "";

  const remember = (nodes: PickerNode[], ancestors: string[]) => {
    for (const n of nodes) {
      const had = seen.current.get(n.id);
      // A search result knows no ancestors; keep what the tree taught.
      seen.current.set(n.id, { node: n, ancestors: ancestors.length || !had ? ancestors : had.ancestors });
    }
  };

  const loadRoots = useCallback(() => {
    setRootError(null);
    setRoots(null);
    knowledge
      .browse(kind, null, "", via)
      .then((r) => {
        remember(r.nodes, []);
        setRoots(r.nodes);
      })
      .catch((e) => setRootError(errorMessage(e, `Couldn't open ${label}.`)));
  }, [kind, label, via]);
  useEffect(loadRoots, [loadRoots]);

  // Search as you type, a moment after the last key.
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    setSearchError(null);
    if (!term) {
      seq.current += 1;
      setFound(null);
      setSearching(false);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(() => {
      knowledge
        .browse(kind, null, term, via)
        .then((r) => {
          if (mine !== seq.current) return;
          remember(r.nodes, []);
          setFound(r.nodes);
          setSearching(false);
        })
        .catch((e) => {
          if (mine !== seq.current) return;
          setSearchError(errorMessage(e, "The search didn't work. Try again."));
          setSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind, via]);

  // Leaving the search puts the tree back as it was: what was open stays
  // open (that state is never touched by a search) and the scroll returns.
  const wasSearching = useRef(false);
  useLayoutEffect(() => {
    if (wasSearching.current && !searchMode && grid.current) grid.current.scrollTop = treeScroll.current;
    wasSearching.current = searchMode;
  }, [searchMode]);
  const typeSearch = (next: string) => {
    if (!searchMode && next.trim() && grid.current) treeScroll.current = grid.current.scrollTop;
    setQ(next);
  };

  const loadChildren = (n: PickerNode, ancestors: string[]) => {
    setChildren((c) => ({ ...c, [n.id]: "loading" }));
    knowledge
      .browse(kind, n.id, "", via)
      .then((r) => {
        remember(r.nodes, [...ancestors, n.id]);
        setChildren((c) => ({ ...c, [n.id]: r.nodes }));
      })
      .catch((e) => setChildren((c) => ({ ...c, [n.id]: { error: errorMessage(e, "Couldn't open this.") } })));
  };

  const setOpenTo = (n: PickerNode, ancestors: string[], next: boolean) => {
    setOpen((o) => ({ ...o, [n.id]: next }));
    const kids = children[n.id];
    if (next && (!kids || (typeof kids === "object" && !Array.isArray(kids)))) loadChildren(n, ancestors);
  };

  // ── Selection ──

  const picked = useMemo(() => new Map(value.map((v) => [v.id, v])), [value]);

  /** Ids above a picked item, from the tree when it was seen there. */
  const ancestorsOf = (id: string) => seen.current.get(id)?.ancestors ?? [];

  /** The picked item that already takes this row in, if any. */
  const coveredBy = (row: { node: PickerNode; path: string[]; ancestors: string[] }): Selected | undefined => {
    for (const a of row.ancestors) {
      const v = picked.get(a);
      if (v?.include_children) return v;
    }
    // A search result: compare titles above it with what is picked.
    if (!row.ancestors.length && row.path.length) {
      return value.find((v) => v.include_children && v.id !== row.node.id && startsWith(row.path, [...v.path, v.title]));
    }
    return undefined;
  };

  /** Some of what is inside it is picked. */
  const partly = (node: PickerNode, path: string[]) => {
    const here = [...path, node.title];
    return value.some((v) => v.id !== node.id && (ancestorsOf(v.id).includes(node.id) || (v.path.length >= here.length && startsWith(v.path, here))));
  };

  const toggle = (node: PickerNode, path: string[]) => {
    if (picked.has(node.id)) {
      onChange(value.filter((v) => v.id !== node.id));
      return;
    }
    // Picking a parent takes in what was picked inside it.
    const here = [...path, node.title];
    const rest = value.filter((v) => !(ancestorsOf(v.id).includes(node.id) || (v.path.length >= here.length && startsWith(v.path, here))));
    onChange([...rest, { id: node.id, title: node.title, kind: node.kind, path, include_children: true }]);
  };

  // ── Rows ──

  const rows: Row[] = [];
  const addRows = (nodes: PickerNode[], depth: number, path: string[], ancestors: string[], parentId: string) => {
    const limit = shown[parentId] ?? PAGE;
    nodes.slice(0, limit).forEach((n, i) => {
      rows.push({ type: "node", key: `${parentId}/${n.id}`, node: n, depth, path, ancestors, pos: i + 1, size: nodes.length });
      if (searchMode || !open[n.id]) return;
      const kids = children[n.id];
      const under = depth + 1;
      if (kids === "loading" || kids === undefined) rows.push({ type: "loading", key: `${n.id}#loading`, depth: under, parent: n });
      else if (!Array.isArray(kids)) rows.push({ type: "error", key: `${n.id}#error`, depth: under, parent: n, message: kids.error });
      else if (!kids.length) rows.push({ type: "empty", key: `${n.id}#empty`, depth: under, parent: n });
      else addRows(kids, under, [...path, n.title], [...ancestors, n.id], n.id);
    });
    if (nodes.length > limit) rows.push({ type: "more", key: `${parentId}#more`, depth, parentId, left: nodes.length - limit });
  };
  if (found) found.forEach((n, i) => rows.push({ type: "node", key: `found/${n.id}`, node: n, depth: 0, path: n.path ?? [], ancestors: [], pos: i + 1, size: found.length }));
  else if (roots && !searchMode) addRows(roots, 0, [], [], "");

  const navigable = rows.filter((r) => r.type === "node" || r.type === "error" || r.type === "more");
  const activeKey = focusKey && navigable.some((r) => r.key === focusKey) ? focusKey : (navigable[0]?.key ?? null);

  // Move focus to a row after it renders.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const k = pendingFocus.current;
    if (!k) return;
    const el = rowEls.current.get(k);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });
  const focusRow = (key: string | null | undefined) => {
    if (!key) return;
    setFocusKey(key);
    pendingFocus.current = key;
    rowEls.current.get(key)?.focus();
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = navigable.findIndex((r) => r.key === activeKey);
    const row = navigable[i];
    if (!row) return;
    const go = (to: number) => {
      e.preventDefault();
      focusRow(navigable[Math.max(0, Math.min(navigable.length - 1, to))]?.key);
    };
    switch (e.key) {
      case "ArrowDown":
        return go(i + 1);
      case "ArrowUp":
        if (i === 0) {
          e.preventDefault();
          searchBox.current?.focus();
          return;
        }
        return go(i - 1);
      case "Home":
        return go(0);
      case "End":
        return go(navigable.length - 1);
      case "PageDown":
        return go(i + 10);
      case "PageUp":
        return go(i - 10);
    }
    if (row.type === "node") {
      const n = row.node;
      const canOpen = n.has_children && !searchMode;
      if (e.key === "ArrowRight" && canOpen) {
        e.preventDefault();
        if (!open[n.id]) setOpenTo(n, row.ancestors, true);
        else if (navigable[i + 1]?.depth === row.depth + 1) focusRow(navigable[i + 1].key);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (canOpen && open[n.id]) setOpenTo(n, row.ancestors, false);
        else {
          const up = row.ancestors[row.ancestors.length - 1];
          const parent = up && navigable.slice(0, i).reverse().find((r) => r.type === "node" && r.node.id === up);
          if (parent) focusRow(parent.key);
        }
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (n.selectable && !coveredBy(row)) toggle(n, row.path);
        else if (canOpen) setOpenTo(n, row.ancestors, !open[n.id]);
      }
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && row.type === "error") {
      e.preventDefault();
      loadChildren(row.parent, ancestorsOf(row.parent.id));
    }
    if ((e.key === "Enter" || e.key === " ") && row.type === "more") {
      e.preventDefault();
      setShown((s) => ({ ...s, [row.parentId]: (s[row.parentId] ?? PAGE) + PAGE }));
    }
  };

  // ── Top line: select everything at the top level ──

  const pickableRoots = (roots ?? []).filter((n) => n.selectable);
  const allRoots = pickableRoots.length > 1 && !searchMode && pickableRoots.length === (roots ?? []).length;
  const rootsPicked = pickableRoots.filter((n) => picked.has(n.id)).length;
  const toggleAll = () => {
    if (rootsPicked === pickableRoots.length) onChange([]);
    else onChange(pickableRoots.map((n) => ({ id: n.id, title: n.title, kind: n.kind, path: [], include_children: true })));
  };

  const indent = (depth: number) => ({ paddingLeft: `${0.375 + depth * 1.25}rem` });

  const body = (() => {
    if (rootError && !searchMode) {
      return (
        <div className="flex flex-col items-start gap-3 p-4 text-sm text-zinc-300" data-testid="picker-error" role="alert">
          <p>{rootError}</p>
          <button type="button" className={smallSecondaryButton} onClick={loadRoots}>
            Try again
          </button>
        </div>
      );
    }
    if (searchError) {
      return (
        <p className="p-4 text-sm text-amber-300" data-testid="picker-error" role="alert">
          {searchError}
        </p>
      );
    }
    if ((!roots && !searchMode) || (searchMode && !found)) {
      return (
        <div className="space-y-1.5 p-2" aria-label="Loading" role="status">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex h-12 items-center gap-3 px-2">
              <div className="h-4 w-4 rounded bg-zinc-800/80" />
              <div className="h-5 w-5 rounded bg-zinc-800/80" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 animate-pulse rounded bg-zinc-800/80 motion-reduce:animate-none" style={{ width: `${70 - i * 9}%` }} />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-zinc-800/50 motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (!rows.length && searchMode) {
      return (
        <div className="space-y-3 p-5" data-testid="picker-empty">
          <p className="text-sm text-zinc-300">Nothing in {label} matches &quot;{q.trim()}&quot;.</p>
          <p className="text-sm text-zinc-400">Check the spelling, or share the page with Coderhelm if it isn&rsquo;t listed.</p>
        </div>
      );
    }
    if (!rows.length) {
      return (
        <div className="space-y-4 p-5" data-testid="picker-empty">
          <p className="text-sm font-medium text-zinc-100">{label} hasn&rsquo;t shared anything with Coderhelm yet.</p>
          <ShareSteps kind={kind} />
          <button type="button" className={smallSecondaryButton} onClick={loadRoots} data-testid="picker-recheck">
            Check again
          </button>
        </div>
      );
    }
    return (
      <div
        role="treegrid"
        aria-label={searchMode ? `Search results in ${label}` : label}
        aria-multiselectable="true"
        aria-rowcount={-1}
        className="py-1"
        onKeyDown={onGridKey}
        data-testid="picker-tree"
      >
        {rows.map((row) => {
          const isActive = row.key === activeKey;
          const common = {
            ref: (el: HTMLDivElement | null) => {
              if (el) rowEls.current.set(row.key, el);
              else rowEls.current.delete(row.key);
            },
            role: "row",
            tabIndex: row.type === "loading" || row.type === "empty" ? undefined : isActive ? 0 : -1,
            "aria-level": row.depth + 1,
            onFocus: () => setFocusKey(row.key),
          } as const;
          if (row.type === "loading") {
            return (
              <div key={row.key} {...common} data-testid="picker-loading">
                <div role="gridcell" className="flex min-h-9 items-center gap-2 text-xs text-zinc-400" style={indent(row.depth + 1.4)}>
                  <Spinner />
                  Opening {row.parent.title}…
                </div>
              </div>
            );
          }
          if (row.type === "empty") {
            return (
              <div key={row.key} {...common}>
                <div role="gridcell" className="flex min-h-9 items-center text-xs text-zinc-400" style={indent(row.depth + 1.4)}>
                  Nothing inside that {label} shares with Coderhelm
                </div>
              </div>
            );
          }
          if (row.type === "error") {
            return (
              <div key={row.key} {...common} className={`rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-300`} data-testid="picker-node-error">
                <div role="gridcell" className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 py-1 pr-3 text-xs text-amber-300" style={indent(row.depth + 1.4)}>
                  <span className="min-w-0">
                    Couldn&rsquo;t open {row.parent.title}. {row.message}
                  </span>
                  <button type="button" tabIndex={-1} className={smallSecondaryButton} onClick={() => loadChildren(row.parent, ancestorsOf(row.parent.id))} data-testid="picker-retry">
                    Try again
                  </button>
                </div>
              </div>
            );
          }
          if (row.type === "more") {
            return (
              <div key={row.key} {...common} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-300">
                <div role="gridcell" className="flex min-h-10 items-center" style={indent(row.depth + 1.4)}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={linkButton}
                    onClick={() => setShown((s) => ({ ...s, [row.parentId]: (s[row.parentId] ?? PAGE) + PAGE }))}
                    data-testid="picker-more"
                  >
                    Show {Math.min(PAGE, row.left)} more of {row.left}
                  </button>
                </div>
              </div>
            );
          }
          const { node } = row;
          const cover = coveredBy(row);
          const isPicked = picked.has(node.id);
          const checked = isPicked || !!cover;
          const some = !checked && partly(node, row.path);
          const canOpen = node.has_children && !searchMode;
          const isOpen = canOpen && !!open[node.id];
          const kids = children[node.id];
          const line = cover
            ? `Included with ${cover.title}`
            : searchMode && row.path.length
              ? row.path.join(" / ")
              : metaLine(node);
          const state = cover ? "covered" : isPicked ? "checked" : some ? "partial" : "unchecked";
          return (
            <div
              key={row.key}
              {...common}
              aria-expanded={canOpen ? isOpen : undefined}
              aria-selected={node.selectable ? checked : undefined}
              aria-posinset={row.pos}
              aria-setsize={row.size}
              aria-busy={isOpen && kids === "loading" ? true : undefined}
              className={`group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${isPicked ? "bg-emerald-500/[0.07]" : ""}`}
              data-testid="picker-row"
              data-id={node.id}
              data-state={state}
            >
              <div role="gridcell" className="flex min-h-12 items-center gap-1 pr-2" style={indent(row.depth)}>
                {canOpen ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setOpenTo(node, row.ancestors, !isOpen)}
                    aria-label={`${isOpen ? "Close" : "Open"} ${node.title}`}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
                    data-testid="picker-toggle"
                  >
                    {isOpen && kids === "loading" ? <Spinner /> : <Chevron open={isOpen} />}
                  </button>
                ) : (
                  <span className="w-8 shrink-0" />
                )}
                <label
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 py-1.5 ${cover ? "cursor-default" : "cursor-pointer hover:bg-zinc-800/50"}`}
                  title={node.title}
                  onClick={(e) => {
                    // The label ticks; a heading (a Sanity project) opens instead.
                    if (!node.selectable && canOpen) {
                      e.preventDefault();
                      setOpenTo(node, row.ancestors, !isOpen);
                    }
                    setFocusKey(row.key);
                  }}
                >
                  {node.selectable || cover ? (
                    <TriCheck
                      checked={checked}
                      partial={some}
                      disabled={!!cover || !node.selectable}
                      label={`Include ${node.title}`}
                      onChange={() => toggle(node, row.path)}
                    />
                  ) : (
                    <span aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                  <NodeIcon kind={node.kind} icon={node.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100" data-testid="picker-title">
                      {searchMode ? <Marked text={node.title} q={q} /> : node.title}
                    </span>
                    {line && (
                      <span className="block truncate text-xs text-zinc-400" data-testid="picker-meta">
                        {line}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    );
  })();

  // Nothing to pick from at all: the help takes the whole width.
  const nothingShared = !searchMode && !!roots && roots.length === 0 && !value.length;
  const status = searchMode
    ? searching
      ? "Searching…"
      : found
        ? `${found.length.toLocaleString()} ${found.length === 1 ? "result" : "results"}`
        : ""
    : "";

  return (
    <div
      className={`flex h-[calc(100dvh-14rem)] min-h-[22rem] flex-col gap-3 sm:h-[min(36rem,calc(84dvh-10rem))] ${nothingShared ? "" : "md:grid md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-[minmax(0,1fr)] md:gap-4"}`}
      data-testid="source-picker"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative">
          <label>
            <span className="sr-only">Search {label}</span>
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={searchBox}
              className={`${inputClass} !py-2.5 pl-9 pr-10`}
              value={q}
              onChange={(e) => typeSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && navigable.length) {
                  e.preventDefault();
                  focusRow(activeKey);
                }
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  e.stopPropagation();
                  typeSearch("");
                }
              }}
              placeholder={`Search ${label}`}
              data-testid="picker-search"
              autoComplete="off"
              aria-describedby="picker-status"
            />
          </label>
          {q && (
            <button
              type="button"
              onClick={() => {
                typeSearch("");
                searchBox.current?.focus();
              }}
              aria-label="Clear the search"
              className={`absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
              data-testid="picker-clear"
            >
              {searching ? (
                <Spinner />
              ) : (
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
            </button>
          )}
        </div>

        <div className={`mt-2 flex min-h-8 items-center justify-between gap-3 px-1 ${allRoots || status ? "" : "hidden"}`}>
          {allRoots ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300" data-testid="picker-all">
              <TriCheck checked={rootsPicked === pickableRoots.length} partial={value.length > 0} disabled={false} label={`Select everything in ${label}`} onChange={toggleAll} />
              Select all
            </label>
          ) : (
            <span />
          )}
          <span id="picker-status" className="text-xs text-zinc-400" aria-live="polite" data-testid="picker-status">
            {status}
          </span>
        </div>

        <div ref={grid} className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-800 bg-zinc-950/40 px-1">
          {body}
        </div>

        {SHARE[kind] && roots && roots.length > 0 && (
          <div className="mt-2 px-1">
            <button type="button" className={`inline-flex min-h-6 items-center rounded py-0.5 text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`} aria-expanded={helpOpen} onClick={() => setHelpOpen((o) => !o)} data-testid="picker-help">
              {kind === "github" ? "Don't see a repository?" : kind === "google_drive" ? "Don't see a folder or file?" : "Don't see a page?"}
            </button>
            {helpOpen && (
              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <ShareSteps kind={kind} />
              </div>
            )}
          </div>
        )}

        {/* On a phone the selection sits in a bar that opens a sheet. */}
        <button
          type="button"
          className={`mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 text-left text-sm md:hidden ${focusRing}`}
          onClick={() => setSheet(true)}
          disabled={!value.length}
          data-testid="picked-bar"
        >
          <span className="min-w-0 truncate text-zinc-300">
            {value.length ? (
              <>
                <span className="font-medium text-zinc-100">{value.length} selected</span>
                {estimate(value, seen.current, kind) && <span className="text-zinc-400"> · {estimate(value, seen.current, kind)}</span>}
              </>
            ) : (
              "Tick what to bring in"
            )}
          </span>
          {value.length > 0 && <span className="shrink-0 text-xs font-medium text-zinc-300 underline underline-offset-4">Review</span>}
        </button>
      </div>

      <aside className={`hidden min-h-0 flex-col ${nothingShared ? "" : "md:flex"} rounded-xl border border-zinc-800 bg-zinc-950/40`} aria-label="Selected" data-testid="picked-summary">
        <SelectedList kind={kind} value={value} seen={seen.current} onChange={onChange} />
      </aside>

      <SelectionSheet open={sheet && value.length > 0} onOpenChange={setSheet}>
        <SelectedList kind={kind} value={value} seen={seen.current} onChange={onChange} inSheet />
      </SelectionSheet>
    </div>
  );
}

// ── What is picked ───────────────────────────────────────────────────

/** "About 140 pages, 3.2 MB" from what the listing said, or null. */
function estimate(value: Selected[], seen: Map<string, Seen>, kind: SourceKind): string | null {
  if (!value.length) return null;
  let items = 0;
  let known = 0;
  let bytes = 0;
  let sized = 0;
  for (const v of value) {
    const n = seen.get(v.id)?.node;
    if (!n) continue;
    if (n.item_count != null) {
      items += n.item_count;
      known += 1;
    } else if (!n.has_children) {
      items += 1;
      known += 1;
    }
    if (n.bytes != null) {
      bytes += n.bytes;
      sized += 1;
    }
  }
  if (!known) return null;
  const noun: [string, string] = kind === "sanity" ? ["document", "documents"] : kind === "google_drive" || kind === "github" ? ["file", "files"] : ["page", "pages"];
  const words = `${known === value.length ? "About" : "At least"} ${count(items, noun)}`;
  return sized === value.length && bytes > 0 ? `${words}, ${fileSize(bytes)}` : words;
}

/** What one picked item brings in, in a few words. */
function brings(v: Selected, n: PickerNode | undefined): string {
  if (!n) return v.include_children ? "With everything inside" : "Just this one";
  const inside = insideCount(n);
  if (n.has_children && v.include_children) {
    if (inside == null) return "With everything inside";
    if (inside === 0) return n.kind === "page" ? "Just this page" : "Nothing inside yet";
    // A page counts everything inside it, not just its own subpages (the
    // row's "3 subpages"), so say "pages inside" rather than "subpages".
    if (n.kind === "page") return `${count(inside, ["page", "pages"])} inside`;
    return `Includes ${count(inside, insideNoun(n))}`;
  }
  return [typeOf(n), n.bytes != null ? fileSize(n.bytes) : ""].filter(Boolean).join(" · ");
}

function SelectedList({
  kind,
  value,
  seen,
  onChange,
  inSheet = false,
}: {
  kind: SourceKind;
  value: Selected[];
  seen: Map<string, Seen>;
  onChange: (v: Selected[]) => void;
  inSheet?: boolean;
}) {
  const est = estimate(value, seen, kind);
  const deep = value.some((v) => v.include_children) && kind !== "sanity";
  const Title = inSheet ? Dialog.Title : "h3";
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <Title className="text-sm font-medium text-zinc-100" aria-live="polite">
          {value.length ? `${value.length} selected` : "Selected"}
        </Title>
        {value.length > 0 && (
          <button type="button" className={`inline-flex min-h-6 items-center rounded py-0.5 text-xs text-zinc-300 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`} onClick={() => onChange([])} data-testid="picked-clear">
            Clear
          </button>
        )}
      </div>
      {value.length === 0 ? (
        <p className="p-4 text-sm leading-relaxed text-zinc-400">Tick what to bring in. Ticking something brings in everything inside it.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" data-testid="picked-list">
          {value.map((v) => {
            const n = seen.get(v.id)?.node;
            const where = v.path.join(" / ");
            return (
              <li key={v.id} className="flex min-w-0 items-center gap-2.5 py-1.5 pl-4 pr-2" data-testid="picked-item" data-id={v.id}>
                <NodeIcon kind={v.kind} icon={n?.icon} />
                <span className="min-w-0 flex-1" title={[...v.path, v.title].join(" / ")}>
                  <span className="block truncate text-sm text-zinc-100">{v.title}</span>
                  <span className="block truncate text-xs text-zinc-400" data-testid="picked-brings">
                    {brings(v, n)}
                  </span>
                  {where && (
                    <span className="block truncate text-xs text-zinc-400" data-testid="picked-where">
                      In {where}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.id !== v.id))}
                  aria-label={`Remove ${v.title}`}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
                  data-testid="picked-remove"
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value.length > 0 && (est || deep) && (
        <div className="shrink-0 space-y-1 border-t border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-400" data-testid="picked-estimate">
          {est && <p className="text-sm text-zinc-200">{est} in all</p>}
          {deep && <p>What&rsquo;s added inside them later comes in too.</p>}
        </div>
      )}
    </>
  );
}

/** A sheet from the bottom of a phone screen, over the dialog. */
function SelectionSheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  const layer = useModalLayer();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={layer ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-zinc-700 bg-zinc-900 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl md:hidden"
          data-testid="picked-sheet"
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-700" />
          {children}
          <div className="shrink-0 px-4 pt-2">
            <Dialog.Close className={`${buttonClass("secondary")} w-full`}>Done</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── A website ────────────────────────────────────────────────────────

function AddressPicker({ value, onChange }: { value: Selected[]; onChange: (v: Selected[]) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const term = url.trim();
    if (!term) return;
    setBusy(true);
    setError(null);
    try {
      const r = await knowledge.browse("web", null, term);
      const n = r.nodes[0];
      if (n && !value.some((v) => v.id === n.id)) {
        onChange([...value, { id: n.id, title: n.title, kind: n.kind, path: [], include_children: true }]);
      }
      setUrl("");
    } catch (e) {
      setError(errorMessage(e, "That address can't be read."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="address-picker">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Page or sitemap address</span>
          <input
            className={`${inputClass} !py-2.5`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="docs.example.com/sitemap.xml"
            inputMode="url"
            autoComplete="off"
            data-testid="address-input"
          />
        </label>
        <button type="submit" className={smallSecondaryButton + " !min-h-10 !px-4"} disabled={busy || !url.trim()}>
          {busy ? "Checking…" : "Add"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-amber-300">{error}</p>}
      <p className="mt-3 text-sm text-zinc-400">Add a single page, or a sitemap to bring in every page it lists.</p>
      {value.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800" data-testid="address-list">
          {value.map((v) => (
            <li key={v.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <NodeIcon kind={v.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-100">{v.title}</span>
                <span className="block text-xs text-zinc-400">{v.kind === "sitemap" ? "Every page in this sitemap" : "This page"}</span>
              </span>
              <button type="button" className={smallSecondaryButton} onClick={() => onChange(value.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.title}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
