"use client";

import { useEffect, useState } from "react";
import { StatusDot } from "@/components/list/status";
import { Chip, MoreMenu } from "@/components/list";
import { buttonClass, focusRing } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { KIND_LABEL, fixLabel, itemWord, sourceHealth, truncatedLine, type KnowledgeLimits } from "@/lib/knowledge";
import {
  VIA_SHORT,
  dayWords,
  kbPage,
  liveWords,
  pickedWords,
  placeWords,
  relTime,
  viaWords,
  type ConnectionDetail,
  type PageSource,
} from "@/lib/knowledge-page";
import { ProgressBar } from "./add-flow";
import { SourceLogo } from "./logos";

// Connections: one row per source with how it connects and whether it is
// up to date; a row opens into the whole story: how and as whom it
// connects, its scopes and token health (for the people who manage it),
// live updates, what was picked, what happens when the person who
// connected it leaves, and the buttons that act on it.

export interface ConnectionActions {
  onSync: (s: PageSource) => void;
  onFix: (s: PageSource) => void;
  onEdit: (s: PageSource) => void;
  onReconnect: (s: PageSource) => void;
  onSignIn: (s: PageSource) => void;
  onSwitch: (s: PageSource, via: "oauth" | "saved_key") => void;
  onPause: (s: PageSource, paused: boolean) => void;
  onRemove: (s: PageSource) => void;
  onNewExport: (s: PageSource) => void;
}

export function ConnectionRow({
  kbId,
  source,
  canManage,
  limits,
  open,
  onToggle,
  actions,
}: {
  kbId: string;
  source: PageSource;
  canManage: boolean;
  limits: KnowledgeLimits | null;
  open: boolean;
  onToggle: () => void;
  actions: ConnectionActions;
}) {
  const s = source;
  const label = KIND_LABEL[s.kind];
  const health = sourceHealth(s);
  const fix = s.status === "error" ? fixLabel(s) : null;
  const syncing = s.status === "syncing";
  const place = placeWords(s);
  const panelId = `conn-${s.id}`;
  const tone = health.tone === "attention" ? "attention" : health.tone === "success" ? "success" : health.tone === "muted" ? "muted" : "live";
  return (
    <li className={`min-w-0 ${s.status === "error" ? "bg-orange-500/[0.04]" : ""}`} data-testid="source-card" data-status={s.status} data-kind={s.kind} data-via={s.via ?? ""}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5">
        <SourceLogo kind={s.kind} size="md" />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={`min-w-0 flex-1 basis-40 rounded text-left ${focusRing}`}
          data-testid="connection-toggle"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100" title={s.name}>
              {s.name}
            </span>
            <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{open ? "Hide details" : "Show details"}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-400" data-testid="connection-meta">
            {[label, place, itemWord(s.kind, s.items), s.via ? VIA_SHORT[s.via] : null].filter(Boolean).join(" · ")}
          </span>
          {s.connection === "sign_in" && s.signin && (
            <span className="mt-0.5 block truncate text-xs text-zinc-400" data-testid="source-signin" title={s.signin.account ? `${label} account: ${s.signin.account}` : undefined}>
              Synced with {s.signin.name}&apos;s {label} sign-in
            </span>
          )}
          {s.kind === "archive" && typeof s.options.file_name === "string" && (
            <span className="mt-0.5 block truncate text-xs text-zinc-400" data-testid="archive-file">
              {s.options.file_name}
            </span>
          )}
        </button>
        <span className="flex w-full min-w-0 items-start gap-2 pl-[3.25rem] text-sm sm:w-auto sm:max-w-[45%] sm:items-center sm:pl-0" data-testid="source-health" aria-live="polite">
          <StatusDot tone={tone} live={health.tone === "live"} className="mt-1.5 sm:mt-0" />
          <span className={`min-w-0 [overflow-wrap:anywhere] sm:truncate ${health.tone === "attention" ? "text-orange-200" : "text-zinc-300"}`} title={health.words}>
            {health.words}
          </span>
        </span>
        {canManage && (
          <span className="flex w-full items-center gap-1.5 pl-[3.25rem] sm:w-auto sm:pl-0" data-testid="row-actions">
            {fix ? (
              <button type="button" className={buttonClass("primary", "sm")} onClick={() => actions.onFix(s)} data-testid="source-fix">
                {fix}
              </button>
            ) : s.paused ? (
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => actions.onPause(s, false)} data-testid="source-resume">
                Resume updates
              </button>
            ) : (
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => actions.onSync(s)} disabled={syncing} data-testid="source-sync">
                {syncing ? "Checking…" : "Check for changes"}
              </button>
            )}
            <MoreMenu
              compact
              label={`${s.name} actions`}
              buttonLabel={`More for ${s.name}`}
              items={[
                ...(s.kind === "archive"
                  ? [{ label: "Upload a newer export", onSelect: () => actions.onNewExport(s) }]
                  : s.kind === "s3"
                    ? []
                    : [{ label: "Choose pages", onSelect: () => actions.onEdit(s) }]),
                s.paused
                  ? { label: "Resume updates", onSelect: () => actions.onPause(s, false) }
                  : { label: "Pause updates", onSelect: () => actions.onPause(s, true), note: `Stops bringing in changes from ${label}` },
                { label: "Remove", onSelect: () => actions.onRemove(s), danger: true },
              ]}
            />
          </span>
        )}
      </div>
      {s.truncated && (
        <p className="px-4 pb-3 pl-[4.25rem] text-xs text-zinc-400" data-testid="source-truncated">
          {truncatedLine(s.kind, limits)}
        </p>
      )}
      {syncing && (
        <div className="px-4 pb-3">
          <ProgressBar value={s.progress && s.progress.total ? s.progress.done / s.progress.total : 0} indeterminate={!s.progress || !s.progress.total || s.progress.phase !== "fetching"} />
        </div>
      )}
      {open && <ConnectionPanel id={panelId} kbId={kbId} source={s} canManage={canManage} limits={limits} actions={actions} />}
    </li>
  );
}

