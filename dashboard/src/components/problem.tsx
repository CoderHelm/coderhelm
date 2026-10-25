"use client";

import type { ReactNode } from "react";
import { CodeBlock } from "./code-block";
import { AlertCircleIcon, WarningIcon } from "./icons";
import { secondaryButton } from "./ui";

/**
 * Something went wrong, said the way a person needs it: a plain headline,
 * what to do next (a sentence and a button), and the raw technical text
 * folded away under "Technical details" for whoever needs it.
 *
 *   <Problem title="Couldn't load your rules" onRetry={load} details={err.message}>
 *     Nothing was changed. Check your connection and try again.
 *   </Problem>
 *
 * Never show a raw error, stack trace or JSON as the main text: pass it as
 * `details`.
 */
export function Problem({
  title,
  children,
  details,
  detailsLang,
  onRetry,
  retryLabel = "Try again",
  action,
  tone = "error",
  compact = false,
  testId = "problem",
}: {
  title: ReactNode;
  /** What happened and what to do next, in plain words. */
  children?: ReactNode;
  /** The raw error, stack trace or payload; folded under "Technical details". */
  details?: string | null;
  detailsLang?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Another next step (a link to fix it, "Get help"). */
  action?: ReactNode;
  /** "warning" for a problem that doesn't stop the page. */
  tone?: "error" | "warning";
  /** No box: for a problem inside a row or a card. */
  compact?: boolean;
  testId?: string;
}) {
  const raw = details?.trim();
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`flex min-w-0 gap-3 text-sm ${
        compact ? "" : `rounded-lg border px-4 py-3 ${tone === "error" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`
      }`}
    >
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${tone === "error" ? "text-red-400" : "text-amber-400"}`}>
        {tone === "error" ? <AlertCircleIcon /> : <WarningIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-50">{title}</p>
        <div className="mt-0.5 max-w-prose text-zinc-300">{children ?? "Check your connection and try again."}</div>
        {(onRetry || action) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onRetry && (
              <button type="button" onClick={onRetry} className={secondaryButton}>
                {retryLabel}
              </button>
            )}
            {action}
          </div>
        )}
        {raw && <TechnicalDetails text={raw} lang={detailsLang} />}
      </div>
    </div>
  );
}

/** Raw text (an error, a payload, a stack trace) folded behind "Technical details". */
export function TechnicalDetails({ text, lang, summary = "Technical details" }: { text: string; lang?: string; summary?: string }) {
  return (
    <details className="group mt-3 min-w-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          <path d="M9 6l6 6-6 6" />
        </svg>
        {summary}
      </summary>
      <div className="mt-2 min-w-0">
        <CodeBlock code={text} lang={lang} wrap maxHeightClass="max-h-72" />
      </div>
    </details>
  );
}

/** The first line of a raw error, cut to a sentence's length, for a one-line summary. */
export function firstLine(raw: string | null | undefined, max = 140): string {
  const line = (raw ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
