"use client";

// The Sources panel: where findings come from (Dependabot, OSV, GitHub's
// advisory feed, CISA's exploited list, FIRST's EPSS), each with what it
// gives, its state in plain words, its last sync and what came from it; and
// the dependency list each repo was read into, or why it couldn't be.

import { Chip, Time, type Tone } from "@/components/list";
import { Section } from "@/components/page";
import { repoName, type RepoInventory, type SecurityOverview, type SourceRow } from "@/lib/security";

const STATE_LOOK: Record<SourceRow["state"], { tone: Tone; label: string }> = {
  ok: { tone: "success", label: "On" },
  error: { tone: "danger", label: "Error" },
  never: { tone: "muted", label: "Not synced yet" },
  off: { tone: "muted", label: "Off" },
  needs_permission: { tone: "attention", label: "Needs permission" },
};

const INVENTORY_LOOK: Record<RepoInventory["state"], { tone: Tone; label: string }> = {
  ok: { tone: "success", label: "Read" },
  graph_off: { tone: "attention", label: "Dependency graph off" },
  error: { tone: "danger", label: "Couldn't read" },
  not_read: { tone: "muted", label: "Not read yet" },
};

function When({ at }: { at: string | null }) {
  if (!at) return <span className="text-zinc-500">never</span>;
  return <Time iso={at} />;
}

function countWords(s: SourceRow): string {
  if (s.id === "kev") return `${s.count} open finding${s.count === 1 ? "" : "s"} on the list${s.listed ? ` (lists ${s.listed.toLocaleString()})` : ""}`;
  if (s.id === "epss") return `${s.count} open finding${s.count === 1 ? "" : "s"} scored`;
  return `${s.count} open finding${s.count === 1 ? "" : "s"}`;
}

export function SourcesPanel({ o }: { o: SecurityOverview }) {
  const rows = o.source_rows ?? [];
  const repos = o.repos ?? [];
  if (rows.length === 0 && repos.length === 0) return null;
  return (
    <Section id="sources" title="Sources" description="Where findings come from, when each source was last read, and what it found.">
      <ul className="mt-4 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="sources">
        {rows.map((s) => {
          const look = STATE_LOOK[s.state] ?? STATE_LOOK.never;
          return (
            <li key={s.id} className="grid min-w-0 gap-x-4 gap-y-1 px-4 py-3 lg:grid-cols-[12rem_minmax(0,1fr)_auto]" data-testid="source-row" data-source={s.id} data-state={s.state}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-100">{s.name}</span>
                <Chip tone={look.tone}>{look.label}</Chip>
              </div>
              <div className="min-w-0 text-sm text-zinc-400 [overflow-wrap:break-word]">
                <p>{s.gives}</p>
                {s.reason && (
                  <p className={`mt-1 ${s.state === "error" ? "text-red-300" : s.state === "needs_permission" ? "text-amber-300" : "text-zinc-400"}`} data-testid="source-reason">
                    {s.reason}
                  </p>
                )}
              </div>
              <div className="text-xs text-zinc-400 lg:whitespace-nowrap lg:text-right">
                <p>{countWords(s)}</p>
                <p>
                  Last read <When at={s.synced_at} />
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {repos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-200">Dependency lists</h3>
          <ul className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="inventory">
            {repos.map((r) => {
              const look = INVENTORY_LOOK[r.state] ?? INVENTORY_LOOK.not_read;
              const ecos = Object.entries(r.ecosystems ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([e, n]) => `${e} ${n.toLocaleString()}`)
                .join(", ");
              return (
                <li key={r.repo} className="grid min-w-0 gap-x-4 gap-y-1 px-4 py-3 lg:grid-cols-[12rem_minmax(0,1fr)_auto]" data-testid="inventory-row" data-repo={r.repo} data-state={r.state}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-zinc-100" title={r.repo}>
                      {repoName(r.repo)}
                    </span>
                    <Chip tone={look.tone}>{look.label}</Chip>
                  </div>
                  <div className="min-w-0 text-sm text-zinc-400 [overflow-wrap:break-word]">
                    {r.state === "ok" || r.packages > 0 ? (
                      <p>
                        {r.packages.toLocaleString()} package{r.packages === 1 ? "" : "s"}
                        {ecos && <span className="text-zinc-500"> · {ecos}</span>}
                        {r.unpinned > 0 && <span className="text-zinc-500"> · {r.unpinned} without an exact version</span>}
                      </p>
                    ) : null}
                    {r.reason && <p className={r.state === "error" ? "text-red-300" : "text-amber-300"}>{r.reason}</p>}
                    {r.dependabot && r.dependabot !== "on" && r.dependabot_reason && <p className="text-amber-300">{r.dependabot_reason}</p>}
                    {r.osv_error && <p className="text-red-300">OSV: {r.osv_error}</p>}
                  </div>
                  <div className="text-xs text-zinc-400 lg:whitespace-nowrap lg:text-right">
                    Read <When at={r.read_at} />
                    {r.read_at && r.next_read && <span data-testid="next-read">; {r.next_read.charAt(0).toLowerCase() + r.next_read.slice(1)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}
