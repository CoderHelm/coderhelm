"use client";

import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import { CodeBlock } from "@/components/code-block";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton } from "@/components/ui";
import { Chip, List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, type Tone } from "@/components/list";
import { Code, SettingsMore, SettingsRow } from "@/components/settings";
import { Tabs } from "@/components/tabs";
import { Modal } from "@/components/modal";
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
  toolWords,
  type AgentAsk,
  type AgentToolset,
  type SkillRepo,
  type SkillWithBody,
} from "@/lib/skills";
import { ItemActivity } from "../skill-activity";
import { CompatSection } from "../compat";
import { useRecheck } from "../use-recheck";
import { ReviewStepsSection } from "../review-steps";
import { Page, PageHeader } from "@/components/page";

export default function AgentPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <AgentPage />
      </Suspense>
    </RoleGuard>
  );
}

/** How long the page waits on a try before it stops checking. */
const TRY_WAIT_MS = 180_000;
const sectionHeading = "mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500";
type AgentTab = "overview" | "asks" | "instructions";
const TABS: AgentTab[] = ["overview", "asks", "instructions"];
const card = "rounded-lg border border-zinc-800 bg-zinc-900/50";

function AgentPage() {
  const params = useSearchParams();
  const repoName = params.get("repo") ?? "";
  const path = params.get("path") ?? "";
  const tabParam = params.get("tab") as AgentTab | null;
  const tab: AgentTab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const [tryOpen, setTryOpen] = useState(false);
  const tryButton = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const [agent, setAgent] = useState<SkillWithBody | null>(null);
  const [repo, setRepo] = useState<SkillRepo | null>(null);
  const [missing, setMissing] = useState(false);
  // Skills are managed with data sources and team tools.
  const { can } = useCan();
  const canManage = can("data_sources");
  const [asks, setAsks] = useState<AgentAsk[] | null>(null);
  const [triesLeft, setTriesLeft] = useState<number | null>(null);
  const [triesPerDay, setTriesPerDay] = useState(20);
  const [asksError, setAsksError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [draft, setDraft] = useState<{ question: string; key: number } | null>(null);
  const reload = useCallback(async () => {
    const item = await skillsApi.item(repoName, path);
    setAgent(item);
    return item;
  }, [repoName, path]);
  const { busy, recheck, chooseTranslated } = useRecheck(agent, setAgent, reload);

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
    setTryOpen(true);
  };

  if (missing) {
    return (
      <Page>
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
          <p className="mb-2 text-lg">Agent not found</p>
          <p className="text-sm">
            It may have been removed from its repository, or the repository was disconnected.{" "}
            <Link href="/skills" className="underline">
              All skills
            </Link>
          </p>
        </div>
      </Page>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4" role="status" aria-label="Loading the agent">
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
  const canTry = canManage && agent.enabled;
  const tabHref = (t: AgentTab) => {
    const q = new URLSearchParams({ repo: repoName, path });
    if (t !== "overview") q.set("tab", t);
    return `/skills/agent?${q.toString()}`;
  };

  return (
    <Page>
      <PageHeader
        detail
        title={agent.name}
        status={<Chip tone={agent.enabled ? "success" : "muted"}>{agent.enabled ? "Agent · can be asked" : "Agent · off"}</Chip>}
        lead={
          <span className="text-xs text-zinc-500 [overflow-wrap:anywhere]">
            From {agent.repo} · <Code>{agent.path}</Code>
            {repo?.synced_at && <> · synced {ago(repo.synced_at)}</>}
            {" · "}
            <a
              href={fileUrl(agent.repo, agent.sha, agent.path)}
              target="_blank"
              rel="noreferrer"
              title={agent.sha ? `The file at ${agent.sha.slice(0, 7)}` : undefined}
              className={`underline underline-offset-2 hover:text-zinc-300 rounded ${focusRing}`}
            >
              Open on GitHub
            </a>
            {!canTry && (
              <span className="mt-1 block">
                {canManage ? `Switch ${agent.name} on to try it.` : "Admins can try this agent with a question of their own."}
              </span>
            )}
          </span>
        }
        actions={
          canTry ? (
            <button type="button" ref={tryButton} className={buttonClass("primary", "sm")} onClick={() => setTryOpen(true)}>
              Try it
            </button>
          ) : undefined
        }
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
        <SettingsRow
          label="Let Coderhelm ask this agent"
          layout="toggle"
          help={
            <>
              A Coderhelm setting. It doesn&apos;t change the file.
              {agent.switched_by && (
                <>
                  {" "}
                  Last switched {agent.enabled ? "on" : "off"} by {agent.switched_by} {ago(agent.switched_at)}.
                </>
              )}
            </>
          }
          control={() =>
            canManage ? (
              <ToolSwitch on={agent.enabled} label={`Let Coderhelm ask ${agent.name}`} busy={switching} onToggle={toggle} />
            ) : (
              <Chip tone={agent.enabled ? "success" : "muted"}>{agent.enabled ? "On" : "Off"}</Chip>
            )
          }
        />
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

      <Tabs
        label="Agent views"
        value={tab}
        items={[
          { value: "overview", label: "Overview", href: tabHref("overview") },
          {
            value: "asks",
            label: "Asks",
            href: tabHref("asks"),
            count: asks && asks.length > 0 ? <span className="text-xs tabular-nums text-zinc-500">{asks.length}</span> : undefined,
            countText: asks && asks.length > 0 ? String(asks.length) : undefined,
          },
          { value: "instructions", label: "Instructions", href: tabHref("instructions") },
        ]}
      />

      {tab === "overview" && (
        <div className="mt-6 space-y-8">
          {/* When it's asked: the description is what Coderhelm decides on. */}
          <div className={`${card} p-5`}>
            <p className="text-xs font-medium text-zinc-500">Coderhelm asks this agent when</p>
            {agent.description ? (
              <p className="mt-1 text-sm text-zinc-200">{agent.description}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-400">Its file has no description.</p>
            )}
            {thinDescription(agent.description) && (
              <p className="mt-2 text-xs text-amber-300">
                Coderhelm&apos;s agents pick who to ask from this line alone, so a short or missing one means it&apos;s rarely asked. Say what kind of
                work it&apos;s for in the file&apos;s <Code>description:</Code>.
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

          <ReviewStepsSection item={agent} canManage={canManage} onSaved={(r) => setAgent({ ...agent, reviews: r })} />

          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className={sectionHeading}>
              When Coderhelm asks it
            </h2>
            <dl className={`${card} divide-y divide-zinc-800`}>
              <Fact term="Who asks it">The planner, coder and reviewer, at most 3 asks in one run.</Fact>
              <Fact term="Tools">
                <AgentTools tools={agent.agent_tools} toolsSet={settings.toolsSet} />
              </Fact>
              <Fact term="Model">
                Your team&apos;s {modelFor(settings.model)} model
                {settings.model && (
                  <span className="text-zinc-500">
                    {" "}
                    (the file says <Code>model: {settings.model}</Code>)
                  </span>
                )}
                .
              </Fact>
              <Fact term="Limits">
                {(agent.agent_tools?.granted.length ?? 0) > 0
                  ? "Up to 12 tool calls and 3 minutes, then an answer of up to 4k tokens."
                  : "One turn, up to 4k tokens and 3 minutes."}
                <SettingsMore summary="What else is limited">
                  {(agent.agent_tools?.granted.length ?? 0) > 0 && (
                    <p>Every call is kept in the activity log with the run that asked and this agent&apos;s name.</p>
                  )}
                  <p>
                    Secrets are removed from what it reads and from its answer, and the asking agent treats the answer as advice, never as
                    permission.
                  </p>
                </SettingsMore>
              </Fact>
            </dl>
          </section>

          <CompatSection
            item={agent}
            canManage={canManage}
            busy={busy}
            onRecheck={recheck}
            onUseTranslated={chooseTranslated}
            agentNote
            showText={!!agent.translated?.trim()}
          />
        </div>
      )}

      {tab === "asks" && (
        <div className="mt-6 space-y-10">
          <RecentAsks asks={asks} error={asksError} agent={agent} canAskAgain={canTry} onAskAgain={askAgain} />
          <ItemActivity item={agent} heading="Every read and ask" />
        </div>
      )}

      {tab === "instructions" && (
        <section aria-labelledby="instructions-heading" className="mt-6">
          <h2 id="instructions-heading" className="sr-only">
            Instructions
          </h2>
          <div className={`${card} p-5`}>
            <Markdown>{text.trim() || "_This file has no instructions after its settings._"}</Markdown>
            {front && (
              <details className="mt-3 border-t border-zinc-800 pt-3">
                <summary className={`cursor-pointer text-xs text-zinc-500 rounded ${focusRing}`}>File settings</summary>
                <CodeBlock code={front} lang="yaml" label="File settings" className="mt-2" />
              </details>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Read from the default branch. To change it, open a pull request to {agent.repo}; Coderhelm reads it again when that merges.
          </p>
        </section>
      )}

      {canTry && (
        <Modal open={tryOpen} onOpenChange={setTryOpen} title={`Try ${agent.name}`} returnFocus={tryButton}>
          <TryIt agent={agent} triesLeft={triesLeft} triesPerDay={triesPerDay} draft={draft} onAsked={loadAsks} />
        </Modal>
      )}
    </Page>
  );
}

/** What the agent reads with when it's asked, from its own file: the tools
 * it gets, and what its file lists that it doesn't. */
function AgentTools({ tools, toolsSet }: { tools?: AgentToolset; toolsSet: boolean }) {
  const granted = tools?.granted ?? [];
  const missing = tools?.missing ?? [];
  const blocked = tools?.blocked ?? [];
  return (
    <div className="space-y-2" data-testid="agent-tools">
      {granted.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-zinc-200">Read-only, the ones its file lists.</span>
          <ul className="flex flex-wrap gap-1.5" aria-label="Tools it gets">
            {granted.map((t) => (
              <li key={t}>
                <Code>{t}</Code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>
          <span className="text-zinc-200">None.</span> It answers from the question and the context it&apos;s sent.
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-zinc-400">
          <span className="text-zinc-500">Not available here:</span> <span className="text-zinc-300">{missing.join(", ")}</span>.
        </p>
      )}
      {blocked.length > 0 && (
        <p className="text-zinc-400">
          <span className="text-zinc-500">Write blocked:</span> <span className="text-zinc-300">{blocked.join(", ")}</span>.
        </p>
      )}
      <SettingsMore summary="How its tools work">
        {granted.length > 0 && (
          <p>
            When asked during work it can {[...new Set(granted.map(toolWords))].join(", ")}, in the repository and data the asking agent is
            working on.
          </p>
        )}
        {granted.length === 0 && !toolsSet && <p>Its file doesn&apos;t list tools, and an agent only gets the read-only tools its file lists.</p>}
        {missing.length > 0 && <p>Coderhelm has no read-only equivalent of {missing.join(", ")}, so it answers without them.</p>}
        {blocked.length > 0 && <p>Team agents never write; the planner, coder or reviewer that asked makes any change.</p>}
        <p>It never writes, runs commands, uses an MCP server or browses the web.</p>
      </SettingsMore>
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

const OUTCOME: Record<AgentAsk["outcome"], { tone: Tone; label: string; means: string }> = {
  answered: { tone: "success", label: "Answered", means: "The agent answered within its limits." },
  pending: { tone: "live", label: "Thinking…", means: "Waiting for the agent's answer." },
  failed: { tone: "danger", label: "No answer", means: "The model call failed, so the asking agent went on without it." },
  timed_out: { tone: "danger", label: "Took too long", means: "No answer within 3 minutes, so the asking agent went on without it." },
};

type Filter = "all" | "runs" | "tries" | "problems";
const matches = (a: AgentAsk, f: Filter) =>
  f === "runs" ? !isTry(a) : f === "tries" ? isTry(a) : f === "problems" ? a.outcome === "failed" || a.outcome === "timed_out" : true;

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
  const all = asks ?? [];
  const shown = useMemo(() => all.filter((a) => matches(a, filter)), [all, filter]);
  const count = (f: Filter) => all.filter((a) => matches(a, f)).length;
  return (
    <section aria-labelledby="asks-heading">
      <h2 id="asks-heading" className={sectionHeading}>
        Recent asks
      </h2>
      {error && (
        <div className="mb-3">
          <ListError title="We couldn't load the asks">{error}</ListError>
        </div>
      )}
      {asks === null ? (
        <ListSkeleton rows={3} label="Loading asks" />
      ) : asks.length === 0 ? (
        <ListEmpty title={`Nobody has asked ${agent.name} anything yet.`}>
          Each question Coderhelm&apos;s agents put to it shows here with the answer, for 30 days.
        </ListEmpty>
      ) : (
        <>
          <ListToolbar
            className="mb-3"
            status={{
              label: "Show asks",
              value: filter,
              onChange: (v) => setFilter(v as Filter),
              options: [
                { value: "all", label: "All", count: all.length },
                { value: "runs", label: "From runs", count: count("runs") },
                { value: "tries", label: "Tries", count: count("tries") },
                { value: "problems", label: "No answer", count: count("problems"), tone: "danger" },
              ],
            }}
          />
          {shown.length === 0 ? (
            <ListEmpty title="Nothing matches this filter." onClear={() => setFilter("all")} />
          ) : (
            <List label="Asks">
              {shown.map((a) => (
                <AskRow key={a.id} ask={a} currentSha={agent.sha} canAskAgain={canAskAgain} onAskAgain={onAskAgain} />
              ))}
            </List>
          )}
        </>
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

function AskRow({ ask, currentSha, canAskAgain, onAskAgain }: { ask: AgentAsk; currentSha: string; canAskAgain: boolean; onAskAgain: (q: string) => void }) {
  const [full, setFull] = useState(false);
  // A try still pending after five minutes was lost.
  const lost = ask.outcome === "pending" && Date.now() - new Date(ask.at).getTime() > 300_000;
  const o = lost ? OUTCOME.failed : (OUTCOME[ask.outcome] ?? OUTCOME.failed);
  const long = ask.answer.length > 420 || ask.answer.split("\n").length > 6;
  const older = ask.sha && currentSha && ask.sha !== currentSha;
  return (
    <ListRow
      testId="ask-row"
      status={{ tone: o.tone, live: o === OUTCOME.pending }}
      title={`${asker(ask.by)}${isTry(ask) ? " tried it" : " asked"}`}
      meta={[
        ask.origin && <Origin origin={ask.origin} />,
        ask.run_id && (
          <Link href={`/runs/detail?id=${encodeURIComponent(ask.run_id)}`} className={`underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
            View run
          </Link>
        ),
      ]}
      chips={
        <Chip tone={o.tone} title={o.means}>
          {o.label}
        </Chip>
      }
      time={ask.at}
      actions={
        canAskAgain && ask.outcome !== "pending" ? (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => onAskAgain(ask.question)}>
            Ask again
          </button>
        ) : undefined
      }
    >
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200 [overflow-wrap:anywhere]">{ask.question}</p>
      {ask.answer && (
        <div className="mt-2 rounded-md bg-zinc-950 px-3 py-2">
          <div className={!full && long ? "max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]" : ""}>
            <Markdown>{ask.answer}</Markdown>
          </div>
          {long && (
            <button type="button" className={`${linkButton} mt-1 text-xs`} onClick={() => setFull(!full)} aria-expanded={full}>
              {full ? "Show less" : "Show the whole answer"}
            </button>
          )}
        </div>
      )}
      {!ask.answer && o === OUTCOME.failed && !lost && <p className="mt-1 text-xs text-zinc-500">{o.means}</p>}
      <p className="mt-2 text-xs text-zinc-600 [overflow-wrap:anywhere]">
        {[
          ask.sha && (
            <span key="sha">
              file at {ask.sha.slice(0, 7)}
              {older && <span className="text-amber-400/80"> (an older version)</span>}
            </span>
          ),
          ask.context_chars > 0 && <span key="ctx">sent {ask.context_chars.toLocaleString()} characters of context, not kept</span>,
          ask.outcome !== "pending" && ask.model && (
            <span key="cost">
              {(ask.input_tokens + ask.output_tokens).toLocaleString()} tokens · {(ask.ms / 1000).toFixed(1)} s
            </span>
          ),
        ]
          .filter(Boolean)
          .flatMap((el, i) => (i > 0 ? [<span key={`sep${i}`}> · </span>, el] : [el]))}
      </p>
    </ListRow>
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

  // Closing the dialog while it waits stops the polling; the ask shows under
  // Asks, where its answer lands.
  const onAskedRef = useRef(onAsked);
  onAskedRef.current = onAsked;
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        onAskedRef.current();
      }
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
    <div data-testid="try-it">
      {triesLeft !== null && (
        <p className={`text-xs ${out ? "text-amber-300" : "text-zinc-500"}`}>
          {triesLeft} of {triesPerDay} tries left today
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-500">
        Ask it what Coderhelm&apos;s agents would, with your team&apos;s model.{" "}
        {(agent.agent_tools?.granted.length ?? 0) > 0
          ? "A try has no work to read, so it answers without its tools; asked during work, it reads that work's repository."
          : "It has no tools, here or during work."}
      </p>
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
            className={`${inputClass} mt-1.5 min-h-20 text-xs`}
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
            <CodeBlock code={sent} lang="markdown" title="What gets sent" wrap maxHeightClass="max-h-72" />
            <p className="mt-1 text-xs text-zinc-600">About {Math.ceil(sent.length / 4).toLocaleString()} tokens. No tools are sent.</p>
          </div>
        )}
      </form>
      {waiting && (
        <p role="status" className="mt-4 text-sm text-zinc-400">
          Waiting for {agent.name}. Most answers take under a minute; it stops at 3.
        </p>
      )}
      {result && (
        <div className="mt-4" aria-live="polite">
          {result.outcome === "answered" ? (
            <>
              <div className="max-h-[60vh] overflow-auto overscroll-contain rounded bg-zinc-950 px-4 py-3" tabIndex={0} data-testid="try-answer">
                <Markdown>{result.answer}</Markdown>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-600">
                  {(result.input_tokens + result.output_tokens).toLocaleString()} tokens · {(result.ms / 1000).toFixed(1)} s
                </span>
                <span className="flex gap-2">
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={() => copy(result.answer)}>
                    Copy
                  </button>
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setResult(null)}>
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
    </div>
  );
}
