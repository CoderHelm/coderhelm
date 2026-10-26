"use client";

import { useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Short hint on the right, e.g. a shortcut. */
  hint?: string;
  /** A line under the label, e.g. why it is disabled. */
  note?: string;
  disabled?: boolean;
  /** Red text, for "Forget" and other destructive choices. */
  danger?: boolean;
}

/**
 * The one action menu: a button that opens a list of actions in the shared
 * popover (portaled, flips when there is no room, never clipped by a card).
 * Arrow keys, Home and End move between items, Enter or Space picks, Escape
 * and Tab close, and focus returns to the button.
 */
export function Menu({
  trigger,
  label,
  items,
  align = "end",
  width = "w-60",
}: {
  /** The button; it gets `aria-haspopup="menu"` and `aria-expanded`. */
  trigger: ReactElement;
  /** Spoken name of the menu. */
  label: string;
  items: MenuAction[];
  align?: "start" | "end";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  // Set when an item was picked: its action may open a dialog, which must
  // keep focus; the menu only takes focus back to its button if nothing did.
  const picked = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const enabled = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
  const onKey = (e: KeyboardEvent) => {
    const els = enabled();
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % els.length;
    else if (e.key === "ArrowUp") next = (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = els.length - 1;
    else if (e.key === "Tab") return setOpen(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: the next item starting with that letter.
      const k = e.key.toLowerCase();
      const order = [...els.slice(i + 1), ...els.slice(0, i + 1)];
      const hit = order.find((el) => el.textContent?.trim().toLowerCase().startsWith(k));
      if (hit) next = els.indexOf(hit);
    }
    if (next >= 0) {
      e.preventDefault();
      els[next].focus();
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(v);
      }}
    >
      <PopoverTrigger asChild aria-haspopup="menu">
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          enabled()[0]?.focus();
        }}
        onCloseAutoFocus={(e) => {
          if (!picked.current) return;
          picked.current = false;
          e.preventDefault();
          const back = opener.current;
          window.setTimeout(() => {
            const a = document.activeElement;
            if (back?.isConnected && (!a || a === document.body)) back.focus();
          }, 0);
        }}
        className={`${width} max-w-[calc(100vw-1rem)] overflow-y-auto py-1`}
      >
        <div ref={list} role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                picked.current = true;
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${item.danger ? "text-red-300" : "text-zinc-200"} hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="min-w-0">
                {item.label}
                {item.note && <span className="mt-0.5 block text-xs text-zinc-400">{item.note}</span>}
              </span>
              {item.hint && <span className="shrink-0 text-xs text-zinc-400">{item.hint}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
