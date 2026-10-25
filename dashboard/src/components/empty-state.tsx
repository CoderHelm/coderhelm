import type { ReactNode } from "react";
import { secondaryButton } from "./ui";

/**
 * Nothing here yet: an icon, a one-line title, one sentence of what this
 * place is for, and one action. A solid card, never a dashed placeholder box.
 *
 *   <EmptyState icon={<PlanIcon />} title="No plans yet" action={<Link …>New plan</Link>}>
 *     A plan splits a bigger change into small steps.
 *   </EmptyState>
 *
 * `compact` drops the padding for an empty state inside a card or a section.
 * `onClear` says filters hide everything and offers to clear them.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  onClear,
  compact = false,
  testId = "empty-state",
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onClear?: () => void;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`min-w-0 text-center ${compact ? "px-4 py-6" : "rounded-lg border border-zinc-800 bg-zinc-900/40 px-6 py-10"}`}
    >
      {icon && (
        <span aria-hidden="true" className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-prose text-sm text-zinc-400">{children}</div>}
      {(action || onClear) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onClear && (
            <button type="button" onClick={onClear} className={secondaryButton}>
              Clear filters
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
