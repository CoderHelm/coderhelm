"use client";

// Pieces the Setup pages share: the repo state pill, the Detected / Inferred
// / Default tag with its evidence, and a value said in words.

import { Chip, StatusDot } from "@/components/list";
import { ExternalLinkIcon } from "@/components/icons";
import { Code } from "@/components/settings";
import { linkButton } from "@/components/ui";
import { REPO_STATE_LOOK, RUN_STATE_LOOK, SOURCE_LOOK, valueWords, type Evidence, type RepoState, type RunState, type Source, type Value } from "@/lib/setup";

export function RepoStatePill({ state }: { state: RepoState }) {
  const look = REPO_STATE_LOOK[state] ?? REPO_STATE_LOOK.not_set_up;
  return (
    <span title={look.hover} data-testid="repo-state" data-state={state} className="inline-flex">
      <Chip tone={look.tone} title={look.hover}>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone={look.tone} live={state === "analyzing"} />
          {look.label}
        </span>
      </Chip>
    </span>
  );
}

export function RunStatePill({ state }: { state: RunState }) {
  const look = RUN_STATE_LOOK[state] ?? RUN_STATE_LOOK.done;
  return (
    <span data-testid="run-state" data-state={state} className="inline-flex">
      <Chip tone={look.tone}>{look.label}</Chip>
    </span>
  );
}

export function SourceTag({ source }: { source: Source }) {
  const look = SOURCE_LOOK[source] ?? SOURCE_LOOK.default;
  return (
    <span
      title={look.hover}
      data-testid="source-tag"
      data-source={source}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-xs font-medium leading-4 ${look.className}`}
    >
      {look.label}
    </span>
  );
}

/** Where a recommendation came from: one line each, with the file it read when there is one. */
export function EvidenceList({ evidence, className = "" }: { evidence: Evidence[]; className?: string }) {
  if (!evidence.length) return null;
  return (
    <ul className={`min-w-0 space-y-1 text-sm text-zinc-400 ${className}`.trim()} data-testid="evidence">
      {evidence.map((e, i) => (
        <li key={i} className="min-w-0 [overflow-wrap:anywhere]">
          {e.text}
          {(e.file || e.url) && <> <EvidenceLink e={e} /></>}
        </li>
      ))}
    </ul>
  );
}

function EvidenceLink({ e }: { e: Evidence }) {
  const where = e.file ? `${e.file}${e.line ? `:${e.line}` : ""}` : null;
  if (e.url) {
    return (
      <a href={e.url} target="_blank" rel="noreferrer" className={`${linkButton} !inline !text-sm gap-1`} data-testid="evidence-link">
        {where ? <span className="font-mono text-xs">{where}</span> : "See it"}
        <span aria-hidden="true" className="ml-1 inline-flex align-[-2px]">
          <ExternalLinkIcon />
        </span>
        <span className="sr-only"> (opens GitHub)</span>
      </a>
    );
  }
  return where ? <Code>{where}</Code> : null;
}

/** A value in words, with "Not set" in a quieter voice. */
export function ValueText({ value, set = true, strong = false }: { value: Value; set?: boolean; strong?: boolean }) {
  const words = valueWords(value, set);
  const quiet = words === "Not set" || words === "Empty" || words === "None";
  return (
    <span className={`[overflow-wrap:anywhere] ${quiet ? "italic text-zinc-400" : strong ? "font-medium text-zinc-50" : "text-zinc-200"}`}>{words}</span>
  );
}
