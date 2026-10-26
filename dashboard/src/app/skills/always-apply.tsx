"use client";

import { SaveBar } from "@/components/settings";
import { formatDate } from "@/components/list/time";

import { useEffect, useMemo, useState } from "react";
import { Section } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { ToolSwitch } from "@/components/tools";
import { useToast } from "@/components/toast";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { api } from "@/lib/api";
import {
  DEFAULT_PASSES,
  PASSES,
  alwaysLabel,
  alwaysShort,
  repoShort,
  skillsApi,
  suggestionLabel,
  type AlwaysApply,
  type Pass,
  type Skill,
} from "@/lib/skills";

/** "Always applied · web-app · Coder, Reviewer", or nothing when off. */
/** `short` for a list row: a few words, every repo and path in the tooltip. */
export function AlwaysApplyBadge({ item, short = false }: { item: Pick<Skill, "always_apply" | "kind">; short?: boolean }) {
  const a = item.always_apply;
  if (!a?.on || item.kind === "agent") return null;
  return (
    <span data-testid="always-badge" className="inline-flex max-w-full" title={short ? alwaysLabel(a) : undefined}>
      <StatusPill tone="success">
        <span className={short ? "truncate" : "[overflow-wrap:anywhere] whitespace-normal"}>{short ? alwaysShort(a) : alwaysLabel(a)}</span>
      </StatusPill>
    </span>
  );
}

/** The suggestion line for a list, or nothing. */
export function SuggestionHint({ item }: { item: Pick<Skill, "suggestion" | "always_apply" | "kind"> }) {
  if (!item.suggestion || item.always_apply?.on || item.kind === "agent") return null;
  return (
    <p data-testid="always-suggestion-hint" className="mt-1 text-xs text-blue-300">
      {suggestionLabel(item.suggestion)}
    </p>
  );
}

type Draft = { on: boolean; repos: string[]; passes: Pass[]; paths: string };

const draftOf = (a?: AlwaysApply): Draft => ({
  on: !!a?.on,
  repos: a?.repos ?? [],
  passes: a?.passes?.length ? a.passes : DEFAULT_PASSES,
  paths: (a?.paths ?? []).join("\n"),
});

const pathsOf = (text: string) =>
  text
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * "Always apply" for a skill or a command: given in full to matching work
 * instead of only listed for the agents to pick. Admins set the scope;
 * everyone else sees it.
 */
