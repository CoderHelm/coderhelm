"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type Repo } from "@/lib/api";
import { onRecentRepos, recentRepos, rememberRepo } from "@/lib/recent-repos";
import { Combobox, type ComboGroup, type ComboOption } from "./combobox";

/** `owner/name` split; a name without a slash has no owner. */
export function splitRepo(full: string): { owner: string; name: string } {
  const i = full.indexOf("/");
  return i < 0 ? { owner: "", name: full } : { owner: full.slice(0, i), name: full.slice(i + 1) };
}

/** This browser's recent repos, kept in step across pickers and tabs. */
export function useRecentRepos(): string[] {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setRecent(recentRepos());
    read();
    return onRecentRepos(read);
  }, []);
  return recent;
}

/**
 * The picker's groups. Rows show the repo name; the owner is muted beside it.
 * When every repo has one owner, the owner is the group's heading instead of
 * being repeated on each row.
 */
export function repoOptions(
  repos: { name: string; role?: string }[],
  { hints = {}, recent = [] }: { hints?: Record<string, ReactNode>; recent?: string[] } = {},
): { groups: ComboGroup[]; recent: ComboOption[]; oneOwner: string } {
  const owners = new Set(repos.map((r) => splitRepo(r.name).owner));
  const oneOwner = owners.size === 1 ? [...owners][0] : "";
  const option = (r: { name: string; role?: string }): ComboOption => {
    const { owner, name } = splitRepo(r.name);
    return {
      value: r.name,
      label: name,
      sub: oneOwner ? undefined : owner || undefined,
      hint: hints[r.name] ?? r.role ?? undefined,
      keywords: [owner, r.role ?? ""],
      title: r.name,
    };
  };
  const sorted = [...repos].sort((a, b) => splitRepo(a.name).name.localeCompare(splitRepo(b.name).name));
  const byName = new Map(repos.map((r) => [r.name, r]));
  return {
    groups: [{ heading: oneOwner || "Repositories", options: sorted.map(option) }],
    recent: recent.flatMap((n) => {
      const r = byName.get(n);
      return r ? [option(r)] : [];
    }),
    oneOwner,
  };
}

export function RepoCombobox({
  repos,
  selected,
  onSelect,
  label = "Repository",
  placeholder = "Pick a repo",
  id,
  className = "mb-4",
  hints,
  loading = false,
  testId = "repo-picker",
}: {
  repos: Pick<Repo, "name" | "role">[];
  selected: string;
  onSelect: (name: string) => void;
  /** Spoken name of the picker; a visible <label htmlFor={id}> also works. */
  label?: string;
  /** What the trigger says while nothing is picked. */
  placeholder?: string;
  id?: string;
  /** Spacing around the picker; most pages keep the default gap below it. */
  className?: string;
  /** A note per repo on the right of its row ("2 open"). Defaults to its role. */
  hints?: Record<string, ReactNode>;
  loading?: boolean;
  testId?: string;
}) {
  const recent = useRecentRepos();
  const { groups, recent: recentOptions } = useMemo(() => repoOptions(repos, { hints, recent }), [repos, hints, recent]);
  const { owner, name } = splitRepo(selected);
  return (
    <Combobox
      id={id}
      label={label}
      placeholder={placeholder}
      searchPlaceholder="Search repos…"
      emptyText="No repos match"
      value={selected}
      valueLabel={
        selected ? (
          <>
            {owner && <span className="text-zinc-500">{owner}/</span>}
            {name}
          </>
        ) : undefined
      }
      onChange={(v) => {
        rememberRepo(v);
        onSelect(v);
      }}
      groups={groups}
      recent={recentOptions}
      loading={loading && repos.length === 0}
      className={className}
      testId={testId}
    />
  );
}
