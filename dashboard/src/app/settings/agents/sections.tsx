"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Repo } from "@/lib/api";
import {
  AGENT_LABELS, AUTONOMY_OPTIONS, DECISION_LABELS, KIND_LABELS, PRESETS, RISK_LABELS,
  decidedByText, ruleWhat, ruleWhere, rulesFor,
  type AgentEvent, type AgentKey, type Autonomy, type CallKind, type Decision, type PolicyView, type Risk, type Rule, type Scope, type TestResult,
} from "@/lib/agent-policy";
import { Modal } from "@/components/modal";
import { Segmented } from "@/components/segmented";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { RepoCombobox } from "@/components/repo-combobox";
import { Time } from "@/components/list";
import { cardClass } from "@/components/page";
import { buttonClass, inputClass, monoInputClass } from "@/components/ui";

type Change = (what: Promise<PolicyView>, done?: string) => Promise<boolean>;

const DECISION_TONE = { allow: "success", ask: "warning", deny: "error" } as const;

function SectionHead({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-base font-semibold text-zinc-100">
        {title}
      </h2>
      {lead && <p className="mt-1 max-w-prose text-sm text-zinc-400">{lead}</p>}
    </div>
  );
}

// ── Pause all agents ────────────────────────────────────────────────

/** "2026-10-24T18:00" from a local datetime input, as RFC 3339 (UTC). */
function untilToIso(local: string): string | undefined {
  if (!local) return undefined;
  const t = new Date(local);
  return Number.isFinite(t.getTime()) ? t.toISOString() : undefined;
}

