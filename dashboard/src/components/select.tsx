"use client";

// The one select box: pick one value from a short, known list (a role, a sort
// order, a status, a filter). A long or searchable list is a `Combobox`
// (components/combobox.tsx); a list of actions is a `Menu` (components/menu.tsx).
//
// It is drawn by the dashboard, never by the browser, so it looks the same on
// every system and can show an icon and a second line per choice:
//
// - The trigger is a button with the input's border and colours, in two sizes.
//   It is as wide as its longest choice (like a native select), so the row
//   around it does not jump when the value changes; `w-full` and friends in
//   `className` override that.
// - The list opens in the shared <PopoverContent>: portaled (into a modal's
//   box when inside one) and placed with collision handling, so it flips and
//   shrinks instead of running off the screen. On a phone it is a bottom sheet.
// - ARIA: the trigger is a select-only `combobox` (`aria-haspopup="listbox"`,
//   `aria-expanded`, `aria-controls`); the list is a `listbox` of `option`s
//   with `aria-selected`, grouped by `group`s, and the highlighted choice is
//   its `aria-activedescendant`. A `<label htmlFor>`, `aria-label` or
//   `aria-labelledby` names it, as it would a native select.
// - Keys, closed: ArrowDown, ArrowUp, Enter and Space open it; a letter opens
//   it on the first choice starting with that letter. Open: ArrowDown/ArrowUp
//   move, Home/End jump, PageUp/PageDown move ten, typing jumps to the choice
//   that starts with what was typed, Enter or Space picks, Escape and Tab
//   close without changing anything. Focus returns to the trigger.
// - `name` adds a hidden input, so a <form> posts the value as it did.

import * as Dialog from "@radix-ui/react-dialog";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { usePhone } from "@/hooks/use-phone";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { focusRing } from "./ui";

export interface SelectOption<T extends string = string> {
  value: T;
  /** The text, on the trigger and in the list. */
  label: string;
  /** A muted second line under the label, in the list only. */
  description?: string;
  /** A small icon before the label, in the list and on the trigger. */
  icon?: ReactNode;
  /** Shown but not pickable. */
  disabled?: boolean;
}

export interface SelectGroup<T extends string = string> {
  /** The heading above the group's choices. */
  group: string;
  options: readonly SelectOption<T>[];
}

export type SelectItem<T extends string = string> = SelectOption<T> | SelectGroup<T>;

const isGroup = <T extends string>(i: SelectItem<T>): i is SelectGroup<T> => "group" in i;

/** Every choice in order, groups flattened. */
export function selectOptions<T extends string>(items: readonly SelectItem<T>[]): SelectOption<T>[] {
  return items.flatMap((i) => (isGroup(i) ? [...i.options] : [i]));
}

