"use client";

// Stale pull request settings, the Settings view of the Stale PRs page
// (/reviewer/stale?view=settings): the settings for all repositories, or one
// repository's, picked with the page's "Settings for" control. A repository
// inherits the team's settings until it is given its own. The rules live in
// coderhelm-platform's common::stale_prs.

import { useEffect, useState } from "react";
import { api, type StaleConfig, type StaleConfigView } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { monoInputClass } from "@/components/ui";
import { ScopeBadge } from "@/components/settings-scope";
import { Field, SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";
import { useSetupMarks } from "@/components/setup-marks";

export const STALE_DEFAULTS: StaleConfig = {
  enabled: false,
  stale_days: 21,
  close_days: 7,
  label: "stale",
  warn_message: "",
  close_message: "",
  exempt_labels: ["keep-open", "pinned", "security", "do-not-close"],
  exempt_drafts: true,
  exempt_authors: [],
  scope: "all",
  delete_branch: false,
  max_closes_per_run: 10,
  dry_run: true,
};

/** The form: the settings plus, for a repository, whether it has its own. */
type Form = StaleConfig & { own: boolean };

type Target = "team" | "repo";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** One sentence: what the cleanup does with these settings. */
export function staleSummary(c: StaleConfig): string {
  if (!c.enabled) return "Off. Coderhelm never marks or closes pull requests here.";
  const what = c.scope === "own" ? "Coderhelm's own pull requests" : "pull requests";
  const base = `Marks ${what} stale after ${c.stale_days} days without activity and closes them ${c.close_days} days later.`;
  return c.dry_run ? `Dry run: shows what it would do and changes nothing. ${base}` : base;
}

/** The settings for all repositories (no repo), or one repository's. `onSaved` runs after a save. */
export function StaleSection({ repo, readOnly, onSaved }: { repo: string; readOnly: boolean; onSaved?: () => void }) {
  const { toast } = useToast();
  const [view, setView] = useState<StaleConfigView | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const target: Target = repo ? "repo" : "team";
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const form = useDirtyForm<Form>({ ...STALE_DEFAULTS, own: false }, { disabled: loadState !== "ready" });
  const setupMarks = useSetupMarks(repo || null);
  const { values: f, set, reset } = form;

  useEffect(() => {
    let current = true;
    setLoadState("loading");
    api
      .getStaleConfig(repo || undefined)
      .then((v) => {
        if (!current) return;
        setView(v);
        setLoadState("ready");
      })
      .catch(() => current && setLoadState("error"));
    return () => {
      current = false;
    };
  }, [repo, reload]);

  // The form follows what is being edited: the team's, or the repository's
  // (its own when it has them, else the team's to start from).
  useEffect(() => {
    if (!view) return;
    if (target === "team") reset({ ...view.team, own: false });
    else reset({ ...(view.repo ?? view.team), own: !!view.repo });
  }, [view, target, reset]);

  const editing = target === "team" || f.own;
  // A repository that inherits shows the team's values, read only.
  const v: Form = editing || !view ? f : { ...view.team, own: false };

  const save = async () => {
    const { own, ...cfg } = f;
    if (cfg.close_days < 1 || cfg.stale_days < 1) {
      setProblem("The days must be 1 or more.");
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      if (target === "team") await api.saveStaleConfig(cfg);
      else await api.saveStaleConfig(own ? cfg : null, repo);
      toast("Stale pull request settings saved");
      setReload((k) => k + 1);
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can change these settings." : "Could not save. Try again.";
      setProblem(msg);
      toast(msg, "error");
    }
    setSaving(false);
  };

  // What applies with the edits as they stand: the form, unless the repository follows the team.
  const effective = view ? (target === "repo" && !f.own ? view.team : f) : STALE_DEFAULTS;
  const numberField = (key: "stale_days" | "close_days" | "max_closes_per_run", label: string, help: string, max: number) => (
    <Field
      label={label}
      help={help}
      unsaved={form.isDirty(key)}
      type="number"
      min={1}
      max={max}
      value={v[key]}
      onChange={(e) => set(key, Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
      controlClassName="sm:w-32"
      data-testid={`stale-${key}`}
    />
  );

  return (
    <section id="stale" aria-labelledby="stale-heading" className="min-w-0" data-testid="stale-section">
      <h2 id="stale-heading" className="sr-only">
        Stale pull request settings
      </h2>
      {loadState === "loading" ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading stale pull request settings">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : loadState === "error" ? (
        <div className="mt-4">
          <Problem title="Could not load the stale pull request settings" onRetry={() => setReload((k) => k + 1)}>
            Saving is off until they load, so they can&apos;t be overwritten by mistake. Try again.
          </Problem>
        </div>
      ) : (
        <>
          {target === "repo" && (
            <div className="mt-4">
              <ScopeBadge
                state={f.own ? "overridden" : "inherited"}
                onOverride={() => set("own", true)}
                onReset={() => set("own", false)}
                disabled={readOnly}
              />
            </div>
          )}
          <p className="mt-4 text-sm text-zinc-300" data-testid="stale-summary">
            {target === "repo" && !f.own ? `${repo} uses the settings for all repositories. ` : ""}
            {staleSummary(effective)}
          </p>
          <fieldset disabled={readOnly || !editing} className={`mt-4 min-w-0 ${editing ? "" : "opacity-60"}`} data-inherited={editing ? undefined : "true"}>
            <legend className="sr-only">Stale pull request settings</legend>
            <SettingsSection id="stale-settings" title={target === "team" ? "All repositories" : repo}>
              <>
                  <SettingsRow
                    label="Close stale pull requests"
                    help="Only on repositories the reviewer is on for. Off by default."
                    unsaved={form.isDirty("enabled")} setup={setupMarks.mark(["stale_prs.enabled"], form.values.enabled)}
                    layout="toggle"
                    control={({ labelId, helpId, inputId }) => (
                      <Switch id={inputId} checked={v.enabled} onChange={(v) => set("enabled", v)} labelledBy={labelId} describedBy={helpId} testId="stale-enabled" />
                    )}
                  />
                  <SettingsRow
                    label="Dry run"
                    help="Lists what would be marked and closed under Would mark or close, and changes nothing on GitHub. Turn it off once the list looks right."
                    unsaved={form.isDirty("dry_run")} setup={setupMarks.mark(["stale_prs.dry_run"], form.values.dry_run)}
                    layout="toggle"
                    control={({ labelId, helpId, inputId }) => (
                      <Switch id={inputId} checked={v.dry_run} onChange={(v) => set("dry_run", v)} labelledBy={labelId} describedBy={helpId} testId="stale-dry-run" />
                    )}
                  />
                  <SettingsRow
                    label="Timing"
                    help="Activity is a commit, or a person's comment, review, review comment or label change."
                    layout="stacked"
                    control={() => (
                      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                        {numberField("stale_days", "Mark stale after (days)", "With no activity.", 365)}
                        {numberField("close_days", "Close after (more days)", "After the warning.", 90)}
                        {numberField("max_closes_per_run", "Closes per hour", "At most, per repository.", 50)}
                      </div>
                    )}
                  />
                  <SettingsRow
                    label="Which pull requests"
                    unsaved={form.isDirty("scope")}
                    controlClassName="sm:w-64"
                    control={({ inputId }) => (
                      <Field
                        as="select"
                        id={inputId}
                        label={<span className="sr-only">Which pull requests</span>}
                        value={v.scope}
                        onChange={(v) => set("scope", v as StaleConfig["scope"])}
                        options={[
                          { value: "all", label: "Every pull request" },
                          { value: "own", label: "Only Coderhelm's own" },
                        ]}
                      />
                    )}
                  />
                  <SettingsRow
                    label="Never mark"
                    help="Pull requests with any of these labels, by these authors, or drafts. Also any pull request a Coderhelm run is working on."
                    layout="stacked"
                    control={() => (
                      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        <Field
                          label="Labels"
                          help="Comma separated."
                          mono
                          unsaved={form.isDirty("exempt_labels")}
                          value={v.exempt_labels.join(", ")}
                          onChange={(e) => set("exempt_labels", list(e.target.value))}
                          data-testid="stale-exempt-labels"
                        />
                        <Field
                          label="Authors"
                          help="GitHub logins, comma separated. Bots too, like renovate[bot]."
                          mono
                          unsaved={form.isDirty("exempt_authors")}
                          value={v.exempt_authors.join(", ")}
                          onChange={(e) => set("exempt_authors", list(e.target.value))}
                          data-testid="stale-exempt-authors"
                        />
                        <label className="flex items-center gap-3 text-sm text-zinc-200">
                          <Switch checked={v.exempt_drafts} onChange={(v) => set("exempt_drafts", v)} label="Never mark drafts" testId="stale-exempt-drafts" />
                          Never mark drafts
                        </label>
                      </div>
                    )}
                  />
                  <SettingsRow
                    label="Stale label"
                    help="Added with the warning. Removing it keeps the pull request open."
                    unsaved={form.isDirty("label")}
                    controlClassName="sm:w-64"
                    control={({ inputId, helpId }) => (
                      <input
                        id={inputId}
                        aria-describedby={helpId}
                        className={`${monoInputClass} w-full`}
                        value={v.label}
                        maxLength={50}
                        onChange={(e) => set("label", e.target.value)}
                        data-testid="stale-label"
                      />
                    )}
                  />
                  <SettingsRow
                    label="Delete the branch when closing"
                    help="Off by default. Never for a fork, the default branch, or a branch another pull request is based on. GitHub's Restore branch brings it back."
                    unsaved={form.isDirty("delete_branch")}
                    layout="toggle"
                    control={({ labelId, helpId, inputId }) => (
                      <Switch id={inputId} checked={v.delete_branch} onChange={(v) => set("delete_branch", v)} labelledBy={labelId} describedBy={helpId} testId="stale-delete-branch" />
                    )}
                  />
                  <SettingsRow
                    label="Messages"
                    help="Leave one empty for the default. {stale_days}, {close_days} and {label} are filled in. The closing message should say how to reopen."
                    layout="stacked"
                    control={() => (
                      <div className="grid min-w-0 gap-4">
                        <Field
                          as="textarea"
                          label="Warning"
                          rows={3}
                          unsaved={form.isDirty("warn_message")}
                          value={v.warn_message}
                          onChange={(e) => set("warn_message", e.target.value)}
                          placeholder={view?.defaults.warn_message}
                          data-testid="stale-warn-message"
                        />
                        <Field
                          as="textarea"
                          label="When closing"
                          rows={3}
                          unsaved={form.isDirty("close_message")}
                          value={v.close_message}
                          onChange={(e) => set("close_message", e.target.value)}
                          placeholder={view?.defaults.close_message}
                          data-testid="stale-close-message"
                        />
                      </div>
                    )}
                  />
              </>
            </SettingsSection>
          </fieldset>
          {!readOnly && (
            <SaveBar
              persistent
              count={form.count}
              context={target === "team" ? "all repositories" : repo}
              problem={problem}
              onSave={save}
              onDiscard={() => {
                form.discard();
                setProblem(null);
              }}
              saving={saving}
              saveLabel="Save settings"
              testId="stale-save-bar"
            />
          )}
        </>
      )}

    </section>
  );
}