export function AlwaysApplySection({
  item,
  canManage,
  onSaved,
}: {
  item: Skill;
  canManage: boolean;
  onSaved: (a: AlwaysApply) => void;
}) {
  const { toast } = useToast();
  const saved = item.always_apply;
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [teamRepos, setTeamRepos] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(draftOf(saved)), [saved]);
  useEffect(() => {
    if (!canManage) return;
    api
      .listRepos()
      .then((r) => setTeamRepos(r.repos.filter((x) => x.enabled).map((x) => x.name).sort()))
      .catch(() => setTeamRepos([]));
  }, [canManage]);

  const dirty = useMemo(() => {
    const now = draftOf(saved);
    return (
      now.on !== draft.on ||
      now.repos.join() !== draft.repos.join() ||
      now.passes.join() !== draft.passes.join() ||
      pathsOf(now.paths).join() !== pathsOf(draft.paths).join()
    );
  }, [saved, draft]);

  const save = async (next: Draft) => {
    setError("");
    if (next.on && next.passes.length === 0) {
      setError("Pick at least one moment for Coderhelm to use it.");
      return;
    }
    setSaving(true);
    try {
      const r = await skillsApi.setAlwaysApply(item.repo, item.path, {
        on: next.on,
        repos: next.repos,
        passes: next.passes,
        paths: pathsOf(next.paths),
      });
      onSaved(r.always_apply);
      toast(r.always_apply.on ? `${item.name} always applies` : `${item.name} is read on demand`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const suggestion = item.suggestion;

  return (
    <Section
      id="always-apply"
      title="Always apply"
      description={
        <>
          Off, Coderhelm lists {item.name} and its agents read it when they think it fits. On, its whole text goes into their
          instructions on every matching run and review, under &ldquo;Team standards you must follow&rdquo;.
          {item.kind === "command" && " A command is given as reference: agents won't try the steps that need a person."}
        </>
      }
    >
      <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5" data-testid="always-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {saved?.on ? <AlwaysApplyBadge item={item} /> : <StatusPill>Read on demand</StatusPill>}
            {saved?.by && saved.at && (
              <p className="mt-1.5 text-xs text-zinc-400">
                Set by {saved.by} {formatDate(saved.at)}
              </p>
            )}
          </div>
          {canManage && (
            <ToolSwitch
              on={draft.on}
              label={`Always apply ${item.name}`}
              busy={saving}
              onToggle={() => {
                const next = { ...draft, on: !draft.on };
                setDraft(next);
                // Switching off saves at once; switching on lets the scope be set first.
                if (!next.on && saved?.on) save(next);
              }}
            />
          )}
        </div>

        {suggestion && !saved?.on && (
          <div className="mt-4 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200" data-testid="always-suggestion">
            <p>{suggestionLabel(suggestion)}</p>
            {suggestion.reason && <p className="mt-0.5 text-xs text-blue-200/80">{suggestion.reason}</p>}
            {canManage && (
              <button
                type="button"
                className={`${linkButton} mt-1 text-xs`}
                onClick={() => setDraft({ on: true, repos: suggestion.repos, passes: suggestion.passes, paths: suggestion.paths.join("\n") })}
              >
                Use this scope
              </button>
            )}
          </div>
        )}

        {canManage && draft.on && (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium text-zinc-200">Repositories</legend>
              <p className="mt-0.5 text-xs text-zinc-400">None picked means every repository.</p>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {teamRepos === null ? (
                  <p role="status" className="text-xs text-zinc-400">Loading…</p>
                ) : teamRepos.length === 0 ? (
                  <p className="text-xs text-zinc-400">No repositories switched on.</p>
                ) : (
                  teamRepos.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        className={`h-4 w-4 accent-emerald-500 ${focusRing}`}
                        checked={draft.repos.includes(r)}
                        onChange={() => setDraft({ ...draft, repos: toggleIn(draft.repos, r) })}
                      />
                      <span className="font-mono [overflow-wrap:anywhere]" title={r}>
                        {repoShort(r)}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium text-zinc-200">Use it when Coderhelm is…</legend>
              <div className="mt-2 space-y-1.5">
                {PASSES.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      className={`h-4 w-4 accent-emerald-500 ${focusRing}`}
                      checked={draft.passes.includes(p.id)}
                      onChange={() =>
                        setDraft({ ...draft, passes: PASSES.map((x) => x.id).filter((id) => (id === p.id ? !draft.passes.includes(id) : draft.passes.includes(id))) })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="min-w-0 text-sm font-medium text-zinc-200">
              Only for certain folders <span className="font-normal text-zinc-400">(optional)</span>
              <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                One folder a line, like apps/web. Patterns such as **/*.tsx work too.
              </span>
              <textarea
                className={`${inputClass} mt-2 h-28 font-mono`}
                value={draft.paths}
                onChange={(e) => setDraft({ ...draft, paths: e.target.value })}
                placeholder={"apps/web\npackages/ui"}
                spellCheck={false}
                aria-label="Paths"
              />
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {canManage && (draft.on || saved?.on) && (
          <SaveBar
            count={dirty ? 1 : 0}
            saving={saving}
            saveLabel={draft.on ? "Save" : "Turn off"}
            onSave={() => save(draft)}
            onDiscard={() => {
              setDraft(draftOf(saved));
              setError("");
            }}
            testId="always-save-bar"
          />
        )}
      </div>
    </Section>
  );
}
