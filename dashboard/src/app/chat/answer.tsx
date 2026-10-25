"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/list";
import { StreamingCursor } from "@/components/streaming-cursor";
import { copyText } from "@/components/copy-button";
import {
  BookIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DatabaseIcon,
  LogsIcon,
  MemoryIcon,
  PaperclipIcon,
  PluginIcon,
  RetryIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/icons";
import { ChevronDownIcon, LoaderIcon } from "@/components/stream-icons";
import { focusRing, linkButton } from "@/components/ui";
import { CITATION_KIND, citationName, citationWhen, linkCitations, withoutCitations, type Citation, type Rating } from "@/lib/brain";

// One answer: how it was found (folded once it is done), its text with a
// small chip for each source it leans on (the source's icon and name), the
// sources as cards underneath, and a row of actions (copy, try again, rate).
// A chip or a card opens the passage behind it. An answer nothing supported
// says so plainly, with no sources listed.

export interface ToolStep {
  id: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
}

/** The icon for a kind of source. */
export function SourceIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "code":
      return <CodeIcon />;
    case "upload":
      return <PaperclipIcon />;
    case "connection":
      return <PluginIcon />;
    case "data_source":
      return <DatabaseIcon />;
    case "memory":
      return <MemoryIcon />;
    case "skill":
      return <BookIcon />;
    default:
      return <LogsIcon />;
  }
}

/** "paid [S1]." reads "paid. [S1]": a chip sits after the sentence it backs. */
const afterSentence = (text: string) => text.replace(/\s*(\[S\d+(?:\s*[,;]\s*S\d+)*\](?:\s*\[S\d+(?:\s*[,;]\s*S\d+)*\])*)([.!?])/g, "$2 $1");

const metaOf = (c: Citation) => [CITATION_KIND[c.kind] ?? c.kind, c.base, c.loc, citationWhen(c.as_of)].filter(Boolean).join(" · ");

/** A source inside the answer's text: a small chip with its icon and name. */
function CiteChip({ c, onOpen }: { c: Citation; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="cite-marker"
      aria-label={`Source: ${c.title}`}
      title={c.title}
      className={`mx-0.5 inline-flex h-[1.375rem] max-w-[12rem] translate-y-[-1px] items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-800/80 px-2 align-middle text-[0.72rem] font-medium leading-none text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 motion-reduce:transition-none [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0 ${focusRing}`}
    >
      <SourceIcon kind={c.kind} />
      <span className="min-w-0 truncate">{citationName(c)}</span>
    </button>
  );
}

const SHOWN_SOURCES = 4;

