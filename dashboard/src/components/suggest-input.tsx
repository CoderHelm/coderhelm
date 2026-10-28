"use client";

// A free-text input with suggestions under it: the dashboard's own version of
// <input list> + <datalist>, which the browser draws in the system's look.
// Any text is allowed; the suggestions only save typing (AWS regions).
//
// ARIA: the input is a `combobox` with `aria-autocomplete="list"`; the
// suggestions are a `listbox` and the highlighted one is its
// `aria-activedescendant`. Focus stays in the input. ArrowDown/ArrowUp open
// the list and move through it, Enter takes the highlighted suggestion,
// Escape closes it. The list shows the suggestions containing what is typed.

import { useId, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

export function SuggestInput({
  value,
  onChange,
  suggestions,
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const base = useId();
  const listId = `${base}-list`;

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    // A value that already is a suggestion shows them all, like a datalist after a pick.
    if (!q || suggestions.some((s) => s.toLowerCase() === q)) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, value]);

  const visible = open && shown.length > 0;

  const take = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  return (
    <Popover open={visible} onOpenChange={(v) => !v && setOpen(false)}>
      <PopoverAnchor asChild>
        <input
          {...rest}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={visible && active >= 0 ? `${base}-s${active}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={(e) => {
            onFocus?.(e);
            setOpen(true);
          }}
          onBlur={(e) => {
            onBlur?.(e);
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.defaultPrevented) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!visible) {
                setOpen(true);
                setActive(e.key === "ArrowDown" ? 0 : shown.length - 1);
                return;
              }
              const n = shown.length;
              setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, n - 1) : Math.max(a - 1, 0)));
            } else if (e.key === "Enter" && visible && active >= 0) {
              e.preventDefault();
              take(shown[active]);
            } else if (e.key === "Escape" && visible) {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (input.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="w-[var(--radix-popover-trigger-width)] min-w-48 max-w-[calc(100vw-1rem)] overflow-hidden"
      >
        <div id={listId} role="listbox" aria-label="Suggestions" data-testid="suggest-list" className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {shown.map((s, i) => (
            <div
              key={s}
              id={`${base}-s${i}`}
              role="option"
              aria-selected={i === active}
              onPointerMove={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => take(s)}
              className={`flex min-h-8 cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm ${i === active ? "bg-zinc-800 text-zinc-100" : "text-zinc-200"}`}
            >
              {s}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
