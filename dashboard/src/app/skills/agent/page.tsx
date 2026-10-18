"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { focusRing, inputClass, primaryButton } from "@/components/ui";
import { ago, briefSettings, modelFor, skillsApi, type AgentAsk, type SkillWithBody } from "@/lib/skills";

export default function AgentPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <AgentPage />
      </Suspense>
    </RoleGuard>
  );
}

/** How long the page waits on a try before it stops checking. */
const TRY_WAIT_MS = 180_000;

function AgentPage() {
  const params = useSearchParams();
  const repo = params.get("repo") ?? "";
  const path = params.get("path") ?? "";
  const { toast } = useToast();
  const [agent, setAgent] = useState<SkillWithBody | null>(null);
  const [missing, setMissing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [asks, setAsks] = useState<AgentAsk[] | null>(null);
  const [triesPerDay, setTriesPerDay] = useState(20);
  const [asksError, setAsksError] = useState("");
  const [switching, setSwitching] = useState(false);

  const loadAsks = useCallback(async () => {
    try {
      const r = await skillsApi.asks(repo, path);
      setAsks(r.asks);
      setTriesPerDay(r.tries_per_day);
      setAsksError("");
    } catch (e) {
      setAsksError(e instanceof Error ? e.message : "The request failed.");
      setAsks((prev) => prev ?? []);
    }
  }, [repo, path]);

  useEffect(() => {
    if (!repo || !path) {
      setMissing(true);
      return;
    }
    Promise.all([skillsApi.item(repo, path), skillsApi.list()])
      .then(([item, list]) => {
        if (item.kind !== "agent") {
          setMissing(true);
          return;
        }
        setAgent(item);
        setCanManage(list.can_manage);
      })
      .catch(() => setMissing(true));
    loadAsks();
  }, [repo, path, loadAsks]);

  const toggle = async () => {
    if (!agent) return;
    setSwitching(true);
    try {
      const r = await skillsApi.setEnabled(agent.repo, agent.path, !agent.enabled);
      setAgent({ ...agent, enabled: r.enabled });
      toast(r.enabled ? `${agent.name} is on` : `${agent.name} is off`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setSwitching(false);
    }
  };

  if (missing) {
    return (
      <div className="max-w-3xl rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
        <p className="mb-2 text-lg">Agent not found</p>
        <p className="text-sm">
          It may have been removed from its repository, or the repository was disconnected.{" "}
          <Link href="/skills" className="underline">
            All skills
          </Link>
        </p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-4xl space-y-4" role="status" aria-label="Loading the agent">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const settings = briefSettings(agent.body);
  const model = modelFor(settings.model);

  return (
    <div className="max-w-4xl">
      <Link href="/skills" className={`text-sm text-zinc-400 hover:text-zinc-200 rounded ${focusRing}`}>
        ← Skills
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-zinc-100 [overflow-wrap:anywhere]">{agent.name}</h1>
            <StatusPill tone="success">Agent · can be asked</StatusPill>
          </div>
          {agent.description && <p className="mt-2 max-w-prose text-sm text-zinc-400">{agent.description}</p>}
          <p className="mt-1 text-xs text-zinc-500 [overflow-wrap:anywhere]">
            {agent.repo} · {agent.path}
            {agent.sha && <> · commit <span className="font-mono">{agent.sha.slice(0, 7)}</span></>}
          </p>
        </div>
        {canManage ? (
          <ToolSwitch on={agent.enabled} label={`Let Coderhelm ask ${agent.name}`} busy={switching} onToggle={toggle} />
        ) : (
          <StatusPill tone={agent.enabled ? "success" : "neutral"}>{agent.enabled ? "On" : "Off"}</StatusPill>
        )}
      </div>

      {!agent.enabled && (
        <div className="mt-6">
          <Callout variant="info" title="Switched off">
            <p>Coderhelm&apos;s agents can&apos;t read or ask {agent.name} until an admin switches it on.</p>
          </Callout>
        </div>
      )}

      <section aria-labelledby="how-heading" className="mt-8">
        <h2 id="how-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          How Coderhelm runs it
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
          <Fact term="Who asks it">
            The planner, coder and reviewer, when its description fits the work. At most 3 asks in one run.
          </Fact>
          <Fact term="Model">
            Your team&apos;s {model} model
            {settings.model ? (
              <>
                {" "}
                (its brief says <code className="text-zinc-300">model: {settings.model}</code>)
              </>
            ) : null}
            .
          </Fact>
          <Fact term="Tools">
            None. It answers from its brief and what it&apos;s sent: it can&apos;t read files, run commands or reach the network.
            {settings.tools.length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span>Its brief asks for</span>
                {settings.tools.map((t) => (
                  <span key={t} className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-xs text-zinc-500 line-through" title="Not given">
                    {t}
                  </span>
                ))}
                <span>and doesn&apos;t get them.</span>
              </span>
            )}
          </Fact>
          <Fact term="Limits">
            One turn, up to 4k tokens and 2 minutes per answer. Secrets are removed from the answer, and it&apos;s weighed as advice, never as
            permission.
          </Fact>
        </dl>
      </section>

      {canManage && agent.enabled && (
        <TryIt repo={agent.repo} path={agent.path} name={agent.name} triesPerDay={triesPerDay} onAsked={loadAsks} />
      )}

      <section aria-labelledby="asks-heading" className="mt-8">
        <h2 id="asks-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Recent asks {asks && asks.length > 0 && <span className="ml-1 text-zinc-600">({asks.length})</span>}
        </h2>
        {asksError && <p className="mb-3 text-sm text-red-300">{asksError}</p>}
        {asks === null ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading…
          </p>
        ) : asks.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            Nobody has asked {agent.name} anything yet. Each question Coderhelm&apos;s agents put to it shows here with the answer, for 30 days.
          </p>
        ) : (
          <ul className="space-y-3">
            {asks.map((a) => (
              <AskCard key={a.id} ask={a} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brief-heading" className="mt-8">
        <h2 id="brief-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Its brief
        </h2>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">
          {agent.body}
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Read from the default branch. Change it with a pull request to {agent.repo}; Coderhelm reads it again when that merges.
        </p>
      </section>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/80 p-4">
      <dt className="text-xs font-medium text-zinc-500">{term}</dt>
      <dd className="mt-1 text-sm text-zinc-300">{children}</dd>
    </div>
  );
}

const OUTCOME: Record<AgentAsk["outcome"], { tone: "success" | "warning" | "error" | "neutral"; label: string }> = {
  answered: { tone: "success", label: "Answered" },
  pending: { tone: "warning", label: "Thinking…" },
  failed: { tone: "error", label: "No answer" },
  timed_out: { tone: "error", label: "Took too long" },
};

/** "owner/name#12" links to that issue or pull request on GitHub. */
function Origin({ origin }: { origin: string }) {
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(origin);
  if (!m) return <span className="[overflow-wrap:anywhere]">{origin}</span>;
  return (
    <a href={`https://github.com/${m[1]}/issues/${m[2]}`} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
      {origin}
    </a>
  );
}

function who(by: string): string {
  if (by.endsWith(" (try)")) return `${by.slice(0, -6)}, trying it`;
  return `the ${by}`;
}

function AskCard({ ask }: { ask: AgentAsk }) {
  const o = OUTCOME[ask.outcome] ?? OUTCOME.failed;
  // A try still pending after five minutes was lost.
  const lost = ask.outcome === "pending" && Date.now() - new Date(ask.at).getTime() > 300_000;
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-zinc-500">
          Asked by {who(ask.by)}
          {ask.origin && (
            <>
              {" "}
              on <Origin origin={ask.origin} />
            </>
          )}{" "}
          · {ago(ask.at)}
        </p>
        <StatusPill tone={lost ? "error" : o.tone}>{lost ? "No answer" : o.label}</StatusPill>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200 [overflow-wrap:anywhere]">{ask.question}</p>
      {ask.context_chars > 0 && (
        <p className="mt-1 text-xs text-zinc-500">
          With {ask.context_chars.toLocaleString()} characters of context (not kept).
        </p>
      )}
      {ask.answer && (
        <details className="mt-3 group" open={ask.by.endsWith(" (try)")}>
          <summary className={`cursor-pointer text-sm text-zinc-300 rounded ${focusRing}`}>
            {ask.outcome === "answered" ? "Answer" : "What happened"}
          </summary>
          <div className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
            {ask.answer}
          </div>
        </details>
      )}
      {ask.outcome !== "pending" && ask.model && (
        <p className="mt-2 text-xs text-zinc-600 [overflow-wrap:anywhere]">
          {ask.model} · {(ask.input_tokens + ask.output_tokens).toLocaleString()} tokens · {(ask.ms / 1000).toFixed(1)} s
        </p>
      )}
    </li>
  );
}

function TryIt({ repo, path, name, triesPerDay, onAsked }: { repo: string; path: string; name: string; triesPerDay: number; onAsked: () => void }) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<AgentAsk | null>(null);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const poll = (id: string, started: number) => {
    timer.current = setTimeout(async () => {
      try {
        const a = await skillsApi.ask(repo, path, id);
        if (a.outcome !== "pending") {
          setResult(a);
          setWaiting(false);
          onAsked();
          return;
        }
      } catch {
        // A blip: check again on the next tick.
      }
      if (Date.now() - started > TRY_WAIT_MS) {
        setWaiting(false);
        toast("The agent hasn't answered yet. Its answer will show under Recent asks.", "error");
        onAsked();
        return;
      }
      poll(id, started);
    }, 2_000);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || waiting) return;
    setWaiting(true);
    setResult(null);
    try {
      const { id } = await skillsApi.tryAgent(repo, path, question.trim(), context.trim());
      onAsked();
      poll(id, Date.now());
    } catch (err) {
      setWaiting(false);
      toast(err instanceof Error ? err.message : "The request failed.", "error");
    }
  };

  return (
    <section aria-labelledby="try-heading" className="mt-8">
      <h2 id="try-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Try it
      </h2>
      <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
        <label className="block text-sm text-zinc-300">
          Your question
          <textarea
            className={`${inputClass} mt-1.5 min-h-20`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={8000}
            placeholder={`What would you like ${name} to look at?`}
          />
        </label>
        <label className="mt-4 block text-sm text-zinc-300">
          Context <span className="text-zinc-500">(optional)</span>
          <textarea
            className={`${inputClass} mt-1.5 min-h-20 font-mono text-xs`}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            maxLength={16000}
            placeholder="Paste a spec, a diff or code it should see"
            spellCheck={false}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={waiting || !question.trim()}>
            {waiting ? "Asking…" : `Ask ${name}`}
          </button>
          <span className="text-xs text-zinc-500">
            It runs exactly as it does for Coderhelm&apos;s agents, on your team&apos;s model. {triesPerDay} tries a day.
          </span>
        </div>
        {waiting && (
          <p role="status" className="mt-4 text-sm text-zinc-400">
            Waiting for {name} to answer. This usually takes under a minute.
          </p>
        )}
        {result && (
          <div className="mt-4" aria-live="polite">
            {result.outcome === "answered" ? (
              <div className="whitespace-pre-wrap break-words rounded bg-zinc-950 px-4 py-3 text-sm text-zinc-300">{result.answer}</div>
            ) : (
              <p className="text-sm text-red-300">{result.answer || (result.outcome === "timed_out" ? "It took too long to answer." : "It didn't answer. Try again.")}</p>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
