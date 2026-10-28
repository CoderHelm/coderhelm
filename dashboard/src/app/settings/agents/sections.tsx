"use client";

import { Switch } from "@/components/settings/switch";

import { useEffect, useMemo, useState } from "react";
import { api, type Repo } from "@/lib/api";
import {
  AGENT_LABELS, AUTONOMY_OPTIONS, DECISION_LABELS, KIND_LABELS, PRESETS, RISK_LABELS,
  actorLabel, decidedByText, ruleWhat, ruleWhere, rulesFor,
  type AgentEvent, type AgentKey, type Autonomy, type CallKind, type Decision, type PolicyView, type Risk, type Rule, type Scope, type TestResult,
} from "@/lib/agent-policy";
import { Modal } from "@/components/modal";
import { Segmented } from "@/components/segmented";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { RepoCombobox } from "@/components/repo-combobox";
import { MoreMenu, Time } from "@/components/list";
import { cardClass } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { SaveBar, SettingsMore, useDirtyForm } from "@/components/settings";
import { buttonClass, inputClass, monoInputClass } from "@/components/ui";
import { Select } from "@/components/select";

/** Puts a change back, given the policy version current when Undo is pressed. */
export type Undo = (version: number) => Promise<PolicyView>;
type Change = (what: Promise<PolicyView>, done?: string, undo?: Undo) => Promise<boolean>;

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

type PauseFor = "resume" | "hour" | "tomorrow" | "custom";
const PAUSE_FOR: { value: PauseFor; label: string }[] = [
  { value: "resume", label: "Until I resume" },
  { value: "hour", label: "1 hour" },
  { value: "tomorrow", label: "Until tomorrow 9:00" },
  { value: "custom", label: "Pick a time" },
];

/** When a quick pick ends, as RFC 3339; undefined pauses until someone resumes. */
function pauseUntil(pick: PauseFor, custom: string, now = new Date()): string | undefined {
  if (pick === "hour") return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (pick === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t.toISOString();
  }
  if (pick === "custom") return untilToIso(custom);
  return undefined;
}

