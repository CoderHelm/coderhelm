"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { MAX_READERS, readerEntry, readerWords } from "@/lib/knowledge";

// "Only these people or roles": an optional list inside the read role. An
// email is one person, anything else a role (a built-in one or a custom
// role's key). Empty means everyone the read role allows.

export function ReadersEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const add = () => {
    const entry = readerEntry(draft);
    if (!entry) {
      setBad("Type an email address, or a role such as member or a custom role's key.");
      return;
    }
    if (value.length >= MAX_READERS) {
      setBad(`Up to ${MAX_READERS} people and roles.`);
      return;
    }
    setBad(null);
    setDraft("");
    if (!value.includes(entry)) onChange([...value, entry]);
  };
  return (
    <div data-testid="readers-editor">
      <span className="mb-1 block text-xs font-medium text-zinc-400">Only these people or roles (optional)</span>
      <div className="flex gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="ada@example.com or a role"
          aria-label="Add a person or role"
          data-testid="reader-input"
        />
        <button type="button" className={buttonClass("secondary", "sm")} onClick={add} data-testid="reader-add">
          Add
        </button>
      </div>
      {bad && (
        <p className="mt-1.5 text-xs text-amber-300" role="alert" data-testid="reader-bad">
          {bad}
        </p>
      )}
      {value.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Who can read it" data-testid="readers">
          {value.map((r) => (
            <li key={r} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-200" data-testid="reader">
              <span className="min-w-0 truncate">{readerWords(r)}</span>
              <button type="button" className="shrink-0 text-zinc-400 hover:text-zinc-100" aria-label={`Remove ${readerWords(r)}`} onClick={() => onChange(value.filter((x) => x !== r))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-400">Empty: everyone the setting above allows can read it.</p>
      )}
      {value.length > 0 && (
        <p className="mt-1.5 text-xs text-zinc-400">Only the people and roles listed read it, in Chat and on this page. Admins who manage knowledge still see it to manage it.</p>
      )}
    </div>
  );
}
