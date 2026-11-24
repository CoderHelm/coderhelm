"use client";

// Scheduled skill runs: a team's synced skill, run by Coderhelm on a schedule
// in the team's time zone, read-only unless the schedule allows writes. An
// admin picks the skill, the schedule, the tools it may call and where the
// result goes, and presses Run now to test it: the run page shows its
// progress and, at the end, its report.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCan } from "@/hooks/use-can";
import { Page, PageHeader, cardClass } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Select } from "@/components/select";
import { Code } from "@/components/settings";
import { ListSkeleton } from "@/components/list";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { inputClass, monoInputClass, primaryButton, secondaryButton, smallSecondaryButton, smallDangerButton, linkButton } from "@/components/ui";
import {
  RUN_STATUS_LABEL,
  draftOf,
  newDraft,
  skillRunsApi,
  type ScheduleDraft,
  type ScheduleOptions,
  type SkillRunEntry,
  type SkillSchedule,
  type ToolGrant,
} from "@/lib/skill-runs";

const STATUS_TONE: Record<SkillRunEntry["status"], "neutral" | "info" | "success" | "warning" | "error"> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "error",
  needs_access: "warning",
};

function runHref(runId: string, output?: string): string {
  return `/runs/detail?id=${encodeURIComponent(runId)}${output ? `&output=${encodeURIComponent(output)}#outputs` : ""}`;
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-200">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

/** The schedule's form: create or edit. */
function ScheduleForm({
  initial,
  options,
  onSave,
  onCancel,
}: {
  initial: ScheduleDraft;
  options: ScheduleOptions;
  onSave: (d: ScheduleDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ScheduleDraft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ScheduleDraft>) => setD((x) => ({ ...x, ...patch }));
  const setTool = (i: number, patch: Partial<ToolGrant>) =>
    set({ tools: d.tools.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const skillKey = d.skill_repo ? `${d.skill_repo}#${d.skill_path}` : "";

  return (
    <form
      aria-label="Schedule"
      className={`${cardClass} space-y-5`}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSaving(true);
        try {
          await onSave(d);
        } catch (err) {
          setError(err instanceof Error ? err.message : "The schedule couldn't be saved.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Skill" htmlFor="sched-skill" hint="A skill from the team's skill repositories. It runs as written, with its scripts.">
        <Select
          id="sched-skill"
          className="w-full"
          placeholder="Pick a skill"
          value={skillKey}
          onChange={(v) => {
            const s = options.skills.find((x) => `${x.repo}#${x.path}` === v);
            set(s ? { skill_repo: s.repo, skill_path: s.path, skill_name: s.name } : { skill_repo: "", skill_path: "", skill_name: "" });
          }}
          options={options.skills.map((s) => ({ value: `${s.repo}#${s.path}`, label: `${s.name} (${s.repo})` }))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Schedule" htmlFor="sched-cron" hint="Five cron fields: minute hour day month weekday. 23 7 * * MON is Mondays at 07:23.">
          <input id="sched-cron" className={monoInputClass} value={d.cron} onChange={(e) => set({ cron: e.target.value })} />
        </Field>
        <Field label="Time zone" htmlFor="sched-tz" hint="The schedule is read in this zone, daylight saving included.">
          <input id="sched-tz" className={monoInputClass} value={d.timezone} onChange={(e) => set({ timezone: e.target.value })} />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-200">Tools the skill calls</legend>
        <p className="text-xs text-zinc-400">
          Name each tool as the skill does, and pick the connected server that offers it. Only these tools exist in the run. A tool that may change something is refused unless writes are allowed below.
        </p>
        {d.tools.map((t, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]" data-testid="tool-row">
            <Field label="Name in the skill" htmlFor={`tool-name-${i}`}>
              <input id={`tool-name-${i}`} className={monoInputClass} value={t.name} onChange={(e) => setTool(i, { name: e.target.value })} />
            </Field>
            <Field label="Server" htmlFor={`tool-server-${i}`}>
              <Select
                id={`tool-server-${i}`}
                className="w-full"
                placeholder="Pick a server"
                value={t.server}
                onChange={(v) => setTool(i, { server: v })}
                options={options.servers.map((x) => ({ value: x.id, label: x.name }))}
              />
            </Field>
            <Field label="Tool on the server" htmlFor={`tool-tool-${i}`}>
              <input id={`tool-tool-${i}`} className={monoInputClass} placeholder={t.name || "same name"} value={t.tool} onChange={(e) => setTool(i, { tool: e.target.value })} />
            </Field>
            <label className="flex min-h-9 items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={t.reads_only} onChange={(e) => setTool(i, { reads_only: e.target.checked })} />
              Only reads
            </label>
            <button type="button" className={smallSecondaryButton} onClick={() => set({ tools: d.tools.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className={smallSecondaryButton} onClick={() => set({ tools: [...d.tools, { name: "", server: "", tool: "", reads_only: false }] })}>
          Add a tool
        </button>
        {options.servers.length === 0 && (
          <p className="text-xs text-zinc-400">
            No MCP server is connected yet. <Link className={linkButton} href="/connections">Connect one</Link>.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-200">AWS reader role</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={!!d.aws}
            onChange={(e) => set({ aws: e.target.checked ? { account: options.aws_accounts[0] ?? "", region: "us-east-1", workgroup: "", max_gb: 30 } : null })}
          />
          Let the skill query Athena through the team&apos;s read-only AWS role
        </label>
        {d.aws && (
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Account" htmlFor="aws-account">
              <Select
                id="aws-account"
                className="w-full"
                placeholder="Pick an account"
                value={d.aws.account}
                onChange={(v) => set({ aws: { ...d.aws!, account: v } })}
                options={options.aws_accounts.map((a) => ({ value: a, label: a }))}
              />
            </Field>
            <Field label="Region" htmlFor="aws-region">
              <input id="aws-region" className={monoInputClass} value={d.aws.region} onChange={(e) => set({ aws: { ...d.aws!, region: e.target.value } })} />
            </Field>
            <Field label="Athena workgroup" htmlFor="aws-wg">
              <input id="aws-wg" className={monoInputClass} value={d.aws.workgroup} onChange={(e) => set({ aws: { ...d.aws!, workgroup: e.target.value } })} />
            </Field>
            <Field label="Data per run (GB)" htmlFor="aws-gb">
              <input id="aws-gb" type="number" min={1} className={inputClass} value={d.aws.max_gb} onChange={(e) => set({ aws: { ...d.aws!, max_gb: Number(e.target.value) } })} />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Memory folder" htmlFor="sched-state" hint="The skill's folder kept between runs, inside its output folder (like snapshots). Comma between several.">
          <input
            id="sched-state"
            className={monoInputClass}
            value={d.state_dirs.join(", ")}
            onChange={(e) => set({ state_dirs: e.target.value.split(",").map((x) => x.trim()) })}
          />
        </Field>
        <Field label="Model budget per run ($)" htmlFor="sched-usd">
          <input id="sched-usd" type="number" min={0.5} step={0.5} className={inputClass} value={d.budget.max_usd} onChange={(e) => set({ budget: { ...d.budget, max_usd: Number(e.target.value) } })} />
        </Field>
        <Field label="Time per run (minutes)" htmlFor="sched-min">
          <input id="sched-min" type="number" min={1} max={60} className={inputClass} value={d.budget.max_minutes} onChange={(e) => set({ budget: { ...d.budget, max_minutes: Number(e.target.value) } })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tell the team's chat channels" htmlFor="sched-chat">
          <Select
            id="sched-chat"
            className="w-full"
            value={d.notify.chat}
            onChange={(v) => set({ notify: { ...d.notify, chat: v as ScheduleDraft["notify"]["chat"] } })}
            options={[
              { value: "off", label: "Never (the run page only)" },
              { value: "always", label: "After every run" },
              { value: "failure", label: "When a run fails" },
            ]}
          />
        </Field>
        <div className="space-y-2 pt-6">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={d.notify.issue_on_failure} onChange={(e) => set({ notify: { ...d.notify, issue_on_failure: e.target.checked } })} />
            Open an issue in the skill&apos;s repository when a scheduled run fails
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={d.allow_writes} onChange={(e) => set({ allow_writes: e.target.checked })} />
            Allow tools that change things (off: the run only reads)
          </label>
        </div>
      </div>

      <Field label="What to ask the skill" htmlFor="sched-instructions" hint="Optional. Without it the run is asked to do the skill end to end.">
        <textarea id="sched-instructions" rows={2} className={inputClass} value={d.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={saving}>
          {saving ? "Saving" : "Save schedule"}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A schedule's runs, newest first, each with its report. */
function History({ id }: { id: string }) {
  const [runs, setRuns] = useState<SkillRunEntry[] | null>(null);
  useEffect(() => {
    skillRunsApi
      .runs(id)
      .then((r) => setRuns(r.runs))
      .catch(() => setRuns([]));
  }, [id]);
  if (runs === null) return <p className="text-sm text-zinc-400">Loading runs</p>;
  if (runs.length === 0) return <p className="text-sm text-zinc-400">No runs yet. Press Run now to test it.</p>;
  return (
    <ul className="divide-y divide-zinc-800" aria-label="Runs" data-testid="schedule-runs">
      {runs.map((r) => (
        <li key={r.run_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
          <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{RUN_STATUS_LABEL[r.status] ?? r.status}</StatusPill>
          <Link className={linkButton} href={runHref(r.run_id)}>
            {new Date(r.started_at).toLocaleString()}
          </Link>
          <span className="text-zinc-400">{r.trigger === "manual" ? `Run now by ${r.requested_by}` : "On schedule"}</span>
          {r.report && (
            <Link className={linkButton} href={runHref(r.run_id, r.report)}>
              View report
            </Link>
          )}
          {r.needs_access.length > 0 && <span className="w-full text-xs text-amber-300">Needs access: {r.needs_access.join("; ")}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function SkillSchedulesPage() {
  const { can } = useCan();
  const canManage = can("data_sources");
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [schedules, setSchedules] = useState<SkillSchedule[] | null>(null);
  const [options, setOptions] = useState<ScheduleOptions>({ skills: [], servers: [], aws_accounts: [] });
  const [editing, setEditing] = useState<{ id: string | null; draft: ScheduleDraft } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(() => {
    skillRunsApi
      .list()
      .then((r) => setSchedules(r.schedules))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "The schedules couldn't be read."));
  }, []);
  useEffect(() => {
    load();
    skillRunsApi.options().then(setOptions).catch(() => {});
  }, [load]);

  const sorted = useMemo(() => [...(schedules ?? [])].sort((a, b) => a.skill_name.localeCompare(b.skill_name)), [schedules]);

  async function save(d: ScheduleDraft) {
    const clean = { ...d, state_dirs: d.state_dirs.filter(Boolean) };
    if (editing?.id) await skillRunsApi.update(editing.id, clean);
    else await skillRunsApi.create(clean);
    toast("Schedule saved");
    setEditing(null);
    load();
  }

  async function runNow(s: SkillSchedule) {
    try {
      const { run_id } = await skillRunsApi.runNow(s.id);
      router.push(runHref(run_id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "The run couldn't start.");
    }
  }

  return (
    <Page>
      <PageHeader
        title="Scheduled skill runs"
        lead="Run a team skill on a schedule, as written, with its scripts and only the tools you grant. Each run keeps its report on its run page and the skill's memory for the next run."
        actions={
          canManage && !editing ? (
            <button type="button" className={primaryButton} onClick={() => setEditing({ id: null, draft: newDraft() })}>
              New schedule
            </button>
          ) : undefined
        }
      />
      <div className="mt-6 space-y-4">
        {editing && <ScheduleForm initial={editing.draft} options={options} onSave={save} onCancel={() => setEditing(null)} />}
        {loadError && <p role="alert" className="text-sm text-red-400">{loadError}</p>}
        {schedules === null && !loadError && <ListSkeleton rows={3} label="Loading schedules" />}
        {schedules !== null && sorted.length === 0 && !editing && (
          <p className={`${cardClass} text-sm text-zinc-400`}>
            No schedules yet. {options.skills.length === 0 ? <>Connect a skill repository on the <Link className={linkButton} href="/skills">Skills</Link> page first.</> : "Make one with New schedule."}
          </p>
        )}
        {sorted.map((s) => (
          <section key={s.id} className={cardClass} aria-label={s.skill_name} data-testid="schedule">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-semibold text-zinc-100">{s.skill_name}</h2>
                <p className="text-sm text-zinc-400">
                  <Code>{s.cron}</Code> in {s.timezone}
                  {s.paused ? " · Paused" : s.next_run ? ` · Next: ${s.next_run.label}` : ""}
                </p>
                <p className="text-xs text-zinc-400">
                  {s.tools.length} tools{s.aws ? ", Athena" : ""} · {s.allow_writes ? "writes allowed" : "read-only"} · ${s.budget.max_usd} and {s.budget.max_minutes} min per run
                  {s.state_dirs.length > 0 ? ` · memory: ${s.state_dirs.join(", ")}` : ""}
                </p>
                {s.last_run && (
                  <p className="text-xs text-zinc-400">
                    Last run:{" "}
                    <Link className={linkButton} href={runHref(s.last_run.run_id)}>
                      {RUN_STATUS_LABEL[s.last_run.status as SkillRunEntry["status"]] ?? s.last_run.status}
                    </Link>
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primaryButton} onClick={() => runNow(s)}>
                    Run now
                  </button>
                  <button type="button" className={smallSecondaryButton} onClick={() => setEditing({ id: s.id, draft: draftOf(s) })}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={smallSecondaryButton}
                    onClick={async () => {
                      await skillRunsApi.update(s.id, { ...draftOf(s), paused: !s.paused });
                      toast(s.paused ? "Schedule resumed" : "Schedule paused");
                      load();
                    }}
                  >
                    {s.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className={smallDangerButton}
                    onClick={async () => {
                      if ((await confirm({ title: `Delete the schedule of ${s.skill_name}?`, message: "Its runs stay with the team's runs.", confirmLabel: "Delete", destructive: true })) !== "primary") return;
                      await skillRunsApi.remove(s.id);
                      load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button type="button" className={linkButton} aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                {open === s.id ? "Hide runs" : "Show runs"}
              </button>
              {open === s.id && (
                <div className="mt-2">
                  <History id={s.id} />
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
