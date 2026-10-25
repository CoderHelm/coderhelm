"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, inputClass } from "@/components/ui";
import { SettingsSection } from "@/components/settings";
import { Problem } from "@/components/problem";
import { ScopeBar, type Scope } from "../scope-bar";

export default function GuardrailsPageGuarded() {
  return <RoleGuard need="agent_settings"><GuardrailsPage /></RoleGuard>;
}

/**
 * The team's rules, one per row, added and removed in place. Each change
 * saves at once, as it always has: a rule list has nothing half done to hold.
 */
function RuleList({
  scope,
  rules,
  loading,
  error,
  onRetry,
  saving,
  onChange,
  onRemove,
}: {
  scope: string;
  rules: string[];
  loading: boolean;
  /** The rules could not be read: nothing is shown or editable, so a save can't replace them. */
  error: string | null;
  onRetry: () => void;
  saving: boolean;
  onChange: (next: string[]) => void;
  onRemove: (index: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const duplicate = !!trimmed && rules.includes(trimmed);

  const add = () => {
    if (!trimmed || duplicate || saving) return;
    onChange([...rules, trimmed]);
    setDraft("");
  };

  if (error !== null) {
    return (
      <div className="p-4">
        <Problem title={`Couldn't load the rules for ${scope}`} onRetry={onRetry} details={error || undefined} testId="rules-error">
          Nothing has been changed. Try again; until the rules load, you can&apos;t add or remove any, so the saved ones are safe.
        </Problem>
      </div>
    );
  }

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
          <li key={`${i}-${rule}`} className="flex min-w-0 items-center justify-between gap-4 px-4 py-2.5">
            <span className="min-w-0 text-sm text-zinc-200 [overflow-wrap:anywhere]">{rule}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={saving}
              aria-label={`Remove rule: ${rule}`}
              className={buttonClass("ghost", "sm")}
            >
              Remove
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="px-4 py-3 text-sm text-zinc-400">No rules for {scope} yet.</li>}
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
        <p id="new-rule-help" className="mt-1.5 text-sm text-zinc-400">
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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSaving, setGlobalSaving] = useState(false);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoRules, setRepoRules] = useState<string[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoSaving, setRepoSaving] = useState(false);

  const loadGlobal = useCallback(() => {
    setGlobalLoading(true);
    setGlobalError(null);
    api.getGlobalRules()
      .then((data) => setGlobalRules(data.rules))
      .catch((e) => setGlobalError(e instanceof Error ? e.message : ""))
      .finally(() => setGlobalLoading(false));
  }, []);

  const loadRepo = useCallback((repo: string) => {
    setRepoLoading(true);
    setRepoError(null);
    api.getRepoRules(repo)
      .then((data) => setRepoRules(data.rules))
      .catch((e) => setRepoError(e instanceof Error ? e.message : ""))
      .finally(() => setRepoLoading(false));
  }, []);

  useEffect(() => {
    loadGlobal();
    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setSelectedRepo(enabled[0].name);
    }).catch(() => {});

  }, [loadGlobal]);

  useEffect(() => {
    if (selectedRepo) loadRepo(selectedRepo);
  }, [selectedRepo, loadRepo]);

  // Each change saves at once. A removal offers Undo, which saves the list
  // as it was before.
  const saveGlobal = async (updated: string[], message = "Rule saved", undo?: string[]) => {
    const before = globalRules;
    setGlobalRules(updated);
    setGlobalSaving(true);
    try {
      await api.updateGlobalRules(updated);
      toast(message, "success", undo ? { action: { label: "Undo", onClick: () => void saveGlobal(undo, "Rule put back") } } : undefined);
    } catch {
      setGlobalRules(before);
      toast("Couldn't save the rules. Check your connection and try again.", "error");
    }
    setGlobalSaving(false);
  };

  const saveRepo = async (updated: string[], message = "Rule saved", undo?: string[]) => {
    if (!selectedRepo) return;
    const repo = selectedRepo;
    const before = repoRules;
    setRepoRules(updated);
    setRepoSaving(true);
    try {
      await api.updateRepoRules(repo, updated);
      toast(message, "success", undo ? { action: { label: "Undo", onClick: () => void saveRepo(undo, "Rule put back") } } : undefined);
    } catch {
      setRepoRules(before);
      toast("Couldn't save the rules. Check your connection and try again.", "error");
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
          <RuleList
            scope="every repository"
            rules={globalRules}
            loading={globalLoading}
            error={globalError}
            onRetry={loadGlobal}
            saving={globalSaving}
            onChange={(next) => saveGlobal(next)}
            onRemove={(i) => saveGlobal(globalRules.filter((_, k) => k !== i), "Rule removed", globalRules)}
          />
        ) : repos.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-400">No repositories are turned on. Turn one on under Settings, Repositories first.</p>
        ) : (
          <RuleList
            scope={selectedRepo}
            rules={repoRules}
            loading={repoLoading}
            error={repoError}
            onRetry={() => loadRepo(selectedRepo)}
            saving={repoSaving}
            onChange={(next) => saveRepo(next)}
            onRemove={(i) => saveRepo(repoRules.filter((_, k) => k !== i), "Rule removed", repoRules)}
          />
        )}
      </SettingsSection>

      <p className="mt-4 max-w-prose text-sm text-zinc-500" data-testid="built-in-rules">
        Coderhelm also keeps its own rules on every run, such as never pushing to your default branch and never committing secrets, and it
        checks the change for security problems before it opens a pull request.
      </p>
    </Page>
  );
}
