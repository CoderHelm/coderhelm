"use client";

// Where the preview of a web change stands: the repository's own preview
// deploy, its end-to-end checks on it, and the changed pages captured at
// desktop and phone width. A skipped preview check is a gap CoderHelm closes,
// so it is shown as not run yet, never as a result.

import type { RunPreview } from "@/lib/api";
import { SectionHeading } from "@/components/page";
import { Chip } from "@/components/list";
import { focusRing } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { previewWords } from "@/lib/waiting-line";

const OUTCOME_WORDS: Record<string, string> = {
  passed: "passed",
  failed: "failed",
  running: "running",
  skipped: "not run yet",
};

const OUTCOME_TONE: Record<string, string> = {
  passed: "text-emerald-300",
  failed: "text-red-300",
  running: "text-amber-300",
  skipped: "text-zinc-400",
};

/** Only an https address is followed or shown. */
const safe = (u: string) => (u.startsWith("https://") ? u : "");

export function RunPreviewPanel({ preview }: { preview: RunPreview | null | undefined }) {
  if (!preview || preview.stage === "not_needed") return null;
  const url = safe(preview.url ?? "");
  const shots = (preview.shots ?? []).filter((s) => safe(s.src));
  const pages = Array.from(new Set(shots.map((s) => s.page)));
  return (
    <section aria-labelledby="preview-heading" className="space-y-3" data-testid="run-preview" data-stage={preview.stage}>
      <SectionHeading id="preview-heading">Preview</SectionHeading>
      <p className="text-sm text-zinc-200" data-testid="run-preview-stage">
        {previewWords(preview.stage)}.
        {preview.why ? <span className="text-zinc-400"> {preview.why.trim().replace(/\.$/, "")}.</span> : null}
      </p>
      {(url || preview.labels_added?.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-sky-300 underline-offset-2 [overflow-wrap:anywhere] hover:underline ${focusRing}`} data-testid="run-preview-url">
              Open the preview
              <ExternalLinkIcon />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          {preview.labels_added?.length > 0 && (
            <span className="text-zinc-400" data-testid="run-preview-labels">
              Started with {preview.labels_added.map((l) => (
                <Chip key={l}>{l}</Chip>
              ))}
            </span>
          )}
        </p>
      )}
      {preview.e2e_required && (
        <p className="text-sm text-zinc-400" data-testid="run-preview-e2e-spec">
          {preview.e2e_covered ? "The change adds or updates an end-to-end spec for what it changes." : "The change has no end-to-end spec for what it changes yet; CoderHelm writes one."}
        </p>
      )}
      {preview.checks?.length > 0 && (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="run-preview-checks">
          {preview.checks.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm" data-testid="run-preview-check" data-outcome={c.outcome}>
              {safe(c.url) ? (
                <a href={safe(c.url)} target="_blank" rel="noopener noreferrer" className={`min-w-0 text-zinc-200 underline underline-offset-4 [overflow-wrap:anywhere] hover:text-zinc-50 ${focusRing}`}>
                  {c.name}
                </a>
              ) : (
                <span className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">{c.name}</span>
              )}
              <span className={`shrink-0 text-xs ${OUTCOME_TONE[c.outcome] ?? "text-zinc-400"}`}>{OUTCOME_WORDS[c.outcome] ?? c.outcome}</span>
            </li>
          ))}
        </ul>
      )}
      {pages.length > 0 && (
        <div className="space-y-4" data-testid="run-preview-shots">
          {pages.map((page) => (
            <figure key={page} className="space-y-2">
              <figcaption className="text-sm text-zinc-400 [overflow-wrap:anywhere]">{page}</figcaption>
              <div className="flex flex-wrap items-start gap-3">
                {shots
                  .filter((s) => s.page === page)
                  .map((s) => (
                    <a key={`${s.page}-${s.width}`} href={safe(s.src)} target="_blank" rel="noopener noreferrer" className={`block rounded-md border border-zinc-800 ${focusRing}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- an image hosted on GitHub, shown as it is */}
                      <img
                        src={safe(s.src)}
                        alt={`${page} at ${s.width} width`}
                        loading="lazy"
                        className={s.width === "phone" ? "h-auto w-24 rounded-md sm:w-32" : "h-auto w-full max-w-md rounded-md"}
                        data-testid="run-preview-shot"
                        data-width={s.width}
                      />
                    </a>
                  ))}
              </div>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
