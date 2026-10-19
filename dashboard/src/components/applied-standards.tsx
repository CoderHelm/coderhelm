import Link from "next/link";
import { focusRing } from "./ui";

/**
 * "Applied team standards: code-standards, writing-style": the team skills
 * and commands set to always apply that this run or review was given in
 * full. Nothing when there were none.
 */
export function AppliedStandards({ names, className = "" }: { names?: string[] | null; className?: string }) {
  const list = (names ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <p data-testid="applied-standards" className={`text-sm text-zinc-400 [overflow-wrap:anywhere] ${className}`.trim()}>
      <span className="text-zinc-500">Applied team standards:</span>{" "}
      <span className="font-mono text-zinc-200">{list.join(", ")}</span>{" "}
      <Link href="/skills?tab=activity&action=apply" className={`text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300 rounded ${focusRing}`}>
        what this means
      </Link>
    </p>
  );
}