export function CitationList({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation) => void }) {
  const [all, setAll] = useState(false);
  if (!citations.length) return null;
  const shown = all ? citations : citations.slice(0, SHOWN_SOURCES);
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-zinc-500">Sources</p>
      <ol className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="Sources" data-testid="citation-list">
        {shown.map((c) => {
          return (
            <li key={c.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(c)}
                data-testid="citation"
                className={`flex h-full w-full min-w-0 items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900 motion-reduce:transition-none ${focusRing}`}
              >
                <span aria-hidden="true" className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 [&_svg]:h-3.5 [&_svg]:w-3.5">
                  <SourceIcon kind={c.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{c.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">{metaOf(c)}</span>
                  {c.authoritative && (
                    <span className="mt-1.5 block">
                      <Chip tone="success">Source of truth</Chip>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {citations.length > SHOWN_SOURCES && (
        <button type="button" onClick={() => setAll((a) => !a)} className={`${linkButton} mt-2 text-xs`}>
          {all ? "Show fewer sources" : `Show all ${citations.length} sources`}
        </button>
      )}
    </div>
  );
}

export function PassageDialog({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  return (
    <Modal open={!!citation} onOpenChange={(o) => !o && onClose()} title={citation?.title ?? ""} description={citation ? metaOf(citation) : undefined} wide>
      {citation && (
        <div data-testid="passage">
          {citation.authoritative && (
            <p className="mb-2">
              <Chip tone="success">Source of truth</Chip>
            </p>
          )}
          <blockquote className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-emerald-500/60 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">
            {citation.passage}
          </blockquote>
          {citation.href && citation.href.startsWith("/") && (
            <p className="mt-3">
              <Link href={citation.href} className={linkButton}>
                Open where it came from
              </Link>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

const actionButton = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 aria-pressed:text-zinc-100 [&_svg]:h-[15px] [&_svg]:w-[15px] ${focusRing}`;

function Steps({ steps, streaming }: { steps: ToolStep[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const running = steps.some((s) => s.status === "running");
  const list = (
    <ul className="mt-1.5 flex flex-col gap-1 border-l border-zinc-800 pl-3 text-xs text-zinc-500" aria-label="What it looked up">
      {steps.map((s) => (
        <li key={s.id} className="flex min-w-0 items-center gap-1.5" data-testid="tool-step">
          <span aria-hidden="true" className={`shrink-0 [&_svg]:h-3 [&_svg]:w-3 ${s.status === "error" ? "text-red-400" : s.status === "running" ? "text-zinc-400" : "text-emerald-400"}`}>
            {s.status === "running" ? <LoaderIcon className="animate-spin motion-reduce:animate-none" /> : s.status === "error" ? "✕" : <CheckIcon />}
          </span>
          <span className="min-w-0 truncate">
            {s.label}
            {s.summary ? ` · ${s.summary}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
  if (streaming) return <div className="mb-3">{list}</div>;
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded text-xs text-zinc-500 hover:text-zinc-300 ${focusRing}`}
      >
        {running ? "Looking things up" : "How this was found"}
        <ChevronDownIcon className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && list}
    </div>
  );
}

export function AnswerView({
  text,
  citations,
  grounded,
  streaming,
  steps,
  rating,
  onRate,
  onRetry,
}: {
  text: string;
  citations: Citation[];
  grounded: boolean;
  streaming?: boolean;
  steps?: ToolStep[];
  /** The asker's rating; with `onRate`, the thumbs show. */
  rating?: Rating | null;
  onRate?: (r: Rating | null) => void;
  /** Ask the same question again (the latest answer only). */
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState<Citation | null>(null);
  const [copied, setCopied] = useState(false);
  const byId = (id: string) => citations.find((c) => c.id === id) ?? null;
  const waiting = streaming && !text;
  return (
    <div className="min-w-0" data-testid="answer">
      {steps && steps.length > 0 && <Steps steps={steps} streaming={!!streaming} />}
      {waiting ? (
        <p className="text-sm" data-testid="answer-waiting">
          <span className="animate-chat-shimmer">Looking through your team&apos;s work…</span>
        </p>
      ) : !grounded && !streaming ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3" data-testid="no-source-answer">
          <p className="text-sm font-medium text-zinc-100">Nothing found</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">{text}</p>
        </div>
      ) : (
        <div>
          <ChatMarkdown
            onCite={(id) => setOpen(byId(id))}
            renderCite={(id) => {
              const c = byId(id);
              return c ? <CiteChip key={id} c={c} onOpen={() => setOpen(c)} /> : null;
            }}
          >
            {streaming ? text.replace(/\s?\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, "") : linkCitations(afterSentence(text), citations)}
          </ChatMarkdown>
          {streaming && <StreamingCursor />}
        </div>
      )}
      {!streaming && <CitationList citations={citations} onOpen={setOpen} />}
      {!streaming && text && (
        <div className="-ml-2 mt-2 flex items-center gap-0.5" data-testid="answer-actions">
          <button
            type="button"
            className={actionButton}
            aria-label={copied ? "Copied" : "Copy answer"}
            title={copied ? "Copied" : "Copy"}
            data-testid="answer-copy"
            onClick={async () => {
              if (await copyText(withoutCitations(text))) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {onRetry && (
            <button type="button" className={actionButton} aria-label="Try again" title="Try again" data-testid="answer-retry" onClick={onRetry}>
              <RetryIcon />
            </button>
          )}
          {onRate && (
            <>
              <button
                type="button"
                className={actionButton}
                aria-label="Good answer"
                title="Good answer"
                aria-pressed={rating === "up"}
                data-testid="answer-up"
                onClick={() => onRate(rating === "up" ? null : "up")}
              >
                <ThumbsUpIcon />
              </button>
              <button
                type="button"
                className={actionButton}
                aria-label="Bad answer"
                title="Bad answer"
                aria-pressed={rating === "down"}
                data-testid="answer-down"
                onClick={() => onRate(rating === "down" ? null : "down")}
              >
                <ThumbsDownIcon />
              </button>
            </>
          )}
        </div>
      )}
      <PassageDialog citation={open} onClose={() => setOpen(null)} />
    </div>
  );
}
