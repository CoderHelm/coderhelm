"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Repo, Task, TaskState } from "@/lib/api";
import { DetailBlock, List, ListRow, StatusText, Time, TONES } from "@/components/list";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { RepoCombobox } from "@/components/repo-combobox";
import { buttonClass, focusRing, inputClass, secondaryButton, smallSecondaryButton, smallPrimaryButton } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { Select } from "@/components/select";
import { PrChip, TASK_ORDER, money, taskFinished, taskState, taskStatusLook } from "../status";

// The plan's tasks: one row per task with its state, its pull requests as
// chips coloured by checks and review, its attempts and cost, and marks for
// changes after approval. Finished tasks are faded; a long plan is grouped by
// state, with what needs a person first. What a task says, its runs and its
// editing controls open under the row; which row is open, and which groups
// are folded, is remembered for the plan.

export interface TaskActions {
  /** Which action is in flight, "<task id>:<action>". */
  busy: string | null;
  approve: (taskId: string) => void;
  drop: (taskId: string) => void;
  remove: (taskId: string) => void;
  retry: (task: Task) => void;
  forceRun: (taskId: string) => void;
  setDependency: (taskId: string, dependsOn: string) => void;
  save: (taskId: string, edit: Partial<Task>) => Promise<boolean>;
  add: (task: NewTask) => Promise<boolean>;
}

export interface NewTask {
  title: string;
  description: string;
  acceptance_criteria: string;
  repo: string;
  depends_on: string;
}

const EMPTY_TASK: NewTask = { title: "", description: "", acceptance_criteria: "", repo: "", depends_on: "" };

const taskFields = (t: Task): NewTask => ({
  title: t.title,
  description: t.description ?? "",
  acceptance_criteria: t.acceptance_criteria ?? "",
  repo: t.repo ?? "",
  depends_on: t.depends_on ?? "",
});

/** Tasks above this are grouped by state, with a search box. */
const GROUP_OVER = 8;

const quietButton = buttonClass("secondary", "sm");
const ghostSmall = buttonClass("ghost", "sm");

/** A value kept per plan in this browser; never needed for the page to work. */
function useRemembered<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setV(JSON.parse(raw) as T);
    } catch {
      /* storage blocked: start fresh */
    }
  }, [key]);
  const set = (next: T) => {
    setV(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };
  return [v, set];
}

