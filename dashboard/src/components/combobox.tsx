"use client";

// The one searchable picker (repos, PRs, anything with more than a handful of
// choices). Built the way Linear's, Vercel's and GitHub's pickers are:
//
// - The trigger looks like any other input (`text-sm`, same height).
// - The list opens in the shared <PopoverContent>: portaled and placed with
//   collision handling, so a modal or card edge never clips it. On a phone it
//   is a bottom sheet instead.
// - The search box is the first thing in it and has focus. Matching is fuzzy
//   (cmdk's scorer) over the label, the muted part and any keywords.
// - cmdk gives the ARIA combobox / listbox / option semantics and the
//   arrow, Enter, Home and End keys; Escape closes and focus returns to the
//   trigger. Typing a letter on the closed trigger opens it with that letter
//   already searched.
// - A "Recent" group leads while the search box is empty.

import * as Dialog from "@radix-ui/react-dialog";
import { Command, defaultFilter } from "cmdk";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { usePhone } from "@/hooks/use-phone";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { focusRing } from "./ui";

export interface ComboOption {
  value: string;
  /** The main text, normal weight. */
  label: string;
  /** Muted text after the label (a repo's owner). */
  sub?: string;
  /** A small note on the right ("3 open", "web"). */
  hint?: ReactNode;
  /** More words it is found by. */
  keywords?: string[];
  /** Tooltip; defaults to the label and sub. */
  title?: string;
}

export interface ComboGroup {
  /** Shown above the group; leave out for an unnamed group. */
  heading?: string;
  options: ComboOption[];
}

/** An input-sized trigger. */
export const comboTriggerClass =
  "flex w-full min-h-9 items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-100 transition-colors motion-reduce:transition-none hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50";

const GROUP =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500";

/** Fuzzy score of an option for a search (cmdk's scorer over its label, muted part, value and keywords); 0 = no match. */
function score(o: ComboOption, search: string): number {
  return defaultFilter([o.label, o.sub ?? "", o.value, ...(o.keywords ?? [])].join(" "), search);
}

