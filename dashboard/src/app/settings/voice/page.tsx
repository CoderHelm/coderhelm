"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { useConfirm } from "@/components/confirm-dialog";
import { TextareaSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";
import { Page, PageHeader } from "@/components/page";
import { primaryButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { Field } from "@/components/settings";
import { MarkdownEditor } from "@/components/markdown-editor";

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
        active ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function VoiceEditor({
  fieldId,
  content,
  setContent,
  saving,
  onSave,
  regenerating,
  onRegenerate,
  loading,
}: {
  fieldId: string;
  content: string;
  setContent: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  regenerating?: boolean;
  onRegenerate?: () => void;
  loading: boolean;
}) {
  if (loading) return <TextareaSkeleton />;
  return (
    <>
      <Field as="custom" id={fieldId} label="Voice" help="Used when Coderhelm writes pull request descriptions, commit messages and code comments.">
        {(ids) => (
          <MarkdownEditor
            {...ids}
            variant="instructions"
            value={content}
            onChange={setContent}
            minRows={14}
            previewNote="Coderhelm reads this as written. This is how its headings and lists read."
            placeholder={`# Team Voice\n\n## Tone\nCasual and direct. No emojis in code.\n\n## Commit Messages\nConventional commits (feat:, fix:, chore:). Imperative mood.\n\n## PR Descriptions\nStructured with Problem, Changes, Risk, Verification sections.\n\n## Language\nTechnical but concise. Avoid jargon.`}
          />
        )}
      </Field>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={primaryButton}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className={secondaryButton}
          >
            {regenerating ? "Regenerating..." : "Regenerate"}
          </button>
        )}
      </div>
    </>
  );
}

export default function VoicePageGuarded() {
  return <RoleGuard minRole="admin"><VoicePage /></RoleGuard>;
}

function VoicePage() {
  const [tab, setTab] = useState<"global" | "repo">("global");
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [globalContent, setGlobalContent] = useState("");
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoContent, setRepoContent] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    api.getGlobalVoice().then((data) => {
      setGlobalContent(data.content);
      setGlobalLoading(false);
    }).catch(() => setGlobalLoading(false));

    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setSelectedRepo(enabled[0].name);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setRepoLoading(true);
    api.getRepoVoice(selectedRepo).then((data) => {
      setRepoContent(data.content);
      setRepoLoading(false);
    }).catch(() => {
      setRepoContent("");
      setRepoLoading(false);
    });
  }, [selectedRepo]);

  const selectedRepoData = repos.find((r) => r.name === selectedRepo);
  const isGenerating = selectedRepoData?.onboard_status === "pending" && !repoContent;

  const saveGlobal = async () => {
    setGlobalSaving(true);
    try {
      await api.updateGlobalVoice(globalContent);
      toast("Global voice saved");
    } catch {
      toast("Failed to save voice", "error");
    }
    setGlobalSaving(false);
  };

  const saveRepo = async () => {
    if (!selectedRepo) return;
    setRepoSaving(true);
    try {
      await api.updateRepoVoice(selectedRepo, repoContent);
      toast("Voice saved");
    } catch {
      toast("Failed to save voice", "error");
    }
    setRepoSaving(false);
  };

  const regenerate = async () => {
    if (!selectedRepo) return;
    if (!(await confirm({ title: "Regenerate Voice", message: "This will re-analyze your repo and regenerate the voice profile. Your edits will be replaced. Continue?", confirmLabel: "Regenerate", destructive: true }))) return;
    setRegenerating(true);
    try {
      await api.regenerateRepo(selectedRepo);
      toast("Regeneration started — this may take a minute");
      setTimeout(async () => {
        try {
          const data = await api.getRepoVoice(selectedRepo);
          setRepoContent(data.content);
        } catch { /* ignore */ }
        setRegenerating(false);
      }, 15000);
    } catch {
      toast("Failed to start regeneration", "error");
      setRegenerating(false);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Team voice"
          lead="Define how Coderhelm writes PR descriptions, commit messages, and code comments. Global voice applies to all repos. Per-repo voice overrides it for a specific repo and is auto-generated during onboarding."
        />
      </div>

      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        <Tab label="Global" active={tab === "global"} onClick={() => setTab("global")} />
        <Tab label="Per Repo" active={tab === "repo"} onClick={() => setTab("repo")} />
      </div>

      {tab === "global" ? (
        <VoiceEditor
          fieldId="global-voice"
          content={globalContent}
          setContent={setGlobalContent}
          saving={globalSaving}
          onSave={saveGlobal}
          loading={globalLoading}
        />
      ) : repos.length === 0 ? (
        <p className="text-zinc-500 text-sm">No enabled repos. Enable repos in Settings → Repos first.</p>
      ) : (
        <>
          <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16 border border-zinc-800 rounded-lg">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-3" />
              <p className="text-zinc-400 text-sm">Generating voice profile...</p>
              <p className="text-zinc-600 text-xs mt-1">Analyzing PRs and commits for communication patterns</p>
            </div>
          ) : selectedRepoData?.onboard_status === "failed" && !repoContent ? (
            <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4">
              <p className="text-red-400 text-sm font-medium">Voice generation failed</p>
              {selectedRepoData.onboard_error && (
                <p className="text-red-400/70 text-xs mt-1">{selectedRepoData.onboard_error.slice(0, 200)}</p>
              )}
              <button
                onClick={regenerate}
                disabled={regenerating}
                className={`mt-3 ${smallSecondaryButton}`}
              >
                Retry
              </button>
            </div>
          ) : (
            <VoiceEditor
              fieldId="repo-voice"
              content={repoContent}
              setContent={setRepoContent}
              saving={repoSaving}
              onSave={saveRepo}
              regenerating={regenerating}
              onRegenerate={regenerate}
              loading={repoLoading}
            />
          )}
        </>
      )}
    </Page>
  );
}
