"use client";

// Stale pull request settings, the Settings view of the Stale PRs page
// (/reviewer/stale?view=settings): the settings for all repositories, or one
// repository's, picked with the page's "Settings for" control. A repository
// inherits the team's settings until it is given its own. The rules live in
// coderhelm-platform's common::stale_prs.

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { api, type StaleConfig, type StaleConfigView } from "@/lib/api";
import { STATE_WORD, modeHelp, otherRepoModes, plural, staleState, timingLine, withMode, type StaleState } from "@/lib/stale";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { linkButton, monoInputClass } from "@/components/ui";
import { Chip } from "@/components/list";
import { ScopeBadge } from "@/components/settings-scope";
import { Field, SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";

export const STALE_DEFAULTS: StaleConfig = {
  enabled: false,
  stale_days: 7,
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

/** One sentence: what the cleanup does with these settings, in the mode's own words. */
export function staleSummary(c: StaleConfig): string {
  const mode = staleState(c);
  if (mode === "off") return "Off: nothing happens. Coderhelm never labels, comments on or closes a pull request.";
  if (mode === "dry_run") return "Preview only: nothing changes on GitHub.";
  const what = c.scope === "own" ? "Coderhelm's own pull requests" : "pull requests";
  return `On: marks ${what} stale after ${plural(c.stale_days, "day")} with no activity and closes them ${plural(c.close_days, "day")} later.`;
}

const MODES: StaleState[] = ["off", "dry_run", "on"];

/** Off, Preview only or On: one choice, each with a plain line under it. */
function ModeChoice({ value, onChange, timing, labelledBy, disabled }: { value: StaleState; onChange: (m: StaleState) => void; timing: Pick<StaleConfig, "stale_days" | "close_days" | "max_closes_per_run">; labelledBy: string; disabled?: boolean }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid min-w-0 gap-2 sm:grid-cols-3" data-testid="stale-mode">
      {MODES.map((m) => {
        const picked = value === m;
        return (
          <label
            key={m}
            className={`flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 text-sm transition-colors motion-reduce:transition-none ${
              picked ? "border-zinc-300 bg-zinc-800/80" : "border-zinc-800 hover:border-zinc-600"
            } ${disabled ? "cursor-not-allowed opacity-70" : ""} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-300`}
            data-testid={`stale-mode-${m}`}
            data-picked={picked ? "true" : undefined}
          >
            <span className="flex flex-wrap items-center gap-2">
              <input type="radio" name={name} value={m} checked={picked} disabled={disabled} onChange={() => onChange(m)} className="h-4 w-4 accent-emerald-500" />
              <span className="font-medium text-zinc-100">{STATE_WORD[m]}</span>
              {m === "dry_run" && <Chip tone="info">Recommended to start</Chip>}
            </span>
            <span className="text-zinc-400">{modeHelp(m, timing)}</span>
          </label>
        );
      })}
    </div>
  );
}

/** What the page lists, for the sentence at the top of the settings. */
export interface StaleCounts {
  marked: number;
  next: number;
  nextHref: string;
  markedHref: string;
}

/** The settings for all repositories (no repo), or one repository's. `onSaved` runs after a save. */
export function StaleSection({ repo, readOnly, onSaved, counts }: { repo: string; readOnly: boolean; onSaved?: () => void; counts?: StaleCounts }) {
  const { toast } = useToast();
  const [view, setView] = useState<StaleConfigView | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const target: Target = repo ? "repo" : "team";
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const form = useDirtyForm<Form>({ ...STALE_DEFAULTS, own: false }, { disabled: loadState !== "ready" });
  const { values: f, set, update, reset } = form;

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
          <div className="mt-4 space-y-1 text-sm" data-testid="stale-summary" data-state={staleState(effective)}>
            <p className="text-zinc-200">
              {target === "repo" && !f.own ? `${repo} uses the settings for all repositories. ` : ""}
              {staleSummary(effective)}
              {counts && staleState(effective) === "dry_run" && (
                <>
                  {" "}
                  <Link href={counts.nextHref} className={`${linkButton} !text-sm`}>
                    {plural(counts.next, "pull request")} would be marked or closed
                  </Link>
                  .
                </>
              )}
              {counts && staleState(effective) === "on" && counts.marked > 0 && (
                <>
                  {" "}
                  <Link href={counts.markedHref} className={`${linkButton} !text-sm`}>
                    {plural(counts.marked, "pull request")} marked stale
                  </Link>
                  .
                </>
              )}
            </p>
            {target === "team" && view && !view.team_saved && (
              <p className="text-zinc-500" data-testid="stale-not-set">
                Not set for all repositories yet, so it is off (the default). Pick a mode and save.
              </p>
            )}
            {target === "team" &&
              otherRepoModes(view?.repo_configs, staleState(effective)).map((g) => (
                <p key={g.state} className="text-zinc-400" data-testid="stale-repo-modes" data-state={g.state}>
                  {STATE_WORD[g.state]} on {g.repos.length > 3 ? plural(g.repos.length, "repository", "repositories") : g.repos.join(", ")}, which {g.repos.length === 1 ? "has its" : "have their"} own settings. Pick one under Settings for to change it.
                </p>
              ))}
          </div>
          <fieldset disabled={readOnly || !editing} className={`mt-4 min-w-0 ${editing ? "" : "opacity-60"}`} data-inherited={editing ? undefined : "true"}>
            <legend className="sr-only">Stale pull request settings</legend>
            <SettingsSection id="stale-settings" title={target === "team" ? "All repositories" : repo}>
              <>
                  <SettingsRow
                    label="Mode"
                    help="What Coderhelm does with pull requests nobody has worked on for a while."
                    unsaved={form.isDirty("enabled", "dry_run")}
                    layout="stacked"
                    control={({ labelId }) => (
                      <ModeChoice value={staleState(v)} onChange={(m) => update((p) => withMode(p, m))} timing={v} labelledBy={labelId} disabled={readOnly || !editing} />
                    )}
                    testId="stale-mode-row"
                  />
                  <SettingsRow
                    label="Timing"
                    help={
                      <>
                        <span className="block font-medium text-zinc-200" data-testid="stale-timing-line">{timingLine(v)}</span>
                        <span className="block">Activity is a commit, or a person&apos;s comment, review, review comment or label change.</span>
                      </>
                    }
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