export function TaskChecklist({
  planId,
  tasks,
  planRepo,
  started,
  repos,
  actions,
}: {
  planId: string;
  tasks: Task[];
  planRepo: string;
  /** The plan has started: drafts are still approved from their rows. */
  started: boolean;
  repos: Repo[];
  actions: TaskActions;
}) {
  const [openId, setOpenId] = useRemembered<string | null>(`plan:${planId}:open-task`, null);
  const [folded, setFolded] = useRemembered<string[]>(`plan:${planId}:folded`, ["merged", "dropped"]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const grouped = tasks.length > GROUP_OVER;
  const q = query.trim().toLowerCase();
  const shown = tasks.filter((t) => !q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  const number = (id: string) => tasks.findIndex((t) => t.task_id === id) + 1;

  const row = (task: Task) => (
    <TaskRow
      key={task.task_id}
      task={task}
      tasks={tasks}
      number={number}
      planRepo={planRepo}
      repos={repos}
      actions={actions}
      started={started}
      open={openId === task.task_id}
      onOpenChange={(o) => {
        setOpenId(o ? task.task_id : null);
        if (!o) setEditingId(null);
      }}
      editing={editingId === task.task_id}
      setEditing={(e) => setEditingId(e ? task.task_id : null)}
    />
  );

  return (
    <div className="min-w-0 space-y-3">
      {grouped && (
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      )}

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet">{!started ? "Add the first one below." : "This plan has no tasks."}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No tasks match." onClear={() => setQuery("")} />
      ) : grouped ? (
        <div className="space-y-4">
          {TASK_ORDER.map((s) => {
            const inGroup = shown.filter((t) => taskState(t) === s);
            if (inGroup.length === 0) return null;
            const look = taskStatusLook(s);
            const isFolded = folded.includes(s) && !q;
            return (
              <section key={s} aria-label={`${look.label} tasks`} data-testid={`task-group-${s}`}>
                <button
                  type="button"
                  aria-expanded={!isFolded}
                  onClick={() => setFolded(isFolded ? folded.filter((f) => f !== s) : [...folded, s])}
                  className={`mb-2 flex items-center gap-2 rounded text-sm font-semibold text-zinc-100 ${focusRing}`}
                >
                  <span aria-hidden="true" className={`inline-block transition-transform motion-reduce:transition-none ${isFolded ? "" : "rotate-90"}`}>
                    ›
                  </span>
                  <StatusText look={look} />
                  <span className="font-normal tabular-nums text-zinc-400">{inGroup.length}</span>
                </button>
                {!isFolded && <List label={`${look.label} tasks`}>{inGroup.map(row)}</List>}
              </section>
            );
          })}
        </div>
      ) : (
        <List label="Tasks">{shown.map(row)}</List>
      )}

      {adding ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <TaskForm
            initial={EMPTY_TASK}
            others={tasks}
            numberOf={number}
            repos={repos}
            submitLabel="Add task"
            autoFocus
            onCancel={() => setAdding(false)}
            onSubmit={async (v) => {
              const ok = await actions.add(v);
              if (ok) setAdding(false);
              return ok;
            }}
          />
          {started && <p className="mt-2 text-xs text-zinc-400">Added after approval: the task is marked as added, and starts as a draft.</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${secondaryButton} gap-1.5`}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New task
        </button>
      )}
    </div>
  );
}

const DRIFT_WORD: Record<string, string> = { added: "Added", changed: "Changed", dropped: "Dropped", scope: "Out of scope" };

function TaskRow({
  task,
  tasks,
  number,
  planRepo,
  repos,
  actions,
  started,
  open,
  onOpenChange,
  editing,
  setEditing,
}: {
  task: Task;
  tasks: Task[];
  number: (id: string) => number;
  planRepo: string;
  repos: Repo[];
  actions: TaskActions;
  started: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: boolean;
  setEditing: (e: boolean) => void;
}) {
  const state = taskState(task);
  const look = taskStatusLook(state);
  const others = tasks.filter((t) => t.task_id !== task.task_id);
  const dep = task.depends_on ? tasks.find((t) => t.task_id === task.depends_on) : undefined;
  const busy = (a: string) => actions.busy === `${task.task_id}:${a}`;
  const prs = task.prs ?? [];
  const runs = task.runs ?? [];
  const drift = task.drift ?? [];
  const finished = taskFinished(state);
  const editable = state === "draft" || state === "dropped";
  return (
    <ListRow
      testId="task"
      data={{ status: state }}
      leading={<TaskMark state={state} />}
      title={
        <>
          <span className="mr-1.5 tabular-nums text-zinc-400">{number(task.task_id)}.</span>
          <span className={state === "dropped" ? "line-through decoration-zinc-600" : ""}>{task.title}</span>
        </>
      }
      titleText={task.title}
      quiet={finished}
      meta={[
        <StatusText key="s" look={look} />,
        task.state_detail && state !== "draft" && state !== "merged" ? (
          <span key="d" className={state === "failed" ? TONES.danger.text : undefined}>
            {task.state_detail}
          </span>
        ) : null,
        (task.attempts ?? 0) > 1 ? <span key="a">{task.attempts} attempts</span> : null,
        (task.cost_usd ?? 0) > 0 ? (
          <span key="c" className="tabular-nums">
            {money(task.cost_usd)}
          </span>
        ) : null,
        task.covers && task.covers.length > 0 ? <span key="cv">{task.covers.join(", ")}</span> : null,
        dep && state !== "merged" ? <span key="dep">after {number(dep.task_id)}</span> : null,
        task.repo && task.repo !== planRepo ? (
          <span key="r" title={task.repo}>
            in {task.repo.split("/").pop()}
          </span>
        ) : null,
      ]}
      chips={
        (prs.length > 0 || drift.length > 0) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {drift.slice(0, 2).map((d, i) => (
              <span
                key={i}
                title={`${d.detail}${d.by === "agent" ? " (by Coderhelm)" : d.by_name ? ` (by ${d.by_name})` : ""}`}
                data-testid="drift-mark"
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TONES.info.chip}`}
              >
                {DRIFT_WORD[d.kind] ?? d.kind}
              </span>
            ))}
            {prs.slice(0, 3).map((pr) => (
              <PrChip key={`${pr.repo}#${pr.number}`} pr={pr} />
            ))}
            {prs.length > 3 && <span className="text-xs text-zinc-400">+{prs.length - 3}</span>}
          </span>
        )
      }
      actions={<RowActions task={task} state={state} started={started} actions={actions} busy={busy} />}
      open={open}
      onOpenChange={onOpenChange}
      detailsFor={`details of ${task.title}`}
      details={
        editing ? (
          <TaskForm
            key="edit"
            initial={taskFields(task)}
            others={others}
            numberOf={number}
            repos={repos}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (v) => {
              // Only what changed is sent.
              const was = taskFields(task);
              const edit = Object.fromEntries(
                (Object.keys(v) as (keyof NewTask)[]).filter((k) => v[k] !== was[k]).map((k) => [k, v[k]]),
              ) as Partial<Task>;
              const ok = await actions.save(task.task_id, edit);
              if (ok) setEditing(false);
              return ok;
            }}
          />
        ) : (
          <>
            {task.state_reason && (
              <p className={TONES.danger.text} data-testid="task-reason">
                Why it failed: {task.state_reason}
              </p>
            )}
            {task.description ? (
              <div className="text-sm [&_p]:text-zinc-300">
                <Markdown>{task.description}</Markdown>
              </div>
            ) : (
              <p className="text-zinc-400">No description.</p>
            )}
            {task.acceptance_criteria && (
              <DetailBlock title={task.covers && task.covers.length > 0 ? `Done when (${task.covers.join(", ")})` : "Done when"}>
                <div className="text-sm">
                  <Markdown>{task.acceptance_criteria}</Markdown>
                </div>
              </DetailBlock>
            )}
            {runs.length > 0 && (
              <DetailBlock title={runs.length === 1 ? "Run" : `${runs.length} attempts`}>
                <ol className="space-y-1">
                  {runs
                    .slice()
                    .reverse()
                    .map((r, i) => (
                      <li key={r.run_id} className="flex flex-wrap items-center gap-x-2">
                        <Link href={`/runs/detail?id=${encodeURIComponent(r.run_id)}`} className={`rounded text-zinc-300 hover:underline ${focusRing}`}>
                          Attempt {runs.length - i}
                        </Link>
                        <span>{r.status.replace(/_/g, " ")}</span>
                        {r.cost_usd > 0 && <span className="tabular-nums">{money(r.cost_usd)}</span>}
                        <Time iso={r.created_at} className="text-zinc-400" />
                      </li>
                    ))}
                </ol>
              </DetailBlock>
            )}
            {drift.length > 0 && (
              <DetailBlock title="Changed since approval">
                <ul className="space-y-1">
                  {drift.map((d, i) => (
                    <li key={i}>
                      {d.detail}
                      {d.by === "agent" ? " (by Coderhelm)" : d.by_name ? ` (by ${d.by_name})` : ""}
                    </li>
                  ))}
                </ul>
              </DetailBlock>
            )}
            {task.ticket_filed && (task.issue_url || task.jira_ticket_url || task.jira_ticket_key) && (
              <p>
                Ticket filed:{" "}
                {task.issue_url ? (
                  <a href={task.issue_url} target="_blank" rel="noopener noreferrer" className={`rounded text-zinc-300 hover:underline ${focusRing}`}>
                    issue #{task.issue_number}
                  </a>
                ) : task.jira_ticket_url ? (
                  <a href={task.jira_ticket_url} target="_blank" rel="noopener noreferrer" className={`rounded text-zinc-300 hover:underline ${focusRing}`}>
                    {task.jira_ticket_key}
                  </a>
                ) : (
                  task.jira_ticket_key
                )}
              </p>
            )}
            {task.approved_by && <p className="text-zinc-400">Approved by {task.approved_by}</p>}
            {editable && (
              <div className="flex flex-wrap items-end gap-3">
                {others.length > 0 && (
                  <label className="min-w-0 flex-1 basis-56">
                    <span className="mb-1 block text-zinc-400">Run after</span>
                    <Select
                      size="sm"
                      value={task.depends_on ?? ""}
                      onChange={(v) => actions.setDependency(task.task_id, v)}
                      className="w-full"
                      options={[
                        { value: "", label: "No dependency" },
                        ...others.map((t) => ({ value: t.task_id, label: `${number(t.task_id)}. ${t.title}` })),
                      ]}
                    />
                  </label>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(true)} className={quietButton}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.remove(task.task_id)}
                    disabled={!!actions.busy}
                    aria-label={`Remove task ${task.title}`}
                    className={`${ghostSmall} hover:text-red-300`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </>
        )
      }
    />
  );
}

