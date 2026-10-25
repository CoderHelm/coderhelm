"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { focusRing, inputClass, linkButton, smallSecondaryButton, primaryButton } from "@/components/ui";
import type { BrainSources, Picks } from "@/lib/brain";

// Which sources a question may read. The kinds come from the server
// (`/api/brain/sources`), so a new kind of source shows up here without a
// change to this page.

/** How many kinds are on, for the button. */
export function picksCount(p: Picks): number {
  return (p.knowledge.length ? 1 : 0) + (["connections", "code", "memories", "data_sources", "skills"] as const).filter((k) => p[k]).length;
}

export function SourcePicker({
  sources,
  value,
  onChange,
  disabled,
}: {
  sources: BrainSources | null;
  value: Picks;
  onChange: (p: Picks) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = picksCount(value);
  const toggleBase = (id: string) =>
    onChange({ ...value, knowledge: value.knowledge.includes(id) ? value.knowledge.filter((k) => k !== id) : [...value.knowledge, id] });
  const setKind = (key: string, on: boolean) => {
    if (key === "knowledge") {
      onChange({ ...value, knowledge: on ? (sources?.knowledge ?? []).map((b) => b.id) : [] });
    } else {
      onChange({ ...value, [key]: on });
    }
  };
  const kindOn = (key: string) => (key === "knowledge" ? value.knowledge.length > 0 : !!value[key as keyof Picks]);
  const available = (key: string) => {
    if (!sources) return false;
    if (key === "knowledge") return sources.knowledge.length > 0;
    if (key === "connections") return sources.connections.length > 0;
    if (key === "code" || key === "memories") return sources.repos.length > 0;
    return true;
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || !sources}
        className={smallSecondaryButton}
        data-testid="sources-button"
        aria-label={`Sources: ${n} on`}
      >
        Sources · {n}
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Sources for this question" description="The brain answers only from what you turn on here.">
        <div className="space-y-4" data-testid="source-picker">
          {(sources?.kinds ?? []).map((k) => {
            const can = available(k.key);
            return (
              <fieldset key={k.key} className="min-w-0">
                <label className={`flex min-w-0 items-start gap-2.5 ${can ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-emerald-500"
                    checked={kindOn(k.key)}
                    disabled={!can}
                    onChange={(e) => setKind(k.key, e.target.checked)}
                    data-testid={`source-${k.key}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-100">{k.label}</span>
                    <span className="block text-xs text-zinc-500">
                      {can ? k.about : k.key === "knowledge" ? "No knowledge bases yet." : k.key === "connections" ? "No connections set up." : "Nothing connected yet."}
                    </span>
                  </span>
                </label>
                {k.key === "knowledge" && can && (
                  <ul className="mt-2 ml-6 space-y-1">
                    {sources!.knowledge.map((b) => (
                      <li key={b.id} className="min-w-0">
                        <label className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
                          <input type="checkbox" className="accent-emerald-500" checked={value.knowledge.includes(b.id)} onChange={() => toggleBase(b.id)} />
                          <span className="min-w-0 truncate">{b.name}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{b.ready} files</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            );
          })}
          {sources && sources.repos.length > 1 && (value.code || value.memories || value.data_sources || value.skills) && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Repository</span>
              <select
                className={inputClass}
                value={value.repo ?? ""}
                onChange={(e) => onChange({ ...value, repo: e.target.value || null })}
              >
                <option value="">Any (first repository)</option>
                {sources.repos.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Link href="/brain/knowledge" className={linkButton}>
              Manage knowledge bases
            </Link>
            <button type="button" onClick={() => setOpen(false)} className={`${primaryButton} ${focusRing}`}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
