"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { focusRing } from "./ui";
import { agentHref, skillsApi, type UsedItem, type UsedQuery, type WorkUsed } from "@/lib/skills";
import type { UsedRef } from "@/lib/stream-types";

const link = `text-zinc-200 underline underline-offset-2 hover:text-zinc-50 rounded ${focusRing}`;

const itemHref = (i: Pick<UsedItem, "kind" | "repo" | "path">) =>
  i.kind === "agent" ? agentHref(i) : `/skills/item?repo=${encodeURIComponent(i.repo)}&path=${encodeURIComponent(i.path)}`;

function times(n: number): string {
  return n > 1 ? ` ×${n}` : "";
}

/** One group of the line: "skills debug ×2, code-standards". */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <span className="text-zinc-500">{label}</span> {children}
    </li>
  );
}

function Items({ list, tools }: { list: UsedItem[]; tools?: boolean }) {
  return (
    <>
      {list.map((i, n) => (
        <span key={`${i.repo}#${i.path}`}>
          {n > 0 && ", "}
          <Link href={itemHref(i)} className={link}>
            {i.name}
          </Link>
          <span className="text-zinc-500">{times(i.count)}</span>
          {tools && i.tools && i.tools.length > 0 && <span className="text-zinc-500"> (read with {i.tools.join(", ")})</span>}
        </span>
      ))}
    </>
  );
}

/** The line itself, from what the work used. Nothing when it used nothing.
 * `standardNames` (kept on the run or review) stand in for the standards when
 * the log has none for it. */
export function UsedLine({ used, standardNames = [], className = "" }: { used: WorkUsed | null; standardNames?: string[] | null; className?: string }) {
  const { skills, agents, sources } = used ?? { skills: [], agents: [], sources: [] };
  const named = (standardNames ?? []).filter(Boolean);
  const standards: UsedItem[] =
    used && used.standards.length > 0 ? used.standards : named.map((name) => ({ name, kind: "skill", repo: "", path: "", count: 1 }));
  if (skills.length + agents.length + sources.length + standards.length === 0) return null;
  return (
    <section aria-label="What this used" data-testid="work-used" className={`rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm ${className}`.trim()}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Used</p>
      <ul className="space-y-1 text-zinc-300 [overflow-wrap:anywhere]">
        {skills.length > 0 && (
          <Group label={skills.length === 1 ? "Skill:" : "Skills:"}>
            <Items list={skills} />
          </Group>
        )}
        {agents.length > 0 && (
          <Group label={agents.length === 1 ? "Agent asked:" : "Agents asked:"}>
            <Items list={agents} tools />
          </Group>
        )}
        {sources.length > 0 && (
          <Group label={sources.length === 1 ? "Data source:" : "Data sources:"}>
            {sources.map((s, n) => (
              <span key={`${s.id}#${s.name}`}>
                {n > 0 && ", "}
                <Link href="/data-sources/activity" className={link}>
                  {s.name || "a data source"}
                </Link>
                <span className="text-zinc-500">{times(s.lookups)}</span>
              </span>
            ))}
          </Group>
        )}
        {standards.length > 0 && (
          <Group label="Standards applied:">
            {standards[0].repo ? <Items list={standards} /> : <span className="font-mono text-zinc-200">{standards.map((s) => s.name).join(", ")}</span>}
          </Group>
        )}
      </ul>
    </section>
  );
}

/** "Used: skills …, agents …, data sources …, standards applied …" for a run,
 * review or plan chat, read from the team's access and data source logs. */
export function WorkUsedLine({
  query,
  refreshKey,
  standardNames,
  className,
}: {
  query: UsedQuery | null;
  refreshKey?: string;
  standardNames?: string[] | null;
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
  return <UsedLine used={used} standardNames={standardNames} className={className} />;
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