/** The one or two buttons a task needs right now, beside its row. */
function RowActions({
  task,
  state,
  started,
  actions,
  busy,
}: {
  task: Task;
  state: TaskState;
  started: boolean;
  actions: TaskActions;
  busy: (a: string) => boolean;
}) {
  const any = !!actions.busy;
  if (state === "failed") {
    return (
      <>
        <button type="button" onClick={() => actions.retry(task)} disabled={any} className={quietButton}>
          {busy("retry") ? "Retrying…" : "Retry"}
        </button>
        <button type="button" onClick={() => actions.drop(task.task_id)} disabled={any} className={ghostSmall}>
          Drop
        </button>
      </>
    );
  }
  if (state === "queued" && task.status === "waiting" && task.depends_on) {
    return (
      <button type="button" onClick={() => actions.forceRun(task.task_id)} disabled={any} className={quietButton}>
        Start now
      </button>
    );
  }
  if (state === "draft") {
    return (
      <>
        <button type="button" onClick={() => actions.approve(task.task_id)} disabled={any} className={buttonClass("primary", "sm")}>
          {busy("approve") ? "Starting…" : started ? "Approve and start" : "Approve"}
        </button>
        <button type="button" onClick={() => actions.drop(task.task_id)} disabled={any} className={ghostSmall}>
          Drop
        </button>
      </>
    );
  }
  if (state === "dropped" && (task.runs ?? []).length === 0) {
    return (
      <button type="button" onClick={() => actions.approve(task.task_id)} disabled={any} className={quietButton}>
        Approve
      </button>
    );
  }
  return null;
}

