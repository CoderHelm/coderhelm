"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/list";
import { Markdown } from "@/components/markdown";
import { buttonClass, focusRing, inputClass } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { askBrain, brainApi, groupSources, linkCitations, type AskBody, type Citation, type Rating } from "@/lib/brain";
import { KIND_LABEL } from "@/lib/knowledge";
import { citedLabels, kbAsk, labelMarkers, passageKey, type Passage, type SearchResult } from "@/lib/knowledge-ask";
import { dayWords, isKind } from "@/lib/knowledge-page";

// Ask this knowledge base: a question box with suggested questions. By
// default a cited answer from Chat, read from this base only (saved as a
// Chat thread marked as asked from here); "Passages only" shows what a
// search finds instead, ranked with a score bar, at no AI cost. Each
// passage says whether the answer cited it, and links to the original.

interface AnswerState {
  question: string;
  threadId: string;
  text: string;
  citations: Citation[];
  retrieved: Citation[];
  grounded: boolean;
  done: boolean;
  error: string | null;
}

export function Ask({
  kbId,
  ready,
  bringingIn,
  canAsk,
}: {
  kbId: string;
  /** Pages searchable now. */
  ready: number;
  /** A first sync is still bringing pages in. */
  bringingIn: boolean;
  /** The person may ask Chat (passages only otherwise). */
  canAsk: boolean;
}) {
  const [q, setQ] = useState("");
  const [passagesOnly, setPassagesOnly] = useState(!canAsk);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [found, setFound] = useState<(SearchResult & { question: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [showPassages, setShowPassages] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ready) return;
    kbAsk
      .suggestions(kbId)
      .then((r) => setSuggested(r.questions))
      .catch(() => setSuggested([]));
  }, [kbId, ready]);
  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setRating(null);
    try {
      if (passagesOnly) {
        const r = await kbAsk.search(kbId, text);
        setFound({ ...r, question: text });
        return;
      }
      const state: AnswerState = { question: text, threadId: "", text: "", citations: [], retrieved: [], grounded: true, done: false, error: null };
      setAnswer({ ...state });
      setShowPassages(false);
      abort.current = new AbortController();
      const body: AskBody & { origin: string } = { question: text, mentions: [{ kind: "knowledge", id: kbId }], attachments: [], origin: "kb_page" };
      await askBrain(
        body,
        (ev) => {
          if (ev.type === "thread") state.threadId = ev.id;
          else if (ev.type === "retrieved") state.retrieved = ev.sources;
          else if (ev.type === "text_delta") state.text += ev.text;
          else if (ev.type === "text_reset") state.text = "";
          else if (ev.type === "answer") {
            state.text = ev.text;
            state.citations = ev.citations;
            state.grounded = ev.grounded;
          } else if (ev.type === "error") state.error = ev.message;
          else if (ev.type === "done") state.done = true;
          setAnswer({ ...state });
        },
        abort.current.signal,
      );
      state.done = true;
      setAnswer({ ...state });
    } catch (e) {
      setError(errorMessage(e, "Couldn't ask that right now."));
    } finally {
      setBusy(false);
    }
  };

  const rate = async (r: Rating) => {
    if (!answer?.threadId) return;
    const next = rating === r ? null : r;
    try {
      const t = await brainApi.thread(answer.threadId);
      const last = [...t.messages].reverse().find((m) => m.role === "assistant");
      if (!last) return;
      await brainApi.rate(answer.threadId, last.seq, next);
      setRating(next);
    } catch (e) {
      setError(errorMessage(e, "Couldn't save that."));
    }
  };

  if (!ready) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-6 text-sm text-zinc-400" data-testid="ask-waiting">
        Ask opens once the first page is searchable.
      </p>
    );
  }

  const { docs, numberOf } = groupSources(answer?.citations ?? []);
  const cited = citedLabels(answer?.citations ?? [], numberOf);
  const sameQuestion = !!answer && !!found && answer.question === found.question;
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4" data-testid="ask">
      <form
        className="flex min-w-0 flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Your question</span>
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask a question these pages answer"
            maxLength={2000}
            data-testid="ask-input"
          />
        </label>
        <button type="submit" className={buttonClass("primary", "md")} disabled={busy || !q.trim()} data-testid="ask-submit">
          {busy ? (passagesOnly ? "Searching…" : "Answering…") : passagesOnly ? "Search" : "Ask"}
        </button>
      </form>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={passagesOnly} disabled={!canAsk || busy} onChange={(e) => setPassagesOnly(e.target.checked)} data-testid="ask-passages-only" />
          Passages only <span className="text-zinc-400">(free: no AI answer)</span>
        </label>
        {bringingIn && <span>Answers use the {ready.toLocaleString()} pages brought in so far.</span>}
      </div>
      {suggested.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2" data-testid="ask-suggestions">
          <span className="text-xs text-zinc-400">Try</span>
          {suggested.map((s) => (
            <button
              key={s}
              type="button"
              className={`min-w-0 max-w-full truncate rounded-full border border-zinc-800 px-3 py-1 text-left text-xs text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 ${focusRing}`}
              onClick={() => {
                setQ(s);
                void ask(s);
              }}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-orange-300" role="alert" data-testid="ask-error">
          {error}
        </p>
      )}

      {!passagesOnly && answer && (
        <div className="mt-4 border-t border-zinc-800 pt-4" data-testid="ask-answer" aria-live="polite">
          {answer.error ? (
            <p className="text-sm text-orange-300">{answer.error}</p>
          ) : answer.text ? (
            <div className="min-w-0 text-sm leading-relaxed text-zinc-200 [overflow-wrap:anywhere]">
              <Markdown>{labelMarkers(linkCitations(answer.text, numberOf))}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-zinc-400" role="status">
              Reading the passages…
            </p>
          )}
          {answer.done && !answer.error && (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={rating === "up"}
                className={`${buttonClass("ghost", "sm")} ${rating === "up" ? "text-emerald-300" : ""}`}
                onClick={() => rate("up")}
                disabled={!answer.threadId}
                data-testid="ask-up"
              >
                Helpful
              </button>
              <button
                type="button"
                aria-pressed={rating === "down"}
                className={`${buttonClass("ghost", "sm")} ${rating === "down" ? "text-orange-300" : ""}`}
                onClick={() => rate("down")}
                disabled={!answer.threadId}
                data-testid="ask-down"
              >
                Not helpful
              </button>
              {answer.threadId && (
                <Link href={`/chat?thread=${encodeURIComponent(answer.threadId)}`} className={`ml-auto rounded text-sm text-zinc-300 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`} data-testid="ask-continue">
                  Continue in Chat
                </Link>
              )}
            </div>
          )}
          {answer.retrieved.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                className={`rounded text-xs text-zinc-400 hover:text-zinc-100 ${focusRing}`}
                aria-expanded={showPassages}
                onClick={() => setShowPassages((v) => !v)}
                data-testid="ask-sources-toggle"
              >
                {showPassages ? "Hide" : "Show"} {answer.retrieved.length} {answer.retrieved.length === 1 ? "passage" : "passages"} read · {docs.length} cited
              </button>
              {showPassages && (
                <ol className="mt-2 space-y-2">
                  {answer.retrieved.map((c, i) => (
                    <PassageRow
                      key={`${c.id}-${i}`}
                      p={{ rank: i + 1, score_pct: -1, score: 0, file_id: "", title: c.title, loc: c.loc, as_of: c.as_of, text: c.passage, url: c.url ?? "", source_kind: c.source_kind ?? "", authoritative: c.authoritative }}
                      cited={answer.done ? (cited.get(passageKey(c)) ?? null) : undefined}
                    />
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}

      {passagesOnly && found && (
        <div className="mt-4 border-t border-zinc-800 pt-4" data-testid="ask-passages" aria-live="polite">
          <p className="text-xs text-zinc-400">
            {found.passages.length
              ? `${found.passages.length} ${found.passages.length === 1 ? "passage" : "passages"}, best first. A score is against the best match.`
              : "No passage scored high enough to use. Try other words, or add the page that answers it."}
            {found.reindexing > 0 && ` ${found.reindexing} pages are being indexed again and weren't searched.`}
          </p>
          {found.unreached.length > 0 && <p className="mt-1 text-xs text-orange-300">{found.unreached.join(" ")}</p>}
          <ol className="mt-2 space-y-2">
            {found.passages.map((p) => (
              <PassageRow key={`${p.file_id}-${p.rank}`} p={p} cited={sameQuestion ? (cited.get(passageKey(p)) ?? null) : undefined} />
            ))}
          </ol>
          {found.passages.length > 0 && <p className="mt-2 text-xs text-zinc-400">Nothing else scored high enough to use.</p>}
        </div>
      )}
    </div>
  );
}

/** One passage: its rank, a score bar (when scored), whether the answer cited it, and where it is. */
function PassageRow({ p, cited }: { p: Passage; cited?: string | null }) {
  const [open, setOpen] = useState(false);
  const short = p.text.length > 300 && !open ? `${p.text.slice(0, 300).trimEnd()}…` : p.text;
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-3" data-testid="ask-passage">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-400">{p.rank}</span>
        {p.score_pct >= 0 && (
          <span className="inline-flex shrink-0 items-center gap-2" title={`Fused score ${p.score.toFixed(4)}`} data-testid="ask-score">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
              <span className="block h-full rounded-full bg-sky-400" style={{ width: `${Math.max(3, p.score_pct)}%` }} />
            </span>
            <span className="w-8 text-xs tabular-nums text-zinc-300">{p.score_pct}</span>
          </span>
        )}
        <span className="min-w-0 flex-1 basis-40 truncate text-sm text-zinc-100">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={`rounded hover:underline ${focusRing}`}>
              {p.title}
              <span className="sr-only"> (opens in {isKind(p.source_kind) ? KIND_LABEL[p.source_kind] : "the original"})</span>
            </a>
          ) : (
            p.title
          )}
          {p.loc && <span className="text-zinc-400"> › {p.loc}</span>}
        </span>
        {p.authoritative && <Chip tone="success">Source of truth</Chip>}
        {cited !== undefined && <Chip tone={cited ? "info" : "muted"}>{cited ? `Cited as ${cited}` : "Not used"}</Chip>}
      </div>
      <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{short}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        {p.as_of && <span>Updated {dayWords(p.as_of)}</span>}
        {p.text.length > 300 && (
          <button type="button" className={`rounded underline underline-offset-4 hover:text-zinc-100 ${focusRing}`} onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Show the whole passage"}
          </button>
        )}
      </div>
    </li>
  );
}
