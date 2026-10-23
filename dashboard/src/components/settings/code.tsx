import type { ReactNode } from "react";

/**
 * Monospace, for the only two things that should be: values someone copies
 * (a role ARN, a webhook URL, a command) and real identifiers (a label name,
 * a file path, a header). Everything else on a page is plain text.
 *
 * A block of code (a file, a CI step, a script) is `<CodeBlock>` in
 * components/code-block.tsx, with a header, Copy and highlighting.
 *
 * `font-mono` anywhere else is counted by `npm run lint` (scripts/ui-lint.mjs).
 */
export function Code({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <code className={`rounded bg-zinc-800/70 px-1 py-px font-mono text-[0.9em] text-zinc-300 [overflow-wrap:anywhere] ${className}`}>
      {children}
    </code>
  );
}
