"use client";

import { CodeBlock, jsonOrText } from "@/components/code-block";
import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type AlertEventDetail, errorStatus } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { RunStatusBadge } from "@/components/run-status";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Chip, List, ListRow, Time } from "@/components/list";
import { Code } from "@/components/settings";
import { Disclosure } from "@/components/disclosure";
import { KIND_LABEL, OUTCOMES, OutcomeBadge, humanize } from "../outcome";

export default function AlertDetailGuarded() {
  return (
    <RoleGuard need="view_alerts">
      <Suspense fallback={<Page><Skeleton className="h-40 w-full" /></Page>}>
        <AlertDetail />
      </Suspense>
    </RoleGuard>
  );
}

function AlertDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { toast } = useToast();
  const [data, setData] = useState<AlertEventDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setData(null);
    setMissing(false);
    setError("");
    if (!id) return;
    api
      .getAlert(id)
      .then(setData)
      .catch((e) => {
        // Only a 404 (or an id that isn't one) means the alert isn't there.
        // Anything else is a failed request the person can retry.
        const msg = e instanceof Error ? e.message : "";
        const status = errorStatus(e);
        if (status === 400 || status === 404) setMissing(true);
        else setError(msg || "The request failed.");
      });
  }, [id, attempt]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied. Anyone on your team can open it.", "success");
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  if (!id || missing) {
    return (
      <Page>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
        <p className="text-lg mb-2">{id ? "Alert not found" : "No alert was named"}</p>
        <p className="text-sm">
          {id ? "It may belong to another team, or it is older than 90 days. " : "Pick one from the list. "}
          <Link href="/alerts" className={linkButton}>
            All alerts
          </Link>
        </p>
      </div>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <Callout variant="error" title="We couldn't load this alert">
          <p>{error}</p>
          <p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={linkButton}>
              Try again
            </button>{" "}
            or go back to <Link href="/alerts" className={linkButton}>all alerts</Link>.
          </p>
        </Callout>
      </Page>
    );
  }
  if (!data) return <Page><Skeleton className="h-40 w-full" /></Page>;

  const a = data.alert;
  // This delivery's run: the first one created at or after the alert arrived.
  const received = new Date(a.received_at ?? 0).getTime();
  const own =
    a.outcome === "run_started"
      ? [...data.runs].reverse().find((r) => new Date(r.created_at ?? 0).getTime() >= received - 60_000)
      : undefined;
  const fields = alertFields(a.body);

  return (
    <Page>
      <PageHeader
        detail
        title={a.title || "(untitled alert)"}
        lead={
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <OutcomeBadge outcome={a.outcome} />
            <Time iso={a.received_at} />
            {a.ticket_id && <Code>{a.ticket_id}</Code>}
          </div>
        }
        actions={
          <button type="button" onClick={copyLink} className={`${secondaryButton} shrink-0`}>
            Copy link
          </button>
        }
      />

      <div className={`mt-6 text-sm ${cardClass}`}>
        <p className="text-zinc-300">{OUTCOMES[a.outcome]?.detail ?? a.outcome}</p>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-zinc-500">Repo</dt>
          <dd className="break-all text-zinc-300">{a.repo || "—"}</dd>
          <dt className="text-zinc-500">Topic</dt>
          <dd className="min-w-0 text-zinc-300">{a.topic_arn ? <Code>{a.topic_arn}</Code> : "—"}</dd>
          <dt className="text-zinc-500">Source</dt>
          <dd className="text-zinc-300">{a.kind ? KIND_LABEL[a.kind] ?? humanize(a.kind) : "—"}</dd>
        </dl>
      </div>

      <Section title="Runs for this alert" className="!mt-8">
        {data.runs.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs.</p>
        ) : (
          <List label="Runs for this alert">
            {data.runs.map((r) => (
              <ListRow
                key={r.run_id}
                title={r.title || "Untitled run"}
                href={`/runs/detail?id=${encodeURIComponent(r.run_id)}`}
                chips={
                  <>
                    <RunStatusBadge status={r.status} />
                    {own?.run_id === r.run_id && <Chip tone="success">started by this alert</Chip>}
                  </>
                }
                time={r.created_at}
                actions={
                  r.pr_url ? (
                    <a href={r.pr_url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`}>
                      Pull request<span aria-hidden="true"> ↗</span>
                    </a>
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="Alert" className="!mt-8">
        {fields.length > 0 ? (
          <dl className={`grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] sm:gap-y-2 ${cardClass}`} data-testid="alert-fields">
            {fields.map((f) => (
              <Fragment key={f.label}>
                <dt className="text-xs text-zinc-500 sm:pt-0.5">{f.label}</dt>
                <dd className="mb-2 min-w-0 text-zinc-200 sm:mb-0 [overflow-wrap:anywhere]">
                  {f.when ? <Time iso={f.value} className="!whitespace-normal" /> : f.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className={`whitespace-pre-wrap text-sm text-zinc-200 ${cardClass}`}>{a.body || "(empty)"}</p>
        )}
        {fields.length > 0 && a.body && (
          <div className="mt-3">
            <Disclosure summary="Raw alert">
              <CodeBlock {...jsonOrText(a.body)} label="The alert as it came" wrap />
            </Disclosure>
          </div>
        )}
      </Section>
    </Page>
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "NewStateReason" or "new_state_reason" becomes "New state reason". */
function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The alert's JSON as label/value pairs, two levels deep ("Trigger metric
 * name"), for reading. Text that isn't a JSON object gives none, and shows as
 * it came.
 */
function alertFields(body?: string | null): { label: string; value: string; when: boolean }[] {
  if (!body) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const out: { label: string; value: string; when: boolean }[] = [];
  const add = (key: string, v: unknown, depth: number) => {
    if (v === null || v === undefined || v === "") return;
    if (typeof v === "object" && !Array.isArray(v) && depth < 1) {
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) add(`${key} ${fieldLabel(k).toLowerCase()}`, inner, depth + 1);
      return;
    }
    const value = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
    out.push({ label: fieldLabel(key), value, when: typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v)) });
  };
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) add(k, v, 0);
  return out.slice(0, 30);
}
