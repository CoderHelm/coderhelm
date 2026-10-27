"use client";

import { useState } from "react";
import Link from "next/link";
import { type Repo, type RepoResolution } from "@/lib/api";
import { RepoCombobox, splitRepo } from "./repo-combobox";
import { focusRing, linkButton } from "./ui";
import { Code } from "./settings/code";

// The repo a log group's (or alarm's) code lives in, as Coderhelm worked it
// out: shown as a choice already made, with the reason in small text and a
// Change link. When Coderhelm isn't sure, its best guess is preselected, the
// row says "Check this" and the other likely repos are one press away.

/** The repo Coderhelm would preselect, if any. */
export function resolvedChoice(r: RepoResolution | null): string {
  return r?.repo ?? "";
}

/** Sure enough to act on without a person. */
export function isSure(r: RepoResolution | null): boolean {
  return !!r?.repo && r.confidence === "high";
}

function RepoName({ full }: { full: string }) {
  const { owner, name } = splitRepo(full);
  return (
    <span className="min-w-0 break-words">
      {owner && <span className="text-zinc-500">{owner}/</span>}
      <span className="font-medium text-zinc-100">{name}</span>
    </span>
  );
}

function Permissions({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <p className="mt-1.5 text-xs text-zinc-400" data-testid="resolved-repo-permissions">
      Coderhelm&apos;s AWS role couldn&apos;t read{" "}
      {list.slice(0, 4).map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <Code>{p}</Code>
        </span>
      ))}
      , so it worked with what it could read. An admin can add {list.length === 1 ? "it" : "them"} in one click.{" "}
      <Link href="/settings/integrations/aws" className={`${linkButton} !text-xs`}>
        Update permissions
      </Link>
    </p>
  );
}

export function ResolvedRepo({
  id,
  label,
  resolution,
  loading,
  repos,
  selected,
  onSelect,
}: {
  id: string;
  /** Spoken name of the picker. */
  label: string;
  resolution: RepoResolution | null;
  loading: boolean;
  repos: Pick<Repo, "name" | "role">[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const r = resolution;
  const resolved = !!r?.repo && !loading;
  // A person chose something else: their choice, with the picker open.
  const own = resolved && selected !== "" && selected !== r!.repo && !r!.candidates.some((c) => c.repo === selected);

  if (loading) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5" data-testid="resolved-repo" data-state="loading">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-400" role="status">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-zinc-500" />
          Working out which repo this code lives in…
        </div>
      </div>
    );
  }

  if (!resolved || picking || own) {
    return (
      <div className="flex min-w-0 flex-col gap-1" data-testid="resolved-repo" data-state={resolved ? "changing" : "none"}>
        <RepoCombobox id={id} repos={repos} selected={selected} onSelect={onSelect} label={label} className="" />
        {!resolved && (
          <p className="text-xs text-zinc-400">
            {r?.reason && r.confidence === "none" ? `${r.reason} ` : ""}Choose the repo this code lives in.
          </p>
        )}
        {resolved && (
          <button
            type="button"
            className={`${linkButton} self-start !text-xs`}
            onClick={() => {
              setPicking(false);
              onSelect(r!.repo!);
            }}
          >
            Use Coderhelm&apos;s choice ({splitRepo(r!.repo!).name})
          </button>
        )}
        <Permissions list={r?.permissions ?? []} />
      </div>
    );
  }

  const sure = r!.confidence === "high";
  const choice = selected || r!.repo!;
  const others = r!.candidates.filter((c) => c.repo !== choice).slice(0, 2);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="resolved-repo" data-state={sure ? "sure" : "check"}>
      <div
        className={`min-w-0 rounded-lg border px-3 py-2.5 ${sure ? "border-zinc-800 bg-zinc-950" : "border-amber-500/40 bg-amber-500/5"}`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 text-sm" data-testid="resolved-repo-name">
            <RepoName full={choice} />
          </span>
          {!sure && (
            <span className="rounded-md border border-amber-500/40 px-1.5 py-0.5 text-xs font-medium text-amber-300">
              Check this
            </span>
          )}
          <button
            type="button"
            className={`${linkButton} ml-auto !text-xs`}
            onClick={() => setPicking(true)}
            aria-label={`Change the repo (now ${choice})`}
            data-testid="resolved-repo-change"
          >
            Change
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400" data-testid="resolved-repo-reason">
          {choice === r!.repo ? r!.source === "saved" ? "Saved for this log group." : r!.reason : r!.candidates.find((c) => c.repo === choice)?.reason}
        </p>
      </div>
      {!sure && others.length > 0 && (
        <div className="min-w-0" data-testid="resolved-repo-candidates">
          <p className="text-xs text-zinc-400">Also likely:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {others.map((c) => (
              <li key={c.repo} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelect(c.repo)}
                  className={`flex w-full min-w-0 flex-col items-start rounded-md border border-zinc-800 px-2.5 py-1.5 text-left text-sm hover:border-zinc-600 ${focusRing}`}
                >
                  <RepoName full={c.repo} />
                  {c.reason && <span className="text-xs text-zinc-400">{c.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Permissions list={r!.permissions} />
    </div>
  );
}
