"use client";

// Stale pull requests: settings for every repository, a repository's own
// settings, the plan (what Coderhelm marks or closes next) and what it did.
// The rules live in coderhelm-platform's common::stale_prs.

import { useCallback, useEffect, useState } from "react";
import { api, type StaleActivity, type StaleConfig, type StaleConfigView, type StalePlanItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { linkButton, monoInputClass, secondaryButton } from "@/components/ui";
import { Code, Field, SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";

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

const day = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const ACTION_WORD: Record<StalePlanItem["action"], string> = {
  mark: "Marks stale",
  close: "Closes",
  unmark: "Un-stales",
  wait: "Marked stale",
  exempt: "Kept open",
};

const LOG_WORD: Record<string, string> = {
  marked: "Marked stale",
  closed: "Closed",
  unstaled: "Un-staled",
  kept_open: "Kept open",
  allowed_to_close: "Allowed to close",
};

/** One sentence: what the cleanup does with these settings. */
export function staleSummary(c: StaleConfig): string {
  if (!c.enabled) return "Off. Coderhelm never marks or closes pull requests here.";
  const what = c.scope === "own" ? "Coderhelm's own pull requests" : "pull requests";
  const base = `Marks ${what} stale after ${c.stale_days} days without activity and closes them ${c.close_days} days later.`;
  return c.dry_run ? `Dry run: shows what it would do and changes nothing. ${base}` : base;
}

export function StaleSection({ repo, readOnly }: { repo: string; readOnly: boolean }) {
  const { toast } = useToast();
  const [view, setView] = useState<StaleConfigView | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [target, setTarget] = useState<Target>(repo ? "repo" : "team");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const form = useDirtyForm<Form>({ ...STALE_DEFAULTS, own: false }, { disabled: loadState !== "ready" });
  const { values: f, set, reset } = form;

  useEffect(() => {
    if (!repo) setTarget("team");
  }, [repo]);

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
      value={f[key]}
      onChange={(e) => set(key, Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
      controlClassName="sm:w-32"
      data-testid={`stale-${key}`}
    />
  );

  return (
    <section id="stale" aria-labelledby="stale-heading" className="mt-6 min-w-0" data-testid="stale-section">
      <h2 id="stale-heading" className="text-sm font-semibold text-zinc-100">Stale pull requests</h2>
      <p className="mt-1 max-w-prose text-sm text-zinc-400">
        Coderhelm marks pull requests nobody has touched for a while, warns on them, and closes them after a grace period if nothing happens.
        Coderhelm&apos;s own comments and other bots never count as activity. Nothing is lost: closing keeps the branch, and reopening picks it back up.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented<Target>
          label="Settings for"
          value={target}
          onChange={setTarget}
          options={[{ value: "team" as Target, label: "Every repository" }, ...(repo ? [{ value: "repo" as Target, label: `Only ${repo}` }] : [])]}
        />
        {!repo && <span className="text-sm text-zinc-400">Choose a repository above to give it its own settings or see its pull requests.</span>}
      </div>

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
          <p className="mt-4 text-sm text-zinc-300" data-testid="stale-summary">
            {target === "repo" && !f.own ? `${repo} follows the settings for every repository. ` : ""}
            {staleSummary(effective)}
          </p>
          <fieldset disabled={readOnly} className="mt-4 min-w-0">
            <legend className="sr-only">Stale pull request settings</legend>
            <SettingsSection id="stale-settings" title={target === "team" ? "Every repository" : repo}>
              {target === "repo" && (
                <SettingsRow
                  label="Use its own settings"
                  help="Off: this repository follows the settings for every repository."
                  unsaved={form.isDirty("own")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => (
                    <Switch id={inputId} checked={f.own} onChange={(v) => set("own", v)} labelledBy={labelId} describedBy={helpId} testId="stale-own" />
                  )}
                />
              )}
              {editing && (
                <>
                  <SettingsRow
                    label="Close stale pull requests"
                    help="Only on repositories the reviewer is on for. Off by default."
                    unsaved={form.isDirty("enabled")}
                    layout="toggle"
                    control={({ labelId, helpId, inputId }) => (
                      <Switch id={inputId} checked={f.enabled} onChange={(v) => set("enabled", v)} labelledBy={labelId} describedBy={helpId} testId="stale-enabled" />
                    )}
                  />
                  <SettingsRow
                    label="Dry run"
                    help="Shows what would be marked and closed below, and changes nothing on GitHub. Turn it off once the list looks right."
                    unsaved={form.isDirty("dry_run")}
                    layout="toggle"
                    control={({ labelId, helpId, inputId }) => (
                      <Switch id={inputId} checked={f.dry_run} onChange={(v) => set("dry_run", v)} labelledBy={labelId} describedBy={helpId} testId="stale-dry-run" />
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
                        value={f.scope}
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
                          value={f.exempt_labels.join(", ")}
                          onChange={(e) => set("exempt_labels", list(e.target.value))}
                          data-testid="stale-exempt-labels"
                        />
                        <Field
                          label="Authors"
                          help="GitHub logins, comma separated. Bots too, like renovate[bot]."
                          mono
                          unsaved={form.isDirty("exempt_authors")}
                          value={f.exempt_authors.join(", ")}
                          onChange={(e) => set("exempt_authors", list(e.target.value))}
                          data-testid="stale-exempt-authors"
                        />
                        <label className="flex items-center gap-3 text-sm text-zinc-200">
                          <Switch checked={f.exempt_drafts} onChange={(v) => set("exempt_drafts", v)} label="Never mark drafts" testId="stale-exempt-drafts" />
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
                        value={f.label}
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
                      <Switch id={inputId} checked={f.delete_branch} onChange={(v) => set("delete_branch", v)} labelledBy={labelId} describedBy={helpId} testId="stale-delete-branch" />
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
                          value={f.warn_message}
                          onChange={(e) => set("warn_message", e.target.value)}
                          placeholder={view?.defaults.warn_message}
                          data-testid="stale-warn-message"
                        />
                        <Field
                          as="textarea"
                          label="When closing"
                          rows={3}
                          unsaved={form.isDirty("close_message")}
                          value={f.close_message}
                          onChange={(e) => set("close_message", e.target.value)}
                          placeholder={view?.defaults.close_message}
                          data-testid="stale-close-message"
                        />
                      </div>
                    )}
                  />
                </>
              )}
            </SettingsSection>
          </fieldset>
          {!readOnly && (
            <SaveBar
              persistent
              count={form.count}
              context={target === "team" ? "every repository" : repo}
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

      {repo && <StaleActivityPanel repo={repo} readOnly={readOnly} />}
    </section>
  );
}

function StaleActivityPanel({ repo, readOnly }: { repo: string; readOnly: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<StaleActivity | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<number | "preview" | null>(null);

  const load = useCallback(() => {
    setState("loading");
    api
      .getStaleActivity(repo)
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [repo]);
  useEffect(load, [load]);

  const preview = async () => {
    setBusy("preview");
    try {
      await api.previewStale(repo);
      toast("Checking now. The list updates in a minute or two.");
      window.setTimeout(load, 20_000);
    } catch {
      toast("Could not start the check. Try again.", "error");
    }
    setBusy(null);
  };

  const keep = async (pr: number, value: boolean, title: string, url: string) => {
    setBusy(pr);
    try {
      await api.setStaleKeepOpen(repo, pr, value, title, url);
      toast(value ? `#${pr} stays open` : `#${pr} can be closed again`);
      load();
    } catch {
      toast("Could not change it. Try again.", "error");
    }
    setBusy(null);
  };

  const plan = data?.plan;
  const kept = new Set((data?.kept_open ?? []).map((k) => k.pr));
  const items = (plan?.items ?? []).filter((i) => i.action !== "exempt" || !kept.has(i.pr));

  return (
    <div className="mt-8 min-w-0 space-y-6" data-testid="stale-activity">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">Pull requests on {repo}</h3>
            <p className="mt-0.5 text-sm text-zinc-400">
              {plan
                ? `${plan.dry_run ? "Preview, nothing changed. " : ""}Checked ${day(plan.computed_at)}.${plan.stopped ? ` Stopped early: ${plan.stopped}.` : ""}`
                : "Not checked yet. Checking reads GitHub and changes nothing."}
            </p>
          </div>
          <button type="button" className={secondaryButton} onClick={preview} disabled={busy === "preview"} data-testid="stale-preview">
            {busy === "preview" ? "Starting…" : "Check now"}
          </button>
        </div>
        {state === "loading" ? (
          <div className="p-4">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : state === "error" ? (
          <div className="p-4">
            <Problem title="Could not load the pull requests" onRetry={load}>
              Try again.
            </Problem>
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing to mark or close">No open pull request has gone quiet long enough.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800" data-testid="stale-plan">
            {items.map((i) => (
              <li key={i.pr} className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`stale-plan-${i.pr}`}>
                <div className="min-w-0">
                  <p className="min-w-0 text-sm text-zinc-100">
                    <span className={`mr-2 text-xs font-medium ${i.action === "close" ? "text-red-300" : i.action === "mark" || i.action === "wait" ? "text-amber-300" : "text-zinc-400"}`}>
                      {ACTION_WORD[i.action]}
                      {i.action === "wait" && i.next_at ? `, closes ${day(i.next_at)}` : ""}
                      {i.action === "mark" && i.next_at ? `, would close ${day(i.next_at)}` : ""}
                    </span>
                    <a href={i.url} target="_blank" rel="noreferrer" className={linkButton}>
                      <span className="wrap-anywhere">#{i.pr} {i.title}</span>
                    </a>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {i.author ? `${i.author} · ` : ""}last activity {day(i.last_activity)} ({i.last_what}) · {i.why}
                  </p>
                </div>
                {!readOnly && i.action !== "exempt" && i.action !== "unmark" && (
                  <button type="button" className={`${secondaryButton} shrink-0`} disabled={busy === i.pr} onClick={() => keep(i.pr, true, i.title, i.url)}>
                    Keep open
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!!data?.kept_open.length && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
          <h3 className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">Kept open</h3>
          <ul className="divide-y divide-zinc-800" data-testid="stale-kept">
            {data.kept_open.map((k) => (
              <li key={k.pr} className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-sm text-zinc-200">
                  <a href={k.url} target="_blank" rel="noreferrer" className={linkButton}>
                    <span className="wrap-anywhere">#{k.pr} {k.title}</span>
                  </a>
                  <span className="ml-2 text-xs text-zinc-400">
                    by {k.by}
                    {k.via === "comment" ? " (comment)" : ""} · {day(k.at)}
                  </span>
                </p>
                {!readOnly && (
                  <button type="button" className={`${secondaryButton} shrink-0`} disabled={busy === k.pr} onClick={() => keep(k.pr, false, k.title, k.url)}>
                    Allow closing
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <h3 className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">What Coderhelm did</h3>
        {!data?.log.length ? (
          <p className="px-4 py-3 text-sm text-zinc-400">Nothing yet. Every pull request marked, closed, un-staled or kept open shows here.</p>
        ) : (
          <ul className="divide-y divide-zinc-800" data-testid="stale-log">
            {data.log.map((e) => (
              <li key={`${e.at}-${e.pr}-${e.action}`} className="min-w-0 px-4 py-3 text-sm">
                <p className="min-w-0 text-zinc-200">
                  <span className="mr-2 text-xs font-medium text-zinc-400">{LOG_WORD[e.action] ?? e.action}</span>
                  <a href={e.url} target="_blank" rel="noreferrer" className={linkButton}>
                    <span className="wrap-anywhere">#{e.pr} {e.title}</span>
                  </a>
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {day(e.at)} · {e.why}
                  {e.run_id ? " · its run was closed" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Callout variant="neutral" title="Keep one open from GitHub">
        <p>
          Comment <Code>@coderhelm keep open</Code> on the pull request, push a commit, or remove the stale label.
        </p>
      </Callout>
    </div>
  );
}
