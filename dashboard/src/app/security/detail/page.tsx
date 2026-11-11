"use client";

// One security finding: the advisory, why Coderhelm thinks the repo is (or
// isn't) affected with the lines that show it, the fix, what happened so
// far, and dismissing or reopening it.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { errorStatus } from "@/lib/api";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { Chip, ListEmpty, Time, formatDate } from "@/components/list";
import { Field } from "@/components/settings";
import { buttonClass, dangerButton, primaryButton, secondaryButton } from "@/components/ui";
import {
  SECURITY_ADMIN,
  STATUS_LOOK,
  advisoryIds,
  dueIn,
  epssText,
  isActive,
  repoName,
  securityApi,
  type Finding,
  type TimelineEvent,
} from "@/lib/security";
import { OutLink, TierPill, VerdictPill } from "../parts";

export default function SecurityFindingPage() {
  return (
    <Suspense
      fallback={
        <Page>
          <Skeleton className="h-40 w-full" />
        </Page>
      }
    >
      <FindingDetail />
    </Suspense>
  );
}

function FindingDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { ready, can } = useCan();
  const admin = ready && can(SECURITY_ADMIN);
  const [data, setData] = useState<{ finding: Finding; timeline: TimelineEvent[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    setMissing(false);
    setError("");
    if (!id) return;
    let live = true;
    securityApi.finding(id).then(
      (d) => live && setData(d),
      (e) => {
        if (!live) return;
        const status = errorStatus(e);
        if (status === 400 || status === 404) setMissing(true);
        else setError(e instanceof Error ? e.message : "The request failed.");
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (!id || missing) {
    return (
      <Page>
        <ListEmpty
          title={id ? "Finding not found" : "No finding was named"}
          action={
            <Link href="/security" className={secondaryButton}>
              All findings
            </Link>
          }
        >
          {id ? "It may belong to another team, or the advisory was withdrawn." : "Pick one from the list."}
        </ListEmpty>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <Problem
          title="We couldn't load this finding"
          onRetry={load}
          testId="finding-error"
          action={
            <Link href="/security" className={buttonClass("ghost")}>
              All findings
            </Link>
          }
        >
          {error}
        </Problem>
      </Page>
    );
  }
  if (!data || data.finding.id !== id) {
    return (
      <Page>
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }
  return <FindingView f={data.finding} timeline={data.timeline} admin={admin} reload={load} />;
}

function FindingView({ f, timeline, admin, reload }: { f: Finding; timeline: TimelineEvent[]; admin: boolean; reload: () => void }) {
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = f.advisory;
  const ids = advisoryIds(a);
  const due = isActive(f) ? dueIn(f.due_at) : null;
  const name = repoName(f.repo);
  const facts = [
    ...ids,
    typeof a.cvss === "number" ? `CVSS ${a.cvss.toFixed(1)}` : null,
    epssText(a.epss, a.epss_percentile),
    isActive(f) && f.due_at ? `due ${formatDate(f.due_at, { time: true })}${due ? ` (${due.overdue ? due.text : `in ${due.text}`})` : ""}` : null,
  ].filter(Boolean);

  const reopen = async () => {
    setBusy(true);
    try {
      await securityApi.reopen(f.id);
      toast("Reopened. Coderhelm picks it up again with its tier and deadline.");
      reload();
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can reopen a finding." : "Could not reopen it. Try again.", "error");
    }
    setBusy(false);
  };

  return (
    <Page>
      <PageHeader
        detail
        crumb={a.primary || a.title}
        eyebrow={
          <span className="font-mono [overflow-wrap:anywhere]">
            {f.package} {f.version} in {name}
          </span>
        }
        title={a.title || a.primary || "Advisory with no title"}
        status={
          <span className="flex flex-wrap items-center gap-2">
            <TierPill tier={f.tier} />
            <VerdictPill verdict={f.verdict} scope={f.scope} />
            {a.kev && <Chip tone="danger">On exploited list</Chip>}
            {a.malware && <Chip tone="danger">Malicious package</Chip>}
            {!isActive(f) && <Chip tone={STATUS_LOOK[f.status]?.tone ?? "neutral"}>{STATUS_LOOK[f.status]?.label ?? f.status}</Chip>}
          </span>
        }
        lead={
          <span className="font-mono text-xs [overflow-wrap:anywhere]" data-testid="finding-facts">
            {facts.join(" · ")}
          </span>
        }
        actions={
          <>
            {f.pr && (
              <a href={f.pr.url} target="_blank" rel="noreferrer" className={primaryButton}>
                Open PR #{f.pr.number}
              </a>
            )}
            {admin && f.status === "dismissed" && (
              <button type="button" className={secondaryButton} onClick={reopen} disabled={busy} data-testid="reopen">
                {busy ? "Reopening…" : "Reopen"}
              </button>
            )}
            {admin && f.status !== "dismissed" && f.status !== "fixed" && f.status !== "withdrawn" && !dismissing && (
              <button type="button" className={secondaryButton} onClick={() => setDismissing(true)} data-testid="dismiss-open">
                Dismiss with reason
              </button>
            )}
          </>
        }
      />

      {dismissing && <DismissForm f={f} onDone={() => {
            setDismissing(false);
            reload();
          }} onCancel={() => setDismissing(false)} />}

      {f.dismissed && (
        <div className="mt-6">
          <Callout variant="neutral" title="Dismissed" testId="dismissed-note">
            <p className="[overflow-wrap:anywhere]">
              By {f.dismissed.by} on {formatDate(f.dismissed.at)}: “{f.dismissed.reason}”
            </p>
            <p>{f.dismissed.until ? `It comes back on ${formatDate(f.dismissed.until)} if it still applies.` : "It stays dismissed until someone reopens it."}</p>
          </Callout>
        </div>
      )}

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Evidence f={f} name={name} />
          <FixBlock f={f} />
          <AdvisoryBlock f={f} />
        </div>
        <Timeline events={timeline} />
      </div>
    </Page>
  );
}

const HEADING: Record<Finding["verdict"], (name: string) => string> = {
  reachable: (n) => `Why we think ${n} is affected`,
  unknown: (n) => `Why we can't tell whether ${n} is affected`,
  not_reachable: (n) => `Why we think ${n} doesn't reach the vulnerable code`,
  not_loaded: (n) => `Why we think ${n} never loads it`,
  pending: (n) => `Checking whether ${n} is affected`,
};

function Evidence({ f, name }: { f: Finding; name: string }) {
  const ev = f.evidence;
  const edge = f.verdict === "reachable" ? "shadow-[inset_3px_0_0_var(--color-red-400)]" : f.verdict === "not_reachable" ? "shadow-[inset_3px_0_0_var(--color-amber-400)]" : "";
  const path = f.path.length > 0 ? `${f.path.join(" > ")} (${f.scope}, ${f.relation})` : null;
  return (
    <section aria-labelledby="evidence-heading" className={`${cardClass} space-y-3 ${edge}`} data-testid="evidence">
      <h2 id="evidence-heading" className="text-sm font-semibold text-zinc-100">
        {HEADING[f.verdict]?.(name) ?? HEADING.unknown(name)}
      </h2>
      {ev?.summary ? (
        <p className="text-sm text-zinc-200 [overflow-wrap:anywhere]">{ev.summary}</p>
      ) : (
        <p className="text-sm text-zinc-400">{f.verdict === "pending" ? "Coderhelm is reading the code. This updates in a few minutes." : "No evidence was recorded for this verdict."}</p>
      )}
      {((ev?.lines.length ?? 0) > 0 || path) && (
        <div className="overflow-x-auto rounded-md bg-zinc-950 px-3 py-2.5" data-testid="evidence-lines">
          <ul className="font-mono text-xs leading-relaxed text-zinc-300">
            {ev?.lines.map((l, i) => (
              <li key={`${l.file}:${l.line}:${i}`} className="whitespace-pre">
                <span className="text-zinc-400">
                  {l.file}:{l.line}
                </span>
                {"   "}
                {l.text}
              </li>
            ))}
            {path && <li className="whitespace-pre text-zinc-400">dependency path: {path}</li>}
          </ul>
        </div>
      )}
      {ev && (ev.checked || ev.confidence) && (
        <p className="text-xs text-zinc-400">
          {ev.checked ? `Checked: ${ev.checked}. ` : ""}Confidence {ev.confidence}.
        </p>
      )}
    </section>
  );
}

function FixBlock({ f }: { f: Finding }) {
  const ci = f.pr?.ci === "passing" ? "CI is passing" : f.pr?.ci === "failing" ? "CI is failing and Coderhelm is fixing it" : f.pr?.ci === "pending" ? "CI is running" : null;
  return (
    <section aria-labelledby="fix-heading" className={`${cardClass} space-y-2 text-sm`} data-testid="fix">
      <h2 id="fix-heading" className="text-sm font-semibold text-zinc-100">
        The fix
      </h2>
      {f.fixed_version ? (
        <p className="text-zinc-200 [overflow-wrap:anywhere]">
          Fixed in <span className="font-mono">{f.package} {f.fixed_version}</span>. Coderhelm moves {f.relation === "transitive" ? "this indirect dependency" : "it"} from{" "}
          <span className="font-mono">{f.version}</span> to <span className="font-mono">{f.fixed_version}</span> in <span className="font-mono">{f.manifest}</span>, using
          the repo&apos;s own package manager to update the lockfile.
        </p>
      ) : (
        <p className="text-zinc-200">No fixed version is out yet. Coderhelm checks again when the advisory gets one.</p>
      )}
      {f.pr ? (
        <p className="text-zinc-300">
          <OutLink href={f.pr.url}>Pull request #{f.pr.number}</OutLink>{" "}
          {f.pr.state === "merged" ? "is merged." : f.pr.state === "closed" ? "was closed without merging." : ci ? `is open; ${ci}.` : "is open."}
          {f.pr.adopted && " Coderhelm adopted the pull request Dependabot or Renovate had opened, instead of opening a duplicate."}
        </p>
      ) : (
        isActive(f) && <p className="text-zinc-400">No pull request yet. The policy decides when this tier gets one.</p>
      )}
      {f.dependabot_alert && (
        <p className="text-zinc-400">
          <OutLink href={f.dependabot_alert.url}>Dependabot alert #{f.dependabot_alert.number}</OutLink> closes when the fix merges.
        </p>
      )}
    </section>
  );
}

const SOURCE_WORD: Record<string, string> = { dependabot: "Dependabot", osv: "OSV", github_advisory: "GitHub advisories" };

function AdvisoryBlock({ f }: { f: Finding }) {
  const a = f.advisory;
  return (
    <section aria-labelledby="advisory-heading" className={`${cardClass} space-y-2 text-sm`} data-testid="advisory">
      <h2 id="advisory-heading" className="text-sm font-semibold text-zinc-100">
        The advisory
      </h2>
      {a.summary && <p className="whitespace-pre-line text-zinc-300 [overflow-wrap:anywhere]">{a.summary}</p>}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {a.cvss_vector && (
          <>
            <dt className="text-zinc-400">CVSS vector</dt>
            <dd className="font-mono text-xs text-zinc-200 [overflow-wrap:anywhere]">{a.cvss_vector}</dd>
          </>
        )}
        {a.kev && (
          <>
            <dt className="text-zinc-400">Exploited</dt>
            <dd className="text-zinc-200">On CISA&apos;s list of exploited vulnerabilities{a.kev_due ? `, due ${formatDate(a.kev_due)}` : ""}</dd>
          </>
        )}
        {a.cwe.length > 0 && (
          <>
            <dt className="text-zinc-400">Weakness</dt>
            <dd className="font-mono text-xs text-zinc-200 [overflow-wrap:anywhere]">{a.cwe.join(", ")}</dd>
          </>
        )}
        {a.published_at && (
          <>
            <dt className="text-zinc-400">Published</dt>
            <dd className="text-zinc-200">{formatDate(a.published_at)}</dd>
          </>
        )}
        <dt className="text-zinc-400">Found in</dt>
        <dd className="font-mono text-xs text-zinc-200 [overflow-wrap:anywhere]">
          {f.repo} · {f.manifest} · {f.ecosystem}
        </dd>
        <dt className="text-zinc-400">First seen</dt>
        <dd className="text-zinc-200">
          <Time iso={f.first_seen_at} />
        </dd>
      </dl>
      {a.urls.length > 0 && (
        <ul className="space-y-0.5">
          {a.urls.slice(0, 6).map((u) => (
            <li key={u} className="min-w-0">
              <OutLink href={u}>{u}</OutLink>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-400">Advisory data: {SOURCE_WORD[a.source] ?? a.source}, OSV and GitHub (CC-BY).</p>
    </section>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Section title="Timeline" className="!mt-0">
      {events.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing has happened yet.</p>
      ) : (
        <ol className="space-y-2 text-sm" data-testid="timeline">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <span className="text-xs tabular-nums text-zinc-400" title={new Date(e.at).toLocaleString()}>
                {formatDate(e.at, { time: true })}
              </span>
              <span className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
                {e.link ? <OutLink href={e.link}>{e.text}</OutLink> : e.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Dismissing, confirmed in the page: why, and optionally until when. */
function DismissForm({ f, onDone, onCancel }: { f: Finding; onDone: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    if (!reason.trim()) {
      setProblem("Say why, so the next person who looks knows.");
      return;
    }
    if (until && until <= today) {
      setProblem("The date it comes back must be after today, or leave it empty.");
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const r = await securityApi.dismiss(f.id, { reason: reason.trim(), until: until || null });
      toast(
        r?.synced
          ? "Dismissed here and on the Dependabot alert."
          : f.dependabot_alert
            ? "Dismissed in Coderhelm. The Dependabot alert stays open: the GitHub App can only read alerts."
            : "Dismissed.",
      );
      onDone();
    } catch (e) {
      const status = errorStatus(e);
      setProblem(
        status === 403
          ? "Only admins can dismiss a finding."
          : status === 400 && e instanceof Error && e.message
            ? e.message
            : "Could not dismiss it. Try again.",
      );
    }
    setSaving(false);
  };

  return (
    <section aria-labelledby="dismiss-heading" className={`mt-6 ${cardClass} space-y-4 border-zinc-600`} data-testid="dismiss-form">
      <div>
        <h2 id="dismiss-heading" className="text-sm font-semibold text-zinc-100">
          Dismiss this finding
        </h2>
        <p className="mt-1 max-w-prose text-sm text-zinc-400">
          Coderhelm stops working on it and posts nothing more about it. The reason is kept with the finding
          {f.dependabot_alert ? ", and the Dependabot alert is dismissed too when the GitHub App may change alerts" : ""}.
        </p>
      </div>
      <Field
        as="textarea"
        label="Why"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: the vulnerable option is turned off in every environment."
        error={problem && !reason.trim() ? problem : undefined}
        data-testid="dismiss-reason"
      />
      <Field
        label="Bring it back on (optional)"
        help="Leave empty to keep it dismissed until someone reopens it."
        type="date"
        min={today}
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        controlClassName="sm:w-48"
        error={problem && reason.trim() ? problem : undefined}
        data-testid="dismiss-until"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={dangerButton} onClick={submit} disabled={saving} data-testid="dismiss-confirm">
          {saving ? "Dismissing…" : "Dismiss finding"}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </section>
  );
}