export function PauseBanner({ view, edit, onChange }: { view: PolicyView; edit: boolean; onChange: Change }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const p = view.paused;

  if (p) {
    return (
      <div data-testid="pause-banner" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4" role="status">
        <p className="text-sm font-semibold text-amber-200">All agents are paused</p>
        <p className="mt-1 text-sm text-amber-100/80">
          {p.reason ? `${p.reason}. ` : ""}Paused by {p.by}
          {p.until ? (
            <>
              {" "}until <Time iso={p.until} />
            </>
          ) : (
            " until someone resumes them"
          )}
          . New work waits and starts again when the pause ends; nothing is dropped.
        </p>
        {edit && (
          <button
            type="button"
            className={`${buttonClass("primary", "sm")} mt-3`}
            onClick={() => onChange(api.resumeAgents(), "Agents resumed. Kept work is starting again.")}
          >
            Resume all agents
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-zinc-400">All agents are running.</p>
      {edit && (
        <button type="button" className={buttonClass("danger", "sm")} onClick={() => setOpen(true)} data-testid="pause-open">
          Pause all agents
        </button>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Pause all agents" description="Agents stop starting new work. Work that arrives meanwhile waits and starts when the pause ends.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onChange(api.pauseAgents(reason.trim(), untilToIso(until)), "All agents are paused.");
            if (ok) setOpen(false);
          }}
        >
          <div>
            <label htmlFor="pause-reason" className="block text-sm font-semibold text-zinc-100">
              Reason
            </label>
            <input id="pause-reason" className={`${inputClass} mt-1.5`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Release freeze" />
          </div>
          <div>
            <label htmlFor="pause-until" className="block text-sm font-semibold text-zinc-100">
              Until (optional)
            </label>
            <input id="pause-until" type="datetime-local" className={`${inputClass} mt-1.5`} value={until} onChange={(e) => setUntil(e.target.value)} />
            <p className="mt-1.5 text-xs text-zinc-500">Leave empty to pause until someone resumes them.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("danger")}>
              Pause all agents
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Agents on and off ───────────────────────────────────────────────

function Switch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 ${
        checked ? "border-emerald-500/50 bg-emerald-500/30" : "border-zinc-700 bg-zinc-800"
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-zinc-100 transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function AgentSwitches({ view, edit, repos, onChange }: { view: PolicyView; edit: boolean; repos: Repo[]; onChange: Change }) {
  const [repoFor, setRepoFor] = useState<AgentKey | null>(null);
  const [repo, setRepo] = useState("");
  const v = view.policy.version;
  return (
    <section aria-labelledby="agents-heading">
      <SectionHead id="agents-heading" title="Agents" lead="Switch an agent off for the whole team or for one repository. An agent that is off doesn't start anything." />
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="agent-switches">
        {view.agents.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`agent-${a.key}`}>
            {/* basis-48: on a narrow screen the buttons wrap below the name instead of squeezing it. */}
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm font-medium text-zinc-100">{a.label}</p>
              <p className="text-xs text-zinc-500">{a.summary}</p>
              {a.repos_off.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.repos_off.map((r) => (
                    <span key={r} className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      <span className="min-w-0 truncate">Off in {r}</span>
                      {edit && (
                        <button
                          type="button"
                          aria-label={`Turn the ${a.label.toLowerCase()} back on in ${r}`}
                          className="text-zinc-500 hover:text-zinc-200"
                          onClick={() => onChange(api.setAgentSwitch(v, a.key, true, r), `${a.label} is on again in ${r}.`)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {edit && repos.length > 0 && (
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRepoFor(a.key)}>
                Off in a repository…
              </button>
            )}
            <Switch
              checked={a.on}
              label={`${a.label} ${a.on ? "on" : "off"} for the team`}
              disabled={!edit}
              onChange={(on) => onChange(api.setAgentSwitch(v, a.key, on), `${a.label} is ${on ? "on" : "off"} for the team.`)}
            />
          </li>
        ))}
      </ul>
      <Modal open={repoFor !== null} onOpenChange={(o) => !o && setRepoFor(null)} title={`Turn the ${repoFor ? AGENT_LABELS[repoFor].toLowerCase() : "agent"} off in a repository`}>
        <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} label="Repository" />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={() => setRepoFor(null)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!repo || !repoFor}
            className={buttonClass("primary")}
            onClick={async () => {
              if (!repoFor) return;
              if (await onChange(api.setAgentSwitch(v, repoFor, false, repo), `${AGENT_LABELS[repoFor]} is off in ${repo}.`)) setRepoFor(null);
            }}
          >
            Turn off
          </button>
        </div>
      </Modal>
    </section>
  );
}

// ── Autonomy limit and presets ──────────────────────────────────────

export function AutonomyAndPresets({ view, edit, onChange }: { view: PolicyView; edit: boolean; onChange: Change }) {
  const v = view.policy.version;
  const current = AUTONOMY_OPTIONS.find((o) => o.value === view.policy.autonomy);
  return (
    <section aria-labelledby="autonomy-heading" className="space-y-5">
      <div>
        <SectionHead id="autonomy-heading" title="Autonomy limit" lead="The most an agent may do without asking. No rule can go above it: an allow above the limit asks instead." />
        <Segmented<Autonomy>
          label="Autonomy limit"
          options={AUTONOMY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={view.policy.autonomy}
          disabled={!edit}
          onChange={(a) => onChange(api.saveAgentSettings({ version: v, autonomy: a }), "Autonomy limit saved.")}
        />
        {current && <p className="mt-2 text-sm text-zinc-400">{current.help}</p>}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Presets</h3>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">A starting point for the team&apos;s rules. A preset replaces only the rules a preset wrote; your own rules and the ones from approvals stay.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="presets">
          {PRESETS.map((p) => {
            const on = view.preset === p.value;
            return (
              <div key={p.value} className={`${cardClass} ${on ? "border-zinc-500" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{p.label}</p>
                  {on && <StatusPill tone="success">In use</StatusPill>}
                </div>
                <p className="mt-1 text-xs text-zinc-400">{p.help}</p>
                {edit && !on && (
                  <button type="button" className={`${buttonClass("secondary", "sm")} mt-3`} onClick={() => onChange(api.applyAgentPreset(v, p.value), `${p.label} preset applied.`)}>
                    Use {p.label.split(" ")[0]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Rules ───────────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "team", label: "Team" },
  { value: "repo", label: "Repository" },
  { value: "agent", label: "Agent" },
];

const SOURCE_LABEL = { manual: "Written here", approval: "From an approval", preset: "Preset" } as const;

export function RulesTable({ view, edit, repos, onChange }: { view: PolicyView; edit: boolean; repos: Repo[]; onChange: Change }) {
  const [scope, setScope] = useState<Scope>("team");
  const [adding, setAdding] = useState(false);
  const rules = rulesFor(view.policy.rules, scope);
  const v = view.policy.version;
  return (
    <section aria-labelledby="rules-heading">
      <SectionHead
        id="rules-heading"
        title="Rules"
        lead="The narrowest rule that matches decides: an agent in a repository, then an agent, then a repository, then the team. At the same level, deny beats ask and ask beats allow. A locked team rule can't be overridden."
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Scope> label="Rules for" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        {edit && (
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAdding(true)} data-testid="add-rule">
            Add a rule
          </button>
        )}
      </div>
      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
          No {scope === "team" ? "team" : scope === "repo" ? "repository" : "agent"} rules yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="rules-list">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} edit={edit} onRemove={() => onChange(api.removeAgentRule(v, r.id), "Rule removed.")} />
          ))}
        </ul>
      )}
      <AddRuleDialog open={adding} onOpenChange={setAdding} scope={scope} repos={repos} view={view} onChange={onChange} />
    </section>
  );
}

function RuleRow({ rule, edit, onRemove }: { rule: Rule; edit: boolean; onRemove: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="rule-row">
      <StatusPill tone={DECISION_TONE[rule.decision]}>{DECISION_LABELS[rule.decision]}</StatusPill>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-100">{ruleWhat(rule)}</p>
        <p className="text-xs text-zinc-500">
          {ruleWhere(rule)} · {SOURCE_LABEL[rule.source ?? "manual"]}
          {rule.created_by ? ` · ${rule.created_by}` : ""}
        </p>
        {rule.note && <p className="mt-1 text-xs text-zinc-400">{rule.note}</p>}
      </div>
      {edit && (
        <button type="button" className={buttonClass("ghost", "sm")} onClick={onRemove} aria-label={`Remove rule: ${DECISION_LABELS[rule.decision]} ${ruleWhat(rule)}`}>
          Remove
        </button>
      )}
    </li>
  );
}

function AddRuleDialog({
  open,
  onOpenChange,
  scope,
  repos,
  view,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: Scope;
  repos: Repo[];
  view: PolicyView;
  onChange: Change;
}) {
  const [s, setS] = useState<Scope>(scope);
  const [repo, setRepo] = useState("");
  const [agent, setAgent] = useState<AgentKey>("coder");
  const [kind, setKind] = useState<CallKind | "">("");
  const [server, setServer] = useState("");
  const [tool, setTool] = useState("");
  const [risk, setRisk] = useState<Risk | "">("");
  const [command, setCommand] = useState("");
  const [decision, setDecision] = useState<Decision>("ask");
  const [locked, setLocked] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setS(scope);
  }, [open, scope]);

  const capped = decision === "allow" && risk && (view.policy.autonomy === "read_only" ? risk !== "read" : view.policy.autonomy === "standard" && risk === "consequential");
  const needsRepo = s === "repo" && !repo;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a rule" description="Leave a field empty to match anything." wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onChange(
            api.addAgentRule(view.policy.version, {
              scope: s,
              repo: s === "team" ? undefined : repo || undefined,
              agent: s === "agent" ? agent : undefined,
              kind: kind || undefined,
              server: server.trim() || undefined,
              tool: tool.trim() || undefined,
              risk: risk || undefined,
              command: command.trim() || undefined,
              decision,
              locked: s === "team" && locked,
              note: note.trim(),
            }),
            "Rule added.",
          );
          if (ok) {
            onOpenChange(false);
            setTool("");
            setServer("");
            setCommand("");
            setNote("");
          }
        }}
      >
        <Segmented<Scope> label="Applies to" options={SCOPE_OPTIONS} value={s} onChange={setS} />
        {s !== "team" && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-zinc-100">Repository{s === "agent" ? " (optional)" : ""}</p>
            <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} label="Repository" className="mb-0" />
          </div>
        )}
        {s === "agent" && (
          <div>
            <label htmlFor="rule-agent" className="block text-sm font-semibold text-zinc-100">Agent</label>
            <select id="rule-agent" className={`${inputClass} mt-1.5`} value={agent} onChange={(e) => setAgent(e.target.value as AgentKey)}>
              {Object.entries(AGENT_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-kind" className="block text-sm font-semibold text-zinc-100">Kind of call</label>
            <select id="rule-kind" className={`${inputClass} mt-1.5`} value={kind} onChange={(e) => setKind(e.target.value as CallKind | "")}>
              <option value="">Any</option>
              {view.kinds.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rule-risk" className="block text-sm font-semibold text-zinc-100">Risk</label>
            <select id="rule-risk" className={`${inputClass} mt-1.5`} value={risk} onChange={(e) => setRisk(e.target.value as Risk | "")}>
              <option value="">Any</option>
              {(Object.keys(RISK_LABELS) as Risk[]).map((r) => (
                <option key={r} value={r}>{RISK_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rule-server" className="block text-sm font-semibold text-zinc-100">Server or data source</label>
            <input id="rule-server" className={`${monoInputClass} mt-1.5`} value={server} onChange={(e) => setServer(e.target.value)} placeholder="linear" />
          </div>
          <div>
            <label htmlFor="rule-tool" className="block text-sm font-semibold text-zinc-100">Tool name</label>
            <input id="rule-tool" className={`${monoInputClass} mt-1.5`} value={tool} onChange={(e) => setTool(e.target.value)} placeholder="create_* or write_file" />
          </div>
        </div>
        {(kind === "command" || kind === "egress") && (
          <div>
            <label htmlFor="rule-command" className="block text-sm font-semibold text-zinc-100">{kind === "egress" ? "Domain" : "Command"}</label>
            <input id="rule-command" className={`${monoInputClass} mt-1.5`} value={command} onChange={(e) => setCommand(e.target.value)} placeholder={kind === "egress" ? "registry.npmjs.org" : "npm run test*"} />
          </div>
        )}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-zinc-100">Decision</p>
          <Segmented<Decision>
            label="Decision"
            options={[
              { value: "allow", label: "Allow" },
              { value: "ask", label: "Ask" },
              { value: "deny", label: "Deny" },
            ]}
            value={decision}
            onChange={setDecision}
          />
          {capped && <p className="mt-2 text-xs text-amber-300">This is above the team&apos;s autonomy limit, so it would ask instead. Raise the limit first, or make the rule ask.</p>}
        </div>
        {s === "team" && (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            Lock it: no repository or agent rule can override it
          </label>
        )}
        <div>
          <label htmlFor="rule-note" className="block text-sm font-semibold text-zinc-100">Note (optional)</label>
          <input id="rule-note" className={`${inputClass} mt-1.5`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this rule exists" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="submit" disabled={needsRepo || !!capped} className={buttonClass("primary")}>Add rule</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Test a call ─────────────────────────────────────────────────────

export function TestCall({ view, repos }: { view: PolicyView; repos: Repo[] }) {
  const [agent, setAgent] = useState<AgentKey>("coder");
  const [what, setWhat] = useState<"tool" | "command" | "egress">("tool");
  const [text, setText] = useState("");
  const [repo, setRepo] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    setResult(null);
    try {
      const body =
        what === "tool"
          ? { agent, tool: text.trim(), repo: repo || undefined }
          : { agent, command: text.trim(), repo: repo || undefined, kind: what };
      setResult(await api.testAgentCall(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't test that call.");
    }
  };

  return (
    <section aria-labelledby="test-heading" className={cardClass} data-testid="test-call">
      <SectionHead id="test-heading" title="Test a call" lead="See what would happen to a call, and which rule decides it." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="test-agent" className="block text-sm font-semibold text-zinc-100">Agent</label>
          <select id="test-agent" className={`${inputClass} mt-1.5`} value={agent} onChange={(e) => setAgent(e.target.value as AgentKey)}>
            {view.agents.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-zinc-100">Repository (optional)</p>
          <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} label="Repository" className="mb-0" />
        </div>
      </div>
      <div className="mt-4">
        <Segmented
          label="What to test"
          options={[
            { value: "tool", label: "A tool" },
            { value: "command", label: "A sandbox command" },
            { value: "egress", label: "A domain" },
          ]}
          value={what}
          onChange={(v) => setWhat(v as typeof what)}
        />
      </div>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor="test-input" className="sr-only">
          {what === "tool" ? "Tool name" : what === "command" ? "Command" : "Domain"}
        </label>
        <input
          id="test-input"
          className={monoInputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={what === "tool" ? "write_file or linear__create_issue" : what === "command" ? "npm run test" : "registry.npmjs.org"}
        />
        <button type="submit" disabled={!text.trim()} className={`${buttonClass("primary")} w-full shrink-0 whitespace-nowrap sm:w-auto`}>
          Test
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2" data-testid="test-result" data-decision={result.verdict.decision}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={DECISION_TONE[result.verdict.decision]}>{DECISION_LABELS[result.verdict.decision]}</StatusPill>
            {result.risk && <span className="text-xs text-zinc-400">Risk: {RISK_LABELS[result.risk]}</span>}
            {result.verdict.capped && <span className="text-xs text-amber-300">Held to ask by the autonomy limit</span>}
          </div>
          <p className="text-sm text-zinc-200">Decided by: {decidedByText(result.verdict.decided_by)}</p>
          <p className="text-xs text-zinc-400">{result.verdict.reason}</p>
          {result.considered.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">Every rule looked at ({result.considered.length})</summary>
              <ul className="mt-2 space-y-1">
                {result.considered.map((c) => (
                  <li key={c.id} className={`text-xs ${c.matched ? "text-zinc-200" : "text-zinc-500"}`}>
                    {c.label}: {c.note}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

// ── Sandbox ─────────────────────────────────────────────────────────

export function SandboxSettings({ view, edit, repos, onChange }: { view: PolicyView; edit: boolean; repos: Repo[]; onChange: Change }) {
  const sb = view.policy.sandbox;
  const v = view.policy.version;
  const repoNames = useMemo(() => {
    const names = new Set<string>([...Object.keys(sb.commands), ...Object.keys(sb.suggestions)]);
    return [...names].sort();
  }, [sb]);
  const [repo, setRepo] = useState(repoNames[0] ?? "");
  const key = repo.toLowerCase();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft((sb.commands[key] ?? []).map((c) => c.command).join("\n"));
  }, [key, sb.commands]);
  const [egress, setEgress] = useState(sb.egress.join("\n"));
  useEffect(() => setEgress(sb.egress.join("\n")), [sb.egress]);
  const [timeout, setTimeoutMins] = useState(String(Math.round(view.policy.ask_timeout_secs / 60)));
  const suggestions = sb.suggestions[key] ?? [];

  return (
    <section aria-labelledby="sandbox-heading" className="space-y-6">
      <SectionHead
        id="sandbox-heading"
        title="Sandbox"
        lead="The build and test commands each repository may run without asking, and where the sandbox may connect. Commands found in a repository are suggestions until an admin accepts them."
      />
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-100">Command allowlist</h3>
        <div className="mt-3 max-w-md">
          <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} label="Repository" />
        </div>
        {repo ? (
          <>
            <label htmlFor="sandbox-commands" className="block text-sm text-zinc-300">
              One command per line. End with * to allow its arguments (npm run test*).
            </label>
            <textarea id="sandbox-commands" rows={4} className={`${monoInputClass} mt-1.5`} value={draft} disabled={!edit} onChange={(e) => setDraft(e.target.value)} />
            {edit && (
              <button
                type="button"
                className={`${buttonClass("secondary", "sm")} mt-2`}
                onClick={() => onChange(api.setSandboxCommands(v, repo, draft.split("\n").map((l) => l.trim()).filter(Boolean)), "Commands saved.")}
              >
                Save commands
              </button>
            )}
            {suggestions.length > 0 && (
              <div className="mt-4" data-testid="command-suggestions">
                <p className="text-sm font-medium text-zinc-200">Suggested from the repository</p>
                <ul className="mt-2 space-y-2">
                  {suggestions.map((s) => (
                    <li key={s.command} className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">{s.command}</code>
                      <span className="text-xs text-zinc-500">from {s.origin}</span>
                      {edit && (
                        <>
                          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onChange(api.decideCommandSuggestion(v, repo, s.command, true), "Command allowed.")}>
                            Allow
                          </button>
                          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => onChange(api.decideCommandSuggestion(v, repo, s.command, false), "Suggestion dismissed.")}>
                            Dismiss
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">Pick a repository to see its commands.</p>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">Network</h3>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={sb.limit_egress}
              disabled={!edit}
              onChange={(e) => onChange(api.saveAgentSettings({ version: v, limit_egress: e.target.checked }), e.target.checked ? "Sandbox network limited to the allowlist." : "Sandbox network opened.")}
            />
            Limit the sandbox to these domains
          </label>
        </div>
        {!sb.limit_egress && (
          <div className="mt-3">
            <Callout variant="warning" live={false}>
              <p>The sandbox can reach any address. Builds run without a network limit.</p>
            </Callout>
          </div>
        )}
        <label htmlFor="sandbox-egress" className="mt-3 block text-sm text-zinc-300">
          One domain per line. A domain covers its subdomains.
        </label>
        <textarea id="sandbox-egress" rows={6} className={`${monoInputClass} mt-1.5`} value={egress} disabled={!edit} onChange={(e) => setEgress(e.target.value)} />
        {edit && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onChange(api.saveAgentSettings({ version: v, egress: egress.split("\n").map((l) => l.trim()).filter(Boolean) }), "Network allowlist saved.")}>
              Save domains
            </button>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEgress(view.default_egress.join("\n"))}>
              Use the recommended list
            </button>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-100">Approval timeout</h3>
        <p className="mt-1 text-sm text-zinc-400">How long a run waits for an answer before it stops cleanly with a note. A run never waits longer than it has left.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="ask-timeout" className="block text-xs text-zinc-400">Minutes</label>
            <input id="ask-timeout" type="number" min={1} max={10080} className={`${inputClass} mt-1 w-28`} value={timeout} disabled={!edit} onChange={(e) => setTimeoutMins(e.target.value)} />
          </div>
          {edit && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onChange(api.saveAgentSettings({ version: v, ask_timeout_secs: Math.max(1, Number(timeout) || 15) * 60 }), "Approval timeout saved.")}>
              Save
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Recent decisions ────────────────────────────────────────────────

export function RecentDecisions({ reload }: { reload: number }) {
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  useEffect(() => {
    api.agentActivity(30).then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, [reload]);
  return (
    <section aria-labelledby="log-heading">
      <SectionHead id="log-heading" title="Recent decisions" lead="Every ask, deny, approval and change, with the rule that decided it." />
      {events === null ? null : events.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="agent-log">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <Time iso={e.at} />
                <span className="min-w-0 wrap-anywhere">{e.actor}</span>
                {e.policy?.decision && <StatusPill tone={DECISION_TONE[e.policy.decision as Decision] ?? "neutral"}>{e.policy.decision}</StatusPill>}
              </div>
              <p className="mt-1 text-sm text-zinc-200">
                {e.tool ? `${e.tool}: ` : ""}
                {e.detail || e.action}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
