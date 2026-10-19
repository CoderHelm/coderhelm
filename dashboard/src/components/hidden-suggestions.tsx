"use client";

import { useEffect, useState } from "react";
import { api, type DataSource, type HiddenSuggestion } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Callout } from "./callout";
import { linkButton, secondaryButton } from "./ui";

/**
 * Columns a database's table and column names suggest hold a person's
 * details (worked out from names only, never data). Nothing is hidden until
 * an admin accepts a suggestion; a dismissed one is never suggested again.
 */
export function HiddenSuggestions({
  source,
  onChange,
}: {
  source: DataSource;
  /** Called with the source after an accepted suggestion joined its hidden list. */
  onChange: (s: DataSource) => void;
}) {
  const [items, setItems] = useState<HiddenSuggestion[] | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .getHiddenSuggestions(source.id)
      .then((r) => {
        if (!live) return;
        setItems(r.suggestions);
        setCheckedAt(r.checked_at ?? "");
      })
      .catch((e) => live && setError(errorMessage(e, "We couldn't load the suggestions.")));
    return () => {
      live = false;
    };
  }, [source.id]);

  const decide = async (body: { accept?: string[]; dismiss?: string[]; refresh?: boolean }, label: string) => {
    setBusy(label);
    setError("");
    try {
      const r = await api.decideHiddenSuggestions(source.id, body);
      setItems(r.suggestions);
      if (body.accept?.length) onChange(r.source);
      if (body.refresh) setAsked(true);
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
    } finally {
      setBusy("");
    }
  };

  return (
    <section aria-labelledby={`hs-${source.id}`} className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
      <h4 id={`hs-${source.id}`} className="text-sm font-semibold text-zinc-100">Suggested hidden fields</h4>
      <p className="text-xs text-zinc-500">
        Columns whose table and column names suggest they hold a person&apos;s details. Only names are read, never data.
        Nothing is hidden until you accept it.
      </p>
      {error && <Callout variant="error" title="Suggestions">{error}</Callout>}
      {items === null && !error && <p role="status" className="text-sm text-zinc-500">Loading suggestions…</p>}
      {items !== null && items.length === 0 && (
        <p className="text-sm text-zinc-400">
          {checkedAt ? "No suggestions right now." : "Suggestions appear after the list of tables is read."}
        </p>
      )}
      {items !== null && items.length > 0 && (
        <ul aria-label="Suggested hidden columns" className="flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.entry} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-200 break-all">{s.entry}</code>
              {s.reason && <span className="min-w-0 flex-1 text-zinc-400">{s.reason}</span>}
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide({ accept: [s.entry] }, s.entry)}
                  disabled={!!busy}
                  className={secondaryButton}
                  aria-label={`Hide ${s.entry}`}
                >
                  Hide it
                </button>
                <button
                  type="button"
                  onClick={() => decide({ dismiss: [s.entry] }, s.entry)}
                  disabled={!!busy}
                  className={linkButton}
                  aria-label={`Dismiss ${s.entry}`}
                >
                  Dismiss
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {items !== null && items.length > 1 && (
          <button
            type="button"
            onClick={() => decide({ accept: items.map((s) => s.entry) }, "all")}
            disabled={!!busy}
            className={secondaryButton}
          >
            {busy === "all" ? "Hiding…" : `Hide all ${items.length}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => decide({ refresh: true }, "refresh")}
          disabled={!!busy || asked}
          className={linkButton}
        >
          {asked ? "Checking; reopen this in a minute" : "Check the tables again"}
        </button>
      </div>
    </section>
  );
}
