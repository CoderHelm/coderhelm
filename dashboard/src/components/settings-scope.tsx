"use client";

// "Settings for [All repositories ▾]": the one scope control at the top of a
// Code review settings page. "All repositories" is the team's settings; a
// repository is that repository's. Where a team value exists, ScopeBadge says
// whether the repository inherits it or has its own.

import { useMemo, type ReactNode } from "react";
import type { Repo } from "@/lib/api";
import { Combobox } from "./combobox";
import { repoOptions, splitRepo, useRecentRepos } from "./repo-combobox";
import { Chip } from "./list";
import { linkButton } from "./ui";

/** The value the picker uses for "All repositories". */
export const ALL_REPOS = "";

export function SettingsScope({
  repos,
  value,
  onChange,
  after,
  testId = "settings-scope",
}: {
  repos: Pick<Repo, "name">[];
  /** A repository, or ALL_REPOS. */
  value: string;
  onChange: (repo: string) => void;
  /** Beside the picker: a state, a badge. */
  after?: ReactNode;
  testId?: string;
}) {
  const recent = useRecentRepos();
  const { groups, recent: recentOptions } = useMemo(() => repoOptions(repos, { recent }), [repos, recent]);
  const { owner, name } = splitRepo(value);
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
      data-testid={testId}
      data-scope={value ? "repo" : "all"}
    >
      <span aria-hidden="true" className="shrink-0 text-sm font-medium text-zinc-300">
        Settings for
      </span>
      <div className="min-w-0 sm:w-96">
        <Combobox
          label="Settings for"
          placeholder="All repositories"
          searchPlaceholder="Search repos…"
          emptyText="No repos match"
          value={value}
          valueLabel={
            value ? (
              <>
                {owner && <span className="text-zinc-500">{owner}/</span>}
                {name}
              </>
            ) : (
              "All repositories"
            )
          }
          onChange={onChange}
          groups={[{ options: [{ value: ALL_REPOS, label: "All repositories", sub: "The team's settings" }] }, ...groups]}
          recent={recentOptions}
          testId={`${testId}-picker`}
        />
      </div>
      {after && <div className="flex min-w-0 flex-wrap items-center gap-2">{after}</div>}
    </div>
  );
}

/**
 * Where one repository's values come from. Inherited: the team's, with a way
 * to give it its own. Overridden: its own, with a way back to the team's.
 * Per repository: there is no team value for these settings.
 */
export function ScopeBadge({
  state,
  onOverride,
  onReset,
  disabled,
}: {
  state: "inherited" | "overridden" | "per-repo";
  onOverride?: () => void;
  onReset?: () => void;
  disabled?: boolean;
}) {
  if (state === "per-repo") {
    return (
      <span data-testid="scope-badge" data-state={state}>
        <Chip tone="muted">Set per repository</Chip>
      </span>
    );
  }
  const inherited = state === "inherited";
  const action = inherited ? onOverride : onReset;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid="scope-badge" data-state={state}>
      <Chip tone={inherited ? "neutral" : "info"}>{inherited ? "Inherited from all repositories" : "Overridden here"}</Chip>
      {action && !disabled && (
        <button type="button" onClick={action} className={`${linkButton} !text-sm`} data-testid={inherited ? "scope-override" : "scope-reset"}>
          {inherited ? "Use different settings here" : "Reset to all repositories"}
        </button>
      )}
    </span>
  );
}
