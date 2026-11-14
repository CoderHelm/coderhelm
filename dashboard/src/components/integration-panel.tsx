"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import type { Integration, IntegrationUse, SignInStart } from "@/lib/api";
import { timeAgo } from "@/lib/data-sources";
import { INTEGRATION_STATUS } from "@/lib/integration-status";
import { spanWords, useSignIn } from "@/lib/sign-in-flow";
import { Callout } from "./callout";
import { Disclosure } from "./disclosure";
import { TechnicalDetails } from "./problem";
import { buttonClass, dangerButton, linkButton, primaryButton, secondaryButton } from "./ui";

// The parts every opened card on Integrations is made of, so each one reads
// the same way whatever it connects:
//
// - Not connected: what Coderhelm will be able to do, one primary action,
//   what happens next. Other ways to connect sit under one disclosure.
//   Nothing about tools, instructions or history yet.
// - Signing in: the same button shows progress, with Cancel, and always
//   ends in an outcome with its reason and the next step.
// - Connected: who connected it and when, when it was last checked, what it
//   is used for; a Manage area whose parts hide when empty; Disconnect last,
//   worded and coloured as the destructive action it is.
// - Needs attention: the plain reason and one action.

/** A titled part of an opened card. */
export function PanelSection({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className="min-w-0">
      <h3 id={id} className="text-sm font-semibold text-zinc-100">
        {title}
      </h3>
      <div className="mt-2 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

function upperFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** One fact about a connection: a label and its value. */
export interface Fact {
  label: string;
  value: ReactNode;
}

/** Who connected it and when, how, and when it was last checked: only the facts there are. */
export function ConnectionFacts({ item, extra = [] }: { item: Integration; extra?: Fact[] }) {
  const facts: Fact[] = [];
  if (item.how) facts.push({ label: "Connected with", value: upperFirst(item.how) });
  if (item.connected_by) facts.push({ label: "Connected by", value: <span className="wrap-anywhere">{item.connected_by}</span> });
  if (item.connected_at) facts.push({ label: "Connected", value: timeAgo(item.connected_at) });
  facts.push(...extra);
  if (item.last_check) facts.push({ label: "Last checked", value: timeAgo(item.last_check) });
  if (facts.length === 0) return null;
  return (
    <dl data-testid="connection-facts" className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {facts.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-zinc-400">{f.label}</dt>
          <dd className="min-w-0 text-zinc-200">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const USE_STATE: Record<IntegrationUse["state"], { label: string; dot: string; text: string }> = {
  on: { label: "On", dot: "bg-emerald-400", text: "text-zinc-200" },
  attention: { label: "Needs attention", dot: "bg-amber-400", text: "text-amber-300" },
  ready: { label: "Off", dot: "bg-zinc-600", text: "text-zinc-400" },
  needs: { label: "Not connected", dot: "bg-zinc-600", text: "text-zinc-400" },
  off: { label: "Off", dot: "bg-zinc-600", text: "text-zinc-400" },
};

/**
 * What the product is used for, one row per use: on (and with what), or
 * what turning it on takes, with the one control that does it. `onAction`
 * handles the actions the page performs (`use_in_runs`); links are links.
 */
export function UsesList({
  uses,
  canEdit,
  busy,
  onAction,
}: {
  uses: IntegrationUse[];
  canEdit: boolean;
  busy?: string;
  onAction?: (use: IntegrationUse) => void;
}) {
  if (uses.length === 0) return null;
  return (
    <PanelSection title="Used for" testId="integration-uses">
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {uses.map((u) => {
          const st = USE_STATE[u.state];
          const a = u.action;
          // Signing in again, checking and adding a key are the card's one
          // action above; a row offers only what is its own.
          const own = a && (a.kind === "link" || a.kind === "use_in_runs");
          return (
            <li key={u.id} data-testid={`use-${u.id}`} data-state={u.state} className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 text-sm">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-zinc-100">{u.label}</span>
                  <span className={`inline-flex items-center gap-1.5 ${st.text}`}>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                  {u.state === "on" && u.how && <span className="text-zinc-400">with {u.how}</span>}
                </p>
                {u.detail && u.state !== "on" && <p className="mt-0.5 text-zinc-400">{u.detail}</p>}
              </div>
              {canEdit && own && a.kind === "link" && (
                <Link href={a.href} className={`${buttonClass("secondary", "sm")} shrink-0 self-start`}>
                  {a.label}
                </Link>
              )}
              {canEdit && own && a.kind !== "link" && (
                <button type="button" disabled={!!busy} onClick={() => onAction?.(u)} className={`${buttonClass("secondary", "sm")} shrink-0 self-start`}>
                  {busy === a.kind ? "Turning on…" : a.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </PanelSection>
  );
}

/** Needs attention: the plain reason and the one action that fixes it. */
export function Attention({ item, children }: { item: Integration; children?: ReactNode }) {
  if (item.status === "connected" || item.status === "not_connected") return null;
  const label = INTEGRATION_STATUS[item.status].label;
  return (
    <Callout variant={item.status === "error" ? "error" : "warning"} title={label} live={false} testId="integration-attention">
      {item.reason && <p>{item.reason}</p>}
      {children && <div className="pt-2">{children}</div>}
    </Callout>
  );
}

/**
 * The one sign-in control: a primary button that opens the sign-in page in
 * a new tab, shows that it is waiting (with Cancel), and ends in an outcome
 * that says why and what to do next.
 */
export function SignInControl({
  name,
  ids,
  label,
  begin,
  onConnected,
  onReturn,
  disabled,
  variant = "primary",
  testId = "sign-in",
}: {
  /** The product, as people know it ("Figma"). */
  name: string;
  /** The connection and catalog ids whose outcome is this control's. */
  ids: string[];
  label: string;
  /** Asks the API where the sign-in page is. */
  begin: () => Promise<SignInStart>;
  onConnected: () => void | Promise<void>;
  onReturn?: () => void | Promise<void>;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  testId?: string;
}) {
  const flow = useSignIn({ name, ids, onConnected, onReturn });
  const { state } = flow;
  const noteId = useId();
  const busy = state.stage === "starting" || state.stage === "waiting";
  const outcome = state.stage === "ended" ? state.outcome : null;
  const seconds = state.stage === "waiting" ? Math.max(1, Math.round((state.until - Date.now()) / 1000)) : 0;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId} data-stage={state.stage} data-outcome={outcome?.kind ?? ""}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled}
          aria-busy={busy}
          aria-describedby={noteId}
          onClick={() => void flow.start(begin)}
          className={variant === "primary" ? primaryButton : secondaryButton}
          data-testid={`${testId}-button`}
        >
          {state.stage === "starting" ? `Opening ${name}…` : state.stage === "waiting" ? `Waiting for ${name}…` : outcome && outcome.kind !== "cancelled" ? "Try again" : label}
        </button>
        {busy && (
          <button type="button" onClick={flow.cancel} className={secondaryButton} data-testid={`${testId}-cancel`}>
            Cancel
          </button>
        )}
        {outcome?.kind === "blocked" && (
          <button type="button" onClick={() => void flow.continueHere()} className={secondaryButton} data-testid={`${testId}-here`}>
            Sign in in this tab
          </button>
        )}
      </div>
      <p id={noteId} role="status" aria-live="polite" className="text-sm text-zinc-400" data-testid={`${testId}-note`}>
        {state.stage === "waiting"
          ? `Finish signing in in the ${name} tab. This page updates on its own; the sign-in stays open for ${spanWords(seconds)}.`
          : state.stage === "starting"
            ? `Opening ${name} in a new tab…`
            : outcome?.kind === "cancelled"
              ? "Sign-in cancelled. Nothing was connected."
              : `Opens ${name} in a new tab. You come back here when done.`}
      </p>
      {outcome && outcome.kind !== "cancelled" && (
        <Callout variant={outcome.kind === "failed" ? "error" : "warning"} title={outcome.title} testId={`${testId}-outcome`}>
          <p>{outcome.message}</p>
          {outcome.code && <TechnicalDetails text={`Error code: ${outcome.code}`} />}
        </Callout>
      )}
    </div>
  );
}

/** The other ways to connect, behind one disclosure: never beside the default. */
export function OtherWays({ children, open }: { children: ReactNode; open?: boolean }) {
  return (
    <div data-testid="other-ways">
      <Disclosure summary="Other ways to connect" defaultOpen={open}>
        <div className="flex min-w-0 flex-col gap-5 pt-1">{children}</div>
      </Disclosure>
    </div>
  );
}

/** One of the other ways: a name, a line on when to pick it, and its form. */
export function Way({ title, when, children, testId }: { title: string; when?: ReactNode; children: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className="min-w-0">
      <h4 id={id} className="text-sm font-medium text-zinc-200">
        {title}
      </h4>
      {when && <p className="mt-0.5 text-sm text-zinc-400">{when}</p>}
      <div className="mt-3 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

/** The technical side (addresses, permission names), for whoever needs it. */
export function PanelDetails({ rows }: { rows: Fact[] }) {
  const shown = rows.filter((r) => r.value !== "" && r.value !== null && r.value !== undefined);
  if (shown.length === 0) return null;
  return (
    <div data-testid="panel-details">
      <Disclosure summary="Details">
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 pt-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          {shown.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-zinc-400">{f.label}</dt>
              <dd className="min-w-0 text-zinc-200">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}

/** The destructive end of a card: what goes, and the button that does it. */
export function DangerRow({
  title,
  children,
  label,
  onClick,
  busy,
  testId = "disconnect",
}: {
  title: string;
  /** What stops working and what is kept, in a sentence. */
  children: ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-red-500/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="font-medium text-zinc-100">{title}</p>
        <p className="mt-0.5 text-zinc-400">{children}</p>
      </div>
      <button type="button" onClick={onClick} disabled={busy} className={`${dangerButton} shrink-0 self-start sm:self-auto`}>
        {label}
      </button>
    </div>
  );
}

/** A link that reads as one, for "Manage sources in Knowledge". */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={linkButton}>
      {children}
    </Link>
  );
}
