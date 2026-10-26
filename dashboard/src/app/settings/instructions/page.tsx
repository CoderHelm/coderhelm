"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
  const [generated, setGenerated] = useState("");

  useEffect(() => {
    setGenerated("");
    if (isRepo && !repo) return;
    let live = true;
    (isRepo ? api.getRepoAgents(repo) : api.getGlobalAgents())
      .then((d) => live && setGenerated(d.content))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isRepo, repo]);

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
          title="Custom instructions"
          lead="Conventions Coderhelm follows when it writes code. A repository's own instructions are added after the ones for every repository."
        />
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
              {generated && (
                <SettingsDisclosure summary={isRepo ? "What Coderhelm learned about this repository" : "What Coderhelm learned about your team"}>
                  <p className="text-sm text-zinc-400">Written by Coderhelm and given to agents with your instructions. You can&apos;t edit it here.</p>
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                    <Markdown>{generated}</Markdown>
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