export function Combobox({
  id,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches",
  value,
  valueLabel,
  onChange,
  groups,
  recent = [],
  loading = false,
  disabled = false,
  icon,
  className = "",
  triggerClassName = comboTriggerClass,
  testId,
}: {
  id?: string;
  /** Spoken name of the picker, and the bottom sheet's title on a phone. */
  label: string;
  /** What the trigger says while nothing is picked. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  value: string;
  /** What the trigger shows for the current value (default: its option's label). */
  valueLabel?: ReactNode;
  onChange: (value: string) => void;
  groups: ComboGroup[];
  /** Shown first, under "Recent", while nothing is typed. */
  recent?: ComboOption[];
  loading?: boolean;
  disabled?: boolean;
  /** A small icon before the trigger text. */
  icon?: ReactNode;
  /** Classes on the wrapper (spacing, width). */
  className?: string;
  triggerClassName?: string;
  testId?: string;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const all = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const current = all.find((o) => o.value === value) ?? recent.find((o) => o.value === value);

  const show = (next: boolean, seed = "") => {
    if (disabled) return;
    setSearch(seed);
    if (next) {
      const gi = groups.findIndex((g) => g.options.some((o) => o.value === value));
      setActive(gi >= 0 && !seed ? `${gi}:${value}` : "");
    }
    setOpen(next);
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  // Filtered and ranked here rather than by cmdk, so clearing the search
  // brings back the original order (cmdk leaves rows in the last search's).
  const needle = search.trim();
  const showRecent = !needle && recent.length > 0;
  const shown = useMemo(
    () =>
      needle
        ? groups.map((g) => ({
            ...g,
            options: g.options
              .map((o) => ({ o, s: score(o, needle) }))
              .filter((x) => x.s > 0)
              .sort((a, b) => b.s - a.s)
              .map((x) => x.o),
          }))
        : groups,
    [groups, needle],
  );

  const row = (o: ComboOption, key: string) => (
    <Command.Item
      key={key}
      value={key}
      onSelect={() => pick(o.value)}
      title={o.title ?? (o.sub ? `${o.label} · ${o.sub}` : o.label)}
      data-testid="combo-option"
      data-option={o.value}
      aria-label={o.title ?? (o.sub ? `${o.label} · ${o.sub}` : o.label)}
      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-zinc-200 data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100 sm:min-h-8"
    >
      <span className="min-w-0 truncate">{o.label}</span>
      {o.sub && <span className="min-w-0 shrink truncate text-xs text-zinc-500">{o.sub}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {o.hint && <span className="text-xs text-zinc-500">{o.hint}</span>}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={o.value === value ? "text-zinc-300" : "invisible"}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </Command.Item>
  );

  const list = (
    <Command
      label={label}
      shouldFilter={false}
      value={active}
      onValueChange={setActive}
      loop
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0 border-b border-zinc-800 p-1.5">
        <Command.Input
          ref={input}
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder.replace(/…$/, "")}
          data-testid="combo-search"
          className="w-full rounded-md bg-transparent px-2 py-1.5 text-base text-zinc-100 placeholder-zinc-500 outline-none sm:text-sm"
        />
      </div>
      <Command.List id={listId} data-testid="combo-list" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 sm:max-h-80 ${GROUP}`}>
        {loading && (
          <Command.Loading>
            <p className="px-2.5 py-2 text-sm text-zinc-500">Loading…</p>
          </Command.Loading>
        )}
        {!loading && (
          <Command.Empty className="px-2.5 py-2 text-sm text-zinc-500">
            {search.trim() ? `${emptyText} “${search.trim()}”` : emptyText}
          </Command.Empty>
        )}
        {showRecent && (
          <Command.Group heading="Recent" data-testid="combo-recent">
            {recent.map((o) => row(o, `recent:${o.value}`))}
          </Command.Group>
        )}
        {shown.map((g, gi) =>
          g.options.length ? (
            <Command.Group key={g.heading ?? gi} heading={g.heading} data-testid="combo-group">
              {g.options.map((o) => row(o, `${gi}:${o.value}`))}
            </Command.Group>
          ) : null,
        )}
      </Command.List>
    </Command>
  );

  const button = (
    <button
      ref={trigger}
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-testid={testId}
      title={current ? (current.sub ? `${current.label} · ${current.sub}` : current.label) : undefined}
      onClick={phone ? () => show(!open) : undefined}
      onKeyDown={(e) => {
        if (open) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          show(true);
        } else if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          show(true, e.key);
        }
      }}
      className={`${triggerClassName} ${focusRing}`}
    >
      {icon && <span aria-hidden="true" className="shrink-0 text-zinc-500">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">{label}: </span>
        {value && (valueLabel ?? current?.label) ? (valueLabel ?? current?.label) : <span className="text-zinc-500">{placeholder}</span>}
      </span>
      <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    </button>
  );

  if (phone) {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        {button}
        <Dialog.Root open={open} onOpenChange={(v) => show(v)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[79] bg-black/60" />
            <Dialog.Content
              aria-describedby={undefined}
              data-testid="combo-sheet"
              onOpenAutoFocus={(e) => {
                // The search box, not the Done button.
                e.preventDefault();
                input.current?.focus();
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                trigger.current?.focus();
              }}
              className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[85dvh] flex-col rounded-t-xl border-t border-zinc-700 bg-zinc-900 pb-[env(safe-area-inset-bottom)] shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
                <Dialog.Title className="text-sm font-semibold text-zinc-100">{label}</Dialog.Title>
                <Dialog.Close className={`rounded-md px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100 ${focusRing}`}>Done</Dialog.Close>
              </div>
              {list}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <Popover open={open} onOpenChange={(v) => show(v)}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent
          data-testid="combo-popover"
          className="flex w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden"
        >
          {list}
        </PopoverContent>
      </Popover>
    </div>
  );
}
