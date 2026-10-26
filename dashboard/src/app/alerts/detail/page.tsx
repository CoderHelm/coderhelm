"use client";

import { CodeBlock, jsonOrText } from "@/components/code-block";
import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type AlertEventDetail, errorStatus } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { RunStatusBadge } from "@/components/run-status";
import { buttonClass, focusRing, linkButton, secondaryButton } from "@/components/ui";
import { Problem } from "@/components/problem";
import { CopyButton } from "@/components/copy-button";
import { ExternalLinkIcon } from "@/components/icons";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Chip, List, ListEmpty, ListRow, Time } from "@/components/list";
import { Code } from "@/components/settings";
import { Disclosure } from "@/components/disclosure";
import { KIND_LABEL, OutcomeBadge, humanize, outcomeDetail } from "../outcome";

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
        <ListEmpty
          title={id ? "Alert not found" : "No alert was named"}
          action={
            <Link href="/alerts" className={secondaryButton}>
              All alerts
            </Link>
          }
        >
          {id ? "It may belong to another team, or it is older than 90 days." : "Pick one from the list."}
        </ListEmpty>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <Problem
          title="We couldn't load this alert"
          onRetry={() => setAttempt((n) => n + 1)}
          details={error}
          action={
            <Link href="/alerts" className={buttonClass("ghost")}>
              All alerts
            </Link>
          }
        >
          Check your connection and try again.
        </Problem>
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
        title={a.title || "Alert with no title"}
        status={<OutcomeBadge outcome={a.outcome} />}
        lead={
          <>
            Received <Time iso={a.received_at} />
          </>
        }
        actions={
          <button type="button" onClick={copyLink} className={`${secondaryButton} shrink-0`}>
            Copy link
          </button>
        }
      />

      <div className={`mt-6 text-sm ${cardClass}`}>
        <p className="text-zinc-200">{outcomeDetail(a.outcome)}</p>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-zinc-400">Repo</dt>
          <dd className="wrap-anywhere text-zinc-200">{a.repo || "—"}</dd>
          <dt className="text-zinc-400">Comes from</dt>
          <dd className="min-w-0 text-zinc-200">
            {a.topic_arn ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Link href="/settings/alerts" title={a.topic_arn} className={linkButton}>
                  <span className="[overflow-wrap:anywhere]">{topicName(a.topic_arn)}</span>
                </Link>
                <CopyButton text={a.topic_arn} label={<>Copy<span className="sr-only"> topic address</span></>} className="!min-h-7" />
              </span>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-zinc-400">Source</dt>
          <dd className="text-zinc-200">{a.kind ? KIND_LABEL[a.kind] ?? humanize(a.kind) : "—"}</dd>
          {a.ticket_id && (
            <>
              <dt className="text-zinc-400">Reference</dt>
              <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">{a.ticket_id}</dd>
            </>
          )}
        </dl>
      </div>

      <Section title="Runs for this alert" className="!mt-8">
        {data.runs.length === 0 ? (
          <p className="text-sm text-zinc-400">Coderhelm didn&apos;t start any work for this alert. {outcomeDetail(a.outcome)}</p>
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
                    {own?.run_id === r.run_id && <Chip tone="success">Started by this alert</Chip>}
                  </>
                }
                time={r.created_at}
                actions={
                  r.pr_url ? (
                    <a href={r.pr_url} target="_blank" rel="noreferrer" className={`${buttonClass("secondary", "sm")} gap-1`}>
                      Pull request
                      <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
                    </a>
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="What happened" className="!mt-8">
        {fields.length > 0 ? (
          <dl className={`grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] sm:gap-y-2 ${cardClass}`} data-testid="alert-fields">
            {keyFields(fields).map((f) => (
              <Fragment key={f.label}>
                <dt className="text-xs text-zinc-400 sm:pt-0.5">{f.label}</dt>
                <dd className="mb-2 min-w-0 text-zinc-200 sm:mb-0 [overflow-wrap:anywhere]">
                  {f.when ? <Time iso={f.value} className="!whitespace-normal" /> : f.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className={`whitespace-pre-wrap text-sm text-zinc-200 [overflow-wrap:anywhere] ${cardClass}`}>{a.body || "The alert had no text."}</p>
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

/** The fields that say what happened; the rest wait in the raw alert. */
const KEY_FIELD = /alarm name|alarm description|state value|state reason|change time|metric name|namespace|region|detail type|source|subject|message/i;
function keyFields<T extends { label: string }>(fields: T[]): T[] {
  const key = fields.filter((f) => KEY_FIELD.test(f.label));
  return (key.length > 0 ? key : fields).slice(0, 8);
}

/** "arn:aws:sns:us-east-1:123:prod-alerts" -> "prod-alerts". */
function topicName(arn: string): string {
  return arn.split(":").pop() || arn;
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
