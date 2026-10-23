"use client";

import type { Repo } from "@/lib/api";
import { RepoCombobox } from "@/components/repo-combobox";
import { Segmented } from "@/components/segmented";

export type Scope = "global" | "repo";

/**
 * "Every repository" or "One repository" and, for one, which: the picker the
 * guardrails, voice and instructions pages share.
 */
export function ScopeBar({
  scope,
  onScope,
  repos,
  repo,
  onRepo,
  label,
}: {
  scope: Scope;
  onScope: (s: Scope) => void;
  repos: Repo[];
  repo: string;
  onRepo: (name: string) => void;
  /** Spoken name of the choice, e.g. "Whose rules". */
  label: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Segmented
        label={label}
        options={[
          { value: "global", label: "Every repository" },
          { value: "repo", label: "One repository" },
        ]}
        value={scope}
        onChange={onScope}
      />
      {scope === "repo" && repos.length > 0 && (
        <RepoCombobox repos={repos} selected={repo} onSelect={onRepo} label="Repository" className="w-full sm:w-72" />
      )}
    </div>
  );
}
