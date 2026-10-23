"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { TextareaSkeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { Page, PageHeader } from "@/components/page";
import { secondaryButton } from "@/components/ui";
import { Field, SaveBar, SettingsDisclosure, SettingsSection } from "@/components/settings";
import { MarkdownEditor } from "@/components/markdown-editor";
import { CodeBlock } from "@/components/code-block";
import { ScopeBar } from "../scope-bar";
import { useScopedText } from "../use-scoped-text";

export default function InstructionsPageGuarded() {
  return <RoleGuard minRole="admin"><InstructionsPage /></RoleGuard>;
}

const PREVIEW_NOTE = "Agents get this text as written, with your instructions for every repository first. This is how its headings and lists read.";

const GLOBAL_PLACEHOLDER = `Example:
- Always use TypeScript strict mode
- Prefer named exports over default exports
- Use kebab-case for file names
- Write tests for all new functions`;

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
      toast(isRepo ? "Repo instructions saved" : "Global instructions saved");
    } catch {
      setProblem("The instructions were not saved. Try again.");
      toast("Failed to save", "error");
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

      <SettingsSection id="instructions" title={isRepo ? "This repository's instructions" : "Instructions for every repository"}>
        <div className="space-y-4 px-4 py-4">
          {isRepo && repos.length === 0 ? (
            <p className="text-sm text-zinc-500">No repositories are turned on. Turn one on under Settings, Repositories first.</p>
          ) : text.loading ? (
            <TextareaSkeleton />
          ) : text.failed ? (
            <Callout variant="error" title="Could not load the instructions">
              <p>Nothing is shown, so the saved instructions cannot be overwritten by mistake.</p>
              <button type="button" onClick={text.reload} className={`mt-2 ${secondaryButton}`}>Try again</button>
            </Callout>
          ) : generating ? (
            <div role="status" className="flex flex-col items-center justify-center py-12 text-center">
              <div aria-hidden="true" className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300 motion-reduce:animate-none" />
              <p className="text-sm text-zinc-300">Reading this repository…</p>
              <p className="mt-1 text-xs text-zinc-500">Coderhelm is learning its structure and conventions.</p>
            </div>
          ) : (
            <>
              {generationFailed && (
                <Callout variant="error" title="Coderhelm could not read this repository" live={false}>
                  {repoData?.onboard_error ? <p className="break-words">{repoData.onboard_error.slice(0, 200)}</p> : <p>You can still write instructions below.</p>}
                </Callout>
              )}
              <Field
                as="custom"
                id={isRepo ? "repo-instructions" : "global-instructions"}
                label="Custom instructions (optional)"
                unsaved={form.dirty}
                help={isRepo ? `Added after the instructions for every repository, only in ${repo}. Markdown works.` : "Applied in every repository. Markdown works."}
              >
                {(ids) => (
                  <MarkdownEditor
                    {...ids}
                    variant="instructions"
                    value={form.values.content}
                    onChange={(v) => form.set("content", v)}
                    minRows={isRepo ? 10 : 12}
                    previewNote={PREVIEW_NOTE}
                    placeholder={isRepo ? REPO_PLACEHOLDER : GLOBAL_PLACEHOLDER}
                  />
                )}
              </Field>
              {generated && (
                <SettingsDisclosure summary={isRepo ? "What Coderhelm learned about this repository" : "What Coderhelm learned about your team"}>
                  <p className="text-xs text-zinc-500">Written by Coderhelm and given to agents with your instructions. You can&apos;t edit it here.</p>
                  <CodeBlock code={generated} lang="markdown" label={isRepo ? "Codebase analysis" : "Organization overview"} wrap maxHeightClass="max-h-96" />
                </SettingsDisclosure>
              )}
            </>
          )}
        </div>
      </SettingsSection>

      <SaveBar count={form.count} onSave={save} onDiscard={() => { form.discard(); setProblem(null); }} saving={saving} problem={problem} context={isRepo ? repo : undefined} />
    </Page>
  );
}
