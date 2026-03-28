"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { TextareaSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";

export default function VoicePage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) {
        setSelectedRepo(enabled[0].name);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setLoading(true);
    api.getRepoVoice(selectedRepo).then((data) => {
      setContent(data.content);
      setLoading(false);
    }).catch(() => {
      setContent("");
      setLoading(false);
    });
  }, [selectedRepo]);

  const save = async () => {
    if (!selectedRepo) return;
    setSaving(true);
    try {
      await api.updateRepoVoice(selectedRepo, content);
      toast("Voice saved");
    } catch {
      toast("Failed to save voice", "error");
    }
    setSaving(false);
  };

  const regenerate = async () => {
    if (!selectedRepo) return;
    if (!confirm("This will re-analyze your repo and regenerate the voice profile. Your edits will be replaced. Continue?")) return;
    setRegenerating(true);
    try {
      await api.regenerateRepo(selectedRepo);
      toast("Regeneration started — this may take a minute");
      setTimeout(async () => {
        try {
          const data = await api.getRepoVoice(selectedRepo);
          setContent(data.content);
        } catch { /* ignore */ }
        setRegenerating(false);
      }, 15000);
    } catch {
      toast("Failed to start regeneration", "error");
      setRegenerating(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Team Voice</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Define how d3ftly writes PR descriptions, commit messages, and code comments.
        This is auto-generated during onboarding by analyzing your team&apos;s existing PRs and commits — but you can edit it anytime.
      </p>

      {repos.length > 0 && (
        <RepoCombobox
          repos={repos}
          selected={selectedRepo}
          onSelect={setSelectedRepo}
        />
      )}

      {loading ? (
        <TextareaSkeleton />
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            placeholder={`# Team Voice\n\n## Tone\nCasual and direct. No emojis in code.\n\n## Commit Messages\nConventional commits (feat:, fix:, chore:). Imperative mood.\n\n## PR Descriptions\nStructured with Problem, Changes, Risk, Verification sections.\n\n## Language\nTechnical but concise. Avoid jargon.`}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-y"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors border border-zinc-700"
            >
              {regenerating ? "Regenerating..." : "Regenerate"}
            </button>
            <span className="text-xs text-zinc-600">Applied to PR description pass.</span>
          </div>
        </>
      )}
    </div>
  );
}
