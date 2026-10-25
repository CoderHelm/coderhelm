"use client";

import { useId, useMemo, useState } from "react";
import type { AwsLogGroup } from "@/lib/api";
import { formatSize } from "@/lib/data-sources";
import { focusRing, inputClass, linkButton } from "./ui";

/**
 * Choose which log groups Coderhelm may search. Searchable, with each group's
 * size so people can tell the busy ones apart. A chosen name that isn't in the
 * list (a group since deleted, or a prefix ending in *) stays chosen and shown.
 */
export function LogGroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: AwsLogGroup[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const searchId = useId();
  const listed = useMemo(() => {
    const known = new Set(groups.map((g) => g.name));
    const extra: AwsLogGroup[] = value.filter((v) => !known.has(v)).map((name) => ({ name, stored_mb: -1, retention_days: null }));
    return [...extra, ...groups];
  }, [groups, value]);
  const term = filter.trim().toLowerCase();
  const shown = term ? listed.filter((g) => g.name.toLowerCase().includes(term)) : listed;
  const chosen = new Set(value);
  const toggle = (name: string, on: boolean) =>
    onChange(on ? [...value, name] : value.filter((v) => v !== name));
  const allShownChosen = shown.length > 0 && shown.every((g) => chosen.has(g.name));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={searchId} className="block mb-1.5 text-sm font-semibold text-zinc-100">Find a log group</label>
        <input
          id={searchId}
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="For example: api"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-live="polite" className="text-zinc-400">
          {value.length === 0 ? "None chosen yet." : `${value.length} chosen.`}
          {term && ` ${shown.length} match${shown.length === 1 ? "" : "es"}.`}
        </p>
        {shown.length > 0 && (
          <button
            type="button"
            className={linkButton}
            onClick={() =>
              allShownChosen
                ? onChange(value.filter((v) => !shown.some((g) => g.name === v)))
                : onChange(Array.from(new Set([...value, ...shown.map((g) => g.name)])))
            }
          >
            {allShownChosen ? (term ? "Clear these" : "Clear all") : term ? "Choose these" : "Choose all"}
          </button>
        )}
      </div>
      <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <legend className="sr-only">Log groups Coderhelm may search</legend>
        {shown.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">
            {listed.length === 0 ? "This account has no log groups in this region." : "No log group matches that."}
          </p>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y divide-zinc-800">
            {shown.map((g) => (
              <li key={g.name}>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={chosen.has(g.name)}
                    onChange={(e) => toggle(g.name, e.target.checked)}
                    className={`h-4 w-4 shrink-0 accent-white ${focusRing}`}
                  />
                  <span className="min-w-0 flex-1 wrap-anywhere font-mono text-xs text-zinc-200">{g.name}</span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {g.stored_mb < 0 ? (g.name.endsWith("*") ? "every group starting with this" : "not found now") : formatSize(g.stored_mb)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
