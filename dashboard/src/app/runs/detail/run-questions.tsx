"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, type RunAnswer, type RunDetail, type RunQuestion } from "@/lib/api";
import { buttonClass, fullWidthOnPhone, inputClass, linkButton, primaryButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { Time } from "@/components/list";
import { useToast } from "@/components/toast";

// A run that stopped to ask: its questions in plain words, each with why it
// matters, and (for people who may start runs) one answer box per question.
// Sending posts the answers on the ticket as a reply from the person and
// starts the work again with them; the gateway refuses a run that moved on.

/** The longest answer the gateway takes. */
const MAX_ANSWER = 4000;

function ticketWord(source?: string) {
  return source === "jira" ? "Jira ticket" : "issue";
}

function TicketLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${linkButton} gap-1`}>
      {children}
      <ExternalLinkIcon />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Words for a failed send. The gateway's own sentence when it sent one. */
function sendError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Only members can answer a run's questions. Ask an admin for member access.";
    if (e.status === 429) return "The monthly token limit is reached, so no new work can start.";
    if (e.message && e.status !== 500) return e.message;
  }
  return "Your answer wasn't sent. Try again in a moment.";
}

export function RunQuestions({
  run,
  canAnswer,
  limitTitle,
  retry,
  onAnswered,
}: {
  run: RunDetail;
  /** The person may start runs (member and up) and no limit is reached. */
  canAnswer: boolean;
  /** Why sending is off, when a monthly limit is reached. */
  limitTitle?: string;
  /** The Retry button, for a ticket edited directly. */
  retry?: React.ReactNode;
  /** After sending, or when the run moved on: read the run again. */
  onAnswered: () => void;
}) {
  const questions: RunQuestion[] = run.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstBox = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const { toast } = useToast();
  const many = questions.length > 1;
  const where = ticketWord(run.ticket_source);
  const written = questions.filter((q) => (answers[q.id] ?? "").trim());

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!written.length) {
      setError(many ? "Write an answer to at least one question." : "Write your answer first.");
      firstBox.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.answerRun(
        run.run_id,
        written.map((q) => ({ question_id: q.id, answer: answers[q.id].trim() })),
      );
      toast(
        r.posted
          ? `Sent. Your answer is on the ${where} and Coderhelm is continuing.`
          : `Coderhelm is continuing with your answer. It couldn't post it on the ${where}.`,
      );
      onAnswered();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast(err.message, "error");
        onAnswered();
      } else {
        setError(sendError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} noValidate aria-label="Coderhelm's questions" className="space-y-3 pt-1" data-testid="run-questions">
      <p>
        {many ? `It stopped to ask ${questions.length} questions.` : "It stopped to ask one question."}{" "}
        {canAnswer ? "Answer here and it carries on." : `Ask someone with member access to answer here, or reply on the ${where}.`}
      </p>
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const boxId = `answer-${run.run_id}-${q.id}`;
          return (
            <li key={q.id} data-testid="run-question" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="font-medium text-zinc-100 [overflow-wrap:anywhere]">
                {many && <span className="tabular-nums text-zinc-400">{i + 1}. </span>}
                {q.question}
              </p>
              {q.why && <p className="mt-1 text-zinc-400 [overflow-wrap:anywhere]" data-testid="run-question-why">{q.why}</p>}
              {canAnswer && (
                <div className="mt-3">
                  <label htmlFor={boxId} className="mb-1 block text-sm font-medium text-zinc-200">
                    {many ? `Your answer to question ${i + 1}` : "Your answer"}
                  </label>
                  {!!q.suggestions?.length && (
                    <div
                      className="mb-2 flex flex-wrap items-center gap-2"
                      aria-label={q.decision ? "Choices" : "Possible answers Coderhelm found"}
                      role="group"
                    >
                      <span className="text-xs text-zinc-400">{q.decision ? "Choose:" : "Possible answers:"}</span>
                      {q.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setAnswers((a) => ({ ...a, [q.id]: s }));
                            setError(null);
                          }}
                          aria-pressed={answers[q.id] === s}
                          className={`${buttonClass(q.decision && answers[q.id] === s ? "primary" : "secondary", "sm")}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    id={boxId}
                    ref={i === 0 ? firstBox : undefined}
                    rows={3}
                    maxLength={MAX_ANSWER}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => {
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }));
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                    }}
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error && !written.length ? true : undefined}
                    disabled={busy}
                    placeholder={many ? "Leave blank if you don't know" : "Type your answer"}
                    className={`${inputClass} min-h-20 resize-y`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {canAnswer && (
          <button type="submit" disabled={busy || !!limitTitle} title={limitTitle} className={`${primaryButton} ${fullWidthOnPhone}`}>
            {busy ? "Sending…" : many ? "Send answers and continue" : "Send answer and continue"}
          </button>
        )}
        {retry}
        {run.questions_url && <TicketLink href={run.questions_url}>See it on the ticket</TicketLink>}
      </div>
      {canAnswer && (
        <p className="text-xs text-zinc-400">
          Your answer is posted on the {where} as a reply from you. Changed the {where} instead? Retry reads it again.
        </p>
      )}
    </form>
  );
}

/** A run whose questions were answered here: what was asked and answered, and where the work went on. */
export function RunAnswered({ run }: { run: RunDetail }) {
  const answers: RunAnswer[] = run.answers ?? [];
  return (
    <div className="space-y-3 pt-1" data-testid="run-answered">
      <dl className="space-y-3">
        {answers.map((a) => (
          <div key={a.question_id} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <dt className="text-zinc-400 [overflow-wrap:anywhere]">{a.question}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-zinc-100 [overflow-wrap:anywhere]">{a.answer}</dd>
            <dd className="mt-1 text-xs text-zinc-400">
              {a.author || "A teammate"}
              {a.answered_at ? <> · <Time iso={a.answered_at} /></> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {run.continued_run_id && (
          <Link href={`/runs/detail?id=${encodeURIComponent(run.continued_run_id)}`} className={`${primaryButton} ${fullWidthOnPhone}`}>
            Open the run that continued
          </Link>
        )}
        {run.answers_url && <TicketLink href={run.answers_url}>See the reply on the ticket</TicketLink>}
      </div>
    </div>
  );
}
