"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { TextareaSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

export default function InstructionsPage() {
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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Custom Instructions</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Conventions and preferences that d3ftly follows. Global instructions apply to all repos.
        Per-repo instructions add repo-specific guidance on top.
      </p>

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
                  <pre className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-auto">
                    {globalGenerated}
                  </pre>
                )}
              </div>
            )}
            <p className="text-xs text-zinc-600 mb-2">Custom instructions (optional)</p>
            <textarea
              value={globalContent}
              onChange={(e) => setGlobalContent(e.target.value)}
              rows={16}
              placeholder={`Example:\n- Always use TypeScript strict mode\n- Prefer named exports over default exports\n- Use kebab-case for file names\n- Write tests for all new functions`}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-y"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={saveGlobal}
                disabled={globalSaving}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
              >
                {globalSaving ? "Saving..." : "Save"}
              </button>
              <span className="text-xs text-zinc-600">Applied to all repos. Markdown supported.</span>
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
                    <pre className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-auto">
                      {generatedContent}
                    </pre>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-600 mb-2">Custom instructions (optional)</p>
              <textarea
                value={repoContent}
                onChange={(e) => setRepoContent(e.target.value)}
                rows={12}
                placeholder={`Add repo-specific conventions, e.g.:\n- This is a React Native app, use Expo patterns\n- Use Prisma for all database operations\n- Follow the error handling in src/utils/errors.ts`}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-y"
              />
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={saveRepo}
                  disabled={repoSaving}
                  className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
                >
                  {repoSaving ? "Saving..." : "Save"}
                </button>
                <span className="text-xs text-zinc-600">Merged with global instructions at runtime.</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
