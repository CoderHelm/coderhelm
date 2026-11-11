"use client";

import { useEffect, useState } from "react";
import { api, type AgentFile } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { TextareaSkeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Page, PageHeader } from "@/components/page";
import { secondaryButton } from "@/components/ui";
import { Field, SaveBar, SettingsDisclosure } from "@/components/settings";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Markdown } from "@/components/markdown";
import { ScopeBar } from "../scope-bar";
import { useScopedText } from "../use-scoped-text";
import { ReviewInSetup, useSetupMarks } from "@/components/setup-marks";

export default function InstructionsPageGuarded() {
  return <RoleGuard need="agent_settings"><InstructionsPage /></RoleGuard>;
}

const PREVIEW_NOTE = "Coderhelm reads this exactly as written, after your instructions for every repository. This is how its headings and lists read.";

const GLOBAL_PLACEHOLDER = `Example:
- Link the Jira ticket in every pull request
- Write user-facing copy in plain words
- Never change the checkout page without a test
- Always use TypeScript strict mode`;

const REPO_PLACEHOLDER = `Add this repository's conventions, for example:
- This is a React Native app, use Expo patterns
- Use Prisma for all database operations
- Follow the error handling in src/utils/errors.ts`;

function InstructionsPage() {
  const { toast } = useToast();
  const text = useScopedText({
    loadGlobal: () => api.getGlobalInstructions().then((d) => d.content),
    loadRepo: (repo) => api.getRepoInstructions(repo).then((d) => d.content),
  });
  const { scope, repo, repos, form } = text;
  const isRepo = scope === "repo";
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // What Coderhelm wrote itself about the team or the repository, read only.
  const [generated, setGenerated] = useState<AgentFile>({ content: "" });
  const [regenerating, setRegenerating] = useState(false);
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    setGenerated({ content: "" });
    if (isRepo && !repo) return;
    let live = true;
    (isRepo ? api.getRepoAgents(repo) : api.getGlobalAgents())
      .then((d) => live && setGenerated(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isRepo, repo, loads]);

  const regenerate = async () => {
    if (!repo) return;
    setRegenerating(true);
    try {
      await api.regenerateRepo(repo);
      toast("Started. This takes about a minute.");
      setTimeout(() => {
        setLoads((n) => n + 1);
        setRegenerating(false);
      }, 15000);
    } catch {
      toast("Couldn't start it. Try again.", "error");
      setRegenerating(false);
    }
  };

  const repoData = repos.find((r) => r.name === repo);
  const generating = isRepo && repoData?.onboard_status === "pending" && !form.values.content;
  const generationFailed = isRepo && repoData?.onboard_status === "failed" && !form.values.content;

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const content = form.values.content;
    try {
      if (isRepo) await api.updateRepoInstructions(repo, content);
      else await api.updateGlobalInstructions(content);
      form.reset({ content });
      toast("Instructions saved");
    } catch {
      setProblem("The instructions weren't saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Conventions"
          lead="Conventions Coderhelm follows when it writes code. A repository's own instructions are added after the ones for every repository."
        />
        <SetupLink />
      </div>

      <ScopeBar label="Whose instructions" scope={scope} onScope={text.setScope} repos={repos} repo={repo} onRepo={text.setRepo} />

      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-zinc-400" data-testid="instructions-scope-note">
          {isRepo
            ? `Added after the instructions for every repository, only in ${repo || "this repository"}.`
            : "Followed in every repository. A repository's own instructions are added after these."}
        </p>
        <div className="space-y-4">
          {isRepo && repos.length === 0 ? (
            <EmptyState title="No repositories are turned on">Turn one on under Settings, Repositories first.</EmptyState>
          ) : text.loading ? (
            <TextareaSkeleton />
          ) : text.failed ? (
            <Problem title="Couldn't load the instructions" onRetry={text.reload}>
              Nothing has changed. The editor stays hidden until the saved instructions load, so they can&apos;t be overwritten.
            </Problem>
          ) : generating ? (
            <div role="status" className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 py-12 text-center">
              <div aria-hidden="true" className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300 motion-reduce:animate-none" />
              <p className="text-sm text-zinc-300">Reading this repository…</p>
              <p className="mt-1 text-sm text-zinc-400">Coderhelm is learning its structure and conventions.</p>
            </div>
          ) : (
            <>
              {generationFailed && (
                <Problem title="Coderhelm couldn't read this repository" tone="warning" details={repoData?.onboard_error}>
                  You can still write instructions below. To try reading it again, turn the repository off and on in Repositories.
                </Problem>
              )}
              <Field
                as="custom"
                id={isRepo ? "repo-instructions" : "global-instructions"}
                label="Custom instructions (optional)"
                unsaved={form.dirty}
                help="You can use headings and bullet lists."
              >
                {(ids) => (
                  <MarkdownEditor
                    {...ids}
                    variant="instructions"
                    value={form.values.content}
                    onChange={(v) => form.set("content", v)}
                    minRows={isRepo ? 10 : 12}
                    maxHeight="85vh"
                    previewNote={PREVIEW_NOTE}
                    placeholder={isRepo ? REPO_PLACEHOLDER : GLOBAL_PLACEHOLDER}
                  />
                )}
              </Field>
              {generated.content && (
                <SettingsDisclosure summary={isRepo ? "What Coderhelm learned about this repository" : "What Coderhelm learned about your team"}>
                  <p className="text-sm text-zinc-400">
                    Written by Coderhelm and given to agents with your instructions. You can&apos;t edit it here.
                    {isRepo && " Coderhelm writes it again by itself after changes to the files it is read from, such as package.json, CI workflows, the README and review guidelines."}
                  </p>
                  {isRepo && <AgentFileUpdated file={generated} />}
                  {isRepo && generated.out_of_date && (
                    <Problem
                      title="Out of date"
                      tone="warning"
                      action={
                        <button type="button" onClick={regenerate} disabled={regenerating} className={secondaryButton}>
                          {regenerating ? "Writing it again…" : "Write it again from the repository"}
                        </button>
                      }
                    >
                      This file was saved by hand, so Coderhelm didn&apos;t replace it
                      {generated.out_of_date_reasons?.length ? ` after ${joinWords(generated.out_of_date_reasons)}` : ""}. Writing it again replaces those edits.
                    </Problem>
                  )}
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                    <Markdown>{generated.content}</Markdown>
                  </div>
                </SettingsDisclosure>
              )}
            </>
          )}
        </div>
      </div>

      <SaveBar count={form.count} onSave={save} onDiscard={() => { form.discard(); setProblem(null); }} saving={saving} problem={problem} context={isRepo ? repo : undefined} />
    </Page>
  );
}

/** "a", "a and b", "a, b and c". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** When and why Coderhelm last wrote the file, in a sentence. */
function updatedLine(file: AgentFile): string | null {
  if (!file.updated_at) return null;
  const when = new Date(file.updated_at);
  if (Number.isNaN(when.getTime())) return null;
  const date = when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const after = file.regenerated_after ?? [];
  if (file.edited) return `Saved by hand on ${date}.`;
  switch (file.regenerated_reason) {
    case "push":
      return after.length ? `Updated automatically on ${date} after changes to ${joinWords(after)}.` : `Updated automatically on ${date}.`;
    case "age":
      return `Updated automatically on ${date}, after new commits to a file more than 30 days old.`;
    case "manual":
      return `Written again on ${date} when someone asked.`;
    default:
      return `Written on ${date}.`;
  }
}

function AgentFileUpdated({ file }: { file: AgentFile }) {
  const line = updatedLine(file);
  if (!line) return null;
  return (
    <p className="text-sm text-zinc-400" data-testid="agent-file-updated">
      {line}
    </p>
  );
}

/** Setup recommends coder instructions per repo; the way back to it. */
function SetupLink() {
  const { available } = useSetupMarks(null);
  return <ReviewInSetup available={available} />;
}
