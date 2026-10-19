"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ReviewerConfig, type Repo } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";

export default function ReviewerConfigGuarded() {
  return (
    <RoleGuard minRole="member">
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
  teams_webhook_url: "",
  reminder_cooldown_hours: 4,
};

/** Health check log groups the backend keeps per repo; more are dropped on save. */
const MAX_LOG_GROUPS = 20;

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-emerald-600" : "bg-zinc-700"} ${focusRing}`}
      >
        <span aria-hidden="true" className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
      <div>
        <div className="text-sm text-zinc-200">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
    </label>
  );
}

/** What the backend refuses with a bare 400, said before saving. */
function configProblem(cfg: ReviewerConfig): string | null {
  const teams = cfg.teams_webhook_url.trim();
  if (teams && !teams.startsWith("https://")) return "The Teams webhook URL must start with https://.";
  if (teams.length > 500) return "The Teams webhook URL is too long (500 characters at most).";
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

function ReviewerConfigPage() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [cfg, setCfg] = useState<ReviewerConfig>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  // A failed load must not show the defaults as if they were saved: saving
  // them would overwrite the repo's real settings.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logGroups, setLogGroups] = useState<string[]>([]);
  const [loadingLogGroups, setLoadingLogGroups] = useState(false);
  const [logGroupFilter, setLogGroupFilter] = useState("");
  // Org-wide review standards — team-level, applied to every repo's review.
  const [orgInstructions, setOrgInstructions] = useState("");
  const [orgState, setOrgState] = useState<"loading" | "ready" | "error">("loading");
  const [savingOrg, setSavingOrg] = useState(false);

  // Restore the selected repo from the URL (?repo=owner/name) so a refresh keeps
  // the page on the same repo. Read window.location directly (not useSearchParams)
  // to stay compatible with the static export without a Suspense boundary.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("repo");
    if (r) setRepo(r);
  }, []);

  useEffect(() => {
    // Members can read these settings; only admins can save them.
    api.me().then((u) => setIsAdmin(u.role === "admin" || u.role === "owner")).catch(() => setIsAdmin(false));
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
        if (current) setCfg({ ...DEFAULTS, ...c });
      })
      .catch(() => {
        if (!current) return;
        setCfg(DEFAULTS);
        setLoadFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [repo, reloadKey]);

  const set = <K extends keyof ReviewerConfig>(k: K, v: ReviewerConfig[K]) => setCfg((p) => ({ ...p, [k]: v }));

  // Select a repo AND reflect it in the URL so the choice survives a refresh /
  // is shareable, mirroring /runs/detail?id= and /reviewer/detail?sk=.
  const selectRepo = (r: string) => {
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
      await api.updateReviewerConfig(repo, cfg);
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

  const saveOrg = async () => {
    if (orgState !== "ready") return;
    setSavingOrg(true);
    try {
      await api.updateOrgReviewInstructions(orgInstructions);
      toast("Review standards saved");
    } catch (e) {
      toast(saveError(e), "error");
    }
    setSavingOrg(false);
  };

  const readOnly = isAdmin === false;

  return (
    <Page>
      <PageHeader
        eyebrow={<Link href="/reviewer" className={`text-sm text-zinc-500 hover:text-zinc-300 rounded ${focusRing}`}>← Reviewer</Link>}
        title="Reviewer settings"
        lead={
          <>
            Settings for the pull request reviewer, one repository at a time. Everything is off by default. Pick a
            repository below, then set up reviewing, actions after approval, Teams reminders and the health check after
            merge. Turn the reviewer on and add the review label to a PR.
          </>
        }
      />
      <div className="mt-6">

      {readOnly && (
        <div className="mb-5">
          <Callout variant="info" title="You can view these settings">
            <p>Only admins can change them. Ask an admin on your team if something should be different.</p>
          </Callout>
        </div>
      )}

      <section className={`mb-6 ${cardClass}`}>
        <h2 className="text-sm font-semibold text-zinc-200 mb-1">
          <label htmlFor="org-standards">Review standards for every repo</label>
        </h2>
        <p id="org-standards-help" className="text-xs text-zinc-500 mb-2">
          Applied to <strong>every</strong> repo&apos;s review, on top of each repo&apos;s own focus and its
          AGENTS.md. Put shared conventions here (error handling, auth, naming, security expectations).
        </p>
        {orgState === "error" ? (
          <Callout variant="error" title="Could not load the review standards">
            <p>Saving is off until they load, so they cannot be replaced by a blank box.</p>
            <button type="button" onClick={loadOrg} className={`mt-2 ${secondaryButton}`}>Try again</button>
          </Callout>
        ) : (
          <>
            <textarea
              id="org-standards"
              aria-describedby="org-standards-help"
              value={orgInstructions}
              onChange={(e) => setOrgInstructions(e.target.value)}
              disabled={orgState !== "ready" || readOnly}
              rows={5}
              className={`w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono disabled:opacity-60 ${focusRing}`}
              placeholder={orgState === "loading" ? "Loading…" : "For example: use our error handling wrapper in every handler. Flag any new dependency. Never log secrets."}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={saveOrg}
                disabled={savingOrg || orgState !== "ready"}
                className={`mt-2 ${primaryButton}`}
              >
                {savingOrg ? "Saving…" : "Save standards"}
              </button>
            )}
          </>
        )}
      </section>

      <div className="mb-6 max-w-sm">
        <p className="text-xs text-zinc-500 mb-1">Repository to set up</p>
        <RepoCombobox repos={repos} selected={repo} onSelect={selectRepo} />
      </div>

      {!repo ? (
        <div className="text-center py-12 px-4 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-lg">
          Pick a repository above to set up reviewing, actions after approval, Teams reminders and health checks.
        </div>
      ) : loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : loadFailed ? (
        <Callout variant="error" title={`Could not load the settings for ${repo}`}>
          <p>Nothing is shown, so the saved settings cannot be overwritten by mistake.</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={`mt-2 ${secondaryButton}`}>
            Try again
          </button>
        </Callout>
      ) : (
        <fieldset disabled={readOnly} className="space-y-6 min-w-0">
          <legend className="sr-only">Settings for {repo}</legend>
          {/* Core */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Reviewing</h2>
            <Toggle checked={cfg.enabled} onChange={(v) => set("enabled", v)} label="Enable reviewer for this repo" hint="Off = the reviewer ignores this repo entirely." />
            <Toggle checked={cfg.killed} onChange={(v) => set("killed", v)} label="Stop everything" hint="Stops all reviewer actions for this repo at once, whatever is set below." />
            <Toggle checked={cfg.verify_tests} onChange={(v) => set("verify_tests", v)} label="Check the change by running tests" hint="Runs the affected tests and build in a sandbox and adds the results to the review. A clear failure requests changes. Slower, and uses build minutes." />
            <Toggle
              checked={cfg.require_tests}
              onChange={(v) => set("require_tests", v)}
              label="Require tests"
              hint="New features need new tests; changed or fixed behavior needs its tests added or updated. CoderHelm writes those tests itself when it plans and codes a change (following your AGENTS.md / CLAUDE.md test conventions), and the reviewer blocks any PR — CoderHelm's or a person's — whose tests are missing or stale. Refactors, docs, config and dependency bumps are exempt."
            />
            <div className="mt-3">
              <label htmlFor="rc-field-1" className="block text-xs text-zinc-500 mb-1">Trigger label</label>
              <input
                id="rc-field-1"
                value={cfg.label}
                onChange={(e) => set("label", e.target.value)}
                className="w-full max-w-xs px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none"
                placeholder="ch-review"
              />
            </div>
            <div className="mt-3">
              <label htmlFor="rc-field-2" className="block text-xs text-zinc-500 mb-1">Review focus / instructions (optional)</label>
              <textarea
                id="rc-field-2"
                value={cfg.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                placeholder="e.g. Pay special attention to auth changes and DB migrations. Enforce our error-handling conventions."
              />
            </div>
          </section>

          {/* CI labels picked by the reviewer */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">PR labels</h2>
            <Toggle
              checked={cfg.auto_labels}
              onChange={(v) => set("auto_labels", v)}
              label="Add CI labels from what the PR changes"
              hint="On each review, adds the CI labels the PR needs (e.g. which e2e areas to run, a staging deploy) from the files it touches. Works from the repo itself: the labels your AGENTS.md / CLAUDE.md document, their GitHub descriptions, and any mapping files the docs point to — so documenting a new label is all it takes. Labels are only added, never removed, and the review says why each was added. The fields below are optional overrides."
            />
            <div className={`ml-12 space-y-3 ${cfg.auto_labels ? "" : "opacity-40 pointer-events-none"}`}>
              <div>
                <label htmlFor="rc-field-3" className="block text-xs text-zinc-500 mb-1">Labels it may add (optional)</label>
                <input
                  id="rc-field-3"
                  value={cfg.auto_label_allow}
                  onChange={(e) => set("auto_label_allow", e.target.value)}
                  className="w-full max-w-md px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                  placeholder="E2E:*, CI:E2E, CI:DEPLOY_STAGING"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Empty = the repo&apos;s labels that its AGENTS.md / CLAUDE.md name (e.g. <code>CI:DEPLOY_STAGING</code>, or a family
                  written <code>E2E:&lt;area&gt;</code>); production labels are never picked that way. Set this to pin an exact list
                  (comma-separated names or <code>PREFIX*</code>) — then nothing outside it is ever added.
                </p>
              </div>
              <div>
                <label htmlFor="rc-field-4" className="block text-xs text-zinc-500 mb-1">Required companions (optional)</label>
                <textarea
                  id="rc-field-4"
                  value={cfg.auto_label_requires}
                  onChange={(e) => set("auto_label_requires", e.target.value)}
                  rows={3}
                  className="w-full max-w-md px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                  placeholder={"E2E:join -> CI:DEPLOY_STAGING"}
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Usually not needed — the reviewer follows what your docs say (e.g. &quot;payment tests need staging&quot;). Use this to
                  guarantee it: one rule per line, <code>label -&gt; label, label</code> (<code>PREFIX*</code> works on the left).
                </p>
              </div>
              <div>
                <label htmlFor="rc-field-5" className="block text-xs text-zinc-500 mb-1">Guidance (optional)</label>
                <textarea
                  id="rc-field-5"
                  value={cfg.auto_label_guide}
                  onChange={(e) => set("auto_label_guide", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none"
                  placeholder="e.g. Areas and the code they cover are in e2e/test-map.json. Use CI:E2E when shared code (routing, components/ui) changes."
                />
              </div>
            </div>
          </section>

          {/* Release notes */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Release notes</h2>
            <Toggle
              checked={cfg.release_notes}
              onChange={(v) => set("release_notes", v)}
              label="Write release notes for each release tag"
              hint="When a release tag is created on the release branch — by CoderHelm (Tag after merge, below), a person or CI — it writes two versions from the merged PRs and Jira tickets since the last tag: technical GitHub Release notes, and a short business summary for IT and stakeholders. It follows your repo's release-notes guide when it has one. The tag is the approval — it only tags after an approved, green merge. Changes it can't explain from the PR or ticket are listed as written, never guessed."
            />
            <div className={`ml-12 space-y-3 ${cfg.release_notes ? "" : "opacity-40 pointer-events-none"}`}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="rc-field-6" className="block text-xs text-zinc-500 mb-1">Release branch</label>
                  <input id="rc-field-6" value={cfg.release_notes_branch} onChange={(e) => set("release_notes_branch", e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono" placeholder="main (empty = default branch)" />
                  <p className="text-xs text-zinc-600 mt-1">Only tags cut on merges into this branch get notes (e.g. <code>main</code> when features merge into <code>develop</code>).</p>
                </div>
                <div>
                  <label htmlFor="rc-field-7" className="block text-xs text-zinc-500 mb-1">Writing guide (optional)</label>
                  <input id="rc-field-7" value={cfg.release_notes_guide} onChange={(e) => set("release_notes_guide", e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono" placeholder="auto: .claude/skills/changelog-deploy/SKILL.md, RELEASE_NOTES.md…" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="rc-field-8" className="block text-xs text-zinc-500 mb-1">Confluence parent page id</label>
                  <input id="rc-field-8" value={cfg.release_notes_confluence_parent_id} onChange={(e) => set("release_notes_confluence_parent_id", e.target.value.replace(/\D/g, ""))}
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono" placeholder="197197866" />
                </div>
                <div>
                  <label htmlFor="rc-field-9" className="block text-xs text-zinc-500 mb-1">Changelog page title</label>
                  <input id="rc-field-9" value={cfg.release_notes_confluence_container} onChange={(e) => set("release_notes_confluence_container", e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none" placeholder="Changelog" />
                </div>
                <div>
                  <label htmlFor="rc-field-10" className="block text-xs text-zinc-500 mb-1">Space key (for reference)</label>
                  <input id="rc-field-10" value={cfg.release_notes_confluence_space} onChange={(e) => set("release_notes_confluence_space", e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono" placeholder="TECH" />
                </div>
              </div>
              <p className="text-xs text-zinc-600 -mt-1">
                Entries go to parent → {cfg.release_notes_confluence_container || "Changelog"} → one page per year, newest at the top, through the CoderHelm app
                in Jira (needs the app updated with Confluence access). Leave the parent empty to skip Confluence.
              </p>
              <div>
                <label htmlFor="rc-field-11" className="block text-xs text-zinc-500 mb-1">Automation webhook (optional)</label>
                <input id="rc-field-11" value={cfg.release_notes_email_webhook_url} onChange={(e) => set("release_notes_email_webhook_url", e.target.value)}
                  className="w-full max-w-xl px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono" placeholder="https://api-private.atlassian.com/automation/webhooks/…" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    aria-label="Automation webhook secret"
                    autoComplete="off"
                    value={cfg.release_notes_email_webhook_secret ?? ""}
                    onChange={(e) => set("release_notes_email_webhook_secret", e.target.value)}
                    className="w-full max-w-xs px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                    placeholder={cfg.release_notes_email_webhook_secret_set ? "Secret saved — type to replace" : "Webhook secret (optional)"}
                  />
                  {cfg.release_notes_email_webhook_secret_set && (
                    <label className="flex items-center gap-1 text-xs text-zinc-500">
                      <input
                        type="checkbox"
                        checked={!!cfg.release_notes_email_webhook_secret_clear}
                        onChange={(e) => set("release_notes_email_webhook_secret_clear", e.target.checked)}
                      />
                      Remove saved secret
                    </label>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-1">
                  The secret is sent as the <code>X-Automation-Webhook-Token</code> header (Atlassian Automation) and is never shown again.
                  After the Confluence entry, CoderHelm POSTs <code>subject</code>, <code>summary_html</code>, <code>summary_markdown</code>,
                  <code> confluence_url</code>, <code>release_url</code>, <code>repo</code>, <code>tag</code> and <code>date</code> here — e.g. an
                  Atlassian Automation rule that posts the entry to Confluence or emails your IT list. Failures alert the Teams webhook below.
                </p>
              </div>
              <div>
                <label htmlFor="rc-field-12" className="block text-xs text-zinc-500 mb-1">Instructions (optional)</label>
                <textarea id="rc-field-12" value={cfg.release_notes_instructions} onChange={(e) => set("release_notes_instructions", e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none"
                  placeholder="e.g. Audience is the IT help desk. Call the product 'the Acme app'." />
              </div>
            </div>
          </section>

          {/* Advanced: auto-actions */}
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              aria-expanded={showAdvanced}
              aria-controls="reviewer-advanced"
              className={`w-full flex items-center justify-between px-4 py-3 text-left rounded-lg ${focusRing}`}
            >
              <span className="text-sm font-semibold text-zinc-200">Actions after approval <span className="text-zinc-500 font-normal">(advanced)</span></span>
              <span aria-hidden="true" className="text-zinc-500 text-xs">{showAdvanced ? "▲" : "▼"}</span>
            </button>
            {showAdvanced && (
              <div id="reviewer-advanced" className="px-4 pb-4">
                <div className="mb-3 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  These let the reviewer act on your repo after it approves. It only merges the exact commit it
                  reviewed and, unless you turn it off, also waits for a person to approve. The health check reports
                  on the deploy; it never rolls back on its own.
                </div>

                <Toggle checked={cfg.auto_merge} onChange={(v) => set("auto_merge", v)} label="Auto-merge on approve" hint="Only merges the exact reviewed commit; a later push blocks the merge." />
                <div className="ml-12 mb-2">
                  <label htmlFor="rc-merge-method" className="block text-xs text-zinc-500 mb-1">Merge method</label>
                  <select
                    id="rc-merge-method"
                    value={cfg.merge_method}
                    onChange={(e) => set("merge_method", e.target.value)}
                    disabled={!cfg.auto_merge}
                    className="px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                  >
                    <option value="squash">Squash</option>
                    <option value="merge">Merge commit</option>
                    <option value="rebase">Rebase</option>
                  </select>
                </div>
                <Toggle
                  checked={cfg.require_human_approval}
                  onChange={(v) => set("require_human_approval", v)}
                  label="Also require a person's approval"
                  hint="Strongly recommended. If off, the bot's approval alone can merge."
                />
                <div className="ml-12 mt-2 mb-1">
                  <label htmlFor="rc-field-13" className="block text-xs text-zinc-500 mb-1">Deploy label(s) (optional)</label>
                  <input
                    id="rc-field-13"
                    value={cfg.deploy_label}
                    onChange={(e) => set("deploy_label", e.target.value)}
                    disabled={!cfg.auto_merge}
                    className="w-full max-w-md px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none disabled:opacity-40"
                    placeholder="e.g. deploy-staging  or  E2E:IOS,E2E:ANDROID"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    CoderHelm adds this label to its own PRs at creation, so your deploy/preview/E2E CI runs
                    from the start; human-authored PRs get it once they are cleared to merge. Either way,
                    auto-merge waits for all of that CI to pass before merging.
                    <strong> Comma-separate for multiple</strong> (e.g. <code>E2E:IOS,E2E:ANDROID</code>). Leave blank to skip.
                  </p>
                </div>

                <div className="border-t border-zinc-800 my-3" />

                <Toggle checked={cfg.auto_tag} onChange={(v) => set("auto_tag", v)} label="Tag after merge" />
                <div className="ml-12 mb-2">
                  <label htmlFor="rc-tag-mode" className="block text-xs text-zinc-500 mb-1">Tag mode</label>
                  <select
                    id="rc-tag-mode"
                    value={cfg.tag_mode}
                    onChange={(e) => set("tag_mode", e.target.value)}
                    disabled={!cfg.auto_tag}
                    className="px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                  >
                    <option value="semver">Version number (next patch)</option>
                    <option value="date">Date and time</option>
                  </select>
                </div>
                <div className="ml-12 mb-2">
                  <label htmlFor="rc-field-14" className="block text-xs text-zinc-500 mb-1">Tag prefix</label>
                  <input
                    id="rc-field-14"
                    value={cfg.tag_prefix}
                    onChange={(e) => set("tag_prefix", e.target.value)}
                    disabled={!cfg.auto_tag}
                    className="w-32 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                    placeholder="v"
                  />
                  <span className="ml-2 text-xs text-zinc-600">
                    {cfg.tag_mode === "date"
                      ? `→ ${cfg.tag_prefix}YYYYMMDD-HHMMSS (timestamp, not a version)`
                      : `→ next release, e.g. ${cfg.tag_prefix}1.2.4 (bumps the latest ${cfg.tag_prefix}X.Y.Z)`}
                  </span>
                </div>
                <div className="ml-12 mb-2">
                  <label htmlFor="rc-field-15" className="block text-xs text-zinc-500 mb-1">Batch window (minutes)</label>
                  <input
                    id="rc-field-15"
                    type="number"
                    min={0}
                    max={360}
                    value={cfg.tag_batch_minutes}
                    onChange={(e) =>
                      set(
                        "tag_batch_minutes",
                        Math.max(0, Math.min(360, Math.floor(Number(e.target.value) || 0))),
                      )
                    }
                    disabled={!cfg.auto_tag}
                    className="w-32 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                    placeholder="15"
                  />
                  <span className="ml-2 text-xs text-zinc-600">
                    {cfg.tag_batch_minutes === 0
                      ? "→ tag every merge immediately (no batching)"
                      : `→ merges within ${cfg.tag_batch_minutes} min share one release tag at the latest commit`}
                  </span>
                </div>

                <div className="border-t border-zinc-800 my-3" />

                <Toggle checked={cfg.health_check} onChange={(v) => set("health_check", v)} label="Health check after merge" hint="Watches the deploy checks on the base branch (no timer to set) and flags only failures that were not there before the merge. It reports; it never rolls back on its own." />
                {cfg.health_check && (
                  <div className="ml-12 mb-1">
                    <p className="text-xs text-zinc-500 mb-1">CloudWatch log groups to watch (optional)</p>
                    {logGroups.length === 0 ? (
                      <p className="text-xs text-zinc-600">
                        {loadingLogGroups
                          ? "Loading log groups…"
                          : <>No AWS account connected. <Link href="/settings/integrations/aws/" className={linkButton}>Connect one</Link> to pick log groups. The health check on CI works without it.</>}
                      </p>
                    ) : (
                      <>
                        <input
                          aria-label="Search log groups"
                          value={logGroupFilter}
                          onChange={(e) => setLogGroupFilter(e.target.value)}
                          placeholder={`Search ${logGroups.length} log groups…`}
                          className="w-full mb-1 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:border-zinc-500 outline-none"
                        />
                        {(() => {
                          const q = logGroupFilter.trim().toLowerCase();
                          const shown = q ? logGroups.filter((lg) => lg.toLowerCase().includes(q)) : logGroups;
                          return (
                            <div className="max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-2 space-y-1">
                              {shown.length === 0 ? (
                                <p className="text-xs text-zinc-600 px-1">No log groups match “{logGroupFilter}”.</p>
                              ) : (
                                shown.map((lg) => {
                                  const on = cfg.health_log_groups.includes(lg);
                                  const full = !on && cfg.health_log_groups.length >= MAX_LOG_GROUPS;
                                  return (
                                    <label key={lg} className={`flex items-center gap-2 text-xs text-zinc-300 ${full ? "opacity-50" : "cursor-pointer"}`}>
                                      <input
                                        type="checkbox"
                                        checked={on}
                                        disabled={full}
                                        onChange={() => set("health_log_groups", on ? cfg.health_log_groups.filter((g) => g !== lg) : [...cfg.health_log_groups, lg])}
                                      />
                                      <span className="font-mono truncate">{lg}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          );
                        })()}
                        {cfg.health_log_groups.length > 0 && (
                          <p className="text-xs text-zinc-500 mt-1">
                            {cfg.health_log_groups.length} of {MAX_LOG_GROUPS} selected
                            {cfg.health_log_groups.length >= MAX_LOG_GROUPS && ". Clear one to pick another."}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Teams reminders */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Teams reminders</h2>
            <Toggle
              checked={cfg.reminders_enabled}
              onChange={(v) => set("reminders_enabled", v)}
              label="Remind reviewers in Microsoft Teams"
              hint="About every 20 minutes, posts open PRs still waiting on their requested reviewers. It reminds again only after the wait below or a new commit."
            />
            <div className="mt-3">
              <label htmlFor="rc-field-16" className="block text-xs text-zinc-500 mb-1">Teams incoming webhook URL</label>
              <input
                id="rc-field-16"
                value={cfg.teams_webhook_url}
                onChange={(e) => set("teams_webhook_url", e.target.value)}
                disabled={!cfg.reminders_enabled}
                className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none disabled:opacity-40 font-mono"
                placeholder="https://…webhook.office.com/… or a Power Automate URL"
              />
              <p className="text-xs text-zinc-600 mt-1">Must be an https URL. Create one via a Teams channel → Workflows / Incoming Webhook.</p>
            </div>
            <div className="mt-3">
              <label htmlFor="rc-cooldown" className="block text-xs text-zinc-500 mb-1">Wait before reminding again (hours)</label>
              <input
                id="rc-cooldown"
                type="number"
                min={1}
                max={168}
                value={cfg.reminder_cooldown_hours}
                onChange={(e) => set("reminder_cooldown_hours", Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
                disabled={!cfg.reminders_enabled}
                className="w-28 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
              />
            </div>
          </section>

          {problem && (
            <Callout variant="error" title="Not saved">
              <p>{problem}</p>
            </Callout>
          )}
          {!readOnly && (
            <button type="button" onClick={save} disabled={saving} className={primaryButton}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          )}
        </fieldset>
      )}
      </div>
    </Page>
  );
}
