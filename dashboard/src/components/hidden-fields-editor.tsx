"use client";

import { useState } from "react";
import { XIcon } from "./icons";
import { focusRing, inputClass, secondaryButton } from "./ui";

/**
 * Why a hidden entry can't be saved, or "" when it is fine. Mirrors the
 * server's check: a word (two letters or digits at least), an `=exact`
 * name, or one table's column as `table.column` / `schema.table.column`.
 */
export function hiddenEntryProblem(entry: string): string {
  const e = entry.trim();
  if (!e) return "Type a name.";
  const bare = e.startsWith("=") ? e.slice(1) : e;
  if (bare.includes(".")) {
    const parts = bare.split(".").map((p) => p.trim().replace(/^"|"$/g, ""));
    const ok =
      parts.length >= 2 &&
      parts.length <= 3 &&
      parts.every((p) => p.length > 0 && /^[\p{L}\p{N}_$\- ]+$/u.test(p)) &&
      parts[parts.length - 1].replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
    return ok ? "" : `"${e}" isn't a column name. Use table.column or schema.table.column.`;
  }
  if (bare.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return `"${e}" is too short: it needs at least two letters or digits.`;
  return "";
}

/**
 * Editor for the list of names hidden from Coderhelm: words matched wherever
 * they appear, exact names, and single tables' columns.
 */
export function HiddenFieldsEditor({
  value,
  onChange,
  idPrefix,
  noun = "field",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Keeps ids unique when more than one editor is on the page. */
  idPrefix: string;
  /** What a hidden name is: "field" (an API or logs) or "column" (a database). */
  noun?: "field" | "column";
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const inputId = `${idPrefix}-hidden-add`;
  const errorId = `${inputId}-error`;

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (value.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already hidden.`);
      return;
    }
    const problem = hiddenEntryProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...value, name]);
    setDraft("");
    setError("");
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="text-sm text-amber-200">
          {noun === "column"
            ? "Nothing is hidden. Coderhelm can read every column."
            : "Nothing is hidden. The reviewer can see every field the key can read."}
        </p>
      ) : (
        <ul aria-label={`Hidden ${noun} names`} className="flex flex-wrap gap-2">
          {value.map((name) => (
            <li
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 pl-3 pr-1 text-sm text-zinc-200"
            >
              <span className="font-mono text-xs break-all">{name}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== name))}
                aria-label={`Stop hiding ${name}`}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100 ${focusRing}`}
              >
                <span aria-hidden="true" className="scale-75"><XIcon /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <label htmlFor={inputId} className="block mb-1.5 text-sm font-semibold text-zinc-100">
          Hide another {noun} name
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="For example: salary"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`${inputClass} flex-1 min-w-40 !w-auto`}
          />
          <button type="button" onClick={add} disabled={!draft.trim()} className={secondaryButton}>
            Hide it
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          A name hides every {noun} that contains it (<code>salary</code> also hides <code>base_salary</code>). Start with = to hide only an exact name: <code>=ip</code> hides <code>ip</code> but not <code>membership</code>.
          {noun === "column" ? (
            <> To hide a column in one table only, name the table: <code>person.name</code> or <code>public.person.name</code> hides <code>name</code> in that table and leaves other tables&apos; <code>name</code> alone.</>
          ) : (
            <> <code>Type.field</code> hides that field name everywhere in an API.</>
          )}
        </p>
        {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
