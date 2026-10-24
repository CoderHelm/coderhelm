"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/list";
import { StreamingCursor } from "@/components/streaming-cursor";
import { focusRing, linkButton } from "@/components/ui";
import { CITATION_KIND, linkCitations, type Citation } from "@/lib/brain";

// One answer: its text with numbered citation markers, the sources it cites
// underneath, and the passage behind a citation in a dialog on click. An
// answer nothing supported says so plainly, with no sources listed.

export interface ToolStep {
  id: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
}

function asOfWords(asOf: string): string {
  if (!asOf) return "";
  return asOf.includes("UTC") ? `read ${asOf}` : `as of ${asOf.slice(0, 10)}`;
}

export function CitationList({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation) => void }) {
  if (!citations.length) return null;
  return (
    <ol className="mt-3 flex flex-col gap-1.5" aria-label="Sources" data-testid="citation-list">
      {citations.map((c, i) => (
        <li key={c.id} className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(c)}
            data-testid="citation"
            className={`flex w-full min-w-0 items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-left text-xs hover:border-zinc-600 ${focusRing}`}
          >
            <span className="mt-px inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-zinc-800 px-1 text-[10px] font-semibold text-zinc-300">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-200">{c.title}</span>
              <span className="block truncate text-zinc-500">
                {[CITATION_KIND[c.kind] ?? c.kind, c.base, c.loc, asOfWords(c.as_of)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {c.authoritative && (
              <span className="shrink-0">
                <Chip tone="success">Source of truth</Chip>
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function PassageDialog({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  return (
    <Modal
      open={!!citation}
      onOpenChange={(o) => !o && onClose()}
      title={citation?.title ?? ""}
      description={citation ? [CITATION_KIND[citation.kind] ?? citation.kind, citation.base, citation.loc, asOfWords(citation.as_of)].filter(Boolean).join(" · ") : undefined}
    >
      {citation && (
        <div data-testid="passage">
          {citation.authoritative && (
            <p className="mb-2">
              <Chip tone="success">Source of truth</Chip>
            </p>
          )}
          <blockquote className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-300">
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

export function AnswerView({
  text,
  citations,
  grounded,
  streaming,
  steps,
}: {
  text: string;
  citations: Citation[];
  grounded: boolean;
  streaming?: boolean;
  steps?: ToolStep[];
}) {
  const [open, setOpen] = useState<Citation | null>(null);
  const byId = (id: string) => citations.find((c) => c.id === id) ?? null;
  return (
    <div className="min-w-0" data-testid="answer">
      {steps && steps.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1 text-xs text-zinc-500" aria-label="What it looked up">
          {steps.map((s) => (
            <li key={s.id} className="flex min-w-0 items-center gap-1.5" data-testid="tool-step">
              <span aria-hidden="true" className={s.status === "error" ? "text-red-400" : s.status === "running" ? "text-amber-400" : "text-emerald-400"}>
                {s.status === "running" ? "•" : s.status === "error" ? "✕" : "✓"}
              </span>
              <span className="min-w-0 truncate">
                {s.label}
                {s.summary ? ` · ${s.summary}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!grounded && !streaming ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid="no-source-answer">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Not in your sources</p>
          <p className="mt-1 text-sm text-zinc-300">{text}</p>
        </div>
      ) : (
        <>
          <ChatMarkdown onCite={(id) => setOpen(byId(id))}>{streaming ? text : linkCitations(text, citations)}</ChatMarkdown>
          {streaming && <StreamingCursor />}
        </>
      )}
      {!streaming && <CitationList citations={citations} onOpen={setOpen} />}
      <PassageDialog citation={open} onClose={() => setOpen(null)} />
    </div>
  );
}
