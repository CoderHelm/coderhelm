"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";

const BUILT_IN_RULES = [
  "Never push directly to the default/main branch",
  "Never commit secrets, credentials, or sensitive information",
];

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

function RuleList({
  rules,
  newRule,
  setNewRule,
  onAdd,
  onRemove,
  saving,
}: {
  rules: string[];
  newRule: string;
  setNewRule: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  saving: boolean;
}) {
  return (
    <>
      <div className="space-y-2 mb-4">
        {rules.map((rule, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
          >
            <span className="text-sm text-zinc-200">{rule}</span>
            <button
              onClick={() => onRemove(i)}
              className="text-zinc-600 hover:text-red-400 text-xs transition-colors shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="text-zinc-600 text-sm py-2">No custom rules yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="e.g. Never delete database migrations"
          className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={onAdd}
          disabled={!newRule.trim() || saving}
          className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
        >
          Add rule
        </button>
      </div>

      {saving && <p className="text-xs text-zinc-500 mt-2">Saving...</p>}
    </>
  );
}

export default function GuardrailsPage() {
  const [tab, setTab] = useState<"global" | "repo">("global");
  const { toast } = useToast();

  const [globalRules, setGlobalRules] = useState<string[]>([]);
  const [globalNewRule, setGlobalNewRule] = useState("");
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoRules, setRepoRules] = useState<string[]>([]);
  const [repoNewRule, setRepoNewRule] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);

  useEffect(() => {
    api.getGlobalRules().then((data) => {
      setGlobalRules(data.rules);
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
    api.getRepoRules(selectedRepo).then((data) => {
      setRepoRules(data.rules);
      setRepoLoading(false);
    }).catch(() => {
      setRepoRules([]);
      setRepoLoading(false);
    });
  }, [selectedRepo]);

  const saveGlobal = async (updated: string[]) => {
    setGlobalSaving(true);
    try {
      await api.updateGlobalRules(updated);
      toast("Rule saved");
    } catch {
      toast("Failed to save rules", "error");
    }
    setGlobalSaving(false);
  };

  const saveRepo = async (updated: string[]) => {
    if (!selectedRepo) return;
    setRepoSaving(true);
    try {
      await api.updateRepoRules(selectedRepo, updated);
      toast("Rule saved");
    } catch {
      toast("Failed to save rules", "error");
    }
    setRepoSaving(false);
  };

  const addGlobal = () => {
    const trimmed = globalNewRule.trim();
    if (!trimmed || globalRules.includes(trimmed)) return;
    const updated = [...globalRules, trimmed];
    setGlobalRules(updated);
    setGlobalNewRule("");
    saveGlobal(updated);
  };

  const removeGlobal = (index: number) => {
    const updated = globalRules.filter((_, i) => i !== index);
    setGlobalRules(updated);
    saveGlobal(updated);
  };

  const addRepo = () => {
    const trimmed = repoNewRule.trim();
    if (!trimmed || repoRules.includes(trimmed)) return;
    const updated = [...repoRules, trimmed];
    setRepoRules(updated);
    setRepoNewRule("");
    saveRepo(updated);
  };

  const removeRepo = (index: number) => {
    const updated = repoRules.filter((_, i) => i !== index);
    setRepoRules(updated);
    saveRepo(updated);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Guardrails</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Must-rules that d3ftly enforces on every run. Global rules apply to all repos.
        Per-repo rules add repo-specific constraints on top.
      </p>

      <div className="border border-zinc-800 rounded-lg p-4 mb-4 bg-zinc-900/30">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Built-in rules (always enforced)</h3>
        {BUILT_IN_RULES.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-zinc-300 mb-1.5 last:mb-0">
            <span className="text-green-400">✓</span>
            {rule}
          </div>
        ))}
      </div>

      <div className="border border-emerald-900/30 rounded-lg p-4 mb-6 bg-emerald-950/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-emerald-400">⛨</span>
          <h3 className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Safety Agent</h3>
        </div>
        <p className="text-zinc-400 text-sm">
          Every implementation is reviewed by a safety agent before creating a pull request.
          Violations are caught and the code is revised automatically.
        </p>
      </div>

      <div className="border border-zinc-800 rounded-lg p-4 mb-6 bg-zinc-900/30">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Platform Security (always on)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { icon: "🔏", label: "Webhook signature verification", detail: "GitHub, Stripe, and Jira webhooks are HMAC-verified" },
            { icon: "🔒", label: "Worker isolation", detail: "Agent tooling is GitHub API only — no shell, no AWS SDK access" },
            { icon: "🛡", label: "Input validation", detail: "Repo paths, payloads, and rules are validated and size-capped at 10KB" },
            { icon: "🔑", label: "Secret scoping", detail: "Worker only has access to GitHub credentials, not Stripe or JWT secrets" },
            { icon: "♻️", label: "Replay protection", detail: "Stripe webhooks are idempotency-checked to prevent double-processing" },
            { icon: "📝", label: "Audit trail", detail: "Every run is logged with full token usage, pass results, and timing" },
          ].map(({ icon, label, detail }) => (
            <div key={label} className="flex items-start gap-2 p-2 rounded-md">
              <span className="text-sm mt-0.5">{icon}</span>
              <div>
                <p className="text-sm text-zinc-300">{label}</p>
                <p className="text-xs text-zinc-600">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        <Tab label="Global" active={tab === "global"} onClick={() => setTab("global")} />
        <Tab label="Per Repo" active={tab === "repo"} onClick={() => setTab("repo")} />
      </div>

      {tab === "global" ? (
        globalLoading ? (
          <div className="space-y-2 mb-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <RuleList
            rules={globalRules}
            newRule={globalNewRule}
            setNewRule={setGlobalNewRule}
            onAdd={addGlobal}
            onRemove={removeGlobal}
            saving={globalSaving}
          />
        )
      ) : repos.length === 0 ? (
        <p className="text-zinc-500 text-sm">No enabled repos. Enable repos in Settings → Repos first.</p>
      ) : (
        <>
          <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
          {repoLoading ? (
            <div className="space-y-2 mb-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <RuleList
              rules={repoRules}
              newRule={repoNewRule}
              setNewRule={setRepoNewRule}
              onAdd={addRepo}
              onRemove={removeRepo}
              saving={repoSaving}
            />
          )}
        </>
      )}
    </div>
  );
}
