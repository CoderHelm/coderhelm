"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ReviewerConfig, type Repo } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { useToast } from "@/components/toast";

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
  health_check: false,
  verify_tests: false,
  deploy_label: "",
  health_log_groups: [],
  reminders_enabled: false,
  teams_webhook_url: "",
  reminder_cooldown_hours: 4,
};

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-green-600" : "bg-zinc-700"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
      <div>
        <div className="text-sm text-zinc-200">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
    </label>
  );
}

function ReviewerConfigPage() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [cfg, setCfg] = useState<ReviewerConfig>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logGroups, setLogGroups] = useState<string[]>([]);
  const [loadingLogGroups, setLoadingLogGroups] = useState(false);
  const [logGroupFilter, setLogGroupFilter] = useState("");

  useEffect(() => {
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

  useEffect(() => {
    if (!repo) return;
    setLoading(true);
    api
      .getReviewerConfig(repo)
      .then((c) => setCfg({ ...DEFAULTS, ...c }))
      .catch(() => setCfg(DEFAULTS))
      .finally(() => setLoading(false));
  }, [repo]);

  const set = <K extends keyof ReviewerConfig>(k: K, v: ReviewerConfig[K]) => setCfg((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!repo) return;
    setSaving(true);
    try {
      await api.updateReviewerConfig(repo, cfg);
      toast("Reviewer config saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed (admins only)", "error");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reviewer" className="text-sm text-zinc-500 hover:text-zinc-300">← Reviewer</Link>
      </div>
      <h1 className="text-2xl font-bold mb-2">Reviewer configuration</h1>
      <p className="text-zinc-400 text-sm mb-5">
        Per-repo settings for the PR reviewer. Everything is off by default. Pick a repository below,
        then configure reviewing, post-approval auto-actions, <strong>Teams reminders</strong>, and the
        post-merge health check. Turn the reviewer on and add the review label to a PR.
      </p>

      <div className="mb-6 max-w-sm">
        <label className="block text-xs text-zinc-500 mb-1">Repository (select to configure)</label>
        <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} />
      </div>

      {!repo ? (
        <div className="text-center py-12 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-lg">
          Pick a repository above to configure reviewing, auto-actions, Teams reminders, and health checks.
        </div>
      ) : loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Core */}
          <section className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Reviewing</h2>
            <Toggle checked={cfg.enabled} onChange={(v) => set("enabled", v)} label="Enable reviewer for this repo" hint="Off = the reviewer ignores this repo entirely." />
            <Toggle checked={cfg.killed} onChange={(v) => set("killed", v)} label="Kill switch" hint="Hard-stops ALL reviewer action for this repo, overriding everything below." />
            <Toggle checked={cfg.verify_tests} onChange={(v) => set("verify_tests", v)} label="Verify in sandbox (run tests)" hint="Runs the affected tests/build in a sandbox and attaches pass/fail receipts to the review. A hard failure requests changes. Slower + uses build minutes." />
            <div className="mt-3">
              <label className="block text-xs text-zinc-500 mb-1">Trigger label</label>
              <input
                value={cfg.label}
                onChange={(e) => set("label", e.target.value)}
                className="w-full max-w-xs px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none"
                placeholder="ch-review"
              />
            </div>
            <div className="mt-3">
              <label className="block text-xs text-zinc-500 mb-1">Review focus / instructions (optional)</label>
              <textarea
                value={cfg.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none font-mono"
                placeholder="e.g. Pay special attention to auth changes and DB migrations. Enforce our error-handling conventions."
              />
            </div>
          </section>

          {/* Advanced: auto-actions */}
          <section className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
            <button
              onClick={() => setShowAdvanced((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-zinc-200">Post-approval actions <span className="text-zinc-500 font-normal">(advanced)</span></span>
              <span className="text-zinc-500 text-xs">{showAdvanced ? "▲" : "▼"}</span>
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4">
                <div className="mb-3 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  ⚠️ These let the reviewer act on your repo after it approves. Merge is guarded to the exact
                  reviewed commit and — unless you turn it off — also requires a human approval (two-key). The
                  health check reports on the deploy; it never rolls back on its own.
                </div>

                <Toggle checked={cfg.auto_merge} onChange={(v) => set("auto_merge", v)} label="Auto-merge on approve" hint="Only merges the exact reviewed commit; a later push blocks the merge." />
                <div className="ml-12 mb-2">
                  <label className="block text-xs text-zinc-500 mb-1">Merge method</label>
                  <select
                    value={cfg.merge_method}
                    onChange={(e) => set("merge_method", e.target.value)}
                    disabled={!cfg.auto_merge}
                    className="px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                  >
                    <option value="squash">squash</option>
                    <option value="merge">merge</option>
                    <option value="rebase">rebase</option>
                  </select>
                </div>
                <Toggle
                  checked={cfg.require_human_approval}
                  onChange={(v) => set("require_human_approval", v)}
                  label="Require a human approval too (two-key)"
                  hint="Strongly recommended. If off, the bot's approval alone can merge."
                />
                <div className="ml-12 mt-2 mb-1">
                  <label className="block text-xs text-zinc-500 mb-1">Deploy label (optional)</label>
                  <input
                    value={cfg.deploy_label}
                    onChange={(e) => set("deploy_label", e.target.value)}
                    disabled={!cfg.auto_merge}
                    className="w-full max-w-xs px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none disabled:opacity-40"
                    placeholder="e.g. deploy-staging"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    Once a PR is cleared to merge, the reviewer adds this label so your own CI can deploy
                    (staging/preview), then waits for that deploy&apos;s CI to pass before merging. Leave blank to skip.
                  </p>
                </div>

                <div className="border-t border-zinc-800 my-3" />

                <Toggle checked={cfg.auto_tag} onChange={(v) => set("auto_tag", v)} label="Tag after merge" />
                <div className="ml-12 mb-2">
                  <label className="block text-xs text-zinc-500 mb-1">Tag mode</label>
                  <select
                    value={cfg.tag_mode}
                    onChange={(e) => set("tag_mode", e.target.value)}
                    disabled={!cfg.auto_tag}
                    className="px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
                  >
                    <option value="semver">semver release (bump patch)</option>
                    <option value="date">date marker</option>
                  </select>
                </div>
                <div className="ml-12 mb-2">
                  <label className="block text-xs text-zinc-500 mb-1">Tag prefix</label>
                  <input
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

                <div className="border-t border-zinc-800 my-3" />

                <Toggle checked={cfg.health_check} onChange={(v) => set("health_check", v)} label="Health check after merge" hint="Watches the base-branch deploy checks (adaptively — no timer to set) and flags only NEW failures vs. before the merge. Reports; never rolls back on its own." />
                {cfg.health_check && (
                  <div className="ml-12 mb-1">
                    <label className="block text-xs text-zinc-500 mb-1">CloudWatch log groups to watch (optional)</label>
                    {logGroups.length === 0 ? (
                      <p className="text-xs text-zinc-600">
                        {loadingLogGroups
                          ? "Loading log groups…"
                          : <>No AWS account connected — <a href="/settings/aws" className="text-zinc-400 underline">connect one</a> to pick log groups. (CI-check health works without it.)</>}
                      </p>
                    ) : (
                      <>
                        <input
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
                                  return (
                                    <label key={lg} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={on}
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
                          <p className="text-xs text-zinc-500 mt-1">{cfg.health_log_groups.length} selected</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Teams reminders */}
          <section className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200 mb-2">Teams reminders</h2>
            <Toggle
              checked={cfg.reminders_enabled}
              onChange={(v) => set("reminders_enabled", v)}
              label="Remind reviewers in Microsoft Teams"
              hint="Every ~20 min, posts open PRs still waiting on their requested reviewers. Re-nudges after the cooldown or a new commit — never every tick."
            />
            <div className="mt-3">
              <label className="block text-xs text-zinc-500 mb-1">Teams incoming webhook URL</label>
              <input
                value={cfg.teams_webhook_url}
                onChange={(e) => set("teams_webhook_url", e.target.value)}
                disabled={!cfg.reminders_enabled}
                className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none disabled:opacity-40 font-mono"
                placeholder="https://…webhook.office.com/… or a Power Automate URL"
              />
              <p className="text-xs text-zinc-600 mt-1">Must be an https URL. Create one via a Teams channel → Workflows / Incoming Webhook.</p>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-zinc-500 mb-1">Re-nudge cooldown (hours)</label>
              <input
                type="number"
                value={cfg.reminder_cooldown_hours}
                onChange={(e) => set("reminder_cooldown_hours", Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
                disabled={!cfg.reminders_enabled}
                className="w-28 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40"
              />
            </div>
          </section>

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save configuration"}
          </button>
        </div>
      )}
    </div>
  );
}
