"use client";

import { useState } from "react";
import { Select } from "@/components/select";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ReadersEditor } from "@/components/knowledge/readers";
import type { BaseInput, KnowledgeLimits } from "@/lib/knowledge";

// A knowledge base's settings: its name and description, who may read it
// (a role, and optionally only some people or roles within it), which agents
// search it (and who gets its results through them), and whether it is a
// source of truth.

/** Said when a base is attached to agents and the page hasn't said who reaches it through them. */
export const AGENT_NOTE = "Everyone who can start an agent run gets results from this base when the agent searches it.";

const ROLE_WORDS: Record<string, string> = {
  viewer: "Everyone on the team",
  member: "Members, admins and owners",
  admin: "Admins and owners",
};

export const EMPTY_BASE: BaseInput = {
  name: "",
  description: "",
  read_role: "member",
  attach_team: false,
  agents: [],
  authoritative: false,
};

export function BaseForm({
  initial,
  limits,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
  agentNote,
}: {
  initial: BaseInput;
  /** Who reaches the base through agents, as the gateway words it. */
  agentNote?: string;
  limits: KnowledgeLimits | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (v: BaseInput) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<BaseInput>({ ...initial, readers: initial.readers ?? [] });
  const attached = v.attach_team || v.agents.length > 0;
  const agents = limits?.agents ?? [];
  const toggleAgent = (k: string) => setV((x) => ({ ...x, agents: x.agents.includes(k) ? x.agents.filter((a) => a !== k) : [...x.agents, k] }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      data-testid="base-form"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">Name</span>
        <input className={inputClass} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="HR handbook" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">What&apos;s in it</span>
        <textarea
          className={inputClass}
          rows={2}
          value={v.description}
          maxLength={1000}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Policies, benefits and how we work. The agents read this to know when to search it."
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">Who can read it</span>
        <Select
          className="w-full"
          value={v.read_role}
          onChange={(r) => setV({ ...v, read_role: r })}
          options={(limits?.read_roles ?? ["viewer", "member", "admin"]).map((r) => ({ value: r, label: ROLE_WORDS[r] ?? r }))}
        />
      </label>
      <ReadersEditor value={v.readers ?? []} onChange={(readers) => setV({ ...v, readers })} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-zinc-400">Agents that search it</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" className="accent-emerald-500" checked={v.attach_team} onChange={(e) => setV({ ...v, attach_team: e.target.checked })} />
          Every agent on the team
        </label>
        {!v.attach_team && (
          <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1.5">
            {agents.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" className="accent-emerald-500" checked={v.agents.includes(a.key)} onChange={() => toggleAgent(a.key)} />
                {a.label}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-400">Chat can always use it for people who may read it.</p>
        {attached && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs leading-relaxed text-zinc-300" data-testid="agent-access-form-note">
            {agentNote || AGENT_NOTE}
          </p>
        )}
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-zinc-200">
        <input type="checkbox" className="mt-0.5 accent-emerald-500" checked={v.authoritative} onChange={(e) => setV({ ...v, authoritative: e.target.checked })} />
        <span>
          Source of truth
          <span className="block text-xs text-zinc-400">When sources disagree, answers prefer this one and say so.</span>
        </span>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving || !v.name.trim()} className={primaryButton}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