function Row({ term, children, testId }: { term: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="grid min-w-0 gap-0.5 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4" data-testid={testId}>
      <dt className="text-xs font-medium text-zinc-400 sm:pt-0.5">{term}</dt>
      <dd className="min-w-0 text-sm text-zinc-300 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function ConnectionPanel({
  id,
  kbId,
  source: s,
  canManage,
  limits,
  actions,
}: {
  id: string;
  kbId: string;
  source: PageSource;
  canManage: boolean;
  limits: KnowledgeLimits | null;
  actions: ConnectionActions;
}) {
  const label = KIND_LABEL[s.kind];
  const [detail, setDetail] = useState<ConnectionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    if (!canManage) return;
    let live = true;
    kbPage
      .connection(kbId, s.id)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setDetailError(errorMessage(e, "Couldn't read the connection.")));
    return () => {
      live = false;
    };
    // Read again after a sync used the connection.
  }, [canManage, kbId, s.id, s.connected_used_at, s.via]);
  const via = detail?.via || s.via || "";
  const who = s.signin?.name || detail?.by || "";
  const switchTo = [
    ...(detail?.switch.oauth ? [{ label: `Use the team's ${label} sign-in`, onSelect: () => actions.onSwitch(s, "oauth") }] : []),
    ...(detail?.switch.saved_key ? [{ label: "Use the saved API token", onSelect: () => actions.onSwitch(s, "saved_key") }] : []),
    ...(detail?.switch.my_sign_in || s.via === "sign_in" ? [{ label: `Use my own ${label} sign-in`, onSelect: () => actions.onSignIn(s) }] : []),
  ];
  const canReconnect = via === "oauth";
  return (
    <div id={id} className="border-t border-zinc-800/80 bg-zinc-950/30 px-4 pb-4 pt-1" data-testid="connection-panel">
      <dl className="divide-y divide-zinc-800/60">
        <Row term="How" testId="conn-how">
          {viaWords({ ...s, via: via as PageSource["via"] })}
          {via === "oauth" && <span className="text-zinc-500"> (OAuth)</span>}
        </Row>
        {canManage && (
          <Row term="Whose" testId="conn-whose">
            {detail ? (
              <>
                {detail.by ? `Connected by ${detail.by}` : via === "saved_key" ? "Saved for the team" : "Not recorded"}
                {detail.connected_at && ` on ${dayWords(detail.connected_at)}`}
                {detail.account && <span className="text-zinc-400"> · as {detail.account}</span>}
              </>
            ) : detailError ? (
              <span className="text-orange-300">{detailError}</span>
            ) : (
              <span className="text-zinc-500">Reading…</span>
            )}
          </Row>
        )}
        {canManage && detail?.token && (
          <>
            <Row term="Token" testId="conn-token">
              {detail.token.status === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <StatusDot tone="success" />
                  Working. It renews on its own{detail.token.expires_at ? `; the current one expires ${relTime(detail.token.expires_at)}` : ""}.
                </span>
              ) : (
                <span className="inline-flex items-start gap-2 text-orange-200">
                  <StatusDot tone="attention" className="mt-1.5" />
                  Stopped{detail.token.status_reason ? `: ${detail.token.status_reason}` : ""}. Reconnect {label} to sign in again.
                </span>
              )}
            </Row>
            {detail.token.scopes.length > 0 && (
              <Row term="Scopes" testId="conn-scopes">
                <span className="flex min-w-0 flex-wrap gap-1.5">
                  {detail.token.scopes.map((sc) => (
                    <Chip key={sc} tone="neutral">
                      {sc}
                    </Chip>
                  ))}
                </span>
              </Row>
            )}
          </>
        )}
        <Row term="Live updates" testId="conn-live">
          {liveWords(s)}
        </Row>
        <Row term="Last checked" testId="conn-checked">
          {s.last_sync_at ? `${relTime(s.last_sync_at)}` : "Not yet"}
          {s.last_success_at && s.last_success_at !== s.last_sync_at && <span className="text-zinc-400"> · last worked {relTime(s.last_success_at)}</span>}
        </Row>
        <Row term="Picked" testId="conn-picked">
          {pickedWords(s)}
        </Row>
        {s.failed_items > 0 && s.status !== "error" && (
          <Row term="Couldn't read">
            {itemWord(s.kind, s.failed_items)} couldn&apos;t be read. They&apos;re tried again on the next check.
          </Row>
        )}
        {canManage && (
          <Row term={who ? `If ${who.split(/[ @]/)[0]} leaves` : "If they leave"} testId="conn-leaves">
            {detail?.if_they_leave ?? (via === "sign_in" ? `It uses ${who || "a member"}'s own sign-in; any admin can sign in again to take it over.` : "It belongs to the team.")}
          </Row>
        )}
      </dl>
      {canManage && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2" data-testid="connection-actions">
          {s.kind === "archive" ? (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => actions.onNewExport(s)}>
              Upload a newer export
            </button>
          ) : s.kind !== "s3" ? (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => actions.onEdit(s)} data-testid="source-edit">
              Change pages
            </button>
          ) : null}
          {canReconnect && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => actions.onReconnect(s)} data-testid="source-reconnect">
              Reconnect
            </button>
          )}
          {switchTo.length > 0 && (
            <MoreMenu compact={false} label="Change connection" buttonLabel="Change connection" items={switchTo} />
          )}
        </div>
      )}
    </div>
  );
}
