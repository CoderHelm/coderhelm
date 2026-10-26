"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inputClass, focusRing, smallSecondaryButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { KIND_LABEL, knowledge, type PickerNode, type Selected, type SourceKind, type Via } from "@/lib/knowledge";

// Picking what to bring in from an app: a tree that opens one level at a
// time, with a search box. Ticking something takes everything inside it,
// including what is added there later. A website takes addresses instead.

interface Row {
  node: PickerNode;
  depth: number;
  /** Titles above it. */
  path: string[];
  /** Ids above it. */
  ancestors: string[];
}

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

function NodeIcon({ kind }: { kind: string }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={KIND_ICON[kind] ?? KIND_ICON.page} />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

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

function TreePicker({ kind, value, onChange, via }: { kind: SourceKind; value: Selected[]; onChange: (v: Selected[]) => void; via: Via }) {
  const [roots, setRoots] = useState<PickerNode[] | null>(null);
  const [children, setChildren] = useState<Record<string, PickerNode[] | "loading" | { error: string }>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PickerNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = KIND_LABEL[kind];

  const loadRoots = useCallback(() => {
    setError(null);
    knowledge
      .browse(kind, null, "", via)
      .then((r) => setRoots(r.nodes))
      .catch((e) => setError(errorMessage(e, `Couldn't open ${label}.`)));
  }, [kind, label, via]);
  useEffect(loadRoots, [loadRoots]);

  // Search as you type, a moment after the last key.
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setFound(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      knowledge
        .browse(kind, null, term, via)
        .then((r) => mine === seq.current && setFound(r.nodes))
        .catch((e) => mine === seq.current && setError(errorMessage(e, "The search didn't work. Try again.")));
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind, via]);

  const toggleOpen = (n: PickerNode) => {
    const next = !open[n.id];
    setOpen((o) => ({ ...o, [n.id]: next }));
    if (next && !children[n.id]) {
      setChildren((c) => ({ ...c, [n.id]: "loading" }));
      knowledge
        .browse(kind, n.id, "", via)
        .then((r) => setChildren((c) => ({ ...c, [n.id]: r.nodes })))
        .catch((e) => setChildren((c) => ({ ...c, [n.id]: { error: errorMessage(e, "Couldn't open this.") } })));
    }
  };

  const picked = useMemo(() => new Set(value.map((v) => v.id)), [value]);
  const deepPicked = useMemo(() => new Set(value.filter((v) => v.include_children).map((v) => v.id)), [value]);

  const toggle = (row: Row) => {
    const { node } = row;
    if (picked.has(node.id)) {
      onChange(value.filter((v) => v.id !== node.id));
      return;
    }
    // Picking a parent covers what was picked inside it.
    const rest = value.filter((v) => !rowsUnder(node.id).has(v.id));
    onChange([...rest, { id: node.id, title: node.title, kind: node.kind, path: row.path, include_children: true }]);
  };

  // Ids loaded under a node (to tidy the selection when a parent is picked).
  const rowsUnder = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (pid: string) => {
      const kids = children[pid];
      if (!Array.isArray(kids)) return;
      for (const k of kids) {
        out.add(k.id);
        walk(k.id);
      }
    };
    walk(id);
    return out;
  };

  const rows: Row[] = [];
  const addRows = (nodes: PickerNode[], depth: number, path: string[], ancestors: string[]) => {
    for (const n of nodes) {
      rows.push({ node: n, depth, path, ancestors });
      const kids = children[n.id];
      if (open[n.id] && Array.isArray(kids)) addRows(kids, depth + 1, [...path, n.title], [...ancestors, n.id]);
    }
  };
  if (found) addRows(found, 0, [], []);
  else if (roots) addRows(roots, 0, [], []);

  return (
    <div className="flex min-h-0 flex-col" data-testid="source-picker">
      <label className="relative block">
        <span className="sr-only">Search {label}</span>
        <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          className={`${inputClass} !py-2.5 pl-9`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${label}`}
          data-testid="picker-search"
          autoComplete="off"
        />
      </label>
      <div className="mt-3 min-h-[14rem] rounded-xl border border-zinc-800 bg-zinc-950/40" role="group" aria-label={`${label} pages`}>
        {error ? (
          <div className="flex flex-col items-start gap-3 p-4 text-sm text-zinc-300" data-testid="picker-error">
            <p>{error}</p>
            <button type="button" className={smallSecondaryButton} onClick={loadRoots}>
              Try again
            </button>
          </div>
        ) : !roots && !found ? (
          <div className="space-y-2 p-4" aria-label="Loading" role="status">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-zinc-800/60 motion-reduce:animate-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-zinc-400" data-testid="picker-empty">
            {found ? `Nothing in ${label} matches "${q.trim()}".` : `${label} hasn't shared any pages with Coderhelm yet.`}
          </p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto overscroll-contain py-1.5" data-testid="picker-tree">
            {rows.map((row) => {
              const { node } = row;
              const covered = row.ancestors.some((a) => deepPicked.has(a));
              const checked = picked.has(node.id) || covered;
              const kids = children[node.id];
              return (
                <li key={`${row.ancestors.join("/")}/${node.id}`} data-testid="picker-row" data-id={node.id}>
                  <div className="flex min-h-10 items-center gap-1 pr-3" style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}>
                    {node.has_children && !found ? (
                      <button
                        type="button"
                        onClick={() => toggleOpen(node)}
                        aria-expanded={!!open[node.id]}
                        aria-label={`${open[node.id] ? "Close" : "Open"} ${node.title}`}
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 ${focusRing}`}
                      >
                        <Chevron open={!!open[node.id]} />
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                    <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-zinc-800/50 ${covered ? "cursor-default" : ""}`}>
                      {node.selectable || covered ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-emerald-500"
                          checked={checked}
                          disabled={covered || !node.selectable}
                          onChange={() => toggle(row)}
                          data-testid="picker-check"
                        />
                      ) : (
                        // A heading (a Sanity project) opens; what is inside it is picked.
                        <span aria-hidden="true" className="h-4 w-4 shrink-0" />
                      )}
                      <NodeIcon kind={node.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-100">{node.title}</span>
                        {(node.detail || covered) && (
                          <span className="block truncate text-xs text-zinc-500">{covered ? "Included with the page above" : node.detail}</span>
                        )}
                      </span>
                    </label>
                  </div>
                  {open[node.id] && kids === "loading" && <p className="py-1.5 text-xs text-zinc-500" style={{ paddingLeft: `${3.5 + row.depth * 1.25}rem` }}>Opening…</p>}
                  {open[node.id] && kids && typeof kids === "object" && !Array.isArray(kids) && (
                    <p className="py-1.5 text-xs text-amber-300" style={{ paddingLeft: `${3.5 + row.depth * 1.25}rem` }}>{kids.error}</p>
                  )}
                  {open[node.id] && Array.isArray(kids) && kids.length === 0 && (
                    <p className="py-1.5 text-xs text-zinc-500" style={{ paddingLeft: `${3.5 + row.depth * 1.25}rem` }}>Nothing inside</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <PickedSummary value={value} kind={kind} />
    </div>
  );
}

function PickedSummary({ value, kind }: { value: Selected[]; kind: SourceKind }) {
  if (!value.length) {
    return <p className="mt-3 text-sm text-zinc-500">Tick what to bring in. Ticking something includes everything inside it.</p>;
  }
  const deep = value.some((v) => v.include_children);
  return (
    <p className="mt-3 text-sm text-zinc-300" data-testid="picked-summary" aria-live="polite">
      <span className="font-medium text-zinc-100">{value.length} selected</span>
      {deep && kind !== "sanity" ? ", with everything inside them, including what's added later." : "."}
    </p>
  );
}

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
      <p className="mt-3 text-sm text-zinc-500">Add a single page, or a sitemap to bring in every page it lists.</p>
      {value.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800" data-testid="address-list">
          {value.map((v) => (
            <li key={v.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <NodeIcon kind={v.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-100">{v.title}</span>
                <span className="block text-xs text-zinc-500">{v.kind === "sitemap" ? "Every page in this sitemap" : "This page"}</span>
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
