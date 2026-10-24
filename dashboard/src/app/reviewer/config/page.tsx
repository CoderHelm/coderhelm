"use client";

import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ReviewerConfig as ApiReviewerConfig, type Repo } from "@/lib/api";
import { ChannelPicker, channelsPayload, channelsSummary, draftFrom, draftValid, type ChannelsDraft } from "@/components/chat-channels";

/** The form: the API's settings plus the reminder channels being edited
 * (saved webhooks are never sent back, only changes). */
type ReviewerConfig = ApiReviewerConfig & { channels: ChannelsDraft };
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { Chip, StatusText, type StatusLook } from "@/components/list";
import { focusRing, inputClass, linkButton, monoInputClass, primaryButton, secondaryButton } from "@/components/ui";
import {
  Code,
  Field,
  RowMarks,
  SaveBar,
  SettingsDisclosure,
  SettingsRow,
  SettingsSection,
  Switch,
  sameSetting,
  useDirtyForm,
  useLeaveWarning,
} from "@/components/settings";
import { Page, PageHeader } from "@/components/page";
import { MarkdownEditor } from "@/components/markdown-editor";

export default function ReviewerConfigGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <ReviewerConfigPage />
    </RoleGuard>
  );
}

const DEFAULTS: ReviewerConfig = {
  enabled: false,
  label: "ch-review",
  killed: false,
  instructions: "",
  auto_merge: false,
  merge_method: "squash",
  require_human_approval: true,
  auto_tag: false,
  tag_mode: "semver",
  tag_prefix: "v",
  tag_batch_minutes: 15,
  health_check: false,
  verify_tests: false,
  require_tests: false,
  auto_labels: false,
  auto_label_allow: "",
  auto_label_requires: "",
  auto_label_guide: "",
  release_notes: false,
  release_notes_branch: "",
  release_notes_confluence_space: "",
  release_notes_confluence_parent_id: "",
  release_notes_confluence_container: "Changelog",
  release_notes_email_webhook_url: "",
  release_notes_guide: "",
  release_notes_instructions: "",
  deploy_label: "",
  health_log_groups: [],
  reminders_enabled: false,
  reminder_cooldown_hours: 4,
  channels: draftFrom(undefined),
};

type Key = keyof ReviewerConfig;

/** Health check log groups the backend keeps per repo; more are dropped on save. */
const MAX_LOG_GROUPS = 20;

const MERGE_METHODS = [
  { value: "squash", label: "Squash" },
  { value: "merge", label: "Merge commit" },
  { value: "rebase", label: "Rebase" },
];

const TAG_MODES = [
  { value: "semver", label: "Version number" },
  { value: "date", label: "Date and time" },
];

/** The page's sections, in order. The nav, the anchors and the summary read this. */
const SECTIONS = [
  { id: "reviews", title: "Reviews" },
  { id: "tests", title: "Tests" },
  { id: "labels", title: "CI labels" },
  { id: "merge", title: "Auto-merge" },
  { id: "after-merge", title: "Tags and health check" },
  { id: "release-notes", title: "Release notes" },
  { id: "reminders", title: "Review reminders" },
  { id: "stop", title: "Stop everything" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Which settings each section holds, for its "on/off" word and its unsaved dot. */
const SECTION_KEYS: Record<SectionId, Key[]> = {
  reviews: ["enabled", "label", "instructions"],
  tests: ["verify_tests", "require_tests"],
  labels: ["auto_labels", "auto_label_allow", "auto_label_requires", "auto_label_guide"],
  merge: ["auto_merge", "merge_method", "require_human_approval", "deploy_label"],
  "after-merge": ["auto_tag", "tag_mode", "tag_prefix", "tag_batch_minutes", "health_check", "health_log_groups"],
  "release-notes": [
    "release_notes", "release_notes_branch", "release_notes_confluence_parent_id", "release_notes_confluence_container",
    "release_notes_confluence_space", "release_notes_email_webhook_url", "release_notes_email_webhook_secret",
    "release_notes_email_webhook_secret_clear", "release_notes_guide", "release_notes_instructions",
  ],
  reminders: ["reminders_enabled", "channels", "reminder_cooldown_hours"],
  stop: ["killed"],
};

/** What the backend refuses with a bare 400, said before saving. */
function configProblem(cfg: ReviewerConfig): string | null {
  if (!draftValid(cfg.channels, cfg.webhooks, cfg.reminders_enabled)) {
    return cfg.reminders_enabled && !cfg.channels.teams.on && !cfg.channels.slack.on
      ? "Choose where reminders post: Microsoft Teams, Slack or both."
      : "Check the reminder webhook addresses: a Teams Workflows address or a Slack incoming webhook (https://hooks.slack.com/services/…).";
  }
  const email = cfg.release_notes_email_webhook_url.trim();
  if (email && !email.startsWith("https://")) return "The automation webhook URL for release notes must start with https://.";
  if (!/^\d*$/.test(cfg.release_notes_confluence_parent_id.trim())) return "The Confluence parent page id must be digits only.";
  if (cfg.instructions.length > 20_000) return "The review focus is too long (20,000 characters at most).";
  return null;
}

/** Turn a failed save into words: these endpoints answer with bare status codes. */
function saveError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/\b403\b/.test(msg)) return "Only admins can change reviewer settings.";
  if (/\b400\b/.test(msg)) return "A value was not accepted. Check the webhook URLs and the Confluence page id.";
  if (/\b413\b/.test(msg)) return "The text is too long to save.";
  return msg && !/^API \d+/.test(msg) ? msg : "Could not save. Try again.";
}

