import type { ReactNode } from "react";

/**
 * Monospace, for the only two things that should be: values someone copies
 * (a role ARN, a webhook URL, a command) and real identifiers (a label name,
 * a file path, a header). Everything else on a page is plain text.
 *
 * `font-mono` anywhere else is counted by `npm run lint` (scripts/ui-lint.mjs).
 */
export function Code({
  children,
  block,
  className = "",
}: {
  children: ReactNode;
  /** A block of several lines, scrolling sideways when it is wide. */
  block?: boolean;
  className?: string;
}) {
  if (block) {
    return (
      <pre className={`min-w-0 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300 ${className}`}>
        <code>{children}</code>
      </pre>
    );
  }
  return (
    <code className={`rounded bg-zinc-800/70 px-1 py-px font-mono text-[0.9em] text-zinc-300 [overflow-wrap:anywhere] ${className}`}>
      {children}
    </code>
  );
}
