"use client";

import { Skeleton } from "@/components/skeleton";
import { Chip } from "@/components/list";
import { GitHubIcon, AtlassianIcon } from "@/components/icons";
import { focusRing, primaryButton } from "@/components/ui";

// The plan the chat is drafting: read from the ```json block in its answers,
// shown beside the conversation (a tab on a phone), with what the latest
// answer changed marked.

export interface DraftTask {
  title: string;
  description: string;
  acceptance_criteria: string;
  order: number;
}

export interface DraftPlan {
  title: string;
  description: string;
  repo: string;
  tasks: DraftTask[];
}

export type PartialPlan = Partial<DraftPlan> & { tasks: DraftTask[] };

export function parsePlan(text: string): DraftPlan | null {
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse a partial/incomplete plan JSON while streaming */
export function parsePartialPlan(text: string): PartialPlan | null {
  const jsonStart = text.indexOf("```json\n");
  if (jsonStart === -1) return null;

  let json = text.slice(jsonStart + 8);
  const jsonEnd = json.indexOf("\n```");
  if (jsonEnd !== -1) json = json.slice(0, jsonEnd);

  try {
    return JSON.parse(json);
  } catch {
    try {
      let attempt = json.trim();
      const opens = { "{": 0, "[": 0 };
      let inString = false;
      let escape = false;
      for (const ch of attempt) {
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") opens["{"]++;
        if (ch === "}") opens["{"]--;
        if (ch === "[") opens["["]++;
        if (ch === "]") opens["["]--;
      }
      if (inString) attempt += '"';
      for (let i = 0; i < opens["{"]; i++) attempt += "}";
      for (let i = 0; i < opens["["]; i++) attempt += "]";
      attempt = attempt.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object") {
        return { tasks: [], ...parsed };
      }
    } catch {
      // Can't parse even with fixes
    }
  }
  return null;
}

/** The answer's words without the plan's JSON block. */
export function withoutPlanJson(text: string): string {
  return text.replace(/```json\n[\s\S]*?(\n```|$)/g, "").trim();
}

export type TaskChange = "new" | "changed" | null;

export interface PlanChange {
  /** Per task of the new plan, by index. */
  tasks: TaskChange[];
  added: number;
  changed: number;
  removed: number;
  /** Title or description changed. */
  header: boolean;
}

/** What one draft changed from the one before it; null for the first draft. */
export function diffPlans(prev: DraftPlan | null, next: DraftPlan): PlanChange | null {
  if (!prev) return null;
  const key = (t: DraftTask) => t.title.trim().toLowerCase();
  const before = new Map(prev.tasks.map((t) => [key(t), t]));
  const tasks: TaskChange[] = next.tasks.map((t) => {
    const was = before.get(key(t));
    if (!was) return "new";
    return was.description !== t.description || was.acceptance_criteria !== t.acceptance_criteria ? "changed" : null;
  });
  const kept = new Set(next.tasks.map(key));
  return {
    tasks,
    added: tasks.filter((c) => c === "new").length,
    changed: tasks.filter((c) => c === "changed").length,
    removed: prev.tasks.filter((t) => !kept.has(key(t))).length,
    header: prev.title !== next.title || prev.description !== next.description,
  };
}

/** "+1 task · 2 changed · 1 removed", or "" when nothing changed. */
export function changeWords(c: PlanChange | null): string {
  if (!c) return "";
  const bits = [
    c.added > 0 && `+${c.added} task${c.added === 1 ? "" : "s"}`,
    c.changed > 0 && `${c.changed} changed`,
    c.removed > 0 && `${c.removed} removed`,
    c.added + c.changed + c.removed === 0 && c.header && "title or summary changed",
  ].filter(Boolean);
  return bits.join(" · ");
}

