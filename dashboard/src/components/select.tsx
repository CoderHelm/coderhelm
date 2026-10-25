import type { SelectHTMLAttributes } from "react";
import { focusRing } from "./ui";

/**
 * The one select box: the input's border and colours, two sizes. The arrow
 * comes from globals.css, so every select draws the same one.
 */
export function selectClass(size: "sm" | "md" = "md"): string {
  const dims = size === "sm" ? "min-h-8 py-1 pl-2.5 text-xs" : "min-h-9 py-2 pl-3 text-sm";
  return `${dims} max-w-full rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 hover:border-zinc-500 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors motion-reduce:transition-none ${focusRing}`;
}

/**
 * A native select in the shared look. Use it for any short, known list of
 * values (a role, a sort order, a status); a long or searchable list is a
 * `Combobox` (components/combobox.tsx).
 */
export function Select({
  size = "md",
  className = "",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md" }) {
  return <select {...props} className={`${selectClass(size)} ${className}`.trim()} />;
}
