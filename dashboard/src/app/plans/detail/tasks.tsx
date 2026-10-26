"use client";

import { useId, useState } from "react";
import type { Repo, Task } from "@/lib/api";
import { DetailBlock, List, ListRow, StatusText, TONES } from "@/components/list";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { RepoCombobox } from "@/components/repo-combobox";
import { buttonClass, focusRing, inputClass, primaryButton, secondaryButton, smallSecondaryButton, smallPrimaryButton } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { selectClass } from "@/components/select";
import { TASK_ORDER, taskInfo, taskStatusLook } from "../status";

// The plan's tasks as a checklist: one row per task with a mark for where it
// stands, its title and a short meta line. What it says, its acceptance
// criteria and the editing controls open under the row, one task at a time.

export interface TaskActions {
  /** Which action is in flight, "<task id>:<action>". */
  busy: string | null;
  approve: (taskId: string) => void;
  reject: (taskId: string) => void;
  remove: (taskId: string) => void;
  retry: (taskId: string) => void;
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

/** Tasks above this get a search box and status filters. */
const FILTER_OVER = 6;

const quietButton = buttonClass("secondary", "sm");
const ghostSmall = buttonClass("ghost", "sm");

export function TaskChecklist({
  tasks,
  planRepo,
  draft,
  repos,
  actions,
}: {
  tasks: Task[];
  planRepo: string;
  /** The plan has not started: tasks can be approved, skipped, edited, added. */
  draft: boolean;
  repos: Repo[];
  actions: TaskActions;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const filtering = tasks.length > FILTER_OVER;
  const q = query.trim().toLowerCase();
  const shown = tasks.filter((t) => {
    if (!filtering) return true;
    if (q && !t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
    if (filters.size > 0 && !filters.has(t.status)) return false;
    return true;
  });
  const number = (id: string) => tasks.findIndex((t) => t.task_id === id) + 1;

  return (
    <div className="min-w-0 space-y-3">
      {filtering && (
        <div className="space-y-2">
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show tasks">
            {TASK_ORDER.map((s) => {
              const count = tasks.filter((t) => t.status === s).length;
              if (count === 0) return null;
              const on = filters.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(s)) next.delete(s);
                      else next.add(s);
                      return next;
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${focusRing} ${
                    on ? TONES[taskStatusLook(s).tone].chip : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {taskInfo(s).label} ({count})
                </button>
              );
            })}
            {filters.size > 0 && (
              <button type="button" onClick={() => setFilters(new Set())} className={`rounded text-xs text-zinc-400 hover:text-zinc-300 ${focusRing}`}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet">{draft ? "Add the first one below." : "This plan has no tasks."}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No tasks match." onClear={() => { setQuery(""); setFilters(new Set()); }} />
      ) : (
        <List label="Tasks">
          {shown.map((task) => {
            const others = tasks.filter((t) => t.task_id !== task.task_id);
            const dep = task.depends_on ? tasks.find((t) => t.task_id === task.depends_on) : undefined;
            const look = taskStatusLook(task.status);
            const editing = editingId === task.task_id;
            const busy = (a: string) => actions.busy === `${task.task_id}:${a}`;
            return (
              <ListRow
                key={task.task_id}
                testId="task"
                data={{ status: task.status }}
                leading={<TaskMark status={task.status} />}
                title={
                  <>
                    <span className="mr-1.5 tabular-nums text-zinc-500">{number(task.task_id)}.</span>
                    <span className={task.status === "rejected" ? "line-through decoration-zinc-600" : ""}>{task.title}</span>
                  </>
                }
                titleText={task.title}
                quiet={task.status === "rejected" || task.status === "done"}
                meta={[
                  <StatusText key="s" look={look} />,
                  task.issue_url && (
                    <a key="i" href={task.issue_url} target="_blank" rel="noopener noreferrer" className={`rounded text-zinc-400 hover:text-zinc-200 hover:underline ${focusRing}`}>
                      Issue #{task.issue_number}
                    </a>
                  ),
                  task.jira_ticket_url && (
                    <a key="j" href={task.jira_ticket_url} target="_blank" rel="noopener noreferrer" className={`rounded text-zinc-400 hover:text-zinc-200 hover:underline ${focusRing}`}>
                      {task.jira_ticket_key}
                    </a>
                  ),
                  dep && <span key="d">after {number(dep.task_id)}</span>,
                  task.repo && task.repo !== planRepo && (
                    <span key="r" title={task.repo}>
                      in {task.repo.split("/").pop()}
                    </span>
                  ),
                ]}
                actions={
                  <RowActions
                    task={task}
                    draft={draft}
                    actions={actions}
                    busy={busy}
                  />
                }
                open={openId === task.task_id}
                onOpenChange={(o) => {
                  setOpenId(o ? task.task_id : null);
                  if (!o) setEditingId(null);
                }}
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
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (v) => {
                        // Only what changed is sent, as before.
                        const was = taskFields(task);
                        const edit = Object.fromEntries(
                          (Object.keys(v) as (keyof NewTask)[]).filter((k) => v[k] !== was[k]).map((k) => [k, v[k]]),
                        ) as Partial<Task>;
                        const ok = await actions.save(task.task_id, edit);
                        if (ok) setEditingId(null);
                        return ok;
                      }}
                    />
                  ) : (
                    <>
                      {task.description ? (
                        <div className="text-sm [&_p]:text-zinc-300">
                          <Markdown>{task.description}</Markdown>
                        </div>
                      ) : (
                        <p className="text-zinc-500">No description.</p>
                      )}
                      {task.acceptance_criteria && (
                        <DetailBlock title="Done when">
                          <div className="text-sm">
                            <Markdown>{task.acceptance_criteria}</Markdown>
                          </div>
                        </DetailBlock>
                      )}
                      {task.status === "waiting" && dep && (
                        <p className={TONES.waiting.text}>Starts when the PR for task {number(dep.task_id)} merges.</p>
                      )}
                      {task.approved_by && <p className="text-zinc-500">Approved by {task.approved_by}</p>}
                      {draft && (
                        <div className="flex flex-wrap items-end gap-3">
                          {others.length > 0 && (
                            <label className="min-w-0 flex-1 basis-56">
                              <span className="mb-1 block text-zinc-500">Run after</span>
                              <select
                                value={task.depends_on ?? ""}
                                onChange={(e) => actions.setDependency(task.task_id, e.target.value)}
                                className={`${selectClass("sm")} w-full`}
                              >
                                <option value="">No dependency</option>
                                {others.map((t) => (
                                  <option key={t.task_id} value={t.task_id}>
                                    {number(t.task_id)}. {t.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setEditingId(task.task_id)} className={quietButton}>
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
          })}
        </List>
      )}

      {draft &&
        (adding ? (
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
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${secondaryButton} gap-1.5`}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New task
          </button>
        ))}
    </div>
  );
}

/** The one or two buttons a task needs right now, beside its row. */
function RowActions({
  task,
  draft,
  actions,
  busy,
}: {
  task: Task;
  draft: boolean;
  actions: TaskActions;
  busy: (a: string) => boolean;
}) {
  const any = !!actions.busy;
  if (task.status === "failed") {
    return (
      <button type="button" onClick={() => actions.retry(task.task_id)} disabled={busy("retry")} className={quietButton}>
        {busy("retry") ? "Retrying…" : "Retry"}
      </button>
    );
  }
  if (task.status === "waiting" && task.depends_on) {
    return (
      <button type="button" onClick={() => actions.forceRun(task.task_id)} disabled={any} className={quietButton}>
        Force run
      </button>
    );
  }
  if (!draft) return null;
  if (task.status === "draft") {
    return (
      <>
        <button
          type="button"
          onClick={() => actions.approve(task.task_id)}
          disabled={any}
          className={buttonClass("primary", "sm")}
        >
          Approve
        </button>
        <button type="button" onClick={() => actions.reject(task.task_id)} disabled={any} className={ghostSmall}>
          Skip
        </button>
      </>
    );
  }
  if (task.status === "approved") {
    return (
      <button type="button" onClick={() => actions.reject(task.task_id)} disabled={any} className={quietButton}>
        Undo
      </button>
    );
  }
  if (task.status === "rejected") {
    return (
      <button type="button" onClick={() => actions.approve(task.task_id)} disabled={any} className={quietButton}>
        Re-approve
      </button>
    );
  }
  return null;
}

/** The checklist mark: an empty box, a tick, a cross, or a pulsing dot. */
export function TaskMark({ status }: { status: string }) {
  const look = taskStatusLook(status);
  const box = "inline-flex h-4 w-4 items-center justify-center rounded border";
  const glyph = (d: string, cls: string) => (
    <svg viewBox="0 0 16 16" className={`h-3 w-3 ${cls}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  let mark;
  switch (status) {
    case "done":
      mark = <span className={`${box} border-emerald-500/60 bg-emerald-500/20`}>{glyph("M3.5 8.5l3 3 6-7", "text-emerald-300")}</span>;
      break;
    case "approved":
      mark = <span className={`${box} border-sky-500/50`}>{glyph("M3.5 8.5l3 3 6-7", "text-sky-300/80")}</span>;
      break;
    case "failed":
      mark = <span className={`${box} border-red-500/60 bg-red-500/15`}>{glyph("M5 5l6 6M11 5l-6 6", "text-red-300")}</span>;
      break;
    case "rejected":
      mark = <span className={`${box} border-zinc-700`}>{glyph("M4.5 8h7", "text-zinc-500")}</span>;
      break;
    case "running":
    case "queued":
    case "waiting":
    case "issue_created":
      mark = (
        <span className={`${box} ${status === "waiting" ? "border-amber-500/50" : status === "issue_created" ? "border-orange-500/50" : "border-sky-500/50"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONES[look.tone].dot} ${look.tone === "live" || look.tone === "queued" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
        </span>
      );
      break;
    default:
      mark = <span className={`${box} border-zinc-600`} />;
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
              <select value={v.depends_on} onChange={(e) => set("depends_on")(e.target.value)} className={inputClass}>
                <option value="">No dependency</option>
                {others.map((t) => (
                  <option key={t.task_id} value={t.task_id}>
                    {numberOf(t.task_id)}. {t.title}
                  </option>
                ))}
              </select>
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
