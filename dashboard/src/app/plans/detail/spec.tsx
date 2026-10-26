"use client";

import type { Openspec } from "@/lib/api";
import { ChatMarkdown } from "@/components/chat-markdown";
import { CopyButton } from "@/components/copy-button";
import { Disclosure } from "@/components/disclosure";
import { Skeleton } from "@/components/skeleton";
import { secondaryButton } from "@/components/ui";

// The plan's written spec (openspec: proposal, design, spec, tasks), read as
// parts of the plan document. tasks.md repeats the checklist above, so it
// stays folded.

const PARTS: { key: keyof Openspec; title: string }[] = [
  { key: "proposal", title: "Proposal" },
  { key: "design", title: "Design" },
  { key: "spec", title: "Requirements" },
];

/** Saves each openspec file as its own .md. */
export function downloadOpenspec(openspec: Openspec) {
  for (const [name, content] of Object.entries(openspec)) {
    const blob = new Blob([content ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function SpecDocument({
  openspec,
  writing,
  onWrite,
}: {
  /** undefined while it loads; null when none has been written. */
  openspec: Openspec | null | undefined;
  writing: boolean;
  onWrite: () => void;
}) {
  if (openspec === undefined) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading the spec">
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
    );
  }
  if (!openspec) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-5" data-testid="spec-empty">
        <p className="text-sm font-medium text-zinc-100">No spec written yet.</p>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">
          Coderhelm can write a proposal, a design and a spec from this plan, to read here or commit with the work.
        </p>
        <button type="button" onClick={onWrite} disabled={writing} className={`mt-3 ${secondaryButton}`}>
          {writing ? "Writing…" : "Write the spec"}
        </button>
      </div>
    );
  }
  const parts = PARTS.filter((p) => openspec[p.key]?.trim());
  // The proposal is the plain summary; the design and requirements are for
  // engineers, folded away until someone asks for them.
  const summary = parts.find((p) => p.key === "proposal");
  const technical = parts.filter((p) => p.key !== "proposal");
  const part = (p: (typeof PARTS)[number]) => (
    <div key={p.key} className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-200">{p.title}</h3>
        <CopyButton className="!min-h-7" text={openspec[p.key] ?? ""} label={<>Copy<span className="sr-only"> {p.key}.md</span></>} />
      </div>
      <div className="min-w-0 overflow-x-auto">
        <ChatMarkdown>{stripTitle(openspec[p.key] ?? "")}</ChatMarkdown>
      </div>
    </div>
  );
  return (
    <div className="space-y-6" data-testid="spec">
      {parts.length === 0 && <p className="text-sm text-zinc-400">The spec is empty.</p>}
      {summary && part(summary)}
      {technical.length > 0 && (
        <Disclosure summary={<span>Technical plan <span className="text-zinc-400">(for engineers)</span></span>}>
          <div className="space-y-8 pt-2">{technical.map(part)}</div>
        </Disclosure>
      )}
      {openspec.tasks?.trim() && (
        <Disclosure summary={<span>The spec&apos;s task list</span>}>
          <div className="flex justify-end">
            <CopyButton className="!min-h-7" text={openspec.tasks} label={<>Copy<span className="sr-only"> tasks.md</span></>} />
          </div>
          <ChatMarkdown>{openspec.tasks}</ChatMarkdown>
        </Disclosure>
      )}
    </div>
  );
}

/** A file that opens with its own "# Proposal" heading repeats ours. */
function stripTitle(md: string): string {
  return md.replace(/^\s*#\s+[^\n]*\n+/, "");
}
