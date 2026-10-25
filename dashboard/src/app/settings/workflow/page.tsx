"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AwsConnection, type GitConventionTemplates, type WorkflowSettings } from "@/lib/api";
import { preview, problem, tokens, TOKEN_HELP, TOKENS, type Kind } from "@/lib/git-conventions";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, linkButton, monoInputClass } from "@/components/ui";
import { Select } from "@/components/select";
import { Code, SaveBar, SettingsDisclosure, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";

export default function WorkflowPageGuarded() {
  return <RoleGuard need="agent_settings"><WorkflowPage /></RoleGuard>;
}

/** The form: the workflow settings and the three git templates, saved with one bar. */
type Form = WorkflowSettings & GitConventionTemplates;

const WORKFLOW_KEYS = ["commit_openspec", "default_destination", "allow_plan_log_analyzer"] as const;
const GIT_KEYS: Kind[] = ["branch", "commit", "pr_title"];

const EMPTY: Form = { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false, branch: "", commit: "", pr_title: "" };

// The sample ticket the previews render.
const SAMPLE = tokens("ABC-123", "ABC-123", "Fix the login redirect after single sign-on");

const GIT_FIELDS: { key: Kind; label: string; what: string }[] = [
  { key: "branch", label: "Branch name", what: "The branch Coderhelm works on for a ticket." },
  { key: "commit", label: "Commit message", what: "The first line of each commit." },
  { key: "pr_title", label: "Pull request title", what: "The title of the pull request Coderhelm opens." },
];

/** Templates compare without their outer spaces; everything else as it is. */
const sameField = (a: unknown, b: unknown, key: keyof Form) =>
  (GIT_KEYS as string[]).includes(key as string) ? String(a ?? "").trim() === String(b ?? "").trim() : a === b;

type Load = "loading" | "error" | "ready";

function WorkflowPage() {
  const { toast } = useToast();
  const [load, setLoad] = useState<Load>("loading");
  const [defaults, setDefaults] = useState<GitConventionTemplates>({ branch: "", commit: "", pr_title: "" });
  const [jiraConnected, setJiraConnected] = useState(false);
  const [awsConnected, setAwsConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problemText, setProblemText] = useState<string | null>(null);
  const [serverError, setServerError] = useState<{ field: Kind; error: string } | null>(null);

  const form = useDirtyForm<Form>(EMPTY, { same: sameField, disabled: load !== "ready" });
  const { reset } = form;
  const v = form.values;

  const fetchAll = useCallback(async () => {
    setLoad("loading");
    try {
      const [workflow, git, jira, aws] = await Promise.all([
        api.getWorkflowSettings(),
        api.getGitConventions(),
        api.getJiraCheck().catch(() => null),
        api.listAwsConnections().catch(() => ({ connections: [] as AwsConnection[] })),
      ]);
      reset({ ...workflow, branch: git.branch, commit: git.commit, pr_title: git.pr_title });
      setDefaults(git.defaults);
      setJiraConnected(!!(jira?.ready || jira?.secret_configured));
      setAwsConnected(aws.connections.some((c) => c.status === "active"));
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, [reset]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const problems = Object.fromEntries(GIT_KEYS.map((k) => [k, problem(k, v[k])])) as Record<Kind, string | null>;
  const blocked = GIT_KEYS.some((k) => problems[k]);

  const save = async () => {
    if (blocked) {
      setProblemText("Fix the highlighted git template first.");
      return;
    }
    setSaving(true);
    setProblemText(null);
    setServerError(null);
    let next: Form = { ...form.saved };
    let failed: string | null = null;

    if (form.isDirty(...WORKFLOW_KEYS)) {
      const body: WorkflowSettings = {
        commit_openspec: v.commit_openspec,
        default_destination: v.default_destination,
        allow_plan_log_analyzer: v.allow_plan_log_analyzer,
      };
      try {
        await api.updateWorkflowSettings(body);
        next = { ...next, ...body };
      } catch {
        failed = "The pull request and plan settings were not saved. Try again.";
      }
    }

    if (form.isDirty(...GIT_KEYS)) {
      const trimmed = { branch: v.branch.trim(), commit: v.commit.trim(), pr_title: v.pr_title.trim() };
      const res = await api.updateGitConventions(trimmed);
      if (res.ok) {
        next = { ...next, branch: res.branch, commit: res.commit, pr_title: res.pr_title };
      } else {
        if (res.field) setServerError({ field: res.field, error: res.error });
        failed = failed ?? (res.error || "The git templates were not saved.");
      }
    }

    // What went through is saved; what didn't stays unsaved on screen.
    const edited = v;
    reset(next);
    if (failed) {
      form.update(edited);
      setProblemText(failed);
      toast(failed, "error");
    } else {
      toast("Workflow settings saved");
    }
    setSaving(false);
  };

  const discard = () => {
    form.discard();
    setProblemText(null);
    setServerError(null);
  };

  const header = (
    <div className="mb-6">
      <PageHeader title="Workflow" lead="How Coderhelm shapes the pull requests it opens and where plan tasks go." />
    </div>
  );

  if (load === "loading") {
    return (
      <Page>
        {header}
        <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Page>
    );
  }

  if (load === "error") {
    return (
      <Page>
        {header}
        <div className="max-w-3xl">
          <Problem title="Couldn't load the workflow settings" onRetry={fetchAll}>
            Nothing has changed. Try again; the form stays hidden until the saved settings load, so they can&apos;t be overwritten.
          </Problem>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      {header}

      <div className="max-w-3xl space-y-8">
        <SettingsSection id="pull-requests" title="Pull requests">
          <SettingsRow
            label="Add the plan to the pull request"
            layout="toggle"
            unsaved={form.isDirty("commit_openspec")}
            help="Commits the plan's proposal, design, tasks and acceptance criteria to the pull request branch, next to the code."
            control={(ids) => (
              <Switch id={ids.inputId} checked={v.commit_openspec} onChange={(on) => form.set("commit_openspec", on)} labelledBy={ids.labelId} describedBy={ids.helpId} />
            )}
          />
          <div className="px-4 py-4">
            <SettingsDisclosure summary="Words you can use in the templates">
              <p className="text-sm text-zinc-400">
                Leave a template empty to keep the default. A pull request already open for a ticket keeps its branch. Shown for the sample
                ticket {SAMPLE.ticket} &ldquo;{SAMPLE.title}&rdquo;:
              </p>
              <ul className="space-y-1 text-sm text-zinc-400">
                {TOKENS.map((t) => (
                  <li key={t}>
                    <Code>{`{${t}}`}</Code> {TOKEN_HELP[t]}
                  </li>
                ))}
              </ul>
            </SettingsDisclosure>
          </div>
          {GIT_FIELDS.map((f) => {
            const template = v[f.key].trim() || defaults[f.key];
            const err = problems[f.key] ?? (serverError?.field === f.key ? serverError.error : null);
            return (
              <SettingsRow
                key={f.key}
                label={f.label}
                layout="stacked"
                unsaved={form.isDirty(f.key)}
                help={f.what}
                control={(ids) => (
                  <div className="min-w-0">
                    <input
                      id={ids.inputId}
                      value={v[f.key]}
                      placeholder={defaults[f.key]}
                      onChange={(e) => {
                        form.set(f.key, e.target.value);
                        if (serverError?.field === f.key) setServerError(null);
                      }}
                      spellCheck={false}
                      autoComplete="off"
                      aria-invalid={err ? true : undefined}
                      aria-describedby={[ids.helpId, `${ids.inputId}-note`].filter(Boolean).join(" ")}
                      className={monoInputClass}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Insert a word">
                      <span className="text-xs text-zinc-400">Add a word:</span>
                      {TOKENS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          title={TOKEN_HELP[t]}
                          className={buttonClass("ghost", "sm")}
                          onClick={() => form.set(f.key, `${v[f.key]}{${t}}`)}
                        >
                          {`{${t}}`}
                        </button>
                      ))}
                    </div>
                    <p id={`${ids.inputId}-note`} className="mt-1.5 text-sm">
                      {err ? (
                        <span role="alert" className="text-red-300">{err}</span>
                      ) : (
                        <span className="text-zinc-400" data-testid={`git-${f.key}-preview`}>
                          Example: <Code>{preview(f.key, template, SAMPLE)}</Code>
                        </span>
                      )}
                    </p>
                  </div>
                )}
              />
            );
          })}
        </SettingsSection>

        <SettingsSection id="plans" title="Plans">
          <SettingsRow
            label="Where plan tasks go"
            controlClassName="sm:w-64"
            unsaved={form.isDirty("default_destination")}
            help="Where a plan's tasks become tickets, unless you pick another place for a task."
            control={(ids) => (
              <Select
                id={ids.inputId}
                aria-describedby={ids.helpId}
                value={v.default_destination}
                onChange={(e) => form.set("default_destination", e.target.value as Form["default_destination"])}
                className="w-full"
              >
                <option value="github">GitHub issues</option>
                {(jiraConnected || v.default_destination === "jira") && <option value="jira">Jira tickets</option>}
              </Select>
            )}
          />
          <SettingsRow
            label="Let plans read your AWS logs"
            layout="toggle"
            unsaved={form.isDirty("allow_plan_log_analyzer")}
            help={
              awsConnected ? (
                "A plan can use what the logs in your connected AWS account show."
              ) : (
                <>
                  Needs a connected AWS account.{" "}
                  <Link href="/settings/integrations/aws/" className={linkButton}>Connect one</Link>
                </>
              )
            }
            control={(ids) => (
              <Switch
                id={ids.inputId}
                checked={v.allow_plan_log_analyzer}
                onChange={(on) => form.set("allow_plan_log_analyzer", on)}
                labelledBy={ids.labelId}
                describedBy={ids.helpId}
                disabled={!awsConnected && !v.allow_plan_log_analyzer}
              />
            )}
          />
        </SettingsSection>
      </div>

      <SaveBar count={form.count} problem={problemText} onSave={save} onDiscard={discard} saving={saving} />
    </Page>
  );
}
