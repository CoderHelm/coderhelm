"use client";

// The security fixes policy: whether it is on, what gets a pull request and
// when, what is posted to the alerts channel, the deadlines, the labels, and
// what is ignored. Every SecurityConfig field the gateway keeps
// (PUT /api/security/config) is edited here.

import { useEffect, useState } from "react";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
import { Chip, useTeamRepos } from "@/components/list";
import { Field, SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";
import { focusRing, monoInputClass, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { XIcon } from "@/components/icons";
import {
  OPEN_PRS_LABEL,
  SECURITY_ADMIN,
  SECURITY_DEFAULTS,
  TIERS,
  configProblems,
  labelProblem,
  repoName,
  securityApi,
  type IgnoreRule,
  type OpenPrs,
  type SecurityConfig,
  type SecurityPreview,
  type Tier,
} from "@/lib/security";
import { TierPill } from "../parts";

const TIER_WHEN: Record<Tier, string> = {
  P0: "Exploited and loaded, or critical and reachable, or a malicious package.",
  P1: "High and reachable, or likely to be exploited soon.",
  P2: "Medium and reachable, or high but not reachable.",
  P3: "Dev only, not loaded, or low.",
};

const OPEN_PRS_OPTIONS = (Object.keys(OPEN_PRS_LABEL) as OpenPrs[]).map((v) => ({ value: v, label: OPEN_PRS_LABEL[v] }));

export default function SecurityPolicyPage() {
  const { toast } = useToast();
  const { ready, can, me } = useCan();
  const readOnly = ready && !can(SECURITY_ADMIN);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [defaults, setDefaults] = useState<SecurityConfig>(SECURITY_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useDirtyForm<SecurityConfig>(SECURITY_DEFAULTS, { disabled: state !== "ready" });
  const { values: c, set, reset } = form;
  const teamRepos = useTeamRepos();

  useEffect(() => {
    let live = true;
    setState("loading");
    securityApi.config().then(
      (r) => {
        if (!live) return;
        reset(r.config);
        setDefaults(r.defaults);
        setState("ready");
      },
      (e) => {
        if (!live) return;
        setLoadError(e instanceof Error ? e.message : "The request failed.");
        setState("error");
      },
    );
    return () => {
      live = false;
    };
  }, [attempt, reset]);

  const save = async () => {
    const problems = configProblems(c);
    if (problems.length) {
      setProblem(problems.join(" "));
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await securityApi.saveConfig(c);
      reset(c);
      toast("Security policy saved");
    } catch (e) {
      const msg = e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can change the policy." : e instanceof Error && e.message ? e.message : "Could not save. Try again.";
      setProblem(msg);
      toast(msg, "error");
    }
    setSaving(false);
  };

  const notDefault = (k: keyof SecurityConfig) => JSON.stringify(c[k]) !== JSON.stringify(defaults[k]);
  const tierRecord = <K extends "open_prs" | "post_alerts" | "due_days">(key: K, tier: Tier, value: SecurityConfig[K][Tier]) =>
    set(key, { ...c[key], [tier]: value } as SecurityConfig[K]);

  return (
    <Page narrow>
      <PageHeader
        title="Security policy"
        lead="What Coderhelm does when an advisory touches your dependencies: which findings get a pull request and when, what is posted to your alerts channel, and the deadlines."
      />

      {readOnly && (
        <div className="mt-6">
          <Callout variant="info" title="Only admins can change the policy">
            <p>You can read it. Ask an admin on your team if something here should change.</p>
          </Callout>
        </div>
      )}

      {state === "loading" ? (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading the policy">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : state === "error" ? (
        <div className="mt-6">
          <Problem title="We couldn't load the policy" onRetry={() => setAttempt((n) => n + 1)} testId="policy-error">
            {loadError} Saving is off until it loads, so nothing is overwritten by mistake.
          </Problem>
        </div>
      ) : (
        <>
          <fieldset disabled={readOnly} className="mt-6 min-w-0 space-y-6">
            <legend className="sr-only">Security policy</legend>
            <SettingsSection id="on" title="Security fixes" description="Off for new teams. Start with dry run on to see what it would do.">
              <SettingsRow
                label="Security fixes"
                help="Check advisories against your code, open fix pull requests and post urgent ones."
                unsaved={form.isDirty("enabled")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.enabled} onChange={(v) => set("enabled", v)} labelledBy={labelId} describedBy={helpId} testId="sec-enabled" />
                )}
              />
              <SettingsRow
                label="Dry run"
                help="Finds and checks advisories, but opens no pull requests and posts nothing. Turn it off once the preview looks right."
                unsaved={form.isDirty("dry_run")}
                notDefault={notDefault("dry_run")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.dry_run} onChange={(v) => set("dry_run", v)} labelledBy={labelId} describedBy={helpId} testId="sec-dry-run" />
                )}
              />
              <SettingsRow
                label="Repos"
                unsaved={form.isDirty("repos")}
                layout="stacked"
                control={() => (
                  <div className="space-y-3">
                    <Segmented<"all" | "some">
                      label="Which repos"
                      value={c.repos === "all" ? "all" : "some"}
                      onChange={(v) => set("repos", v === "all" ? "all" : Array.isArray(c.repos) ? c.repos : [])}
                      options={[
                        { value: "all", label: "Every repo" },
                        { value: "some", label: "Only these" },
                      ]}
                    />
                    {Array.isArray(c.repos) && (
                      <RepoChecklist
                        chosen={c.repos}
                        repos={teamRepos}
                        onChange={(list) => set("repos", list)}
                      />
                    )}
                  </div>
                )}
              />
            </SettingsSection>

            <PreviewPanel readOnly={readOnly} />

            <SettingsSection
              id="tiers"
              title="Pull requests and alerts"
              description="Each finding gets a tier from whether your code reaches it, its severity, the exploited list and its exploit score."
            >
              {TIERS.map((t) => (
                <SettingsRow
                  key={t}
                  label={`${t} findings`}
                  help={TIER_WHEN[t]}
                  unsaved={form.isDirty("open_prs", "post_alerts")}
                  marks={<TierPill tier={t} />}
                  layout="stacked"
                  testId={`tier-${t}`}
                  control={({ inputId }) => (
                    <div className="flex min-w-0 flex-wrap items-end gap-4">
                      <Field
                        as="select"
                        id={inputId}
                        label="Open a pull request"
                        value={c.open_prs[t]}
                        onChange={(v) => tierRecord("open_prs", t, v as OpenPrs)}
                        options={OPEN_PRS_OPTIONS}
                        controlClassName="sm:w-56"
                      />
                      <label className="flex min-h-9 items-center gap-3 text-sm text-zinc-200">
                        <Switch
                          checked={c.post_alerts[t]}
                          onChange={(v) => tierRecord("post_alerts", t, v)}
                          label={`Post ${t} findings to the alerts channel`}
                          testId={`post-${t}`}
                        />
                        Post to the alerts channel
                      </label>
                    </div>
                  )}
                />
              ))}
              <SettingsRow
                label="Remind at half the deadline"
                help="Posts an update to the same card when half the time is gone, and again at the deadline."
                unsaved={form.isDirty("escalate_half")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.escalate_half} onChange={(v) => set("escalate_half", v)} labelledBy={labelId} describedBy={helpId} testId="sec-escalate" />
                )}
              />
              <SettingsRow
                label="Major version bumps"
                help="When the only fixed version is a new major, its breaking changes usually need code changes too."
                unsaved={form.isDirty("major_bumps")}
                layout="stacked"
                control={() => (
                  <Segmented<SecurityConfig["major_bumps"]>
                    label="Major version bumps"
                    value={c.major_bumps}
                    onChange={(v) => set("major_bumps", v)}
                    options={[
                      { value: "fix_in_pr", label: "Fix breaking changes in the same PR" },
                      { value: "issue_only", label: "Open an issue only" },
                    ]}
                  />
                )}
              />
              <SettingsRow
                label="Take over Dependabot and Renovate pull requests"
                help="When one already exists for the fix, Coderhelm adds its findings and fixes its CI instead of opening a second one."
                unsaved={form.isDirty("adopt_bot_prs")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.adopt_bot_prs} onChange={(v) => set("adopt_bot_prs", v)} labelledBy={labelId} describedBy={helpId} testId="sec-adopt" />
                )}
              />
            </SettingsSection>

            <SettingsSection id="deadlines" title="Deadlines" description="Days from when Coderhelm first sees a finding until it should be fixed.">
              <SettingsRow
                label="Days to fix"
                unsaved={form.isDirty("due_days")}
                notDefault={notDefault("due_days")}
                layout="stacked"
                control={() => (
                  <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
                    {TIERS.map((t) => {
                      const d = c.due_days[t];
                      const bad = !Number.isInteger(d) || d < 1 || d > 365;
                      return (
                        <Field
                          key={t}
                          label={t}
                          type="number"
                          min={1}
                          max={365}
                          value={Number.isFinite(d) ? d : ""}
                          onChange={(e) => tierRecord("due_days", t, e.target.value === "" ? Number.NaN : Number(e.target.value))}
                          error={bad ? "From 1 to 365." : undefined}
                          data-testid={`due-${t}`}
                        />
                      );
                    })}
                  </div>
                )}
              />
              <SettingsRow
                label="Use the exploited list's date when it is sooner"
                help="CISA gives each vulnerability on its exploited list a date to fix it by."
                unsaved={form.isDirty("use_kev_due")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.use_kev_due} onChange={(v) => set("use_kev_due", v)} labelledBy={labelId} describedBy={helpId} testId="sec-kev-due" />
                )}
              />
            </SettingsSection>

            <SettingsSection id="labels" title="Pull request labels" description="Created in the repo if missing.">
              <SettingsRow
                label="Labels on every fix"
                help="At most 20, each up to 50 characters."
                unsaved={form.isDirty("labels")}
                layout="stacked"
                control={() => <LabelsEditor labels={c.labels} onChange={(l) => set("labels", l)} />}
              />
              <SettingsRow
                label="Severity label"
                help="severity:critical, severity:high, severity:medium or severity:low."
                unsaved={form.isDirty("severity_labels")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.severity_labels} onChange={(v) => set("severity_labels", v)} labelledBy={labelId} describedBy={helpId} testId="sec-severity-labels" />
                )}
              />
              <SettingsRow
                label="Reachability label"
                help="reachable, not-reachable or reachability:unknown."
                unsaved={form.isDirty("reachability_labels")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.reachability_labels} onChange={(v) => set("reachability_labels", v)} labelledBy={labelId} describedBy={helpId} testId="sec-reach-labels" />
                )}
              />
              <SettingsRow
                label="Ecosystem label"
                help="The label Dependabot would use, like javascript or python, so existing filters keep working."
                unsaved={form.isDirty("ecosystem_labels")}
                layout="toggle"
                control={({ labelId, helpId, inputId }) => (
                  <Switch id={inputId} checked={c.ecosystem_labels} onChange={(v) => set("ecosystem_labels", v)} labelledBy={labelId} describedBy={helpId} testId="sec-eco-labels" />
                )}
              />
            </SettingsSection>

            <SettingsSection id="ignore" title="Ignored" description="Every ignore needs a reason and an end date, so nothing is ignored forever by accident.">
              <IgnoreList rules={c.ignore} onChange={(r) => set("ignore", r)} repos={teamRepos} by={me?.email ?? ""} unsaved={form.isDirty("ignore")} />
            </SettingsSection>
          </fieldset>

          {!readOnly && (
            <SaveBar
              persistent
              count={form.count}
              problem={problem}
              onSave={save}
              onDiscard={() => {
                form.discard();
                setProblem(null);
              }}
              saving={saving}
              saveLabel="Save policy"
              testId="policy-save-bar"
            />
          )}
        </>
      )}
    </Page>
  );
}

