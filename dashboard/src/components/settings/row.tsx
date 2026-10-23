"use client";

import { useId, type ReactNode } from "react";
import { Chip } from "../list";
import { ChevronRightIcon } from "../icons";
import { focusRing } from "../ui";

/** The ids a row hands its control, so the label and help are tied to it. */
export interface SettingsRowIds {
  /** The visible label's id, for `aria-labelledby` (a switch needs it). */
  labelId: string;
  /** The help line's id, for `aria-describedby`; undefined without help. */
  helpId?: string;
  /** Put this on the control: the label's `htmlFor` points at it. */
  inputId: string;
}

/**
 * The marks after a setting's name. "Unsaved" beats "Not default": what the
 * person just did matters most.
 */
export function RowMarks({ unsaved, notDefault, recommended }: { unsaved?: boolean; notDefault?: boolean; recommended?: boolean }) {
  return (
    <>
      {recommended && <Chip tone="neutral">Recommended</Chip>}
      {unsaved ? (
        <Chip tone="waiting">Unsaved</Chip>
      ) : notDefault ? (
        <Chip tone="muted" title="This differs from what a new repo starts with">Not default</Chip>
      ) : null}
    </>
  );
}

/** Longer reading tucked under a row: how a setting works in detail. */
export function SettingsMore({ children, summary = "How it works" }: { children: ReactNode; summary?: string }) {
  return (
    <details className="group mt-1">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs text-zinc-500 hover:text-zinc-300 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none"><ChevronRightIcon /></span>
        {summary}
      </summary>
      <div className="mt-1 max-w-prose space-y-2 text-xs leading-relaxed text-zinc-400">{children}</div>
    </details>
  );
}

/** Optional overrides inside a row, folded away until someone needs them. */
export function SettingsDisclosure({ summary, defaultOpen = false, children }: { summary: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group min-w-0 rounded-lg border border-zinc-800">
      <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"><ChevronRightIcon /></span>
        {summary}
      </summary>
      <div className="min-w-0 space-y-4 px-3 pb-4 pt-1">{children}</div>
    </details>
  );
}

export interface SettingsRowProps {
  /** The setting's name. It is the control's label. */
  label: string;
  /** One line under the name: what the setting does. */
  help?: ReactNode;
  /** Longer reading behind a "How it works" toggle. */
  more?: ReactNode;
  /** The control, given the ids that tie it to the label and help. */
  control: (ids: SettingsRowIds) => ReactNode;
  /**
   * Where the control sits. "inline" (default): right of the label, under it
   * on a phone. "toggle": a switch, on the right even on a phone. "stacked":
   * always under the label, full width (a textarea).
   */
  layout?: "inline" | "toggle" | "stacked";
  /** Width of the control column from `sm:` up, e.g. "sm:w-80". Inline only. */
  controlClassName?: string;
  /** The value differs from what is saved. */
  unsaved?: boolean;
  /** The value differs from what a new team or repo starts with. */
  notDefault?: boolean;
  /** Shows a "Recommended" chip. */
  recommended?: boolean;
  /** Any other marks after the name. */
  marks?: ReactNode;
  /** The setting's own options, indented under it (show them only while it is on). */
  children?: ReactNode;
  testId?: string;
}

/**
 * One setting: its name and a one-line help on the left, the control on the
 * right, and an "Unsaved" or "Not default" mark after the name. On a phone the
 * control goes under the label, except a switch, which stays on the right.
 */
export function SettingsRow({
  label,
  help,
  more,
  control,
  layout = "inline",
  controlClassName = "",
  unsaved,
  notDefault,
  recommended,
  marks,
  children,
  testId,
}: SettingsRowProps) {
  const base = useId();
  const ids: SettingsRowIds = { labelId: `${base}-label`, helpId: help ? `${base}-help` : undefined, inputId: `${base}-input` };
  const toggle = layout === "toggle";
  const stacked = layout === "stacked";
  return (
    <div className="min-w-0 px-4 py-4" data-testid={testId}>
      <div
        className={`flex min-w-0 ${
          toggle ? "flex-row items-start justify-between gap-4 sm:gap-6" : stacked ? "flex-col gap-3" : "flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label id={ids.labelId} htmlFor={ids.inputId} className="text-sm font-medium text-zinc-100">{label}</label>
            <RowMarks unsaved={unsaved} notDefault={notDefault} recommended={recommended} />
            {marks}
          </div>
          {help && <p id={ids.helpId} className="mt-0.5 max-w-prose text-sm text-zinc-400">{help}</p>}
          {more && <SettingsMore>{more}</SettingsMore>}
        </div>
        <div className={`min-w-0 ${toggle ? "shrink-0 pt-0.5" : stacked ? "" : `sm:shrink-0 ${controlClassName}`}`}>{control(ids)}</div>
      </div>
      {children && <div className="mt-4 min-w-0 space-y-4 border-l-2 border-zinc-800 pl-4">{children}</div>}
    </div>
  );
}
