"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, type Repo, type TestSettings } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { CopyButton } from "@/components/copy-button";
import { Callout } from "@/components/callout";
import { useToast } from "@/components/toast";
import { focusRing, primaryButton, secondaryButton } from "@/components/ui";
import { Select } from "./common";

export const REPORTER_SNIPPET = `// playwright.config.ts
reporter: [["html"], ["json", { outputFile: "test-results/results.json" }]],`;

export const QUARANTINE_SNIPPET = `# in the job that runs your Playwright tests
permissions:
  id-token: write # lets the job ask GitHub for a signed token Coderhelm checks
  contents: read
steps:
  # ...your checkout and install steps...
  - name: Get quarantined tests from Coderhelm
    id: quarantine
    run: |
      TOKEN=$(curl -sf -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \\
        "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=coderhelm" | jq -r .value) || TOKEN=""
      GREP=$(curl -sf -H "Authorization: Bearer $TOKEN" \\
        https://api.coderhelm.com/webhooks/ci/tests/quarantine | jq -r '.playwright_grep_invert // ""') || GREP=""
      echo "grep=$GREP" >> "$GITHUB_OUTPUT"
  - name: Run E2E tests
    env:
      QUARANTINED: \${{ steps.quarantine.outputs.grep }}
    run: |
      if [ -n "$QUARANTINED" ]; then
        npx playwright test --grep-invert "$QUARANTINED"
      else
        npx playwright test
      fi
  # ...your upload-artifact step...`;

/** The CI step that keeps quarantined tests from failing a build. Nothing in a repo changes until a team adds it. */
export function QuarantineCiStep() {
  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <p className="max-w-prose text-zinc-400">
        Coderhelm already treats a run where only quarantined tests failed as passing: it won&apos;t try to fix it or hold back
        auto-merge. GitHub&apos;s check still turns red, because your workflow decides that. To skip quarantined tests in the build,
        add this step before your test step. If Coderhelm can&apos;t be reached, every test runs as before.
      </p>
      <Snippet text={QUARANTINE_SNIPPET} />
      <p className="max-w-prose text-zinc-400">
        Skipped tests aren&apos;t recorded from that run. To keep recording them, run{" "}
        <code className="text-zinc-200">npx playwright test --grep &quot;$QUARANTINED&quot;</code> in a separate job with{" "}
        <code className="text-zinc-200">continue-on-error: true</code> that uploads its results the same way.
      </p>
    </div>
  );
}

export const UPLOAD_SNIPPET = `# in the workflow that runs your E2E tests, after the test step
- uses: actions/upload-artifact@v4
  if: \${{ !cancelled() }}
  with:
    name: e2e-results
    path: test-results/`;

/** The two small changes that make a repo's results complete. Shown in the empty state and in settings. */
export function SetupSteps() {
  return (
    <ol className="space-y-4 text-sm text-zinc-300">
      <li>
        <p>
          <span className="font-medium text-zinc-100">1. Write a results file.</span> Add Playwright&apos;s JSON reporter next to the one you
          have. JUnit XML and Cucumber JSON work too.
        </p>
        <Snippet text={REPORTER_SNIPPET} />
      </li>
      <li>
        <p>
          <span className="font-medium text-zinc-100">2. Keep it, even when tests fail.</span> Upload the results folder at the end of the
          job. <code className="text-zinc-200">if: !cancelled()</code> keeps failed runs, which are the ones that matter.
        </p>
        <Snippet text={UPLOAD_SNIPPET} />
      </li>
    </ol>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex justify-end border-b border-zinc-800 px-2 py-1.5">
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-zinc-300">{text}</pre>
    </div>
  );
}

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

