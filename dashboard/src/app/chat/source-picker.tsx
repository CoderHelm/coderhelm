"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { LayersIcon, XIcon } from "@/components/icons";
import { focusRing, linkButton } from "@/components/ui";
import { KNOWLEDGE_HREF } from "@/lib/routes";
import { NO_PICKS, type BrainSources, type Picks } from "@/lib/brain";

// What a question searches, inside the composer: a "Search in" button
// that opens the full list, and a chip for each source that is on (the ×
// turns it off). The kinds and the knowledge come from the server
// (`/api/brain/sources`), so a new kind of source, or knowledge synced from a
// new tool, shows up here without a change to this file.

type KindKey = Exclude<keyof Picks, "repo" | "knowledge">;
const FLAG_KINDS: KindKey[] = ["connections", "code", "memories", "data_sources", "skills"];
/** Kinds that read one repository. */
const REPO_KINDS: KindKey[] = ["code", "memories", "data_sources", "skills"];

/** How many kinds are on, for the button. */
export function picksCount(p: Picks): number {
  return (p.knowledge.length ? 1 : 0) + FLAG_KINDS.filter((k) => p[k]).length;
}

/** Whether a kind can be turned on for this team. */
export function kindAvailable(sources: BrainSources | null, key: string): boolean {
  if (!sources) return false;
  if (key === "knowledge") return sources.knowledge.length > 0;
  if (key === "connections") return sources.connections.length > 0;
  if (key === "code" || key === "memories") return sources.repos.length > 0;
  return true;
}

/** The picks a first visit starts with: all knowledge, else the code. */
export function defaultPicks(sources: BrainSources): Picks {
  if (sources.knowledge.length) return { ...NO_PICKS, knowledge: sources.knowledge.map((b) => b.id) };
  if (sources.repos.length) return { ...NO_PICKS, code: true, memories: true };
  return NO_PICKS;
}

const shortRepo = (r: string) => r.split("/").pop() || r;

