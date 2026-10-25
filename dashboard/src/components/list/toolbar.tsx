"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { rememberRepo } from "@/lib/recent-repos";
import { Combobox } from "../combobox";
import { repoOptions, splitRepo, useRecentRepos } from "../repo-combobox";
import { api } from "@/lib/api";
import { focusRing, linkButton } from "../ui";
import { StatusDot, type Tone } from "./status";
import { Select } from "../select";

// The one toolbar above every list: search (press / to focus), status
// toggles with counts, a repo filter once the team has more than one repo,
// an optional sort, and a slot for the page's secondary actions. Pages own
// the values (usually through `useListParams`, so they live in the address).

export interface StatusOption {
  value: string;
  label: string;
  /** Shown beside the label; omitted when unknown. */
  count?: number;
  /** A small dot in the status colour (e.g. amber for Waiting). */
  tone?: Tone;
}

export interface ListToolbarProps {
  search?: {
    value: string;
    /** Called after a short pause in typing, not on every key. */
    onChange: (value: string) => void;
    placeholder: string;
    /** Spoken name; defaults to the placeholder. */
    label?: string;
  };
  status?: {
    value: string;
    onChange: (value: string) => void;
    options: StatusOption[];
    /** Spoken name of the group, e.g. "Show runs". */
    label: string;
  };
  repo?: {
    value: string;
    onChange: (value: string) => void;
    /** Every repo the team works on; the filter shows only when there are two or more. */
    repos: string[];
  };
  sort?: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  };
  /** Secondary actions at the end of the bar (a "More" menu, a small button). */
  actions?: ReactNode;
  /** Shown as "Clear filters" while any filter is set. */
  onClear?: () => void;
  /** "Showing 3 of 40", read out when it changes. */
  summary?: ReactNode;
  className?: string;
}

export function ListToolbar({ search, status, repo, sort, actions, onClear, summary, className = "" }: ListToolbarProps) {
  const showRepo = !!repo && (repo.repos.length > 1 || !!repo.value);
  return (
    <div className={`min-w-0 ${className}`} data-testid="list-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {search && <SearchField {...search} />}
        {status && <StatusToggles {...status} />}
        {showRepo && <RepoFilter {...repo} />}
        {sort && <SortSelect {...sort} />}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {(summary || onClear) && (
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 text-xs text-zinc-500">
          {summary && <p role="status">{summary}</p>}
          {onClear && (
            <button type="button" onClick={onClear} className={`${linkButton} !text-xs`}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** True when the key press should go to the page, not to a field being typed in. */
function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

const controlBox =
  "min-h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-100 hover:border-zinc-500 transition-colors motion-reduce:transition-none";

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const sent = useRef(value);

  // A change from outside (Back, a link, Clear) replaces what is typed.
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);

  // Send after a pause in typing.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === sent.current) return;
    const t = window.setTimeout(() => {
      sent.current = trimmed;
      onChange(trimmed);
    }, 250);
    return () => window.clearTimeout(t);
  }, [text, onChange]);

  // "/" focuses the list search, as on GitHub and Linear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typingInField(e)) return;
      // Only the first list search on the page answers.
      const first = document.querySelector<HTMLInputElement>("[data-list-search]");
      if (first !== input.current) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-w-0 flex-1 basis-56">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </span>
      <input
        ref={input}
        data-list-search=""
        type="search"
        aria-label={label || placeholder}
        aria-keyshortcuts="/"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) {
            e.preventDefault();
            setText("");
          } else if (e.key === "Enter") {
            // Search now, without waiting for the pause.
            const trimmed = text.trim();
            if (trimmed !== sent.current) {
              sent.current = trimmed;
              onChange(trimmed);
            }
          }
        }}
        autoComplete="off"
        spellCheck={false}
        className={`w-full ${controlBox} bg-zinc-950 py-2 pl-9 pr-9 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none ${focusRing} [&::-webkit-search-cancel-button]:hidden`}
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            setText("");
            input.current?.focus();
          }}
          className={`absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 ${focusRing}`}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-700 px-1.5 text-xs leading-5 text-zinc-400 sm:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}

/** Mutually exclusive status choices with counts, side by side. */
export function StatusToggles({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: StatusOption[];
  label: string;
}) {
  return (
    // On a phone the toggles wrap onto a second line rather than hiding off
    // the edge of the screen.
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors motion-reduce:transition-none ${
                on ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              } ${focusRing}`}
            >
              {o.tone && !on && <StatusDot tone={o.tone} live={false} className="!h-1.5 !w-1.5" />}
              {o.label}
              {o.count !== undefined && (
                <span className={`tabular-nums text-xs ${on ? "text-zinc-600" : "text-zinc-400"}`}>{o.count}</span>
              )}
            </button>
          );
        })}
    </div>
  );
}

/** "All repos" or one repo, picked from the shared searchable picker. */
export function RepoFilter({ value, onChange, repos }: { value: string; onChange: (value: string) => void; repos: string[] }) {
  const recent = useRecentRepos();
  const { groups, recent: recentOptions } = useMemo(() => repoOptions(repos.map((name) => ({ name })), { recent }), [repos, recent]);
  const { owner, name } = splitRepo(value);
  return (
    <Combobox
      label="Repository"
      placeholder="All repos"
      searchPlaceholder="Find a repo…"
      emptyText="No repos match"
      value={value}
      valueLabel={
        value ? (
          <>
            {owner && <span className="text-zinc-500">{owner}/</span>}
            {name}
          </>
        ) : undefined
      }
      onChange={(v) => {
        if (v) rememberRepo(v);
        onChange(v);
      }}
      groups={[{ options: [{ value: "", label: "All repos" }] }, ...groups]}
      recent={recentOptions}
      testId="repo-filter"
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="8" r="2.5" />
          <path d="M6 8.5v7M18 10.5c0 4-6 3-10.5 6" />
        </svg>
      }
      triggerClassName={`inline-flex max-w-full items-center gap-2 px-3 text-left ${controlBox} ${value ? "border-zinc-500" : ""}`}
    />
  );
}

export function SortSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select aria-label="Sort" value={value} onChange={(e) => onChange(e.target.value)} className="bg-zinc-900">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** The team's repo names, read once per page load and shared by every list. */
let reposOnce: Promise<string[]> | null = null;
export function useTeamRepos(): string[] {
  const [repos, setRepos] = useState<string[]>([]);
  useEffect(() => {
    reposOnce ??= api
      .listRepos()
      .then((d) => d.repos.map((r) => r.name).sort((a, b) => a.localeCompare(b)))
      .catch(() => {
        reposOnce = null;
        return [];
      });
    let live = true;
    reposOnce.then((r) => live && setRepos(r));
    return () => {
      live = false;
    };
  }, []);
  return repos;
}
