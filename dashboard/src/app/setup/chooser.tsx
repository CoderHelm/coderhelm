"use client";

// The two ways to start a run, side by side wherever one starts: "Do it for
// me", the recommended one-click path, and "Review each setting", the guided
// four steps. "Do it for me" is the first and the filled one; the guided
// path stays in plain view beside it.

import Link from "next/link";
import { useId } from "react";
import { CheckIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { RunMode } from "@/lib/setup";

export const MODE_WORDS: Record<RunMode, { title: string; body: string; action: string }> = {
  auto: {
    title: "Do it for me",
    body: "Coderhelm reads each repo and turns on the recommended settings. Your own settings stay as they are. Anything that closes or merges starts as a preview. You can undo it.",
    action: "Do it for me",
  },
  guided: {
    title: "Review each setting",
    body: "Coderhelm reads each repo, then you see every recommendation next to your current value and choose Use, Keep or Edit before anything changes.",
    action: "Review each setting",
  },
};

function Recommended() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-px text-xs font-medium text-emerald-300">
      <span aria-hidden="true" className="-ml-0.5 scale-[0.6]">
        <CheckIcon />
      </span>
      Recommended
    </span>
  );
}

const cardBase = "relative flex min-w-0 flex-col rounded-lg border px-4 py-3.5 transition-colors motion-reduce:transition-none";
const cardOn = "border-zinc-300 bg-zinc-900";
const cardOff = "border-zinc-800 bg-zinc-900/30";

/** Home: two cards with their own buttons, for the repos named in `query` ("repos=not_set_up"). */
export function StartCards({ query, title, testId = "start-chooser" }: { query: string; title: string; testId?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0" data-testid={testId}>
      <h2 id={id} className="text-sm font-semibold text-zinc-100">
        {title}
      </h2>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[1.25fr_1fr]">
        <div className={`${cardBase} ${cardOn}`} data-testid="mode-auto">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-50">{MODE_WORDS.auto.title}</h3>
            <Recommended />
          </div>
          <p className="mt-1 flex-1 text-sm text-zinc-300">{MODE_WORDS.auto.body}</p>
          <div className="mt-3">
            <Link href={`/setup/run?${query}&mode=auto`} className={buttonClass("primary")} data-testid="start-auto">
              {MODE_WORDS.auto.action}
            </Link>
          </div>
        </div>
        <div className={`${cardBase} ${cardOff}`} data-testid="mode-guided">
          <h3 className="text-sm font-semibold text-zinc-100">{MODE_WORDS.guided.title}</h3>
          <p className="mt-1 flex-1 text-sm text-zinc-400">{MODE_WORDS.guided.body}</p>
          <div className="mt-3">
            <Link href={`/setup/run?${query}&mode=guided`} className={buttonClass("secondary")} data-testid="start-guided">
              {MODE_WORDS.guided.action}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The Repos step: the same two, as one radio choice. */
export function ModeRadios({ value, onChange }: { value: RunMode; onChange: (m: RunMode) => void }) {
  const name = useId();
  return (
    <fieldset className="min-w-0" data-testid="mode-choice">
      <legend className="text-sm font-semibold text-zinc-100">How to set them up</legend>
      <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-[1.25fr_1fr]">
        {(["auto", "guided"] as RunMode[]).map((m) => {
          const on = m === value;
          return (
            <label
              key={m}
              className={`${cardBase} cursor-pointer flex-row gap-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-100 ${
                on ? cardOn : `${cardOff} hover:border-zinc-700`
              }`}
              data-testid={`mode-${m}`}
            >
              <input type="radio" name={name} value={m} checked={on} onChange={() => onChange(m)} className="sr-only" />
              <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-zinc-100" : "border-zinc-600"}`}>
                {on && <span className="h-2 w-2 rounded-full bg-zinc-100" />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                  {MODE_WORDS[m].title}
                  {m === "auto" && <Recommended />}
                </span>
                <span className="mt-0.5 block text-sm text-zinc-400">{MODE_WORDS[m].body}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A repo row: the two as a pair of small buttons, "Set up for me" first. */
export function RowStart({ repo, onlyNew, label = "Set up for me" }: { repo: string; onlyNew?: boolean; label?: string }) {
  const q = `repos=${encodeURIComponent(repo)}${onlyNew ? "&only_new=1" : ""}`;
  return (
    <span className="inline-flex flex-nowrap justify-end gap-1" data-testid="row-start">
      <Link href={`/setup/run?${q}&mode=auto`} className={`${buttonClass("secondary", "sm")} whitespace-nowrap`} aria-label={`${label}: ${repo}`} data-testid="row-auto">
        {label}
      </Link>
      <Link href={`/setup/run?${q}&mode=guided`} className={`${buttonClass("ghost", "sm")} whitespace-nowrap`} aria-label={`Review each setting: ${repo}`} data-testid="row-guided">
        Review
      </Link>
    </span>
  );
}