export function DraftPanel({
  draft,
  partial,
  streaming,
  change,
  destination,
  jiraReady,
  onDestination,
  saving,
  onSave,
}: {
  draft: DraftPlan | null;
  /** The plan as it streams in, before the block closes. */
  partial: PartialPlan | null;
  streaming: boolean;
  change: PlanChange | null;
  destination: "github" | "jira";
  jiraReady: boolean;
  onDestination: (d: "github" | "jira") => void;
  saving: boolean;
  onSave: () => void;
}) {
  const live = streaming && (!draft || partial);
  const plan = live ? partial : draft;
  const changed = changeWords(change);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="draft-panel">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-sky-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" />
                Writing the plan…
              </span>
            ) : (
              <span>Draft plan</span>
            )}
            {!live && changed && (
              <Chip tone="live">
                <span data-testid="draft-updated">Updated: {changed}</span>
              </Chip>
            )}
          </div>
          {plan?.title ? (
            <h2 className={`break-words text-base font-semibold text-zinc-100 ${change?.header && !live ? "rounded bg-sky-500/10 px-1 -mx-1" : ""}`}>
              {plan.title}
            </h2>
          ) : (
            <Skeleton className="mt-1 h-5 w-3/4" />
          )}
          {plan?.description && <p className="mt-1 text-sm leading-relaxed text-zinc-400">{plan.description}</p>}
          {plan?.repo && <p className="mt-1 text-xs text-zinc-500">{plan.repo}</p>}
        </div>

        <ol className="space-y-2" aria-label="Draft tasks">
          {(plan?.tasks ?? []).map((task, i) => {
            const mark = !live ? change?.tasks[i] : null;
            return (
              <li
                key={i}
                className={`rounded-lg border p-3 animate-message-in motion-reduce:animate-none ${
                  mark ? "border-sky-500/40 bg-sky-500/5" : "border-zinc-800"
                }`}
              >
                <div className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-200">
                      <span className="min-w-0 break-words">{task.title || "…"}</span>
                      {mark && <Chip tone="live">{mark === "new" ? "New" : "Changed"}</Chip>}
                    </p>
                    {task.description && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{task.description}</p>
                    )}
                    {task.acceptance_criteria && !live && (
                      <details className="group mt-1.5">
                        <summary className={`cursor-pointer list-none rounded text-xs text-zinc-500 hover:text-zinc-300 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
                          Done when
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{task.acceptance_criteria}</p>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {live &&
            Array.from({ length: (plan?.tasks.length ?? 0) > 0 ? 1 : 3 }).map((_, i) => (
              <li key={`s${i}`} aria-hidden="true" className="rounded-lg border border-zinc-800 p-3 opacity-50">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="mt-2 h-3 w-full" />
              </li>
            ))}
        </ol>
      </div>

      {draft && !live && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-xs text-zinc-500">Each task becomes</p>
            <div className="flex gap-2" role="group" aria-label="Destination">
              <DestButton on={destination === "github" || !jiraReady} onClick={() => onDestination("github")} icon={<GitHubIcon />}>
                GitHub Issues
              </DestButton>
              <DestButton
                on={destination === "jira" && jiraReady}
                disabled={!jiraReady}
                title={jiraReady ? undefined : "Connect Jira in settings first"}
                onClick={() => onDestination("jira")}
                icon={<AtlassianIcon />}
              >
                Jira Tickets
              </DestButton>
            </div>
          </div>
          <button type="button" onClick={onSave} disabled={saving} className={`${primaryButton} w-full font-semibold`}>
            {saving ? "Saving..." : "Save plan"}
          </button>
          <p className="text-center text-xs text-zinc-500">Nothing runs yet. You approve each task on the plan&apos;s page.</p>
        </div>
      )}
    </div>
  );
}

function DestButton({
  on,
  disabled,
  title,
  onClick,
  icon,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${
        on ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      }`}
    >
      <span aria-hidden="true" className="inline-flex scale-90">
        {icon}
      </span>
      {children}
    </button>
  );
}