/** The reviewer's state on this repo as one word. */
function stateOf(cfg: ReviewerConfig): StatusLook {
  if (cfg.killed) return { label: "Stopped", tone: "danger" };
  if (!cfg.enabled) return { label: "Off", tone: "muted" };
  return { label: "On", tone: "success" };
}

/** The short word the nav shows next to each section. */
function sectionWord(id: SectionId, cfg: ReviewerConfig): string {
  switch (id) {
    case "reviews": return cfg.enabled ? "On" : "Off";
    case "tests": return cfg.verify_tests || cfg.require_tests ? "On" : "Off";
    case "labels": return cfg.auto_labels ? "On" : "Off";
    case "merge": return cfg.auto_merge ? "On" : "Off";
    case "after-merge": return cfg.auto_tag || cfg.health_check ? "On" : "Off";
    case "release-notes": return cfg.release_notes ? "On" : "Off";
    case "reminders": return cfg.reminders_enabled ? "On" : "Off";
    case "stop": return cfg.killed ? "Stopped" : "";
  }
}

/** What the reviewer does on this repo, one plain sentence per area. */
function summaryLines(cfg: ReviewerConfig): string[] {
  if (cfg.killed) return ["Every reviewer action on this repo is stopped, whatever else is set below."];
  if (!cfg.enabled) return ["The reviewer ignores this repo. Turn it on under Reviews."];
  const lines = [`Reviews pull requests labelled “${cfg.label || DEFAULTS.label}”.`];
  if (cfg.verify_tests) lines.push(`Runs the affected tests before it reviews${cfg.require_tests ? ", and blocks changes that come without tests" : ""}.`);
  else lines.push(`Reads the code without running tests${cfg.require_tests ? ", and blocks changes that come without tests" : ""}.`);
  if (cfg.auto_labels) lines.push("Adds the CI labels each pull request needs.");
  if (cfg.auto_merge) {
    const method = MERGE_METHODS.find((m) => m.value === cfg.merge_method)?.label.toLowerCase() ?? cfg.merge_method;
    lines.push(`Merges approved pull requests (${method}) ${cfg.require_human_approval ? "once a person has also approved" : "on its own approval alone"}.`);
  } else {
    lines.push("Leaves merging to people.");
  }
  const after: string[] = [];
  if (cfg.auto_tag) after.push("tags a release");
  if (cfg.health_check) after.push("watches the deploy");
  if (after.length) lines.push(`After a merge it ${after.join(" and ")}.`);
  if (cfg.release_notes) {
    const where = ["GitHub"];
    if (cfg.release_notes_confluence_parent_id) where.push("Confluence");
    if (cfg.release_notes_email_webhook_url) where.push("your automation webhook");
    lines.push(`Writes release notes for each tag (${where.join(", ")}).`);
  }
  if (cfg.reminders_enabled) {
    const where = channelsSummary(cfg.webhooks) || "chat";
    lines.push(`Reminds waiting reviewers in ${where}, at most every ${cfg.reminder_cooldown_hours} hours.`);
  }
  return lines;
}

// ── Building blocks ─────────────────────────────────────────────────

const shortInput = "sm:w-64";

// ── The page ────────────────────────────────────────────────────────

function ReviewerConfigPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  // A failed load must not show the defaults as if they were saved: saving
  // them would overwrite the repo's real settings.
  const [loadFailed, setLoadFailed] = useState(false);
  // The edited settings against what the backend holds. A failed load counts
  // nothing as unsaved, so nothing can be saved over the real settings.
  const form = useDirtyForm<ReviewerConfig>(DEFAULTS, { disabled: loadFailed });
  const { values: cfg, reset: resetForm } = form;
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Reviewer settings are agent settings; null while your role loads.
  const { ready: meReady, can } = useCan();
  const isAdmin = meReady ? can("agent_settings") : null;
  const [logGroups, setLogGroups] = useState<string[]>([]);
  const [loadingLogGroups, setLoadingLogGroups] = useState(false);
  const [logGroupFilter, setLogGroupFilter] = useState("");
  // Org-wide review standards — team-level, applied to every repo's review.
  const [orgInstructions, setOrgInstructions] = useState("");
  const [orgSaved, setOrgSaved] = useState("");
  const [orgState, setOrgState] = useState<"loading" | "ready" | "error">("loading");
  const [savingOrg, setSavingOrg] = useState(false);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // Restore the selected repo from the URL (?repo=owner/name) so a refresh keeps
  // the page on the same repo. Read window.location directly (not useSearchParams)
  // to stay compatible with the static export without a Suspense boundary.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("repo");
    if (r) setRepo(r);
  }, []);

  useEffect(() => {
    // Members can read these settings; only admins can save them.
    api.listRepos().then((d) => setRepos(d.repos)).catch(() => {});
    // Load the connected AWS account's log groups for the health-check picker
    // (no free text — pick from the real list). Best-effort; empty if no account.
    setLoadingLogGroups(true);
    api
      .listAwsConnections()
      .then(async (d) => {
        const conn = d.connections[0];
        if (!conn) return;
        const lg = await api.discoverLogGroups(conn.connection_id);
        setLogGroups(lg.log_groups.map((g) => g.name));
      })
      .catch(() => {})
      .finally(() => setLoadingLogGroups(false));
  }, []);

  // Team-wide review standards (applies to every repo). Until they load, the
  // box stays read-only so a blank box can never be saved over them.
  const loadOrg = () => {
    setOrgState("loading");
    api
      .getOrgReviewInstructions()
      .then((d) => {
        setOrgInstructions(d.instructions || "");
        setOrgSaved(d.instructions || "");
        setOrgState("ready");
      })
      .catch(() => setOrgState("error"));
  };
  useEffect(loadOrg, []);

  useEffect(() => {
    if (!repo) return;
    let current = true;
    setLoading(true);
    setLoadFailed(false);
    setProblem(null);
    api
      .getReviewerConfig(repo)
      .then((c) => {
        if (!current) return;
        const next = { ...DEFAULTS, ...c, channels: draftFrom(c.webhooks) };
        resetForm(next);
      })
      .catch(() => {
        if (!current) return;
        resetForm(DEFAULTS);
        setLoadFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [repo, reloadKey, resetForm]);

  const set = form.set;

  const unsavedKeys = form.dirtyKeys;
  const dirty = form.dirty;
  const orgDirty = orgState === "ready" && orgInstructions !== orgSaved;
  const notDefault = (Object.keys(DEFAULTS) as Key[]).filter((k) => !sameSetting(cfg[k], DEFAULTS[k]));
  const isChanged = (...ks: Key[]) => ks.some((k) => !sameSetting(cfg[k], DEFAULTS[k]));
  const marks = (...ks: Key[]) => ({ unsaved: form.isDirty(...ks), notDefault: isChanged(...ks) });

  // Leaving with unsaved repo edits asks first (useDirtyForm); so do unsaved standards.
  useLeaveWarning(orgDirty);

  // The nav marks the section in view.
  useEffect(() => {
    if (!repo || loading || loadFailed) return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [repo, loading, loadFailed]);

  // Select a repo AND reflect it in the URL so the choice survives a refresh /
  // is shareable, mirroring /runs/detail?id= and /reviewer/detail?sk=.
  const selectRepo = async (r: string) => {
    if (r === repo) return;
    if (dirty) {
      const ok = await confirm({
        title: "Leave without saving?",
        message: `Your changes to ${repo} are not saved yet. Switching to ${r} drops them.`,
        confirmLabel: "Drop changes",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (ok !== "primary") return;
    }
    setRepo(r);
    const url = new URL(window.location.href);
    if (r) url.searchParams.set("repo", r);
    else url.searchParams.delete("repo");
    window.history.replaceState(null, "", url.toString());
  };

  const save = async () => {
    if (!repo || loadFailed) return;
    const found = configProblem(cfg);
    setProblem(found);
    if (found) return;
    setSaving(true);
    try {
      const { channels, webhooks, ...rest } = cfg;
      await api.updateReviewerConfig(repo, { ...rest, ...channelsPayload(channels, webhooks) });
      toast("Reviewer settings saved");
      // Re-read so a new webhook secret shows as saved and the form matches
      // what the backend kept (it trims and caps some values).
      setReloadKey((k) => k + 1);
    } catch (e) {
      const msg = saveError(e);
      setProblem(msg);
      toast(msg, "error");
    }
    setSaving(false);
  };

  const discard = () => {
    form.discard();
    setProblem(null);
  };

  const saveOrg = async () => {
    if (orgState !== "ready") return;
    setSavingOrg(true);
    try {
      await api.updateOrgReviewInstructions(orgInstructions);
      setOrgSaved(orgInstructions);
      toast("Review standards saved");
    } catch (e) {
      toast(saveError(e), "error");
    }
    setSavingOrg(false);
  };

  const readOnly = isAdmin === false;
  const ready = !!repo && !loading && !loadFailed;
  // A refused save reveals every option, so the field it names is in view.
  const reveal = (on: boolean) => on || !!problem;
  const state = stateOf(cfg);

  const navItems = SECTIONS.map((s) => ({
    ...s,
    word: sectionWord(s.id, cfg),
    unsaved: SECTION_KEYS[s.id].some((k) => unsavedKeys.includes(k)),
  }));

  return (
    <Page>
      <PageHeader
        title="Reviewer settings"
        lead="What the pull request reviewer does, set one repository at a time. A new repository starts with everything off."
      />

      {/* Repository switcher: the one choice everything below depends on. */}
      <div className="mt-6 flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:gap-4">
        {/* The picker says "Repository: <name>" itself; this is the visible caption. */}
        <span aria-hidden="true" className="shrink-0 text-sm font-medium text-zinc-300">Repository</span>
        <div className="min-w-0 sm:w-96">
          <RepoCombobox id="rc-repo" repos={repos} selected={repo} onSelect={selectRepo} placeholder="Choose a repository" className="" />
        </div>
      </div>

      {readOnly && (
        <div className="mt-4">
          <Callout variant="info" title="You can view these settings">
            <p>Only admins can change them. Ask an admin on your team if something should be different.</p>
          </Callout>
        </div>
      )}

      {!repo ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-800 px-4 py-12 text-center text-sm text-zinc-400">
          Choose a repository to see what the reviewer does there and change it.
        </div>
      ) : loading ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : loadFailed ? (
        <div className="mt-6">
          <Callout variant="error" title={`Could not load the settings for ${repo}`}>
            <p>Nothing is shown, so the saved settings cannot be overwritten by mistake.</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={`mt-2 ${secondaryButton}`}>
              Try again
            </button>
          </Callout>
        </div>
      ) : (
        <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
          {/* Section nav: a column on wide screens, a scrolling strip on a phone. */}
          <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {navItems.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? "location" : undefined}
                    onClick={() => setActive(s.id)}
                    className={`flex min-h-8 items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 py-1 text-sm ${
                      active === s.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                    } ${s.id === "stop" ? "lg:mt-3" : ""} ${focusRing}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {s.title}
                      {s.unsaved && <span aria-label="unsaved" className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    </span>
                    {s.word && (
                      <span className={`hidden text-xs lg:inline ${s.word === "On" ? "text-emerald-300" : s.word === "Stopped" ? "text-red-300" : "text-zinc-500"}`}>
                        {s.word}
                      </span>
                    )}
                  </a>
                </li>
              ))}
              <li className="shrink-0 lg:mt-3 lg:border-t lg:border-zinc-800 lg:pt-3">
                <a
                  href="#standards"
                  className={`flex min-h-8 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 ${focusRing}`}
                >
                  Every repository
                </a>
              </li>
            </ul>
          </nav>

          <div className="min-w-0">
            {/* What the reviewer does here, in plain words. */}
            <section aria-labelledby="rc-summary" className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4" data-testid="reviewer-summary">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="rc-summary" className="min-w-0 break-all text-sm font-semibold text-zinc-100">On {repo}</h2>
                <StatusText look={state} />
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {summaryLines(cfg).map((l) => (
                  <li key={l} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                    <span className="min-w-0">{l}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-500" data-testid="not-default-count">
                {notDefault.length === 0
                  ? "Every setting is at its default."
                  : `${notDefault.length} setting${notDefault.length === 1 ? " differs" : "s differ"} from the defaults, marked “Not default” below.`}
              </p>
            </section>

            <fieldset disabled={readOnly} className="mt-8 min-w-0 space-y-10">
              <legend className="sr-only">Settings for {repo}</legend>

              <SettingsSection id="reviews" title="Reviews" description="Whether the reviewer looks at pull requests here, and what it pays attention to.">
                <SettingsRow
                  label="Enable reviewer for this repo"
                  help="Off: the reviewer ignores this repo entirely."
                  {...marks("enabled")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.enabled} onChange={(v) => set("enabled", v)} labelledBy={labelId} describedBy={helpId} />}
                />
                <SettingsRow
                  label="Trigger label"
                  help="Add this label to a pull request to have it reviewed."
                  {...marks("label")}
                  control={({ inputId, helpId }) => (
                    <input id={inputId} aria-describedby={helpId} value={cfg.label} onChange={(e) => set("label", e.target.value)} placeholder="ch-review" className={`${monoInputClass} ${shortInput}`} />
                  )}
                />
                <SettingsRow
                  layout="stacked"
                  label="Review focus"
                  help="Optional. What to look at closely on this repo, on top of the team standards and the repo's AGENTS.md."
                  {...marks("instructions")}
                  control={({ inputId, helpId }) => (
                    <MarkdownEditor
                      id={inputId}
                      aria-describedby={helpId}
                      variant="instructions"
                      value={cfg.instructions}
                      onChange={(v) => set("instructions", v)}
                      minRows={4}
                      readOnly={readOnly}
                      emptyText="No extra focus for this repo."
                      previewNote="The reviewer reads this as written, on top of the team standards."
                      placeholder="For example: pay special attention to auth changes and database migrations."
                      testId="review-focus"
                    />
                  )}
                />
              </SettingsSection>

              <SettingsSection id="tests" title="Tests">
                <SettingsRow
                  label="Check the change by running tests"
                  help="Runs the affected tests and build in a sandbox; a clear failure requests changes. Slower, and uses build minutes."
                  {...marks("verify_tests")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.verify_tests} onChange={(v) => set("verify_tests", v)} labelledBy={labelId} describedBy={helpId} />}
                />
                <SettingsRow
                  label="Require tests"
                  help="Blocks pull requests whose new or changed behavior comes without tests."
                  more={
                    <p>
                      New features need new tests; changed or fixed behavior needs its tests added or updated. Coderhelm writes those tests itself
                      when it plans and codes a change (following your AGENTS.md / CLAUDE.md test conventions), and the reviewer blocks any pull
                      request, Coderhelm&apos;s or a person&apos;s, whose tests are missing or stale. Refactors, docs, config and dependency bumps are exempt.
                    </p>
                  }
                  {...marks("require_tests")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.require_tests} onChange={(v) => set("require_tests", v)} labelledBy={labelId} describedBy={helpId} />}
                />
              </SettingsSection>

              <SettingsSection id="labels" title="CI labels">
                <SettingsRow
                  label="Add CI labels from what the PR changes"
                  help="Adds the labels a pull request needs, such as e2e areas or a staging deploy, from the files it touches. It only adds labels, never removes them."
                  more={
                    <p>
                      It works from the repo itself: the labels your AGENTS.md / CLAUDE.md document, their GitHub descriptions, and any mapping files
                      the docs point to, so documenting a new label is all it takes. The review says why each label was added.
                    </p>
                  }
                  {...marks("auto_labels")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.auto_labels} onChange={(v) => set("auto_labels", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {reveal(cfg.auto_labels) && (
                    <SettingsDisclosure summary="Overrides (optional)" defaultOpen={isChanged("auto_label_allow", "auto_label_requires", "auto_label_guide") || !!problem}>
                      <Field
                        label="Labels it may add"
                        {...marks("auto_label_allow")}
                        help={
                          <>
                            Empty: the labels the repo&apos;s AGENTS.md / CLAUDE.md name (production labels are never picked that way). Set this to pin an
                            exact list, comma separated names or <Code>PREFIX*</Code>; nothing outside it is ever added.
                          </>
                        }
                        mono
                        value={cfg.auto_label_allow}
                        onChange={(e) => set("auto_label_allow", e.target.value)}
                        placeholder="E2E:*, CI:E2E, CI:DEPLOY_STAGING"
                      />
                      <Field
                        as="textarea"
                        label="Required companions"
                        {...marks("auto_label_requires")}
                        help={
                          <>
                            Usually not needed: the reviewer follows what your docs say. Use this to guarantee it, one rule per line,{" "}
                            <Code>label -&gt; label, label</Code> (<Code>PREFIX*</Code> works on the left).
                          </>
                        }
                        mono
                        rows={3}
                        value={cfg.auto_label_requires}
                        onChange={(e) => set("auto_label_requires", e.target.value)}
                        placeholder={"E2E:join -> CI:DEPLOY_STAGING"}
                      />
                      <Field as="custom" label="Guidance" {...marks("auto_label_guide")} help="When to use which label, in your own words.">
                        {(ids) => (
                          <MarkdownEditor
                            {...ids}
                            variant="instructions"
                            value={cfg.auto_label_guide}
                            onChange={(v) => set("auto_label_guide", v)}
                            minRows={3}
                            readOnly={readOnly}
                            emptyText="No guidance."
                            placeholder="For example: areas and the code they cover are in e2e/test-map.json."
                          />
                        )}
                      </Field>
                    </SettingsDisclosure>
                  )}
                </SettingsRow>
              </SettingsSection>

              <SettingsSection
                id="merge"
                title="Auto-merge"
                description="Lets the reviewer merge after it approves. It only merges the exact commit it reviewed; a later push blocks the merge."
              >
                <SettingsRow
                  label="Auto-merge on approve"
                  help="Merges once the review approves and all CI has passed."
                  {...marks("auto_merge")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.auto_merge} onChange={(v) => set("auto_merge", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {reveal(cfg.auto_merge) && (
                    <>
                      <Field as="custom" label="Merge method" {...marks("merge_method")}>
                        {() => <Segmented label="Merge method" options={MERGE_METHODS} value={cfg.merge_method} onChange={(v) => set("merge_method", v)} />}
                      </Field>
                      <Field
                        label="Deploy labels (optional)"
                        {...marks("deploy_label")}
                        help={
                          <>
                            Added to Coderhelm&apos;s own pull requests when it opens them, and to people&apos;s once they are cleared to merge, so your
                            deploy, preview or e2e CI runs. Auto-merge waits for that CI too. Comma separate several, for example{" "}
                            <Code>E2E:IOS,E2E:ANDROID</Code>. Empty: skip.
                          </>
                        }
                        mono
                        value={cfg.deploy_label}
                        onChange={(e) => set("deploy_label", e.target.value)}
                        placeholder="deploy-staging"
                      />
                    </>
                  )}
                </SettingsRow>
                <SettingsRow
                  label="Also require a person's approval"
                  help="If off, the reviewer's approval alone can merge."
                  recommended
                  {...marks("require_human_approval")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => (
                    <Switch id={inputId} checked={cfg.require_human_approval} onChange={(v) => set("require_human_approval", v)} labelledBy={labelId} describedBy={helpId} />
                  )}
                />
              </SettingsSection>

              <SettingsSection id="after-merge" title="Tags and health check" description="What happens once a pull request has merged.">
                <SettingsRow
                  label="Tag after merge"
                  help="Cuts a release tag on the merged commit."
                  {...marks("auto_tag")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.auto_tag} onChange={(v) => set("auto_tag", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {reveal(cfg.auto_tag) && (
                    <>
                      <Field as="custom" label="Tag style" {...marks("tag_mode")}>
                        {() => <Segmented label="Tag style" options={TAG_MODES} value={cfg.tag_mode} onChange={(v) => set("tag_mode", v)} />}
                      </Field>
                      <Field
                        label="Tag prefix"
                        {...marks("tag_prefix")}
                        help={
                          cfg.tag_mode === "date"
                            ? <>Tags look like <Code>{cfg.tag_prefix}YYYYMMDD-HHMMSS</Code> (a timestamp, not a version).</>
                            : <>Tags look like <Code>{cfg.tag_prefix}1.2.4</Code>: the next patch after the latest <Code>{cfg.tag_prefix}X.Y.Z</Code>.</>
                        }
                        mono
                        controlClassName="sm:w-32"
                        value={cfg.tag_prefix}
                        onChange={(e) => set("tag_prefix", e.target.value)}
                        placeholder="v"
                      />
                      <Field
                        label="Batch window (minutes)"
                        {...marks("tag_batch_minutes")}
                        help={
                          cfg.tag_batch_minutes === 0
                            ? "0: every merge gets its own tag right away."
                            : `Merges within ${cfg.tag_batch_minutes} minutes share one tag, on the latest commit.`
                        }
                        type="number"
                        min={0}
                        max={360}
                        value={cfg.tag_batch_minutes}
                        onChange={(e) => set("tag_batch_minutes", Math.max(0, Math.min(360, Math.floor(Number(e.target.value) || 0))))}
                        controlClassName="sm:w-32"
                        placeholder="15"
                      />
                    </>
                  )}
                </SettingsRow>
                <SettingsRow
                  label="Health check after merge"
                  help="Watches the deploy checks on the base branch and flags failures that were not there before. It reports; it never rolls back."
                  {...marks("health_check")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.health_check} onChange={(v) => set("health_check", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {cfg.health_check && (
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-zinc-200">CloudWatch log groups to watch (optional)</p>
                        <RowMarks {...marks("health_log_groups")} />
                      </div>
                      {logGroups.length === 0 ? (
                        <p className="text-sm text-zinc-400">
                          {loadingLogGroups ? (
                            "Loading log groups…"
                          ) : (
                            <>
                              No AWS account connected. <Link href="/settings/integrations/aws/" className={linkButton}>Connect one</Link> to pick log
                              groups. The health check on CI works without it.
                            </>
                          )}
                        </p>
                      ) : (
                        <>
                          <input
                            type="search"
                            aria-label="Search log groups"
                            value={logGroupFilter}
                            onChange={(e) => setLogGroupFilter(e.target.value)}
                            placeholder={`Search ${logGroups.length} log groups…`}
                            className={`${inputClass} mb-2`}
                          />
                          {(() => {
                            const q = logGroupFilter.trim().toLowerCase();
                            const shown = q ? logGroups.filter((lg) => lg.toLowerCase().includes(q)) : logGroups;
                            return (
                              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950">
                                {shown.length === 0 ? (
                                  <p className="px-3 py-2 text-sm text-zinc-500">No log groups match “{logGroupFilter}”.</p>
                                ) : (
                                  shown.map((lg) => {
                                    const on = cfg.health_log_groups.includes(lg);
                                    const full = !on && cfg.health_log_groups.length >= MAX_LOG_GROUPS;
                                    return (
                                      <label key={lg} className={`flex min-h-9 items-center gap-3 px-3 py-1.5 text-sm text-zinc-300 ${full ? "opacity-50" : "cursor-pointer hover:bg-zinc-800/50"}`}>
                                        <input
                                          type="checkbox"
                                          checked={on}
                                          disabled={full}
                                          onChange={() => set("health_log_groups", on ? cfg.health_log_groups.filter((g) => g !== lg) : [...cfg.health_log_groups, lg])}
                                          className="h-4 w-4 shrink-0 accent-white"
                                        />
                                        <span className="min-w-0 break-all font-mono text-xs">{lg}</span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })()}
                          {cfg.health_log_groups.length > 0 && (
                            <p className="mt-1.5 text-xs text-zinc-500">
                              {cfg.health_log_groups.length} of {MAX_LOG_GROUPS} chosen
                              {cfg.health_log_groups.length >= MAX_LOG_GROUPS && ". Clear one to pick another."}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </SettingsRow>
              </SettingsSection>

              <SettingsSection id="release-notes" title="Release notes">
                <SettingsRow
                  label="Write release notes for each release tag"
                  help="Writes GitHub release notes and a short summary for stakeholders from the pull requests and tickets since the last tag."
                  more={
                    <>
                      <p>
                        It runs when a release tag is created on the release branch, by Coderhelm (Tag after merge), a person or CI. It follows your
                        repo&apos;s release notes guide when it has one. Coderhelm only tags after an approved, green merge, so the tag is the approval.
                      </p>
                      <p>Changes it can&apos;t explain from the pull request or ticket are listed as written, never guessed.</p>
                    </>
                  }
                  {...marks("release_notes")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.release_notes} onChange={(v) => set("release_notes", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {reveal(cfg.release_notes) && (
                    <>
                      <Field
                        label="Release branch"
                        {...marks("release_notes_branch")}
                        help={<>Only tags on merges into this branch get notes, for example <Code>main</Code> when features merge into <Code>develop</Code>. Empty: the default branch.</>}
                        mono
                        controlClassName={shortInput}
                        value={cfg.release_notes_branch}
                        onChange={(e) => set("release_notes_branch", e.target.value)}
                        placeholder="main"
                      />

                      <SettingsDisclosure
                        summary="Publish to Confluence"
                        defaultOpen={isChanged("release_notes_confluence_parent_id", "release_notes_confluence_container", "release_notes_confluence_space") || !!problem}
                      >
                        <p className="text-xs text-zinc-500">
                          Entries go to parent → {cfg.release_notes_confluence_container || "Changelog"} → one page per year, newest at the top, through the
                          Coderhelm app in Jira (it needs Confluence access). Leave the parent empty to skip Confluence.
                        </p>
                        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                          <Field label="Parent page id" {...marks("release_notes_confluence_parent_id")} mono inputMode="numeric" value={cfg.release_notes_confluence_parent_id} onChange={(e) => set("release_notes_confluence_parent_id", e.target.value.replace(/\D/g, ""))} placeholder="123456789" />
                          <Field label="Changelog page title" {...marks("release_notes_confluence_container")} value={cfg.release_notes_confluence_container} onChange={(e) => set("release_notes_confluence_container", e.target.value)} placeholder="Changelog" />
                          <Field label="Space key (for reference)" {...marks("release_notes_confluence_space")} mono value={cfg.release_notes_confluence_space} onChange={(e) => set("release_notes_confluence_space", e.target.value)} placeholder="ENG" />
                        </div>
                      </SettingsDisclosure>

                      <SettingsDisclosure
                        summary="Send to an automation webhook"
                        defaultOpen={isChanged("release_notes_email_webhook_url") || !!cfg.release_notes_email_webhook_secret_set || !!problem}
                      >
                        <Field
                          label="Automation webhook URL"
                          {...marks("release_notes_email_webhook_url")}
                          help={
                            <>
                              After the Confluence entry, Coderhelm POSTs <Code>subject</Code>, <Code>summary_html</Code>, <Code>summary_markdown</Code>,{" "}
                              <Code>confluence_url</Code>, <Code>release_url</Code>, <Code>repo</Code>, <Code>tag</Code> and <Code>date</Code> here, for
                              example to an Atlassian Automation rule that emails your IT list. Failures post to the reminder channels below.
                            </>
                          }
                          mono
                          value={cfg.release_notes_email_webhook_url}
                          onChange={(e) => set("release_notes_email_webhook_url", e.target.value)}
                          placeholder="https://api-private.atlassian.com/automation/webhooks/…"
                        />
                        <Field
                          as="custom"
                          label="Webhook secret (optional)"
                          {...marks("release_notes_email_webhook_secret", "release_notes_email_webhook_secret_clear")}
                          help={<>Sent as the <Code>X-Automation-Webhook-Token</Code> header and never shown again.</>}
                        >
                          {({ id, "aria-describedby": describedBy }) => (
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                              <input
                                id={id}
                                aria-label="Automation webhook secret"
                                aria-describedby={describedBy}
                                type="password"
                                autoComplete="off"
                                value={cfg.release_notes_email_webhook_secret ?? ""}
                                onChange={(e) => set("release_notes_email_webhook_secret", e.target.value)}
                                className={`${monoInputClass} ${shortInput}`}
                                placeholder={cfg.release_notes_email_webhook_secret_set ? "Saved. Type to replace" : "None saved"}
                              />
                              {cfg.release_notes_email_webhook_secret_set && (
                                <label className="flex items-center gap-2 text-sm text-zinc-400">
                                  <input
                                    type="checkbox"
                                    checked={!!cfg.release_notes_email_webhook_secret_clear}
                                    onChange={(e) => set("release_notes_email_webhook_secret_clear", e.target.checked)}
                                    className="h-4 w-4 accent-white"
                                  />
                                  Remove saved secret
                                </label>
                              )}
                            </div>
                          )}
                        </Field>
                      </SettingsDisclosure>

                      <SettingsDisclosure summary="How it writes (optional)" defaultOpen={isChanged("release_notes_guide", "release_notes_instructions")}>
                        <Field label="Writing guide" {...marks("release_notes_guide")} help="A file in the repo to follow. Empty: found on its own, for example RELEASE_NOTES.md." mono value={cfg.release_notes_guide} onChange={(e) => set("release_notes_guide", e.target.value)} placeholder="docs/RELEASE_NOTES.md" />
                        <Field as="custom" label="Instructions" {...marks("release_notes_instructions")}>
                          {(ids) => (
                            <MarkdownEditor
                              {...ids}
                              variant="instructions"
                              value={cfg.release_notes_instructions}
                              onChange={(v) => set("release_notes_instructions", v)}
                              minRows={3}
                              readOnly={readOnly}
                              emptyText="No instructions."
                              placeholder="For example: the audience is the IT help desk."
                            />
                          )}
                        </Field>
                      </SettingsDisclosure>
                    </>
                  )}
                </SettingsRow>
              </SettingsSection>

              <SettingsSection id="reminders" title="Review reminders">
                <SettingsRow
                  label="Remind reviewers in Microsoft Teams or Slack"
                  help="About every 20 minutes, posts open pull requests still waiting on their requested reviewers."
                  {...marks("reminders_enabled")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.reminders_enabled} onChange={(v) => set("reminders_enabled", v)} labelledBy={labelId} describedBy={helpId} />}
                >
                  {reveal(cfg.reminders_enabled) && (
                    <>
                      <div className="min-w-0">
                        <ChannelPicker
                          idPrefix="reminders"
                          draft={cfg.channels}
                          saved={cfg.webhooks}
                          onChange={(d) => set("channels", d)}
                          destination={{ destination: "reviewer", repo }}
                        />
                      </div>
                      <Field
                        label="Wait before reminding again (hours)"
                        {...marks("reminder_cooldown_hours")}
                        help="It also reminds again after a new commit."
                        type="number"
                        min={1}
                        max={168}
                        value={cfg.reminder_cooldown_hours}
                        onChange={(e) => set("reminder_cooldown_hours", Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
                        controlClassName="sm:w-32"
                      />
                    </>
                  )}
                </SettingsRow>
              </SettingsSection>

              <SettingsSection id="stop" title="Stop everything" danger>
                <SettingsRow
                  label="Stop everything"
                  help="Stops every reviewer action on this repo at once, whatever is set above. Use it if something goes wrong."
                  {...marks("killed")}
                  layout="toggle"
                  control={({ labelId, helpId, inputId }) => <Switch id={inputId} checked={cfg.killed} onChange={(v) => set("killed", v)} labelledBy={labelId} describedBy={helpId} />}
                />
              </SettingsSection>
            </fieldset>

            {/* Save bar: sticks to the bottom of the screen while there are unsaved edits, and says what they are. */}
            {!readOnly && (
              <SaveBar
                persistent
                count={unsavedKeys.length}
                context={repo}
                problem={problem}
                onSave={save}
                onDiscard={discard}
                saving={saving}
                saveLabel="Save settings"
              />
            )}
          </div>
        </div>
      )}

      <StandardsSection
        state={orgState}
        value={orgInstructions}
        onChange={setOrgInstructions}
        onRetry={loadOrg}
        onSave={saveOrg}
        saving={savingOrg}
        dirty={orgDirty}
        readOnly={readOnly}
        indent={ready}
      />
    </Page>
  );
}

/** Team-wide standards: one text for every repo, saved on its own. */
function StandardsSection({
  state,
  value,
  onChange,
  onRetry,
  onSave,
  saving,
  dirty,
  readOnly,
  indent,
}: {
  state: "loading" | "ready" | "error";
  value: string;
  onChange: (v: string) => void;
  onRetry: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  readOnly: boolean;
  /** Line up with the settings column when the section nav is showing. */
  indent: boolean;
}) {
  return (
    <section id="standards" aria-labelledby="standards-heading" className={`mt-12 min-w-0 scroll-mt-6 ${indent ? "lg:ml-[14rem]" : ""}`}>
      <h2 id="standards-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Every repository</h2>
      <p className="mt-1 max-w-prose text-sm text-zinc-400">Shared by all of your repos and saved on its own, separate from the settings above.</p>
      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="org-standards" className="text-sm font-medium text-zinc-100">Review standards for every repo</label>
          {dirty && <Chip tone="waiting">Unsaved</Chip>}
        </div>
        <p id="org-standards-help" className="mt-0.5 mb-3 max-w-prose text-sm text-zinc-400">
          Applied to every repo&apos;s review, on top of each repo&apos;s own focus and its AGENTS.md. Put shared conventions here: error handling,
          auth, naming, security expectations.
        </p>
        {state === "error" ? (
          <Callout variant="error" title="Could not load the review standards">
            <p>Saving is off until they load, so they cannot be replaced by a blank box.</p>
            <button type="button" onClick={onRetry} className={`mt-2 ${secondaryButton}`}>Try again</button>
          </Callout>
        ) : (
          <>
            <MarkdownEditor
              id="org-standards"
              aria-describedby="org-standards-help"
              variant="instructions"
              value={value}
              onChange={onChange}
              disabled={state !== "ready"}
              readOnly={readOnly}
              minRows={5}
              emptyText="No standards yet."
              previewNote="The reviewer reads this as written, on every repo."
              placeholder={state === "loading" ? "Loading…" : "For example: use our error handling wrapper in every handler. Flag any new dependency. Never log secrets."}
              testId="org-standards"
            />
            {!readOnly && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={onSave} disabled={saving || state !== "ready"} className={primaryButton}>
                  {saving ? "Saving…" : "Save standards"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
