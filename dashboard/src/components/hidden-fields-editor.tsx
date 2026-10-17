"use client";

import { useState } from "react";
import { XIcon } from "./icons";
import { focusRing, inputClass, secondaryButton } from "./ui";

/**
 * Editor for the list of field names hidden from the reviewer. Names are
 * matched wherever they appear, so the list is a flat set of words.
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
          A name hides every field that contains it (<code>salary</code> also hides <code>base_salary</code>). Start with = to hide only an exact name: <code>=ip</code> hides <code>ip</code> but not <code>membership</code>.
        </p>
        {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