function RepoChecklist({ chosen, repos, onChange }: { chosen: string[]; repos: string[]; onChange: (list: string[]) => void }) {
  const all = [...new Set([...repos, ...chosen])].sort((a, b) => a.localeCompare(b));
  if (all.length === 0) return <p className="text-sm text-zinc-400">No repos are connected yet.</p>;
  return (
    <ul className="grid min-w-0 gap-1 sm:grid-cols-2" data-testid="repo-checklist">
      {all.map((r) => (
        <li key={r} className="min-w-0">
          <label className="flex min-h-8 min-w-0 items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-zinc-100"
              checked={chosen.includes(r)}
              onChange={(e) => onChange(e.target.checked ? [...chosen, r] : chosen.filter((x) => x !== r))}
            />
            <span className="min-w-0 [overflow-wrap:anywhere]" title={r}>
              {r}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function LabelsEditor({ labels, onChange }: { labels: string[]; onChange: (l: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const p = labelProblem(draft, labels);
    if (p) {
      setProblem(p);
      return;
    }
    onChange([...labels, draft.trim()]);
    setDraft("");
    setProblem(null);
  };
  return (
    <div className="space-y-3">
      <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Labels" data-testid="labels">
        {labels.length === 0 && <li className="text-sm text-zinc-400">No labels.</li>}
        {labels.map((l) => (
          <li key={l} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 py-0.5 pl-2.5 pr-1 font-mono text-xs text-zinc-200">
            <span className="min-w-0 truncate" title={l}>
              {l}
            </span>
            <button
              type="button"
              aria-label={`Remove ${l}`}
              onClick={() => onChange(labels.filter((x) => x !== l))}
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 ${focusRing}`}
            >
              <span aria-hidden="true" className="scale-75">
                <XIcon />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <input
          aria-label="New label"
          className={`${monoInputClass} min-w-0 flex-1 sm:max-w-64`}
          value={draft}
          maxLength={60}
          placeholder="new-label"
          onChange={(e) => {
            setDraft(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          data-testid="label-input"
        />
        <button type="button" className={secondaryButton} onClick={add} data-testid="label-add">
          Add label
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-300">
          {problem}
        </p>
      )}
    </div>
  );
}

function IgnoreList({ rules, onChange, repos, by, unsaved }: { rules: IgnoreRule[]; onChange: (r: IgnoreRule[]) => void; repos: string[]; by: string; unsaved: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({ advisory: "", repo: "", reason: "", until: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({});
  const add = () => {
    const e: typeof errors = {};
    if (!draft.advisory.trim()) e.advisory = "Type the advisory ID, like CVE-2026-1234 or GHSA-xxxx-xxxx-xxxx.";
    if (!draft.reason.trim()) e.reason = "Say why it is safe to ignore.";
    if (!draft.until) e.until = "Pick the date the ignore ends.";
    else if (draft.until <= today) e.until = "The end date must be after today.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onChange([...rules, { advisory: draft.advisory.trim(), repo: draft.repo || null, reason: draft.reason.trim(), until: draft.until, by }]);
    setDraft({ advisory: "", repo: "", reason: "", until: "" });
  };
  return (
    <div className="min-w-0 px-4 py-4" data-testid="ignore">
      {unsaved && (
        <p className="mb-2">
          <Chip tone="waiting">Unsaved</Chip>
        </p>
      )}
      {rules.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing is ignored.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="ignore-list">
          {rules.map((r, i) => {
            const ended = r.until && r.until < today;
            return (
              <li key={`${r.advisory}-${r.repo}-${i}`} className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="min-w-0 text-zinc-100 [overflow-wrap:anywhere]">
                    <span className="font-mono">{r.advisory}</span> in {r.repo ? repoName(r.repo) : "every repo"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                    “{r.reason}” · until {r.until}
                    {ended ? " (ended)" : ""}
                    {r.by ? ` · by ${r.by}` : ""}
                  </p>
                </div>
                <button type="button" className={`${smallSecondaryButton} shrink-0`} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2" data-testid="ignore-add">
        <Field
          label="Advisory ID"
          mono
          value={draft.advisory}
          onChange={(e) => setDraft({ ...draft, advisory: e.target.value })}
          placeholder="CVE-2026-1234"
          error={errors.advisory}
          data-testid="ignore-advisory"
        />
        <Field
          as="select"
          label="Repo"
          value={draft.repo}
          onChange={(v) => setDraft({ ...draft, repo: v })}
          options={[{ value: "", label: "Every repo" }, ...repos.map((r) => ({ value: r, label: r }))]}
        />
        <Field
          label="Reason"
          className="sm:col-span-2"
          value={draft.reason}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          placeholder="For example: only used by the build, never shipped."
          error={errors.reason}
          data-testid="ignore-reason"
        />
        <Field
          label="Until"
          type="date"
          min={today}
          value={draft.until}
          onChange={(e) => setDraft({ ...draft, until: e.target.value })}
          error={errors.until}
          data-testid="ignore-until"
        />
        <div className="flex items-end">
          <button type="button" className={secondaryButton} onClick={add} data-testid="ignore-add-button">
            Add to ignored
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ readOnly }: { readOnly: boolean }) {
  const [preview, setPreview] = useState<SecurityPreview | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const load = () => {
    setState("loading");
    securityApi.preview().then(
      (p) => {
        setPreview(p);
        setState("idle");
      },
      (e) => {
        setError(e instanceof Error ? e.message : "The request failed.");
        setState("error");
      },
    );
  };
  return (
    <section id="preview" aria-labelledby="preview-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h2 id="preview-heading" className="text-sm font-semibold text-zinc-100">
            Preview
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">What Coderhelm would open and post with the saved policy. It changes nothing.</p>
        </div>
        {!readOnly && (
          <button type="button" className={secondaryButton} onClick={load} disabled={state === "loading"} data-testid="preview-load">
            {state === "loading" ? "Loading…" : preview ? "Show again" : "Show what it would open"}
          </button>
        )}
      </div>
      {state === "error" ? (
        <div className="p-4">
          <Problem title="We couldn't load the preview" onRetry={load} compact>
            {error}
          </Problem>
        </div>
      ) : preview ? (
        <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2">
          <PreviewList title="Pull requests it would open" items={preview.would_open} empty="None right now." testId="would-open" />
          <PreviewList title="Cards it would post" items={preview.would_post} empty="None right now." testId="would-post" />
        </div>
      ) : (
        readOnly && <p className="px-4 py-3 text-sm text-zinc-400">Only admins can see the preview.</p>
      )}
    </section>
  );
}

function PreviewList({ title, items, empty, testId }: { title: string; items: SecurityPreview["would_open"]; empty: string; testId: string }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium text-zinc-200">
        {title} <span className="tabular-nums text-zinc-400">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid={testId}>
          {items.map((i, n) => (
            <li key={`${i.finding_id}-${n}`} className="flex min-w-0 items-start gap-2 text-sm">
              <TierPill tier={i.tier} />
              <span className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
                {i.title} <span className="text-zinc-400">in {repoName(i.repo)}</span>
                {(i.branch || (i.labels?.length ?? 0) > 0) && (
                  <span className="mt-0.5 block text-xs text-zinc-400 [overflow-wrap:anywhere]">
                    {[i.branch, i.labels?.join(", ")].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
