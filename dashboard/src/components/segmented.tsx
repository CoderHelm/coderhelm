"use client";

import { focusRing } from "./ui";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A small set of mutually exclusive choices shown side by side, in the same
 * look as the list toolbar's status toggles. On a screen too narrow for the
 * row, the choices wrap onto a second line instead of hiding off the edge.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  /** Accessible name for the group, e.g. "Use of Orders API". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 align-middle">
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            // One font weight for every choice: selection changes only the
            // background and colour, so nothing changes width.
            className={`min-h-8 cursor-pointer whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors motion-reduce:transition-none disabled:cursor-default disabled:opacity-50 ${
              pressed ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            } ${focusRing} focus-visible:outline-offset-[-3px] ${pressed ? "focus-visible:outline-zinc-500" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
