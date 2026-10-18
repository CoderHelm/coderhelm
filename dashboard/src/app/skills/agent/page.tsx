"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import {
  ago,
  asker,
  briefSettings,
  fileUrl,
  isTry,
  modelFor,
  skillsApi,
  splitFrontMatter,
  thinDescription,
  type AgentAsk,
  type SkillRepo,
  type SkillWithBody,
} from "@/lib/skills";

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
const sectionHeading = "mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500";
const card = "rounded-lg border border-zinc-800 bg-zinc-900/50";

function AgentPage() {
  const params = useSearchParams();
  const repoName = params.get("repo") ?? "";
  const path = params.get("path") ?? "";
  const { toast } = useToast();
  const [agent, setAgent] = useState<SkillWithBody | null>(null);
  const [repo, setRepo] = useState<SkillRepo | null>(null);
  const [missing, setMissing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [asks, setAsks] = useState<AgentAsk[] | null>(null);
  const [triesLeft, setTriesLeft] = useState<number | null>(null);
  const [triesPerDay, setTriesPerDay] = useState(20);
  const [asksError, setAsksError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [draft, setDraft] = useState<{ question: string; key: number } | null>(null);

  const loadAsks = useCallback(async () => {
    try {
      const r = await skillsApi.asks(repoName, path);
      setAsks(r.asks);
      setTriesLeft(r.tries_left);
      setTriesPerDay(r.tries_per_day);
      setAsksError("");
    } catch (e) {
      setAsksError(e instanceof Error ? e.message : "The request failed.");
      setAsks((prev) => prev ?? []);
    }
  }, [repoName, path]);

  useEffect(() => {
    if (!repoName || !path) {
      setMissing(true);
      return;
    }
    Promise.all([skillsApi.item(repoName, path), skillsApi.list()])
      .then(([item, list]) => {
        if (item.kind !== "agent") {
          setMissing(true);
          return;
        }
        setAgent(item);
        setRepo(list.repos.find((r) => r.repo === item.repo) ?? null);
        setCanManage(list.can_manage);
      })
      .catch(() => setMissing(true));
    loadAsks();
  }, [repoName, path, loadAsks]);

  const toggle = async () => {
    if (!agent) return;
    setSwitching(true);
    try {
      const r = await skillsApi.setEnabled(agent.repo, agent.path, !agent.enabled);
      setAgent({ ...agent, enabled: r.enabled, switched_by: "you", switched_at: new Date().toISOString() });
      toast(r.enabled ? `${agent.name} is on` : `${agent.name} is off`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setSwitching(false);
    }
  };

  const askAgain = (question: string) => {
    setDraft({ question, key: Date.now() });
    document.getElementById("try-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <div className="max-w-6xl space-y-4" role="status" aria-label="Loading the agent">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const settings = briefSettings(agent.body);
  const { front, text } = splitFrontMatter(agent.body);
  const runAsks = (asks ?? []).filter((a) => !isTry(a));
  const answered = runAsks.filter((a) => a.outcome === "answered").length;

  return (
    <div className="max-w-6xl">
      <Link href="/skills" className={`text-sm text-zinc-400 hover:text-zinc-200 rounded ${focusRing}`}>
        ← Skills
      </Link>

      {/* Header: what it is, where it comes from, and its switch. */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-zinc-100 [overflow-wrap:anywhere]">{agent.name}</h1>
            <StatusPill tone="success">Agent · can be asked</StatusPill>
          </div>
          <p className="mt-1 text-xs text-zinc-500 [overflow-wrap:anywhere]">
            From <span className="font-mono text-zinc-400">{agent.repo}</span> · {agent.path}
            {agent.sha && (
              <>
                {" "}
                at <span className="font-mono">{agent.sha.slice(0, 7)}</span>
              </>
            )}
            {repo?.synced_at && <> · synced {ago(repo.synced_at)}</>}
            {" · "}
            <a href={fileUrl(agent.repo, agent.sha, agent.path)} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-zinc-300 rounded ${focusRing}`}>
              Open on GitHub
            </a>
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
          {canManage ? (
            <ToolSwitch on={agent.enabled} label={`Let Coderhelm ask ${agent.name}`} busy={switching} onToggle={toggle} />
          ) : (
            <StatusPill tone={agent.enabled ? "success" : "neutral"}>{agent.enabled ? "On" : "Off"}</StatusPill>
          )}
          <p className="max-w-56 text-xs text-zinc-500">
            A Coderhelm setting. It doesn&apos;t change the file.
            {agent.switched_by && (
              <>
                {" "}
                Last switched {agent.enabled ? "on" : "off"} by {agent.switched_by} {ago(agent.switched_at)}.
              </>
            )}
          </p>
        </div>
      </div>

      {repo?.error && (
        <div className="mt-4">
          <Callout variant="warning" title="The last sync failed">
            <p>
              {repo.error} Coderhelm is still using the version at {agent.sha.slice(0, 7)}.
            </p>
          </Callout>
        </div>
      )}
      {!agent.enabled && (
        <div className="mt-4">
          <Callout variant="info" title="Switched off">
            <p>Coderhelm&apos;s agents can&apos;t read or ask {agent.name} until an admin switches it on.</p>
          </Callout>
        </div>
      )}

      {/* When it's asked: the description is what Coderhelm decides on. */}
      <div className={`${card} mt-6 p-5`}>
        <p className="text-xs font-medium text-zinc-500">Coderhelm asks this agent when</p>
        {agent.description ? (
          <p className="mt-1 text-sm text-zinc-200">{agent.description}</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">Its file has no description.</p>
        )}
        {thinDescription(agent.description) && (
          <p className="mt-2 text-xs text-amber-300">
            Coderhelm&apos;s agents pick who to ask from this line alone, so a short or missing one means it&apos;s rarely asked. Say what kind of work
            it&apos;s for in the file&apos;s <code className="text-amber-200">description:</code>.
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          {runAsks.length > 0 || agent.asks > 0 ? (
            <>
              Asked {agent.asks || runAsks.length} time{(agent.asks || runAsks.length) === 1 ? "" : "s"}
              {agent.last_asked_at && <>, last {ago(agent.last_asked_at)}</>}
              {runAsks.length > 0 && (
                <>
                  {" "}
                  · {answered} of the last {runAsks.length} answered
                </>
              )}
            </>
          ) : (
            "Not asked by Coderhelm's agents yet."
          )}
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className={sectionHeading}>
              How Coderhelm runs it
            </h2>
            <dl className={`${card} divide-y divide-zinc-800`}>
              <Fact term="Who asks it">The planner, coder and reviewer, at most 3 asks in one run.</Fact>
              <Fact term="Tools">
                <span className="text-zinc-200">None when Coderhelm asks it.</span> It answers from the question and the context it&apos;s sent, and
                can&apos;t read files, run commands or reach the network.{" "}
                {settings.toolsSet ? (
                  settings.tools.length > 0 ? (
                    <span className="text-zinc-500">
                      Its file asks for <span className="font-mono text-zinc-400">{settings.tools.join(", ")}</span>; those apply where the file is
                      used elsewhere, not here.
                    </span>
                  ) : null
                ) : (
                  <span className="text-zinc-500">Its file doesn&apos;t set tools, which in most tools means all of them; here it still gets none.</span>
                )}
              </Fact>
              <Fact term="Model">
                Your team&apos;s {modelFor(settings.model)} model
                {settings.model && (
                  <span className="text-zinc-500">
                    {" "}
                    (the file says <code className="text-zinc-400">model: {settings.model}</code>)
                  </span>
                )}
                .
              </Fact>
              <Fact term="Limits">
                One turn, up to 4k tokens and 2 minutes. Secrets are removed from the answer, and the asking agent treats it as advice, never as permission.
              </Fact>
            </dl>
          </section>

          <RecentAsks asks={asks} error={asksError} agent={agent} canAskAgain={canManage && agent.enabled} onAskAgain={askAgain} />

          <section aria-labelledby="instructions-heading">
            <h2 id="instructions-heading" className={sectionHeading}>
              Instructions
            </h2>
            <div className={`${card} p-5`}>
              <Markdown>{text.trim() || "_This file has no instructions after its settings._"}</Markdown>
              {front && (
                <details className="mt-3 border-t border-zinc-800 pt-3">
                  <summary className={`cursor-pointer text-xs text-zinc-500 rounded ${focusRing}`}>File settings</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-400">{front}</pre>
                </details>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Read from the default branch. To change it, open a pull request to {agent.repo}; Coderhelm reads it again when that merges.
            </p>
          </section>
        </div>

        <aside className={`min-w-0 lg:sticky lg:top-6 lg:self-start ${canManage && agent.enabled ? "order-first lg:order-none" : ""}`}>
          {canManage && agent.enabled ? (
            <TryIt agent={agent} triesLeft={triesLeft} triesPerDay={triesPerDay} draft={draft} onAsked={loadAsks} />
          ) : (
            <div className={`${card} p-5 text-sm text-zinc-400`}>
              <h2 id="try-heading" className={sectionHeading}>
                Try it
              </h2>
              {canManage ? `Switch ${agent.name} on to try it.` : "Admins can try this agent with a question of their own."}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium text-zinc-500 sm:pt-0.5">{term}</dt>
      <dd className="text-sm text-zinc-300">{children}</dd>
    </div>
  );
}

const OUTCOME: Record<AgentAsk["outcome"], { tone: "success" | "warning" | "error"; label: string; means: string }> = {
  answered: { tone: "success", label: "Answered", means: "The agent answered within its limits." },
  pending: { tone: "warning", label: "Thinking…", means: "Waiting for the agent's answer." },
  failed: { tone: "error", label: "No answer", means: "The model call failed, so the asking agent went on without it." },
  timed_out: { tone: "error", label: "Took too long", means: "No answer within 2 minutes, so the asking agent went on without it." },
};

type Filter = "all" | "runs" | "tries" | "problems";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "runs", label: "From runs" },
  { key: "tries", label: "Tries" },
  { key: "problems", label: "No answer" },
];

function RecentAsks({
  asks,
  error,
  agent,
  canAskAgain,
  onAskAgain,
}: {
  asks: AgentAsk[] | null;
  error: string;
  agent: SkillWithBody;
  canAskAgain: boolean;
  onAskAgain: (q: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(
    () =>
      (asks ?? []).filter((a) =>
        filter === "runs" ? !isTry(a) : filter === "tries" ? isTry(a) : filter === "problems" ? a.outcome === "failed" || a.outcome === "timed_out" : true,
      ),
    [asks, filter],
  );
  return (
    <section aria-labelledby="asks-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="asks-heading" className={`${sectionHeading} mb-0`}>
          Recent asks {asks && asks.length > 0 && <span className="ml-1 text-zinc-600">({asks.length})</span>}
        </h2>
        {asks && asks.length > 0 && (
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f.key ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"} ${focusRing}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
      {asks === null ? (
        <p role="status" className="text-sm text-zinc-500">
          Loading…
        </p>
      ) : asks.length === 0 ? (
        <p className={`${card} p-5 text-sm text-zinc-400`}>
          Nobody has asked {agent.name} anything yet. Each question Coderhelm&apos;s agents put to it shows here with the answer, for 30 days.
        </p>
      ) : shown.length === 0 ? (
        <p className={`${card} p-5 text-sm text-zinc-400`}>Nothing matches this filter.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => (
            <AskCard key={a.id} ask={a} currentSha={agent.sha} canAskAgain={canAskAgain} onAskAgain={onAskAgain} />
          ))}
        </ul>
      )}
    </section>
  );
}

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

function AskCard({ ask, currentSha, canAskAgain, onAskAgain }: { ask: AgentAsk; currentSha: string; canAskAgain: boolean; onAskAgain: (q: string) => void }) {
  const [full, setFull] = useState(false);
  // A try still pending after five minutes was lost.
  const lost = ask.outcome === "pending" && Date.now() - new Date(ask.at).getTime() > 300_000;
  const o = lost ? OUTCOME.failed : (OUTCOME[ask.outcome] ?? OUTCOME.failed);
  const long = ask.answer.length > 420 || ask.answer.split("\n").length > 6;
  const older = ask.sha && currentSha && ask.sha !== currentSha;
  return (
    <li className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs text-zinc-500">
          <span className="font-medium text-zinc-300">{asker(ask.by)}</span>
          {isTry(ask) ? " tried it" : " asked"}
          {ask.origin && (
            <>
              {" "}
              on <Origin origin={ask.origin} />
            </>
          )}{" "}
          · <time dateTime={ask.at}>{ago(ask.at)}</time>
          {ask.run_id && (
            <>
              {" · "}
              <Link href={`/runs/detail?id=${encodeURIComponent(ask.run_id)}`} className={`underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
                View run
              </Link>
            </>
          )}
        </p>
        <span title={o.means}>
          <StatusPill tone={o.tone}>{o.label}</StatusPill>
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200 [overflow-wrap:anywhere]">{ask.question}</p>
      {ask.answer && (
        <div className="mt-3 rounded bg-zinc-950 px-4 py-3">
          <div className={`whitespace-pre-wrap break-words text-sm text-zinc-300 ${!full && long ? "line-clamp-6" : ""}`}>{ask.answer}</div>
          {long && (
            <button type="button" className={`${linkButton} mt-1 text-xs`} onClick={() => setFull(!full)} aria-expanded={full}>
              {full ? "Show less" : "Show the whole answer"}
            </button>
          )}
        </div>
      )}
      {!ask.answer && o === OUTCOME.failed && !lost && <p className="mt-2 text-xs text-zinc-500">{o.means}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-zinc-600 [overflow-wrap:anywhere]">
          {ask.sha && (
            <>
              file at <span className="font-mono">{ask.sha.slice(0, 7)}</span>
              {older && <span className="text-amber-400/80"> (an older version)</span>}
              {" · "}
            </>
          )}
          {ask.context_chars > 0 && <>sent {ask.context_chars.toLocaleString()} characters of context, not kept · </>}
          {ask.outcome !== "pending" && ask.model && (
            <>
              {(ask.input_tokens + ask.output_tokens).toLocaleString()} tokens · {(ask.ms / 1000).toFixed(1)} s
            </>
          )}
        </p>
        {canAskAgain && ask.outcome !== "pending" && (
          <button type="button" className={`${linkButton} text-xs`} onClick={() => onAskAgain(ask.question)}>
            Ask again
          </button>
        )}
      </div>
    </li>
  );
}

function TryIt({
  agent,
  triesLeft,
  triesPerDay,
  draft,
  onAsked,
}: {
  agent: SkillWithBody;
  triesLeft: number | null;
  triesPerDay: number;
  draft: { question: string; key: number } | null;
  onAsked: () => void;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<AgentAsk | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showSent, setShowSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const waiting = startedAt !== null;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // "Ask again" on a past ask fills the question in.
  useEffect(() => {
    if (!draft) return;
    setQuestion(draft.question);
    setResult(null);
    questionRef.current?.focus();
  }, [draft]);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const poll = (id: string, started: number) => {
    timer.current = setTimeout(async () => {
      try {
        const a = await skillsApi.ask(agent.repo, agent.path, id);
        if (a.outcome !== "pending") {
          setResult(a);
          setStartedAt(null);
          onAsked();
          return;
        }
      } catch {
        // A blip: check again on the next tick.
      }
      if (Date.now() - started > TRY_WAIT_MS) {
        setStartedAt(null);
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
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    setResult(null);
    try {
      const { id } = await skillsApi.tryAgent(agent.repo, agent.path, question.trim(), context.trim());
      onAsked();
      poll(id, started);
    } catch (err) {
      setStartedAt(null);
      toast(err instanceof Error ? err.message : "The request failed.", "error");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const sent = `${agent.prompt ?? ""}\n\n--- The question ---\n${question.trim() || "(your question)"}${context.trim() ? `\n\n## Context\n${context.trim()}` : ""}`;
  const out = triesLeft !== null && triesLeft <= 0;

  return (
    <section aria-labelledby="try-heading" className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="try-heading" className={`${sectionHeading} mb-0`}>
          Try it
        </h2>
        {triesLeft !== null && (
          <span className={`text-xs ${out ? "text-amber-300" : "text-zinc-500"}`}>
            {triesLeft} of {triesPerDay} tries left today
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Ask it what Coderhelm&apos;s agents would. It runs exactly as it does for them: no tools, your team&apos;s model.</p>
      <form onSubmit={submit} className="mt-4">
        <label className="block text-sm text-zinc-300">
          Question
          <textarea
            ref={questionRef}
            className={`${inputClass} mt-1.5 min-h-24`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={8000}
            placeholder={`What should ${agent.name} look at?`}
          />
        </label>
        <label className="mt-3 block text-sm text-zinc-300">
          Context <span className="text-zinc-500">(optional)</span>
          <textarea
            className={`${inputClass} mt-1.5 min-h-20 font-mono text-xs`}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            maxLength={16000}
            placeholder="A spec, a diff or code it should see"
            spellCheck={false}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={waiting || !question.trim() || out}>
            {waiting ? `Asking… ${Math.round((now - (startedAt ?? now)) / 1000)} s` : `Ask ${agent.name}`}
          </button>
          <button type="button" className={`${linkButton} text-xs`} aria-expanded={showSent} onClick={() => setShowSent(!showSent)}>
            {showSent ? "Hide what gets sent" : "What gets sent"}
          </button>
        </div>
        {out && <p className="mt-2 text-xs text-amber-300">No tries left today. They reset 24 hours after each one.</p>}
        {showSent && (
          <div className="mt-3">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400">{sent}</pre>
            <p className="mt-1 text-xs text-zinc-600">About {Math.ceil(sent.length / 4).toLocaleString()} tokens. No tools are sent.</p>
          </div>
        )}
      </form>
      {waiting && (
        <p role="status" className="mt-4 text-sm text-zinc-400">
          Waiting for {agent.name}. Most answers take under a minute; it stops at 2.
        </p>
      )}
      {result && (
        <div className="mt-4" aria-live="polite">
          {result.outcome === "answered" ? (
            <>
              <div className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 px-4 py-3 text-sm text-zinc-300">{result.answer}</div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-600">
                  {(result.input_tokens + result.output_tokens).toLocaleString()} tokens · {(result.ms / 1000).toFixed(1)} s
                </span>
                <span className="flex gap-2">
                  <button type="button" className={`${secondaryButton} min-h-8 px-3 py-1 text-xs`} onClick={() => copy(result.answer)}>
                    Copy
                  </button>
                  <button type="button" className={`${secondaryButton} min-h-8 px-3 py-1 text-xs`} onClick={() => setResult(null)}>
                    Clear
                  </button>
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-300">{result.answer || (result.outcome === "timed_out" ? "It took too long to answer." : "It didn't answer. Try again.")}</p>
          )}
        </div>
      )}
    </section>
  );
}
