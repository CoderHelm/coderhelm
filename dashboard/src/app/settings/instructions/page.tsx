"use client";

import { CodeBlock } from "@/components/code-block";
import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { TextareaSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";
import { Page, PageHeader } from "@/components/page";
import { Field } from "@/components/settings";
import { MarkdownEditor } from "@/components/markdown-editor";
import { primaryButton } from "@/components/ui";

const PREVIEW_NOTE = "Agents get this text as written, with your global instructions first. This is how its headings and lists read.";

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

export default function InstructionsPageGuarded() {
  return <RoleGuard minRole="admin"><InstructionsPage /></RoleGuard>;
}

function InstructionsPage() {
  const [tab, setTab] = useState<"global" | "repo">("global");
  const { toast } = useToast();

  const [globalContent, setGlobalContent] = useState("");
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalGenerated, setGlobalGenerated] = useState("");
  const [globalGeneratedExpanded, setGlobalGeneratedExpanded] = useState(false);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoContent, setRepoContent] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedExpanded, setGeneratedExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getGlobalInstructions().then((d) => d.content).catch(() => ""),
      api.getGlobalAgents().then((d) => d.content).catch(() => ""),
    ]).then(([custom, generated]) => {
      setGlobalContent(custom);
      setGlobalGenerated(generated);
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
    setGeneratedContent("");
    setGeneratedExpanded(false);
    Promise.all([
      api.getRepoInstructions(selectedRepo).then((d) => d.content).catch(() => ""),
      api.getRepoAgents(selectedRepo).then((d) => d.content).catch(() => ""),
    ]).then(([custom, generated]) => {
      setRepoContent(custom);
      setGeneratedContent(generated);
      setRepoLoading(false);
    });
  }, [selectedRepo]);

  const selectedRepoData = repos.find((r) => r.name === selectedRepo);
  const isGenerating = selectedRepoData?.onboard_status === "pending" && !repoContent;

  const saveGlobal = async () => {
    setGlobalSaving(true);
    try {
      await api.updateGlobalInstructions(globalContent);
      toast("Global instructions saved");
    } catch {
      toast("Failed to save", "error");
    }
    setGlobalSaving(false);
  };

  const saveRepo = async () => {
    if (!selectedRepo) return;
    setRepoSaving(true);
    try {
      await api.updateRepoInstructions(selectedRepo, repoContent);
      toast("Repo instructions saved");
    } catch {
      toast("Failed to save", "error");
    }
    setRepoSaving(false);
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Custom instructions"
          lead="Conventions and preferences that Coderhelm follows. Global instructions apply to all repos. Per-repo instructions add repo-specific guidance on top."
        />
      </div>

      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        <Tab label="Global" active={tab === "global"} onClick={() => setTab("global")} />
        <Tab label="Per Repo" active={tab === "repo"} onClick={() => setTab("repo")} />
      </div>

      {tab === "global" ? (
        globalLoading ? <TextareaSkeleton /> : (
          <>
            {globalGenerated && (
              <div className="mb-4 border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setGlobalGeneratedExpanded(!globalGeneratedExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Generated</span>
                    <span className="text-sm text-zinc-300">Organization overview</span>
                  </div>
                  <span className="text-zinc-600 text-xs">{globalGeneratedExpanded ? "Collapse" : "Expand"}</span>
                </button>
                {globalGeneratedExpanded && (
                  <CodeBlock code={globalGenerated} lang="markdown" label="Organization overview" wrap maxHeightClass="max-h-96" className="!rounded-none !border-x-0 !border-b-0" />
                )}
              </div>
            )}
            <Field as="custom" id="global-instructions" label="Custom instructions (optional)" help="Applied to every repo.">
              {(ids) => (
                <MarkdownEditor
                  {...ids}
                  variant="instructions"
                  value={globalContent}
                  onChange={setGlobalContent}
                  minRows={12}
                  previewNote={PREVIEW_NOTE}
                  placeholder={`Example:\n- Always use TypeScript strict mode\n- Prefer named exports over default exports\n- Use kebab-case for file names\n- Write tests for all new functions`}
                />
              )}
            </Field>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={saveGlobal} disabled={globalSaving} className={primaryButton}>
                {globalSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )
      ) : repos.length === 0 ? (
        <p className="text-zinc-500 text-sm">No enabled repos. Enable repos in Settings → Repos first.</p>
      ) : (
        <>
          <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16 border border-zinc-800 rounded-lg">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-3" />
              <p className="text-zinc-400 text-sm">Generating repo instructions...</p>
              <p className="text-zinc-600 text-xs mt-1">Analyzing repository structure and conventions</p>
            </div>
          ) : selectedRepoData?.onboard_status === "failed" && !repoContent ? (
            <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4">
              <p className="text-red-400 text-sm font-medium">Instruction generation failed</p>
              {selectedRepoData.onboard_error && (
                <p className="text-red-400/70 text-xs mt-1">{selectedRepoData.onboard_error.slice(0, 200)}</p>
              )}
            </div>
          ) : repoLoading ? <TextareaSkeleton /> : (
            <>
              {generatedContent && (
                <div className="mb-4 border border-zinc-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setGeneratedExpanded(!generatedExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Generated</span>
                      <span className="text-sm text-zinc-300">Codebase analysis</span>
                    </div>
                    <span className="text-zinc-600 text-xs">{generatedExpanded ? "Collapse" : "Expand"}</span>
                  </button>
                  {generatedExpanded && (
                    <CodeBlock code={generatedContent} lang="markdown" label="Codebase analysis" wrap maxHeightClass="max-h-96" className="!rounded-none !border-x-0 !border-b-0" />
                  )}
                </div>
              )}
              <Field as="custom" id="repo-instructions" label="Custom instructions (optional)" help="Added after the global instructions for this repo.">
                {(ids) => (
                  <MarkdownEditor
                    {...ids}
                    variant="instructions"
                    value={repoContent}
                    onChange={setRepoContent}
                    minRows={10}
                    previewNote={PREVIEW_NOTE}
                    placeholder={`Add repo-specific conventions, e.g.:\n- This is a React Native app, use Expo patterns\n- Use Prisma for all database operations\n- Follow the error handling in src/utils/errors.ts`}
                  />
                )}
              </Field>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={saveRepo} disabled={repoSaving} className={primaryButton}>
                  {repoSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
