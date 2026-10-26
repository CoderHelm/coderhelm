"use client";

import { useEffect, useMemo, useState } from "react";
import type { PassTrace } from "@/lib/api";
import { Markdown } from "@/components/markdown";
import { DetailBlock, List, ListRow, ListSection, StatusText } from "@/components/list";
import { agentHref, asker, skillsApi, type AgentAsk } from "@/lib/skills";
import {
  STEP_TITLE,
  askCost,
  askCostText,
  askDuration,
  isReviewAsk,
  outcomeOf,
  stepOf,
  stepResults,
  summaryLine,
  whatNext,
  type Gap,
  type Step,
  type StepResult,
} from "./asks";

// The run's asks to the team's own agents, as a timeline: one line a run
// read at a glance (summary on top, one row per ask with who asked, which
// agent, how it went, how long and what it cost), each opening to its
// answer, one at a time. Review steps send the same framing question every
// time, so it is shown once, not on every row. Many asks group by step.

/** More asks than this group by step under their own headings. */
const GROUP_OVER = 5;

const STEP_ORDER: Step[] = ["plan", "prose", "code", "question"];

const agentName = (a: AgentAsk) => a.path.split("/").pop()?.replace(/\.md$/, "") ?? a.path;

export function TeamAgentAsks({ runId, status, traces = [] }: { runId: string; status: string; traces?: PassTrace[] }) {
  const [asks, setAsks] = useState<AgentAsk[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    skillsApi
      .runAsks(runId)
      .then((r) => setAsks([...r.asks].sort((a, b) => a.at.localeCompare(b.at))))
      .catch(() => {});
  }, [runId, status]);

  const results = useMemo(() => stepResults(traces), [traces]);
  const groups = useMemo(
    () =>
      STEP_ORDER.map((step) => ({ step, asks: asks.filter((a) => stepOf(a) === step) })).filter((g) => g.asks.length > 0),
    [asks],
  );

  if (asks.length === 0) return null;
  const grouped = asks.length > GROUP_OVER && groups.length > 1;
  const framing = asks.find(isReviewAsk)?.question;
  const rows = (list: AgentAsk[]) => (
    <List label="Asks">
      {list.map((a) => (
        <AskRow
          key={a.id}
          ask={a}
          results={results}
          open={openId === a.id}
          onOpenChange={(o) => setOpenId(o ? a.id : null)}
        />
      ))}
    </List>
  );
  const nextLine = (step: Step, list: AgentAsk[]) => {
    const next = whatNext(step, list, results);
    return next ? (
      <p className="mt-2 flex gap-1.5 pl-4 text-xs text-zinc-400">
        <span aria-hidden="true" className="text-zinc-400">↳</span>
        <span data-testid={`asks-next-${step}`}>{next}</span>
      </p>
    ) : null;
  };

  return (
    <section className="mb-6 min-w-0" aria-labelledby="team-asks-heading" data-testid="team-asks">
      <h2 id="team-asks-heading" className="text-sm font-medium text-zinc-300">
        Team agents asked <span className="font-normal text-zinc-500">({asks.length})</span>
      </h2>
      <p className="mt-0.5 mb-3 text-xs text-zinc-400" data-testid="asks-summary">{summaryLine(asks, results)}</p>

      {grouped ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <ListSection key={g.step} id={`asks-${g.step}`} title={STEP_TITLE[g.step]} count={g.asks.length} level={3}>
              {rows(g.asks)}
              {nextLine(g.step, g.asks)}
            </ListSection>
          ))}
        </div>
      ) : (
        <>
          {rows(asks)}
          {groups.map((g) => (
            <div key={g.step}>{nextLine(g.step, g.asks)}</div>
          ))}
        </>
      )}

      {framing && (
        <details className="group mt-2 text-xs text-zinc-400">
          <summary className="inline-flex min-h-7 cursor-pointer list-none items-center gap-1 rounded hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
            What the reviewing agents were asked
          </summary>
          <p className="mt-1 max-w-prose whitespace-pre-wrap rounded-md bg-zinc-900/60 px-3 py-2 text-zinc-400">{framing}</p>
          <p className="mt-1 max-w-prose">The same for every review step, with the draft given as context.</p>
        </details>
      )}
    </section>
  );
}

function AskRow({
  ask,
  results,
  open,
  onOpenChange,
}: {
  ask: AgentAsk;
  results: Map<string, StepResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const o = outcomeOf(ask);
  const review = isReviewAsk(ask);
  const name = agentName(ask);
  return (
    <ListRow
      testId="ask-row"
      status={{ tone: o.tone, live: o.tone === "live" }}
      title={name}
      href={agentHref(ask)}
      meta={[`Asked by the ${asker(ask.by)}`, askDuration(ask.ms), askCostText(askCost(ask, results))]}
      chips={<StatusText look={{ label: o.label, tone: o.tone, live: o.tone === "live" }} />}
      time={ask.at}
      details={<AskDetails ask={ask} gaps={o.gaps} review={review} />}
      detailsLabel={review && o.gaps.length > 0 ? "Gaps" : ask.outcome === "answered" ? "Answer" : "Details"}
      detailsFor={`${name}'s answer`}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function AskDetails({ ask, gaps, review }: { ask: AgentAsk; gaps: Gap[]; review: boolean }) {
  const noAnswer =
    ask.outcome === "timed_out"
      ? `No answer: ${agentName(ask)} took longer than it is given${askDuration(ask.ms) ? ` (${askDuration(ask.ms)})` : ""}.`
      : ask.outcome === "failed"
        ? `No answer: ${agentName(ask)} couldn't be asked.`
        : ask.outcome === "pending"
          ? "Still thinking."
          : null;
  return (
    <>
      {!review && (
        <DetailBlock title="Asked">
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{ask.question}</p>
        </DetailBlock>
      )}
      {noAnswer ? (
        <p>{noAnswer}</p>
      ) : review ? (
        gaps.length === 0 ? (
          <p>No gaps found.</p>
        ) : (
          <ol className="space-y-2" aria-label="Gaps">
            {gaps.map((g, i) => (
              <li key={i} className="flex min-w-0 gap-2" data-testid="gap">
                <span className="w-4 shrink-0 text-right tabular-nums text-zinc-400">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  {g.file && (
                    <span className="mb-1 mr-1.5 inline-flex rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-px font-mono text-xs text-zinc-300" data-testid="gap-file">
                      {g.file}
                    </span>
                  )}
                  <span className="text-sm text-zinc-300 [overflow-wrap:anywhere] [&_code]:text-xs [&_p]:mb-0 [&_p]:inline [&_p]:text-sm [&_p]:text-zinc-300">
                    <Markdown>{g.text}</Markdown>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : (
        <DetailBlock title="Answer">
          <div className="min-w-0 overflow-x-auto [&_p:last-child]:mb-0">
            <Markdown>{ask.answer || "_No text._"}</Markdown>
          </div>
        </DetailBlock>
      )}
      {(ask.input_tokens > 0 || ask.model) && (
        <p className="text-zinc-500">
          {[ask.model, ask.input_tokens + ask.output_tokens > 0 && `${(ask.input_tokens + ask.output_tokens).toLocaleString()} tokens`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </>
  );
}
