"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { focusRing } from "./ui";
import { ChevronRightIcon } from "./icons";
import { agentHref, skillsApi, type UsedItem, type UsedQuery, type WorkUsed } from "@/lib/skills";
import type { UsedRef } from "@/lib/stream-types";

const chipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300";
const chipLink = `${chipClass} hover:border-zinc-600 hover:text-zinc-100 ${focusRing}`;

const itemHref = (i: Pick<UsedItem, "kind" | "repo" | "path">) =>
  i.kind === "agent" ? agentHref(i) : `/skills/item?repo=${encodeURIComponent(i.repo)}&path=${encodeURIComponent(i.path)}`;

/** One thing the work used, as a chip: its name, and how many times when more than once. */
type Chip = { key: string; name: string; count: number; href?: string; note?: string };

/** The count every chip of a group shares (all read twice → 2), or null. */
function sharedCount(chips: Chip[]): number | null {
  const n = chips[0]?.count ?? 1;
  return chips.length > 1 && n > 1 && chips.every((c) => c.count === n) ? n : null;
}

function timesWord(n: number): string {
  return n === 2 ? "twice" : `${n} times`;
}

/** One kind of thing used: its label on the left, its chips wrapping beside it. */
function Group({ label, chips }: { label: string; chips: Chip[] }) {
  if (chips.length === 0) return null;
  // "each twice" once, instead of the same ×2 on every chip.
  const shared = sharedCount(chips);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-xs text-zinc-500 sm:w-32">
        {label}
      </dt>
      <dd className="min-w-0">
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const inner = (
              <>
                <span className="truncate font-medium">{c.name}</span>
                {!shared && c.count > 1 && (
                  <>
                    <span aria-hidden="true" className="shrink-0 text-zinc-500">×{c.count}</span>
                    <span className="sr-only">, {timesWord(c.count)}</span>
                  </>
                )}
                {c.note && <span className="shrink-0 truncate text-zinc-500">· {c.note}</span>}
              </>
            );
            return (
              <li key={c.key} className="min-w-0 max-w-full">
                {c.href ? (
                  <Link href={c.href} className={chipLink}>
                    {inner}
                  </Link>
                ) : (
                  <span className={chipClass}>{inner}</span>
                )}
              </li>
            );
          })}
          {shared && <li className="self-center text-xs text-zinc-500">each {timesWord(shared)}</li>}
        </ul>
      </dd>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a run, review or plan chat used, as one quiet section: a one-line
 * count ("1 skill · 2 data sources · 4 standards") that opens to chips
 * grouped by kind, each linking to its skill, agent or data source. The same
 * block on every page that shows it. Nothing when the work used nothing.
 * `standardNames` (kept on the run or review) stand in for the standards
 * when the log has none for it.
 */
export function UsedLine({
  used,
  standardNames = [],
  title = "What this used",
  className = "",
}: {
  used: WorkUsed | null;
  standardNames?: string[] | null;
  /** The section's name, e.g. "What the reviewer used". */
  title?: string;
  className?: string;
}) {
  const { skills, agents, sources } = used ?? { skills: [], agents: [], sources: [] };
  const named = (standardNames ?? []).filter(Boolean);
  const standards: UsedItem[] =
    used && used.standards.length > 0 ? used.standards : named.map((name) => ({ name, kind: "skill", repo: "", path: "", count: 1 }));
  if (skills.length + agents.length + sources.length + standards.length === 0) return null;
  const items = (list: UsedItem[]): Chip[] =>
    list.map((i) => ({
      key: `${i.repo}#${i.path}#${i.name}`,
      name: i.name,
      count: i.count,
      href: i.repo ? itemHref(i) : undefined,
      note: i.tools && i.tools.length > 0 ? `read with ${i.tools.join(", ")}` : undefined,
    }));
  const sourceChips: Chip[] = sources.map((s) => ({
    key: `${s.id}#${s.name}`,
    name: s.name || "a data source",
    count: s.lookups,
    href: "/data-sources/activity",
  }));
  const counts = [
    skills.length > 0 && plural(skills.length, "skill", "skills"),
    agents.length > 0 && plural(agents.length, "agent", "agents"),
    sources.length > 0 && plural(sources.length, "data source", "data sources"),
    standards.length > 0 && plural(standards.length, "standard", "standards"),
  ].filter(Boolean) as string[];
  return (
    <section aria-label={title} data-testid="work-used" className={`min-w-0 rounded-lg border border-zinc-800/80 text-sm ${className}`.trim()}>
      <details className="group">
        <summary
          className={`flex min-h-9 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span aria-hidden="true" className="inline-flex text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">
            <ChevronRightIcon />
          </span>
          <span className="font-medium text-zinc-300">{title}</span>
          <span className="text-zinc-500">{counts.join(" · ")}</span>
        </summary>
        <dl className="space-y-2.5 border-t border-zinc-800/80 px-3 py-3 [overflow-wrap:anywhere]">
          <Group label={skills.length === 1 ? "Skill" : "Skills"} chips={items(skills)} />
          <Group label={agents.length === 1 ? "Agent asked" : "Agents asked"} chips={items(agents)} />
          <Group label={sources.length === 1 ? "Data source" : "Data sources"} chips={sourceChips} />
          <Group label="Standards applied" chips={items(standards)} />
        </dl>
      </details>
    </section>
  );
}

/** What a run, review or plan chat used (see [`UsedLine`]), read from the
 * team's access and data source logs. */
export function WorkUsedLine({
  query,
  refreshKey,
  standardNames,
  title,
  className,
}: {
  query: UsedQuery | null;
  refreshKey?: string;
  standardNames?: string[] | null;
  title?: string;
  className?: string;
}) {
  const [used, setUsed] = useState<WorkUsed | null>(null);
  const key = query ? JSON.stringify(query) : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    skillsApi
      .used(JSON.parse(key) as UsedQuery)
      .then((u) => live && setUsed(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, refreshKey]);
  return <UsedLine used={used} standardNames={standardNames} title={title} className={className} />;
}

const CHIP_WORDS: Record<UsedRef["kind"], string> = {
  skill: "Read skill",
  agent: "Asked agent",
  source: "Looked up",
};

/** The chips under a plan chat answer: each skill read, agent asked and data source looked up, linked. */
export function UsedChips({ used }: { used: UsedRef[] }) {
  if (used.length === 0) return null;
  return (
    <ul aria-label="What this answer used" data-testid="used-chips" className="mb-2 flex flex-wrap gap-1.5">
      {used.map((u) => (
        <li key={`${u.kind}#${u.label}`} className="min-w-0 max-w-full">
          <Link
            href={u.href}
            className={`inline-flex max-w-full items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}
          >
            <span className="shrink-0 text-zinc-500">{CHIP_WORDS[u.kind]}:</span>
            <span className="truncate font-medium">{u.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