/** The trigger's box: the input's border and colours, two sizes. */
export function selectClass(size: "sm" | "md" = "md"): string {
  const dims = size === "sm" ? "min-h-8 py-1 pl-2.5 pr-2 text-xs" : "min-h-9 py-2 pl-3 pr-2.5 text-sm";
  return `${dims} inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 text-left text-zinc-100 hover:border-zinc-500 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-zinc-500 transition-colors motion-reduce:transition-none ${focusRing}`;
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "defaultValue" | "onChange" | "children" | "type" | "name">;

export type SelectProps<T extends string> = ButtonProps & {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectItem<T>[];
  size?: "sm" | "md";
  /** Posted with a <form> through a hidden input. */
  name?: string;
  /** What the trigger says when the value is none of the choices. */
  placeholder?: string;
  required?: boolean;
  /** The bottom sheet's title on a phone (default: the control's label). */
  sheetTitle?: string;
  ref?: Ref<HTMLButtonElement>;
};

const TYPEAHEAD_MS = 600;
const optionIdOf = (base: string, i: number) => `${base}-opt-${i}`;

const Check = ({ on }: { on: boolean }) => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 ${on ? "text-zinc-200" : "invisible"}`}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Chevron = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-zinc-400">
    <path d="M6 8l4 4 4-4" />
  </svg>
);

/**
 * The words that name the trigger, for the list and the sheet's title: the
 * elements in `aria-labelledby`, or its <label>. A label that wraps the
 * trigger holds the trigger's own text too ("Run afterNo dependency"), so
 * that part is left out.
 */
function nameOf(el: HTMLButtonElement | null, labelledBy?: string): string {
  if (!el) return "";
  const from = labelledBy
    ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter((n): n is HTMLElement => !!n)
    : Array.from(el.labels ?? []).slice(0, 1);
  return from
    .map((n) => {
      const copy = n.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[role="combobox"], [aria-hidden="true"], .sr-only').forEach((x) => x.remove());
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join(" ");
}

const iconBox = "flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400 [&>svg]:h-4 [&>svg]:w-4";

export function Select<T extends string>({
  value,
  onChange,
  options: items,
  size = "md",
  name,
  placeholder = "Select…",
  required,
  sheetTitle,
  className = "",
  disabled,
  ref,
  onKeyDown,
  ...rest
}: SelectProps<T>) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<T | null>(null);
  const [title, setTitle] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const space = useRef(false);
  const base = useId();
  const listId = `${base}-list`;
  const optionId = (i: number) => optionIdOf(base, i);

  const options = useMemo(() => selectOptions(items), [items]);
  const enabled = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const current = options.find((o) => o.value === value);
  const hasIcons = options.some((o) => o.icon);

  const setTrigger = (el: HTMLButtonElement | null) => {
    trigger.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = el;
  };

  /** The enabled choice whose label starts with what was typed, searching on from `from`. */
  const match = (key: string, from: T | null): T | null => {
    const now = Date.now();
    const text = now - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key.toLowerCase() : key.toLowerCase();
    typed.current = { text, at: now };
    const i = enabled.findIndex((o) => o.value === from);
    // A fresh letter looks past the current choice, so pressing it again cycles.
    const start = text.length === 1 ? i + 1 : Math.max(i, 0);
    const order = [...enabled.slice(start), ...enabled.slice(0, start)];
    const all = text.split("").every((c) => c === text[0]);
    const hit =
      order.find((o) => o.label.toLowerCase().startsWith(text)) ??
      // "aaa" cycles through the choices starting with "a".
      (all ? order.find((o) => o.label.toLowerCase().startsWith(text[0])) : undefined);
    return hit?.value ?? null;
  };

  const show = (next: boolean, seed?: T | null) => {
    if (disabled) return;
    if (next) {
      space.current = false;
      const start = current && !current.disabled ? current.value : (enabled[0]?.value ?? null);
      setActive(seed ?? start);
      setTitle(sheetTitle ?? rest["aria-label"] ?? (nameOf(trigger.current, rest["aria-labelledby"]) || "Choose"));
    }
    setOpen(next);
  };

  const pick = (v: T) => {
    const o = options.find((x) => x.value === v);
    if (!o || o.disabled) return;
    setOpen(false);
    if (v !== value) onChange(v);
  };

  // Keep the highlighted choice in view.
  useEffect(() => {
    if (!open || active === null) return;
    const i = options.findIndex((o) => o.value === active);
    const el = i >= 0 ? document.getElementById(optionIdOf(base, i)) : null;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, options, base]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || open || disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show(true);
    } else if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      show(true, match(e.key, current?.value ?? null));
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled.length) return;
    const i = enabled.findIndex((o) => o.value === active);
    const to = (n: number) => setActive(enabled[Math.min(Math.max(n, 0), enabled.length - 1)].value);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        to(i < 0 ? 0 : i + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        to(i < 0 ? enabled.length - 1 : i - 1);
        return;
      case "Home":
        e.preventDefault();
        to(0);
        return;
      case "End":
        e.preventDefault();
        to(enabled.length - 1);
        return;
      case "PageDown":
        e.preventDefault();
        to(i + 10);
        return;
      case "PageUp":
        e.preventDefault();
        to(i - 10);
        return;
      case "Enter":
        e.preventDefault();
        if (active !== null) pick(active);
        return;
      case " ":
        e.preventDefault();
        // A space inside a typed word ("Last 7") is part of the search.
        if (Date.now() - typed.current.at < TYPEAHEAD_MS && typed.current.text) {
          const hit = match(" ", active);
          if (hit !== null) setActive(hit);
        } else {
          // Picked on key up: picking on key down would move focus to the
          // button, whose own key up would open the list again.
          space.current = true;
        }
        return;
      case "Tab":
        e.preventDefault();
        setOpen(false);
        return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const hit = match(e.key, active);
      if (hit !== null) setActive(hit);
    }
  };

  const activeIndex = active === null ? -1 : options.findIndex((o) => o.value === active);

  const row = (o: SelectOption<T>, i: number) => {
    const selected = o.value === value;
    const on = o.value === active;
    return (
      <div
        key={o.value}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        aria-disabled={o.disabled || undefined}
        data-value={o.value}
        data-active={on || undefined}
        onPointerMove={() => !o.disabled && active !== o.value && setActive(o.value)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(o.value)}
        className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm ${phone ? "min-h-11 py-2" : "min-h-8 py-1.5"} ${
          on ? "bg-zinc-800 text-zinc-100" : "text-zinc-200"
        } ${o.disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {hasIcons && <span className={iconBox}>{o.icon}</span>}
        <span className="min-w-0 flex-1">
          <span data-option-label className={`block truncate ${selected ? "font-medium" : ""}`}>{o.label}</span>
          {o.description && <span className="block text-xs text-zinc-400">{o.description}</span>}
        </span>
        <Check on={selected} />
      </div>
    );
  };

  let n = 0;
  const listbox = (
    <div
      ref={list}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-label={title}
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onKeyDown={onListKey}
      onKeyUp={(e) => {
        if (e.key !== " " || !space.current) return;
        e.preventDefault();
        space.current = false;
        if (active !== null) pick(active);
      }}
      data-testid="select-list"
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none ${phone ? "" : "max-h-80"}`}
    >
      {items.map((item, gi) => {
        if (!isGroup(item)) return row(item, n++);
        const head = `${base}-g${gi}`;
        return (
          <div key={`g:${item.group}`} role="group" aria-labelledby={head}>
            <div id={head} role="presentation" className="px-2.5 pb-1 pt-2 text-xs font-medium text-zinc-400">
              {item.group}
            </div>
            {item.options.map((o) => row(o, n++))}
          </div>
        );
      })}
    </div>
  );

  const button = (
    <button
      {...rest}
      ref={setTrigger}
      type="button"
      role="combobox"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-required={required || undefined}
      data-value={value}
      onClick={phone ? () => show(!open) : undefined}
      onKeyDown={onTriggerKey}
      className={`${selectClass(size)} ${className}`.trim()}
    >
      {/* Every label stacked in one grid cell: the widest sets the width, only the current one shows. */}
      <span className="grid min-w-0 flex-1">
        {options.map((o) => (
          <span key={o.value} aria-hidden="true" data-label={o.label} className="invisible col-start-1 row-start-1 flex h-0 items-center gap-2 overflow-hidden whitespace-nowrap after:content-[attr(data-label)]">
            {hasIcons && <span className="w-4 shrink-0" />}
          </span>
        ))}
        <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
          {hasIcons && current?.icon && <span className={iconBox}>{current.icon}</span>}
          {current ? <span className="min-w-0 truncate">{current.label}</span> : <span className="min-w-0 truncate text-zinc-400">{placeholder}</span>}
        </span>
      </span>
      <Chevron />
    </button>
  );

  const hidden = name ? <input type="hidden" name={name} value={value} /> : null;

  // One tree at every width: the trigger stays mounted when the screen
  // crosses the phone breakpoint, and only what opens changes (a popover, or
  // on a phone a bottom sheet). The trigger's own click opens the sheet.
  return (
    <>
      <Popover open={open && !phone} onOpenChange={(v) => !phone && show(v)}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        {!phone && (
          <PopoverContent
            data-testid="select-popover"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              list.current?.focus();
            }}
            className="flex w-max min-w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden"
          >
            {listbox}
          </PopoverContent>
        )}
      </Popover>
      {hidden}
      {phone && (
        <Dialog.Root open={open} onOpenChange={(v) => show(v)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[79] bg-black/60" />
            <Dialog.Content
              aria-describedby={undefined}
              data-testid="select-sheet"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                list.current?.focus();
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                trigger.current?.focus();
              }}
              className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[85dvh] flex-col rounded-t-xl border-t border-zinc-700 bg-zinc-900 pb-[env(safe-area-inset-bottom)] shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
                <Dialog.Title className="text-sm font-semibold text-zinc-100">{title}</Dialog.Title>
                <Dialog.Close className={`rounded-md px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100 ${focusRing}`}>Done</Dialog.Close>
              </div>
              {listbox}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