export function SourcePicker({
  sources,
  value,
  onChange,
  disabled,
}: {
  sources: BrainSources | null;
  value: Picks;
  onChange: (p: Picks) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = picksCount(value);
  const kinds = sources?.kinds ?? [];
  const label = (key: string) => kinds.find((k) => k.key === key)?.label ?? key;
  const toggleBase = (id: string) =>
    onChange({ ...value, knowledge: value.knowledge.includes(id) ? value.knowledge.filter((k) => k !== id) : [...value.knowledge, id] });
  const setKind = (key: string, on: boolean) => {
    if (key === "knowledge") onChange({ ...value, knowledge: on ? (sources?.knowledge ?? []).map((b) => b.id) : [] });
    else onChange({ ...value, [key]: on });
  };
  const kindOn = (key: string) => (key === "knowledge" ? value.knowledge.length > 0 : !!value[key as KindKey]);
  const repos = sources?.repos ?? [];
  const needsRepo = repos.length > 1 && REPO_KINDS.some((k) => value[k]);
  const repo = value.repo && repos.includes(value.repo) ? value.repo : null;

  // The chips: one per knowledge source while there are few, else a count.
  const bases = (sources?.knowledge ?? []).filter((b) => value.knowledge.includes(b.id));
  const chips: { key: string; text: string; title?: string; off: () => void }[] = [];
  if (bases.length && bases.length <= 2) {
    for (const b of bases) chips.push({ key: `kb:${b.id}`, text: b.name, off: () => toggleBase(b.id) });
  } else if (bases.length) {
    chips.push({ key: "knowledge", text: `All knowledge (${bases.length})`, title: bases.map((b) => b.name).join(", "), off: () => setKind("knowledge", false) });
  }
  for (const k of FLAG_KINDS) if (value[k]) chips.push({ key: k, text: label(k), off: () => setKind(k, false) });

  return (
    // On a phone the chips stay on one line and slide sideways inside the
    // box, so the box keeps its height; wider screens wrap them.
    <div
      className="-my-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-0.5 py-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0.5 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      data-testid="source-chips"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !sources}
            data-testid="sources-button"
            aria-label={`What to search: ${n} on`}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors motion-reduce:transition-none disabled:opacity-50 ${n === 0 ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"} ${focusRing}`}
          >
            <LayersIcon />
            {n === 0 ? "Choose what to search" : "Search in"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-80 max-w-[calc(100vw-1rem)] overflow-y-auto p-1" data-testid="source-picker" aria-label="What to search">
          <p className="px-3 pt-2.5 pb-1 text-sm font-medium text-zinc-100">What to search</p>
          <p className="px-3 pb-1 text-xs text-zinc-500">Chat only looks in what is turned on.</p>
          <ul className="py-1">
            {kinds.map((k) => {
              const can = kindAvailable(sources, k.key);
              return (
                <li key={k.key} className="min-w-0">
                  <label className={`flex min-w-0 cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 hover:bg-zinc-800/70 ${can ? "" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-emerald-500"
                      checked={kindOn(k.key)}
                      disabled={!can}
                      onChange={(e) => setKind(k.key, e.target.checked)}
                      data-testid={`source-${k.key}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-100">{k.label}</span>
                      <span className="block text-xs text-zinc-500">
                        {can ? k.about : k.key === "knowledge" ? "Nothing added to Knowledge yet." : k.key === "connections" ? "No apps connected yet." : "Nothing connected yet."}
                      </span>
                    </span>
                  </label>
                  {k.key === "knowledge" && can && (
                    <ul className="mb-1 ml-9 mr-2 space-y-0.5">
                      {sources!.knowledge.map((b) => (
                        <li key={b.id} className="min-w-0">
                          <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-zinc-300 hover:bg-zinc-800/70">
                            <input type="checkbox" className="accent-emerald-500" checked={value.knowledge.includes(b.id)} onChange={() => toggleBase(b.id)} />
                            <span className="min-w-0 truncate">{b.name}</span>
                            <span className="ml-auto shrink-0 text-xs text-zinc-500">{b.ready === 1 ? "1 file" : `${b.ready} files`}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {needsRepo && (
            <fieldset className="border-t border-zinc-800 px-3 py-2">
              <legend className="sr-only">Repository</legend>
              <p className="pb-1 text-xs text-zinc-500">Which project&apos;s code and past work</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...repos].map((r) => (
                  <button
                    key={r ?? "any"}
                    type="button"
                    aria-pressed={repo === r}
                    onClick={() => onChange({ ...value, repo: r })}
                    className={`max-w-full truncate rounded-full border px-2.5 py-1 text-xs ${repo === r ? "border-zinc-300 bg-zinc-100 text-zinc-900" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"} ${focusRing}`}
                  >
                    {r ? shortRepo(r) : "Any project"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="border-t border-zinc-800 px-3 py-2">
            <Link href={KNOWLEDGE_HREF} className={`${linkButton} text-xs`}>
              Add or change files and pages
            </Link>
          </div>
        </PopoverContent>
      </Popover>
      {chips.map((c) => (
        <span
          key={c.key}
          data-testid="source-chip"
          title={c.title}
          className="inline-flex h-8 min-w-0 max-w-[12rem] shrink-0 items-center gap-1 rounded-full bg-zinc-800 pl-2.5 pr-1 text-xs text-zinc-200 sm:shrink"
        >
          <span className="min-w-0 truncate">{c.text}</span>
          <button
            type="button"
            onClick={c.off}
            disabled={disabled}
            aria-label={`Turn off ${c.text}`}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 [&_svg]:h-3 [&_svg]:w-3 ${focusRing}`}
          >
            <XIcon />
          </button>
        </span>
      ))}
      {needsRepo && repo && (
        <span className="inline-flex h-8 min-w-0 max-w-[10rem] shrink-0 items-center rounded-full border border-zinc-800 px-2.5 text-xs text-zinc-400 sm:shrink" title={repo}>
          <span className="min-w-0 truncate">in {shortRepo(repo)}</span>
        </span>
      )}
    </div>
  );
}
