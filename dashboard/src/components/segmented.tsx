"use client";

import { ScrollFade } from "./scroll-fade";
import { focusRing } from "./ui";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** A small set of mutually exclusive choices shown side by side. */
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
  // A row wider than a phone scrolls sideways, with a fade on the edge that has more.
  return (
    <ScrollFade axis="x" className="inline-block max-w-full align-middle" innerClassName="[scrollbar-width:none]">
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-zinc-700">
      {options.map((option, i) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            // One font weight for every segment: selection changes only the
            // background and colour, so no segment changes width and the row
            // never shifts. The focus ring sits inside the segment, so it is
            // not clipped by the scroll strip and never covers a neighbour.
            className={`min-h-8 whitespace-nowrap px-3 py-1 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-50 ${
              i > 0 ? "border-l border-zinc-700" : ""
            } ${i === 0 ? "rounded-l-[7px]" : ""} ${i === options.length - 1 ? "rounded-r-[7px]" : ""} ${
              pressed ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            } ${focusRing} focus-visible:outline-offset-[-3px] ${pressed ? "focus-visible:outline-zinc-500" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
    </ScrollFade>
  );
}