function Row({ title, children, control }: { title: string; children: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <div className="mt-0.5 max-w-prose text-sm text-zinc-400">{children}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsView({
  settings,
  onSaved,
}: {
  settings: TestSettings;
  onSaved: (s: TestSettings) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<TestSettings>(settings);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => setRepos([]));
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const days = draft.ticket_after_days;
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 30;
  const set = <K extends keyof TestSettings>(k: K, v: TestSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleRepo = (name: string) =>
    setDraft((d) => ({ ...d, repos: d.repos.includes(name) ? d.repos.filter((r) => r !== name) : [...d.repos, name] }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await api.updateTestSettings(draft);
      onSaved(saved);
      toast("Settings saved");
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Settings</h2>
        <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <Row title="Track E2E tests" control={<Switch label="Track E2E tests" checked={draft.enabled} onChange={(v) => set("enabled", v)} />}>
            Read every E2E run your CI finishes, and tell flaky tests from broken ones. Nothing changes in your repos.
          </Row>
          <Row
            title="Quarantine flaky tests"
            control={<Switch label="Quarantine flaky tests" checked={draft.auto_quarantine} onChange={(v) => set("auto_quarantine", v)} disabled={!draft.enabled} />}
          >
            A test that turns flaky on your main branch stops failing builds. It still runs and is still recorded. Broken tests are never
            quarantined.
          </Row>
          <Row
            title="Open fix PRs"
            control={<Switch label="Open fix PRs" checked={draft.fix_prs} onChange={(v) => set("fix_prs", v)} disabled={!draft.enabled} />}
          >
            Coderhelm reproduces a flaky test, writes a fix and opens a PR only after 20 green runs. It never skips a test or weakens a check
            to make it pass.
          </Row>
          <Row
            title="Check new tests before merge"
            control={<Switch label="Check new tests before merge" checked={draft.burn_in} onChange={(v) => set("burn_in", v)} disabled={!draft.enabled} />}
          >
            When a PR adds or changes a test, the review suggests running it 10 times first, so a flaky test never lands.
          </Row>
          <Row
            title="Tickets for long quarantines"
            control={
              <div className="w-36">
                <Select
                  label="Tickets for long quarantines"
                  hideLabel
                  value={draft.tickets}
                  onChange={(v) => set("tickets", v)}
                  options={[
                    { value: "github", label: "GitHub issue" },
                    { value: "jira", label: "Jira" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </div>
            }
          >
            When a test stays quarantined without a fix, its owner gets a ticket with its history and likely cause.
          </Row>
          <Row
            title="Days before a ticket"
            control={
              <input
                id="ticket-after-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                aria-label="Days before a ticket"
                value={Number.isFinite(draft.ticket_after_days) ? draft.ticket_after_days : ""}
                disabled={!draft.enabled || draft.tickets === "off"}
                onChange={(e) => set("ticket_after_days", e.target.value === "" ? Number.NaN : Number(e.target.value))}
                className={`w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50 ${focusRing}`}
              />
            }
          >
            File a ticket after a test has been quarantined this many days. Between 1 and 30.
          </Row>
        </div>
      </section>

      <section aria-labelledby="repos-heading">
        <h2 id="repos-heading" className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Repositories</h2>
        <p className="mb-3 text-sm text-zinc-400">{draft.repos.length === 0 ? "Every repository is tracked." : "Only the ticked repositories are tracked."}</p>
        {repos === null ? (
          <p role="status" className="text-sm text-zinc-500">Loading repositories…</p>
        ) : repos.length === 0 ? (
          <p className="text-sm text-zinc-500">No repositories are set up yet.</p>
        ) : (
          <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="sr-only">Repositories to track</legend>
            <ul className="space-y-2">
              {repos.map((r) => (
                <li key={r.name}>
                  <label className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={draft.repos.includes(r.name)}
                      onChange={() => toggleRepo(r.name)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    <span className="break-all font-mono">{r.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            {draft.repos.length > 0 && (
              <button type="button" onClick={() => set("repos", [])} className={`${secondaryButton} mt-3 !min-h-8 !py-1`}>
                Track every repository
              </button>
            )}
          </fieldset>
        )}
      </section>

      {!daysValid && (
        <p role="alert" className="text-sm text-red-300">Pick between 1 and 30 days before a ticket.</p>
      )}
      {error && (
        <Callout variant="error" title="We couldn't save your settings">
          <p>{error} Nothing was changed.</p>
        </Callout>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={!dirty || saving || !daysValid} className={primaryButton}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {dirty && (
          <button type="button" onClick={() => setDraft(settings)} disabled={saving} className={secondaryButton}>
            Discard changes
          </button>
        )}
      </div>

      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Make results complete</h2>
        <SetupSteps />
      </section>

      <section aria-labelledby="quarantine-ci-heading">
        <h2 id="quarantine-ci-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Make quarantined tests stop failing your build
        </h2>
        <QuarantineCiStep />
      </section>
    </div>
  );
}