export function PauseBanner({ view, edit, onChange }: { view: PolicyView; edit: boolean; onChange: Change }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [pick, setPick] = useState<PauseFor>("resume");
  const p = view.paused;

  if (p) {
    return (
      <div data-testid="pause-banner" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4" role="status">
        <p className="text-sm font-semibold text-zinc-50">All agents are paused</p>
        <p className="mt-1 text-sm text-zinc-200">
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
            const ok = await onChange(api.pauseAgents(reason.trim(), pauseUntil(pick, until)), "All agents are paused.");
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
            <p className="mb-1.5 text-sm font-semibold text-zinc-100">For how long</p>
            <Segmented<PauseFor> label="For how long" options={PAUSE_FOR} value={pick} onChange={setPick} />
            {pick === "custom" && (
              <div className="mt-3">
                <label htmlFor="pause-until" className="block text-sm text-zinc-300">
                  Until
                </label>
                <input id="pause-until" type="datetime-local" className={`${inputClass} mt-1.5`} value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            )}
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
              <p className="text-sm text-zinc-400">{a.summary}</p>
              {a.repos_off.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.repos_off.map((r) => (
                    <span key={r} className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      <span className="min-w-0 truncate">Off in {r}</span>
                      {edit && (
                        <button
                          type="button"
                          aria-label={`Turn the ${a.label.toLowerCase()} back on in ${r}`}
                          className="rounded px-0.5 text-zinc-400 hover:text-zinc-100"
                          onClick={() =>
                            onChange(api.setAgentSwitch(v, a.key, true, r), `${a.label} is on again in ${r}.`, (ver) => api.setAgentSwitch(ver, a.key, false, r))
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Switch
                checked={a.on}
                label={`${a.label} ${a.on ? "on" : "off"} for the team`}
                disabled={!edit}
                onChange={(on) =>
                  onChange(api.setAgentSwitch(v, a.key, on), `${a.label} is ${on ? "on" : "off"} for the team.`, (ver) => api.setAgentSwitch(ver, a.key, !on))
                }
              />
              {edit && repos.length > 0 && (
                <MoreMenu
                  compact
                  buttonLabel={`Exceptions for the ${a.label.toLowerCase()}`}
                  items={[{ label: "Turn off in a repository…", onSelect: () => setRepoFor(a.key) }]}
                />
              )}
            </div>
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
              const key = repoFor;
              const where = repo;
              if (await onChange(api.setAgentSwitch(v, key, false, where), `${AGENT_LABELS[key]} is off in ${where}.`, (ver) => api.setAgentSwitch(ver, key, true, where))) setRepoFor(null);
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
          onChange={(a) => {
            const before = view.policy.autonomy;
            onChange(api.saveAgentSettings({ version: v, autonomy: a }), "Autonomy limit saved.", (ver) => api.saveAgentSettings({ version: ver, autonomy: before }));
          }}
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
                <p className="mt-1 text-sm text-zinc-400">{p.help}</p>
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
      <SectionHead id="rules-heading" title="Rules" lead="Rules make exceptions: allow, ask or deny a kind of call." />
      <div className="-mt-1 mb-3">
        <SettingsMore summary="How rules are picked">
          <p>
            The narrowest rule that matches decides: an agent in a repository, then an agent, then a repository, then the team. At the same level,
            deny beats ask and ask beats allow. A locked team rule can&apos;t be overridden.
          </p>
        </SettingsMore>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Scope> label="Rules for" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        {edit && (
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAdding(true)} data-testid="add-rule">
            Add a rule
          </button>
        )}
      </div>
      {rules.length === 0 ? (
        <EmptyState title={`No ${scope === "team" ? "team" : scope === "repo" ? "repository" : "agent"} rules yet`}>
          Without a rule, reads run and everything else asks.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="rules-list">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              edit={edit}
              onRemove={() => {
                const { id: _id, source: _src, created_by: _by, created_at: _at, ...back } = r;
                onChange(api.removeAgentRule(v, r.id), "Rule removed.", (ver) => api.addAgentRule(ver, back));
              }}
            />
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
        <p className="text-sm text-zinc-400">
          {ruleWhere(rule)} · {SOURCE_LABEL[rule.source ?? "manual"]}
          {rule.created_by ? ` · ${rule.created_by}` : ""}
        </p>
        {rule.note && <p className="mt-1 text-sm text-zinc-400">{rule.note}</p>}
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
            <Select
              id="rule-agent"
              className="mt-1.5 w-full"
              value={agent}
              onChange={(v) => setAgent(v as AgentKey)}
              options={Object.entries(AGENT_LABELS).map(([k, l]) => ({ value: k, label: l }))}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-kind" className="block text-sm font-semibold text-zinc-100">Kind of call</label>
            <Select
              id="rule-kind"
              className="mt-1.5 w-full"
              value={kind}
              onChange={(v) => setKind(v as CallKind | "")}
              options={[{ value: "", label: "Any" }, ...view.kinds.map((k) => ({ value: k, label: KIND_LABELS[k] }))]}
            />
          </div>
          <div>
            <label htmlFor="rule-risk" className="block text-sm font-semibold text-zinc-100">Risk</label>
            <Select
              id="rule-risk"
              className="mt-1.5 w-full"
              value={risk}
              onChange={(v) => setRisk(v as Risk | "")}
              options={[{ value: "", label: "Any" }, ...(Object.keys(RISK_LABELS) as Risk[]).map((r) => ({ value: r, label: RISK_LABELS[r] }))]}
            />
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
          {capped && <p className="mt-2 text-sm text-amber-300">This is above the team&apos;s autonomy limit, so it would ask instead. Raise the limit first, or make the rule ask.</p>}
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
          <Select
            id="test-agent"
            className="mt-1.5 w-full"
            value={agent}
            onChange={(v) => setAgent(v as AgentKey)}
            options={view.agents.map((a) => ({ value: a.key, label: a.label }))}
          />
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
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
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
                  <li key={c.id} className={`text-xs ${c.matched ? "text-zinc-200" : "text-zinc-400"}`}>
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

type SandboxForm = { commands: string; egress: string; timeout: string };

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * The commands, domains and approval timeout save together with one save
 * bar; the network limit and suggestions are one-click changes with a toast.
 */
export function SandboxSettings({ view, edit, repos, onChange }: { view: PolicyView; edit: boolean; repos: Repo[]; onChange: Change }) {
  const sb = view.policy.sandbox;
  const v = view.policy.version;
  const repoNames = useMemo(() => {
    const names = new Set<string>([...Object.keys(sb.commands), ...Object.keys(sb.suggestions)]);
    return [...names].sort();
  }, [sb]);
  const [repo, setRepo] = useState(repoNames[0] ?? "");
  const key = repo.toLowerCase();
  const suggestions = sb.suggestions[key] ?? [];
  const [saving, setSaving] = useState(false);

  const savedForm = useMemo<SandboxForm>(
    () => ({
      commands: (sb.commands[key] ?? []).map((c) => c.command).join("\n"),
      egress: sb.egress.join("\n"),
      timeout: String(Math.round(view.policy.ask_timeout_secs / 60)),
    }),
    [sb.commands, sb.egress, key, view.policy.ask_timeout_secs],
  );
  const form = useDirtyForm<SandboxForm>(savedForm, { disabled: !edit });
  const { reset } = form;
  useEffect(() => reset(savedForm), [savedForm, reset]);

  const save = async () => {
    setSaving(true);
    // Each save returns the next policy version; the next request uses it.
    const run = async (): Promise<PolicyView> => {
      let next = view;
      if (repo && form.isDirty("commands")) next = await api.setSandboxCommands(next.policy.version, repo, lines(form.values.commands));
      if (form.isDirty("egress", "timeout")) {
        next = await api.saveAgentSettings({
          version: next.policy.version,
          egress: form.isDirty("egress") ? lines(form.values.egress) : undefined,
          ask_timeout_secs: form.isDirty("timeout") ? Math.max(1, Number(form.values.timeout) || 15) * 60 : undefined,
        });
      }
      return next;
    };
    await onChange(run(), "Sandbox settings saved.");
    setSaving(false);
  };

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
            <textarea id="sandbox-commands" rows={4} className={`${monoInputClass} mt-1.5`} value={form.values.commands} disabled={!edit} onChange={(e) => form.set("commands", e.target.value)} />
            {suggestions.length > 0 && (
              <div className="mt-4" data-testid="command-suggestions">
                <p className="text-sm font-medium text-zinc-200">Suggested from the repository</p>
                <ul className="mt-2 space-y-2">
                  {suggestions.map((s) => (
                    <li key={s.command} className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">{s.command}</code>
                      <span className="text-xs text-zinc-400">from {s.origin}</span>
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
          <p className="text-sm text-zinc-400">Pick a repository to see its commands.</p>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="network-heading" className="text-sm font-semibold text-zinc-100">Network</h3>
          <div className="flex items-center gap-2">
            <span id="limit-egress-label" className="text-sm text-zinc-300">Limit the sandbox to these domains</span>
            <Switch
              checked={sb.limit_egress}
              labelledBy="limit-egress-label"
              disabled={!edit}
              onChange={(on) =>
                onChange(
                  api.saveAgentSettings({ version: v, limit_egress: on }),
                  on ? "Sandbox network limited to the allowlist." : "Sandbox network opened.",
                  (ver) => api.saveAgentSettings({ version: ver, limit_egress: !on }),
                )
              }
            />
          </div>
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
        <textarea id="sandbox-egress" rows={6} className={`${monoInputClass} mt-1.5`} value={form.values.egress} disabled={!edit} onChange={(e) => form.set("egress", e.target.value)} />
        {edit && (
          <button type="button" className={`${buttonClass("ghost", "sm")} mt-2`} onClick={() => form.set("egress", view.default_egress.join("\n"))}>
            Use the recommended list
          </button>
        )}
      </div>

      <div className={cardClass}>
        <label htmlFor="ask-timeout" className="text-sm font-semibold text-zinc-100">
          Approval timeout (minutes)
        </label>
        <p className="mt-1 text-sm text-zinc-400">How long a run waits for an answer before it stops cleanly with a note. A run never waits longer than it has left.</p>
        <input
          id="ask-timeout"
          type="number"
          min={1}
          max={10080}
          className={`${inputClass} mt-3 w-28`}
          value={form.values.timeout}
          disabled={!edit}
          onChange={(e) => form.set("timeout", e.target.value)}
        />
      </div>

      {edit && <SaveBar count={form.count} onSave={save} onDiscard={form.discard} saving={saving} />}
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
        <p className="text-sm text-zinc-400">Nothing yet. Asks, denials, approvals and changes show here as they happen.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" data-testid="agent-log">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <Time iso={e.at} />
                <span className="min-w-0 wrap-anywhere">{actorLabel(e.actor)}</span>
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
