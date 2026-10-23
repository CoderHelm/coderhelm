"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, inputClass } from "@/components/ui";
import { SettingsSection } from "@/components/settings";
import { ScopeBar, type Scope } from "../scope-bar";

export default function GuardrailsPageGuarded() {
  return <RoleGuard minRole="admin"><GuardrailsPage /></RoleGuard>;
}

/**
 * The team's rules, one per row, added and removed in place. Each change
 * saves at once, as it always has: a rule list has nothing half done to hold.
 */
function RuleList({
  scope,
  rules,
  loading,
  saving,
  onChange,
}: {
  scope: string;
  rules: string[];
  loading: boolean;
  saving: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const duplicate = !!trimmed && rules.includes(trimmed);

  const add = () => {
    if (!trimmed || duplicate || saving) return;
    onChange([...rules, trimmed]);
    setDraft("");
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading rules">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  return (
    <>
      <ul aria-label={`Rules for ${scope}`} className="divide-y divide-zinc-800">
        {rules.map((rule, i) => (
          <li key={`${i}-${rule}`} className="flex min-w-0 items-start justify-between gap-4 px-4 py-3">
            <span className="min-w-0 break-words text-sm text-zinc-200">{rule}</span>
            <button
              type="button"
              onClick={() => onChange(rules.filter((_, k) => k !== i))}
              disabled={saving}
              aria-label={`Remove rule: ${rule}`}
              className={buttonClass("ghost", "sm")}
            >
              Remove
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500">No rules for {scope} yet.</li>}
      </ul>
      <form
        className="border-t border-zinc-800 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="new-rule" className="text-sm font-medium text-zinc-200">Add a rule</label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="new-rule"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Never delete database migrations"
            aria-describedby="new-rule-help"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="submit" disabled={!trimmed || duplicate || saving} className={`${buttonClass("primary")} shrink-0 self-start`}>
            {saving ? "Saving…" : "Add rule"}
          </button>
        </div>
        <p id="new-rule-help" className="mt-1.5 text-xs text-zinc-500">
          {duplicate ? "That rule is already on the list." : "One plain sentence. It saves as soon as you add it."}
        </p>
      </form>
    </>
  );
}

function GuardrailsPage() {
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope>("global");

  const [globalRules, setGlobalRules] = useState<string[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoRules, setRepoRules] = useState<string[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);

  useEffect(() => {
    api.getGlobalRules()
      .then((data) => setGlobalRules(data.rules))
      .catch(() => {})
      .finally(() => setGlobalLoading(false));

    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setSelectedRepo(enabled[0].name);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setRepoLoading(true);
    api.getRepoRules(selectedRepo)
      .then((data) => setRepoRules(data.rules))
      .catch(() => setRepoRules([]))
      .finally(() => setRepoLoading(false));
  }, [selectedRepo]);

  const saveGlobal = async (updated: string[]) => {
    const before = globalRules;
    setGlobalRules(updated);
    setGlobalSaving(true);
    try {
      await api.updateGlobalRules(updated);
      toast("Rule saved");
    } catch {
      setGlobalRules(before);
      toast("Failed to save rules", "error");
    }
    setGlobalSaving(false);
  };

  const saveRepo = async (updated: string[]) => {
    if (!selectedRepo) return;
    const before = repoRules;
    setRepoRules(updated);
    setRepoSaving(true);
    try {
      await api.updateRepoRules(selectedRepo, updated);
      toast("Rule saved");
    } catch {
      setRepoRules(before);
      toast("Failed to save rules", "error");
    }
    setRepoSaving(false);
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader title="Guardrails" lead="Rules every Coderhelm run must follow. A repository's own rules add to the ones for every repository." />
      </div>

      <ScopeBar label="Whose rules" scope={scope} onScope={setScope} repos={repos} repo={selectedRepo} onRepo={setSelectedRepo} />

      <SettingsSection
        id="your-rules"
        title="Your rules"
        description={scope === "global" ? "Followed in every repository." : selectedRepo ? `Followed in ${selectedRepo}, after the rules for every repository.` : undefined}
      >
        {scope === "global" ? (
          <RuleList scope="every repository" rules={globalRules} loading={globalLoading} saving={globalSaving} onChange={saveGlobal} />
        ) : repos.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">No repositories are turned on. Turn one on under Settings, Repositories first.</p>
        ) : (
          <RuleList scope={selectedRepo} rules={repoRules} loading={repoLoading} saving={repoSaving} onChange={saveRepo} />
        )}
      </SettingsSection>

      <p className="mt-4 max-w-prose text-sm text-zinc-500" data-testid="built-in-rules">
        Coderhelm also keeps its own rules on every run, such as never pushing to your default branch and never committing secrets, and it
        checks the change for security problems before it opens a pull request.
      </p>
    </Page>
  );
}
