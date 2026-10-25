"use client";

// Support access: the team lets Coderhelm support see its workspace, read
// only, for a fixed time, and sees every read support made. Also the banner a
// platform admin sees on every page while in a support view.

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type SupportAccess, type SupportGrant, type SupportViewStatus } from "@/lib/api";
import { timeLeft } from "@/lib/support";
import { Time } from "./list";
import { focusRing, inputClass, primaryButton, secondaryButton } from "./ui";

export const WINDOW_LABEL: Record<number, string> = { 24: "24 hours", 72: "72 hours", 168: "7 days" };
const WINDOWS = [24, 72, 168];

function untilWords(g: SupportGrant): string {
  const d = new Date(g.until);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Turn support access on (for a window, optionally for one ticket) or end
 * it. For team admins and owners; the gateway checks the role too.
 */
export function SupportAccessControl({
  ticketId,
  onChange,
  compact = false,
}: {
  ticketId?: string;
  onChange?: (a: SupportAccess) => void;
  compact?: boolean;
}) {
  const [access, setAccess] = useState<SupportAccess | null>(null);
  const [error, setError] = useState("");
  const [hours, setHours] = useState(72);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .supportAccess()
      .then((a) => {
        setAccess(a);
        onChange?.(a);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not read support access."));
  }, [onChange]);
  useEffect(load, [load]);

  const grant = async () => {
    setBusy(true);
    setError("");
    try {
      await api.grantSupportAccess({ hours, note: note.trim() || undefined, ticket_id: ticketId });
      setNote("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn on support access.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    setError("");
    try {
      await api.revokeSupportAccess();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end support access.");
    } finally {
      setBusy(false);
    }
  };

  if (!access) {
    return error ? (
      <p role="alert" className="text-sm text-red-400">
        {error}
      </p>
    ) : (
      <p className="text-sm text-zinc-500">Checking support access…</p>
    );
  }
  const g = access.grant?.active ? access.grant : null;
  return (
    <div className="space-y-3" data-testid="support-access-control" data-active={g ? "true" : "false"}>
      {g ? (
        <>
          <p className="text-sm text-emerald-300" role="status">
            Coderhelm support can see your workspace, read only, until {untilWords(g)}
            <span className="text-zinc-500"> ({timeLeft(g.until)})</span>.
          </p>
          {!compact && (
            <p className="text-xs text-zinc-500">
              Turned on by {g.granted_by_email}
              {g.note ? ` · “${g.note}”` : ""}
            </p>
          )}
          <button type="button" onClick={() => void revoke()} disabled={busy} className={secondaryButton} data-testid="support-access-revoke">
            {busy ? "Ending…" : "End access now"}
          </button>
        </>
      ) : (
        <>
          {!compact && <p className="text-sm text-zinc-400">Off. Coderhelm support cannot see your workspace.</p>}
          <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-[12rem_minmax(0,1fr)]"}`}>
            <div>
              <label htmlFor={`support-hours${ticketId ? "-t" : ""}`} className="mb-1.5 block text-sm font-medium text-zinc-300">
                For how long
              </label>
              <select
                id={`support-hours${ticketId ? "-t" : ""}`}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className={inputClass}
              >
                {(access.windows?.length ? access.windows : WINDOWS).map((h) => (
                  <option key={h} value={h}>
                    {WINDOW_LABEL[h] ?? `${h} hours`}
                  </option>
                ))}
              </select>
            </div>
            {!compact && (
              <div className="min-w-0">
                <label htmlFor="support-note" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Note for support <span className="font-normal text-zinc-500">(optional)</span>
                </label>
                <input
                  id="support-note"
                  type="text"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What to look at"
                  className={inputClass}
                />
              </div>
            )}
          </div>
          <button type="button" onClick={() => void grant()} disabled={busy} className={primaryButton} data-testid="support-access-grant">
            {busy ? "Turning on…" : ticketId ? "Let support look at this" : "Let Coderhelm support see your workspace"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const LOG_WORDS: Record<string, string> = {
  granted: "Access turned on",
  revoked: "Access ended",
  session_start: "Support opened a read only view",
  read: "Read",
  refused: "Refused",
};

/** Every support access change and every request support made, newest first. */
export function SupportAccessLog({ access }: { access: SupportAccess }) {
  if (access.log.length === 0) {
    return <p className="text-sm text-zinc-500">Nothing yet. Every view and every page support reads will be listed here.</p>;
  }
  return (
    <ol className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800" aria-label="Support access log" data-testid="support-access-log">
      {access.log.map((e) => (
        <li key={e.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm" data-kind={e.kind}>
          <span className={`shrink-0 font-medium ${e.kind === "refused" ? "text-amber-300" : e.kind === "read" ? "text-zinc-300" : "text-zinc-100"}`}>
            {LOG_WORDS[e.kind] ?? e.kind}
          </span>
          {e.route && (
            <code className="min-w-0 wrap-anywhere font-mono text-xs text-zinc-400">
              {e.method} {e.route}
            </code>
          )}
          {e.detail && <span className="min-w-0 text-xs text-zinc-500 [overflow-wrap:anywhere]">{e.detail}</span>}
          <span className="ml-auto flex min-w-0 items-baseline gap-2 text-xs text-zinc-500">
            <span className="min-w-0 [overflow-wrap:anywhere]">{e.actor_email}</span>
            <span className="shrink-0"><Time iso={e.at} /></span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The bar on every page while a platform admin is in a support view: whose
 * workspace, that it is read only, how long is left, and a way out. The shell
 * renders it only when /api/me says the session is a support view.
 */
export function SupportViewBanner() {
  const [view, setView] = useState<SupportViewStatus | null>(null);
  const [ended, setEnded] = useState(false);
  const [, tick] = useState(0);

  const check = useCallback(() => {
    api
      .supportViewStatus()
      .then((v) => {
        setView(v);
        if (!v.active) setEnded((was) => was);
      })
      .catch((e: unknown) => {
        // The gateway answers 403 once the team's grant ends or is revoked.
        if (e instanceof ApiError && e.status === 403) setEnded(true);
      });
  }, []);

  useEffect(() => {
    check();
    const poll = setInterval(check, 60_000);
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [check]);

  const exit = async () => {
    await api.exitSupportView().catch(() => {});
    window.location.href = "/admin/tickets";
  };

  if (ended) {
    return (
      <div role="alert" data-testid="support-view-banner" data-state="ended" className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Support view ended: the team&apos;s access ran out or was turned off.</span>
          <button type="button" onClick={() => void exit()} className={`rounded-md bg-amber-300 px-3 py-1 text-sm font-medium text-zinc-950 hover:bg-amber-200 ${focusRing}`}>
            Back to the support queue
          </button>
        </div>
      </div>
    );
  }
  if (!view || !view.active) return null;
  const left = timeLeft(view.until);
  return (
    <div
      role="region"
      aria-label="Support view"
      data-testid="support-view-banner"
      data-state="active"
      className="z-40 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-100 md:sticky md:top-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="min-w-0 [overflow-wrap:anywhere]">
          <span className="font-semibold">Support view</span> of <span className="font-semibold">{view.team_name || view.team_id}</span>
          <span className="mx-1.5 rounded border border-amber-300/50 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">read only</span>
          <span className="text-amber-200/80">{left || "ending now"}</span>
        </p>
        <button type="button" onClick={() => void exit()} className={`shrink-0 rounded-md bg-amber-300 px-3 py-1 text-sm font-medium text-zinc-950 hover:bg-amber-200 ${focusRing}`}>
          Exit
        </button>
      </div>
    </div>
  );
}
