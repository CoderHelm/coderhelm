"use client";

import { useEffect, useState } from "react";
import { api, type Repo, type TestSettings } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { SetupPointer } from "./setup";
import { useToast } from "@/components/toast";
import { focusRing, inputClass } from "@/components/ui";
import { SaveBar, SettingsRow, SettingsSection, Switch as RowSwitch, useDirtyForm } from "@/components/settings";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      } ${focusRing}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

/** The repositories part of the form: every repository, or only the ticked ones. */
type RepoMode = "all" | "some";

export function SettingsView({
  settings,
  onSaved,
}: {
  settings: TestSettings;
  onSaved: (s: TestSettings) => void;
}) {
  const { toast } = useToast();
  const form = useDirtyForm<TestSettings>(settings);
  const { reset } = form;
  const draft = form.values;
  const [repos, setRepos] = useState<Repo[] | null>(null);
  // "Only these" can be chosen before any box is ticked; the saved list alone can't say so.
  const [mode, setMode] = useState<RepoMode>(settings.repos.length ? "some" : "all");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    reset(settings);
    setMode(settings.repos.length ? "some" : "all");
  }, [settings, reset]);
  useEffect(() => {
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => setRepos([]));
  }, []);

  const days = draft.ticket_after_days;
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 30;
  const noneTicked = mode === "some" && draft.repos.length === 0;
  const modeChanged = mode !== (form.saved.repos.length ? "some" : "all");
  const count = form.count + (modeChanged && !form.isDirty("repos") ? 1 : 0);
  const toggleRepo = (name: string) =>
    form.update((d) => ({ ...d, repos: d.repos.includes(name) ? d.repos.filter((r) => r !== name) : [...d.repos, name] }));
  const chooseMode = (m: RepoMode) => {
    setMode(m);
    if (m === "all") form.set("repos", []);
  };

  const save = async () => {
    if (!daysValid) {
      setProblem("Pick between 1 and 30 days before a ticket.");
      return;
    }
    if (noneTicked) {
      setProblem("Tick at least one repository, or choose every repository.");
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const saved = await api.updateTestSettings(draft);
      onSaved(saved);
      toast("Settings saved");
    } catch (e) {
      setProblem(`${errorMessage(e, "The request failed.")} Nothing was changed.`);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    form.discard();
    setMode(form.saved.repos.length ? "some" : "all");
    setProblem(null);
  };

  const off = !draft.enabled;

  return (
    <div className="space-y-8">
      <SettingsSection id="test-settings" title="Settings">
        <SettingsRow
          label="Track E2E tests"
          layout="toggle"
          unsaved={form.isDirty("enabled")}
          help="Read every E2E run your CI finishes, and tell flaky tests from broken ones. Nothing changes in your repos."
          control={(ids) => <RowSwitch id={ids.inputId} checked={draft.enabled} onChange={(v) => form.set("enabled", v)} labelledBy={ids.labelId} describedBy={ids.helpId} />}
        />
        <SettingsRow
          label="Quarantine flaky tests"
          layout="toggle"
          unsaved={form.isDirty("auto_quarantine")}
          help="A test that turns flaky on your main branch stops failing builds. It still runs and is still recorded. Broken tests are never quarantined."
          control={(ids) => (
            <RowSwitch id={ids.inputId} checked={draft.auto_quarantine} onChange={(v) => form.set("auto_quarantine", v)} labelledBy={ids.labelId} describedBy={ids.helpId} disabled={off} />
          )}
        />
        <SettingsRow
          label="Open fix PRs"
          layout="toggle"
          unsaved={form.isDirty("fix_prs")}
          help="Coderhelm reproduces a flaky test, writes a fix and opens a PR only after 20 green runs. It never skips a test or weakens a check to make it pass."
          control={(ids) => (
            <RowSwitch id={ids.inputId} checked={draft.fix_prs} onChange={(v) => form.set("fix_prs", v)} labelledBy={ids.labelId} describedBy={ids.helpId} disabled={off} />
          )}
        />
        <SettingsRow
          label="Check new tests before merge"
          layout="toggle"
          unsaved={form.isDirty("burn_in")}
          help="When a PR adds or changes a test, the review suggests running it 10 times first, so a flaky test never lands."
          control={(ids) => (
            <RowSwitch id={ids.inputId} checked={draft.burn_in} onChange={(v) => form.set("burn_in", v)} labelledBy={ids.labelId} describedBy={ids.helpId} disabled={off} />
          )}
        />
        <SettingsRow
          label="Tickets for long quarantines"
          controlClassName="sm:w-44"
          unsaved={form.isDirty("tickets")}
          help="When a test stays quarantined without a fix, its owner gets a ticket with its history and likely cause."
          control={(ids) => (
            <select
              id={ids.inputId}
              aria-describedby={ids.helpId}
              value={draft.tickets}
              onChange={(e) => form.set("tickets", e.target.value as TestSettings["tickets"])}
              className={inputClass}
            >
              <option value="github">GitHub issue</option>
              <option value="jira">Jira</option>
              <option value="off">Off</option>
            </select>
          )}
        />
        <SettingsRow
          label="Days before a ticket"
          controlClassName="sm:w-28"
          unsaved={form.isDirty("ticket_after_days")}
          help="File a ticket after a test has been quarantined this many days. Between 1 and 30."
          control={(ids) => (
            <div>
              <input
                id={ids.inputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                aria-describedby={ids.helpId}
                aria-invalid={daysValid ? undefined : true}
                value={Number.isFinite(draft.ticket_after_days) ? draft.ticket_after_days : ""}
                disabled={off || draft.tickets === "off"}
                onChange={(e) => form.set("ticket_after_days", e.target.value === "" ? Number.NaN : Number(e.target.value))}
                className={`${inputClass} w-24 disabled:opacity-50`}
              />
              {!daysValid && (
                <p role="alert" className="mt-1.5 text-xs text-red-400">Pick between 1 and 30 days before a ticket.</p>
              )}
            </div>
          )}
        />
      </SettingsSection>

      <SettingsSection id="test-repos" title="Repositories" description="Which repositories' E2E runs Coderhelm reads.">
        <div className="px-4 py-4">
          {repos === null ? (
            <p role="status" className="text-sm text-zinc-500">Loading repositories…</p>
          ) : repos.length === 0 ? (
            <p className="text-sm text-zinc-500">No repositories are set up yet.</p>
          ) : (
            <fieldset className="min-w-0">
              <legend className="sr-only">Repositories to track</legend>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input type="radio" name="test-repo-mode" checked={mode === "all"} onChange={() => chooseMode("all")} className="h-4 w-4 accent-emerald-500" />
                  Every repository, including ones added later
                </label>
                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input type="radio" name="test-repo-mode" checked={mode === "some"} onChange={() => chooseMode("some")} className="h-4 w-4 accent-emerald-500" />
                  Only the repositories I tick
                </label>
              </div>
              {mode === "some" && (
                <ul aria-label="Repositories to track" className="mt-3 space-y-2 border-l-2 border-zinc-800 pl-4">
                  {repos.map((r) => (
                    <li key={r.name}>
                      <label className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-200">
                        <input type="checkbox" checked={draft.repos.includes(r.name)} onChange={() => toggleRepo(r.name)} className="h-4 w-4 accent-emerald-500" />
                        <span className="wrap-anywhere">{r.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-zinc-400" data-testid="tracked-repos">
                {mode === "all"
                  ? "Every repository is tracked."
                  : noneTicked
                    ? "Tick at least one repository."
                    : `${draft.repos.length} of ${repos.length} repositor${repos.length === 1 ? "y is" : "ies are"} tracked.`}
              </p>
            </fieldset>
          )}
        </div>
      </SettingsSection>

      <SaveBar count={count} onSave={save} onDiscard={discard} saving={saving} problem={problem} />

      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">CI setup</h2>
        <SetupPointer>
          Each repository&apos;s workflow, the results arriving and a one-click setup PR are in Setup.
        </SetupPointer>
      </section>
    </div>
  );
}