/** The row's mark: an empty box, a tick, a cross, or a pulsing dot. */
export function TaskMark({ state }: { state: string }) {
  const look = taskStatusLook(state);
  const box = "inline-flex h-4 w-4 items-center justify-center rounded border";
  const glyph = (d: string, cls: string) => (
    <svg viewBox="0 0 16 16" className={`h-3 w-3 ${cls}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  let mark;
  switch (state) {
    case "merged":
      mark = <span className={`${box} border-violet-500/60 bg-violet-500/20`}>{glyph("M3.5 8.5l3 3 6-7", "text-violet-200")}</span>;
      break;
    case "failed":
      mark = <span className={`${box} border-red-500/60 bg-red-500/15`}>{glyph("M5 5l6 6M11 5l-6 6", "text-red-300")}</span>;
      break;
    case "dropped":
      mark = <span className={`${box} border-zinc-700`}>{glyph("M4.5 8h7", "text-zinc-400")}</span>;
      break;
    case "needs_you":
      mark = <span className={`${box} border-orange-500/60 bg-orange-500/15`}>{glyph("M8 4v5M8 11.5v.5", "text-orange-300")}</span>;
      break;
    case "draft":
      mark = <span className={`${box} border-zinc-600`} />;
      break;
    default:
      mark = (
        <span className={`${box} ${state === "in_review" ? "border-amber-500/50" : "border-sky-500/50"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONES[look.tone].dot} ${look.live ? "animate-pulse motion-reduce:animate-none" : ""}`} />
        </span>
      );
  }
  return (
    <span role="img" aria-label={look.label} className="mt-0.5 inline-flex">
      {mark}
    </span>
  );
}

/** Add or edit a task: title first, the rest optional. */
function TaskForm({
  initial,
  others,
  numberOf,
  repos,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  initial: NewTask;
  others: Task[];
  numberOf: (id: string) => number;
  repos: Repo[];
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (v: NewTask) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<NewTask>(initial);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const set = (k: keyof NewTask) => (val: string) => setV((f) => ({ ...f, [k]: val }));
  const submit = async () => {
    if (!v.title.trim() || saving) return;
    setSaving(true);
    await onSubmit(v);
    setSaving(false);
  };
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-400">Title</span>
        <input autoFocus={autoFocus} value={v.title} onChange={(e) => set("title")(e.target.value)} className={inputClass} />
      </label>
      <div>
        <label htmlFor={`${formId}-what`} className="mb-1 block text-xs text-zinc-400">What to do (optional)</label>
        <MarkdownEditor id={`${formId}-what`} variant="instructions" value={v.description} onChange={set("description")} minRows={3} />
      </div>
      <div>
        <label htmlFor={`${formId}-done`} className="mb-1 block text-xs text-zinc-400">Done when (optional)</label>
        <MarkdownEditor
          id={`${formId}-done`}
          variant="instructions"
          value={v.acceptance_criteria}
          onChange={set("acceptance_criteria")}
          minRows={2}
          placeholder="- The page loads the schedule"
        />
      </div>
      <details className="group">
        <summary className={`cursor-pointer list-none rounded text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}>
          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
          Repo and order
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {repos.length > 0 ? (
            <div>
              <span className="mb-1 block text-xs text-zinc-400">Repo (blank uses the plan&apos;s repo)</span>
              <RepoCombobox repos={repos} selected={v.repo} onSelect={set("repo")} />
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Repo (blank uses the plan&apos;s repo)</span>
              <input value={v.repo} onChange={(e) => set("repo")(e.target.value)} placeholder="owner/repo" className={inputClass} />
            </label>
          )}
          {others.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Run after (starts once that task&apos;s PR merges)</span>
              <Select
                value={v.depends_on}
                onChange={(next) => set("depends_on")(next)}
                className="w-full"
                options={[
                  { value: "", label: "No dependency" },
                  ...others.map((t) => ({ value: t.task_id, label: `${numberOf(t.task_id)}. ${t.title}` })),
                ]}
              />
            </label>
          )}
        </div>
      </details>
      <div className="flex gap-2">
        <button type="submit" disabled={!v.title.trim() || saving} className={`${smallPrimaryButton}`}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={`${smallSecondaryButton}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
