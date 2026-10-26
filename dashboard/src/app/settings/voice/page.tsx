"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { useConfirm } from "@/components/confirm-dialog";
import { TextareaSkeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Page, PageHeader } from "@/components/page";
import { secondaryButton } from "@/components/ui";
import { Field, SaveBar } from "@/components/settings";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ScopeBar } from "../scope-bar";
import { useScopedText } from "../use-scoped-text";

export default function VoicePageGuarded() {
  return <RoleGuard need="agent_settings"><VoicePage /></RoleGuard>;
}

const PLACEHOLDER = `# Team voice

## Tone
Casual and direct. No emoji in code.

## Commit messages
Start with a verb: "Add", "Fix", "Remove". Keep the first line short.

## Pull request descriptions
Problem, Changes, Risk and Verification sections.`;

function VoicePage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const text = useScopedText({
    loadGlobal: () => api.getGlobalVoice().then((d) => d.content),
    loadRepo: (repo) => api.getRepoVoice(repo).then((d) => d.content),
  });
  const { scope, repo, repos, form } = text;
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const repoData = repos.find((r) => r.name === repo);
  const isRepo = scope === "repo";
  const generating = isRepo && repoData?.onboard_status === "pending" && !form.values.content;
  const generationFailed = isRepo && repoData?.onboard_status === "failed" && !form.values.content;
  const where = isRepo ? repo : "every repository";

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const content = form.values.content;
    try {
      if (isRepo) await api.updateRepoVoice(repo, content);
      else await api.updateGlobalVoice(content);
      form.reset({ content });
      toast(isRepo ? "Voice saved" : "Team voice saved");
    } catch {
      setProblem("The voice wasn't saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!repo) return;
    const ok = await confirm({
      title: "Write the voice again?",
      message: "Coderhelm reads this repository's pull requests and commits again and replaces this voice, including your edits.",
      confirmLabel: "Write it again",
      destructive: true,
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      await api.regenerateRepo(repo);
      toast("Started. This takes about a minute.");
      setTimeout(async () => {
        await text.reload();
        setRegenerating(false);
      }, 15000);
    } catch {
      toast("Couldn't start it. Try again.", "error");
      setRegenerating(false);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Team voice"
          lead="How Coderhelm writes pull request descriptions, commit messages and code comments. A repository's own voice replaces the one for every repository."
        />
      </div>

      <ScopeBar label="Whose voice" scope={scope} onScope={text.setScope} repos={repos} repo={repo} onRepo={text.setRepo} />

      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-zinc-400" data-testid="voice-scope-note">
          {isRepo
            ? `${repo || "This repository"} uses its own voice instead of the one for every repository.`
            : "Used in every repository that has no voice of its own."}
        </p>
        {isRepo && repos.length === 0 ? (
          <EmptyState title="No repositories are turned on">Turn one on under Settings, Repositories first.</EmptyState>
        ) : text.loading ? (
          <TextareaSkeleton />
        ) : text.failed ? (
          <Problem title="Couldn't load the voice" onRetry={text.reload}>
            Nothing has changed. The editor stays hidden until the saved voice loads, so it can&apos;t be overwritten.
          </Problem>
        ) : generating ? (
          <div role="status" className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 py-12 text-center">
            <div aria-hidden="true" className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300 motion-reduce:animate-none" />
            <p className="text-sm text-zinc-300">Writing this repository&apos;s voice…</p>
            <p className="mt-1 text-sm text-zinc-400">Coderhelm is reading its pull requests and commits.</p>
          </div>
        ) : generationFailed ? (
          <Problem title="Coderhelm couldn't write this voice" onRetry={regenerate} details={repoData?.onboard_error}>
            Try again. If it keeps failing, write the voice yourself below once the repository loads, or contact support.
          </Problem>
        ) : (
          <>
            <Field
              as="custom"
              id="voice-editor"
              label="Voice"
              unsaved={form.dirty}
              help={`Used for ${where} when Coderhelm writes pull request descriptions, commit messages and code comments. You can use headings and bullet lists.`}
            >
              {(ids) => (
                <MarkdownEditor
                  {...ids}
                  variant="instructions"
                  value={form.values.content}
                  onChange={(v) => form.set("content", v)}
                  minRows={14}
                  maxHeight="85vh"
                  previewNote="Coderhelm reads this as written. This is how its headings and lists read."
                  placeholder={PLACEHOLDER}
                />
              )}
            </Field>
            {isRepo && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={regenerate} disabled={regenerating} className={secondaryButton}>
                  {regenerating ? "Writing it again…" : "Write it again from the repository"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <SaveBar count={form.count} onSave={save} onDiscard={() => { form.discard(); setProblem(null); }} saving={saving} problem={problem} context={isRepo ? repo : undefined} />
    </Page>
  );
}
