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
import { Page, PageHeader, cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { Chip, ListEmpty, Time, formatDate } from "@/components/list";
import { Field } from "@/components/settings";
import { buttonClass, dangerButton, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { InlineMarkdown, Markdown } from "@/components/markdown";
import {
  SECURITY_ADMIN,
  STATUS_LOOK,
  advisoryIds,
  cannotFix,
  closedWords,
  dueIn,
  epssText,
  isActive,
  isMajor,
  repoName,
  securityApi,
  type Combine,
  type Finding,
  type FindingGroup,
  type TimelineEvent,
} from "@/lib/security";
import { OutLink, TierPill, VerdictPill } from "../parts";
import { FixRequest } from "../fix-request";

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
  const [asking, setAsking] = useState<Combine | null>(null);
  const [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<FindingGroup[] | null>(null);
  const [openPr, setOpenPr] = useState<FindingGroup["pr"]>(null);
  const a = f.advisory;
  const ids = advisoryIds(a);
  const due = isActive(f) ? dueIn(f.due_at) : null;
  const name = repoName(f.repo);
  const provisional = !!f.tier_provisional || f.verdict === "pending";
  // The ids and the deadline: the scores have their own boxes.
  const facts = [
    ...ids,
    isActive(f) && f.due_at ? `due ${formatDate(f.due_at, { time: true })}${due ? ` (${due.overdue ? due.text : `in ${due.text}`})` : ""}` : null,
  ].filter(Boolean);

  // Every place the package is installed in this repo (one per version),
  // and the repo's open security PR a fix can be added to.
  useEffect(() => {
    let live = true;
    securityApi.groups({ status: "all", repo: f.repo, q: f.package }).then(
      (r) => live && setPlaces(r.groups.filter((g) => g.package === f.package)),
      () => live && setPlaces([]),
    );
    securityApi.groups({ status: "open", repo: f.repo }).then(
      (r) => live && setOpenPr(r.groups.map((g) => g.pr).find((p) => p && p.state === "open" && !p.adopted) ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [f.repo, f.package]);

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
          <span className="font-mono [overflow-wrap:anywhere]" data-testid="finding-eyebrow">
            {f.package} {f.version || "(version unknown)"}
            {f.fixed_version ? ` · fixed in ${f.fixed_version}` : " · no fix yet"} · {name}
          </span>
        }
        title={a.title || a.primary || "Advisory with no title"}
        status={
          <span className="flex flex-wrap items-center gap-2">
            <TierPill tier={f.tier} provisional={provisional} />
            <VerdictPill verdict={f.verdict} scope={f.scope} />
            {a.kev && <Chip tone="danger">On exploited list</Chip>}
            {a.malware && <Chip tone="danger">Malicious package</Chip>}
            {!isActive(f) && <Chip tone={STATUS_LOOK[f.status]?.tone ?? "neutral"}>{STATUS_LOOK[f.status]?.label ?? f.status}</Chip>}
          </span>
        }
        lead={
          <span className="text-zinc-300" data-testid="finding-summary">
            {plainSummary(f, name)}
          </span>
        }
        actions={
          <>
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

      {asking && <FixRequest ids={[f.id]} combine={asking} names={{ [f.id]: f.package }} onCancel={() => setAsking(null)} onDone={() => reload()} />}

      {dismissing && (
        <DismissForm
          f={f}
          onDone={() => {
            setDismissing(false);
            reload();
          }}
          onCancel={() => setDismissing(false)}
        />
      )}

      {f.dismissed && (
        <div className="mt-6">
          <Callout variant="neutral" title="Dismissed" testId="dismissed-note">
            <p className="[overflow-wrap:anywhere]">
              By {f.dismissed.by} on {formatDate(f.dismissed.at)}: “{f.dismissed.reason}”
            </p>
            <p>
              {f.dismissed.until ? `It comes back on ${formatDate(f.dismissed.until)} if it still applies.` : "It stays dismissed until someone reopens it."}
            </p>
          </Callout>
        </div>
      )}

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <AdvisoryBlock f={f} facts={facts as string[]} />
          <Evidence f={f} name={name} />
          <FixBlock f={f} places={places} openPr={openPr} admin={admin} asking={asking !== null} onAsk={setAsking} />
        </div>
        <Timeline events={timeline} />
      </div>
    </Page>
  );
}

/** One plain line under the title: what, where, how bad, by when. */
function plainSummary(f: Finding, name: string): string {
  const sev = typeof f.advisory.cvss === "number" ? `${severityWord(f.advisory.cvss)} severity (CVSS ${f.advisory.cvss.toFixed(1)})` : "Severity not scored";
  const how = f.relation === "transitive" ? "an indirect dependency" : f.relation === "direct" ? "a direct dependency" : "a dependency";
  const dev = f.scope === "dev" ? ", used only in development" : "";
  const due = isActive(f) && f.due_at ? `, due ${formatDate(f.due_at)}` : "";
  return `${f.package} is ${how} of ${name}${dev}. ${sev}${f.advisory.kev ? ", and attackers are using it" : ""}${due}.`;
}

function severityWord(cvss: number): string {
  return cvss >= 9 ? "Critical" : cvss >= 7 ? "High" : cvss >= 4 ? "Medium" : "Low";
}

/** Server words cleaned for reading: no doubled full stops, "1 search" not "1 searches". */
function tidy(s: string): string {
  return s
    .replace(/\b1 (search|file|line|match|call site|symbol)(?:es|s)\b/g, "1 $1")
    .replace(/\.{2,}(?=\s|$)/g, ".")
    .trim();
}

const VERDICT_EDGE: Partial<Record<Finding["verdict"], string>> = {
  reachable: "shadow-[inset_3px_0_0_var(--color-red-400)]",
  not_reachable: "shadow-[inset_3px_0_0_var(--color-amber-400)]",
  unknown: "shadow-[inset_3px_0_0_var(--color-sky-400)]",
};

const HEADING: Record<Finding["verdict"], (name: string) => string> = {
  reachable: (n) => `Why we think ${n} is affected`,
  unknown: (n) => `Why we can't tell whether ${n} is affected`,
  not_reachable: (n) => `Why we think ${n} doesn't reach the vulnerable code`,
  not_loaded: (n) => `Why we think ${n} never loads it`,
  pending: (n) => `Checking whether ${n} is affected`,
};

function Evidence({ f, name }: { f: Finding; name: string }) {
  const ev = f.evidence;
  const parent = f.relation === "transitive" && f.path.length > 2 ? f.path[f.path.length - 2].replace(/\s+\S+$/, "") : null;
  const lines = ev?.lines ?? [];
  return (
    <section aria-labelledby="evidence-heading" className={`${cardClass} space-y-3 ${VERDICT_EDGE[f.verdict] ?? ""}`} data-testid="evidence">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id="evidence-heading" className="text-sm font-semibold text-zinc-100">
          {HEADING[f.verdict]?.(name) ?? HEADING.unknown(name)}
        </h2>
        <VerdictPill verdict={f.verdict} scope={f.scope} />
      </div>
      {f.verdict === "unknown" ? (
        <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]" data-testid="why-unknown">
          <dt className="text-zinc-400">What was searched</dt>
          <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
            <InlineMarkdown>{tidy(ev?.checked || `The code, for ${f.package}.`)}</InlineMarkdown>
          </dd>
          <dt className="text-zinc-400">What was found</dt>
          <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
            {lines.length > 0
              ? `${lines.length} line${lines.length === 1 ? "" : "s"} that use it (below).`
              : tidy(ev?.summary || "No line in the code names it.")}
          </dd>
          <dt className="text-zinc-400">Why that isn&apos;t enough</dt>
          <dd className="min-w-0 text-zinc-200">
            {lines.length > 0
              ? "The lines use the package, but none shows whether the vulnerable part runs with input someone else controls."
              : parent
                ? `Your code doesn't call ${f.package} itself, and the advisory names no function to look for inside ${parent}.`
                : "The advisory names no function to look for, so a mention of the package doesn't show whether the vulnerable part runs."}
          </dd>
          <dt className="text-zinc-400">What would settle it</dt>
          <dd className="min-w-0 text-zinc-200" data-testid="settle">
            {parent
              ? `It's pulled in by ${parent}. Whether your code sends untrusted input into ${f.package} through ${parent} settles it: if it doesn't, dismiss this with that reason. Coderhelm checks again when the advisory names the vulnerable function.`
              : `Whether your code sends untrusted input into the vulnerable part of ${f.package}. If it doesn't, dismiss this with that reason; Coderhelm checks again when the advisory names the vulnerable function.`}
          </dd>
        </dl>
      ) : ev?.summary ? (
        <p className="text-sm text-zinc-200 [overflow-wrap:anywhere]">{tidy(ev.summary)}</p>
      ) : (
        <p className="text-sm text-zinc-400">
          {f.verdict === "pending" ? "Coderhelm is reading the code. This updates in a few minutes." : "No evidence was recorded for this verdict."}
        </p>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md bg-zinc-950 px-3 py-2.5" data-testid="evidence-lines">
          <ul className="font-mono text-xs leading-relaxed text-zinc-300">
            {lines.map((l, i) => (
              <li key={`${l.file}:${l.line}:${i}`} className="flex min-w-0 flex-col py-0.5 sm:flex-row sm:gap-4">
                <span className="shrink-0 text-zinc-400">
                  {l.file}:{l.line}
                </span>
                <span className="whitespace-pre">{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ev && f.verdict !== "unknown" && (ev.checked || ev.confidence) && (
        <p className="text-xs text-zinc-400">
          {ev.checked ? `Checked: ${tidy(ev.checked).replace(/\.$/, "")}. ` : ""}Confidence {ev.confidence}.
        </p>
      )}
      {ev && f.verdict === "unknown" && ev.confidence && <p className="text-xs text-zinc-400">Confidence {ev.confidence}.</p>}
    </section>
  );
}

/** The fix: the main card, with the action. Each place the package is installed, its version and its fix. */
function FixBlock({
  f,
  places,
  openPr,
  admin,
  asking,
  onAsk,
}: {
  f: Finding;
  places: FindingGroup[] | null;
  openPr: FindingGroup["pr"];
  admin: boolean;
  asking: boolean;
  onAsk: (c: Combine) => void;
}) {
  const cannot = cannotFix(f);
  // Its pull request closed without merging: a new one can be asked for.
  const reask = !!f.pr && f.pr.state === "closed" && admin && isActive(f) && !!f.fixed_version;
  const ci =
    f.pr?.ci === "passing"
      ? "CI is passing"
      : f.pr?.ci === "failing"
        ? "CI is failing and Coderhelm is fixing it"
        : f.pr?.ci === "pending"
          ? "CI is running"
          : null;
  const major = isMajor(f.version, f.fixed_version);
  // This finding first; the others are the same package at other versions or in other lockfiles.
  const others = (places ?? []).filter((g) => !g.finding_ids.includes(f.id));
  const path = f.path.length > 0 ? f.path : [f.package];
  return (
    <section aria-labelledby="fix-heading" className={`${cardClass} space-y-4 border-zinc-700 bg-zinc-900 text-sm`} data-testid="fix">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="fix-heading" className="text-sm font-semibold text-zinc-100">
            The fix
          </h2>
          {f.fixed_version ? (
            <p className="mt-1 text-zinc-200 [overflow-wrap:anywhere]">
              Fixed in{" "}
              <span className="font-mono">
                {f.package} {f.fixed_version}
              </span>
              .
            </p>
          ) : (
            <p className="mt-1 text-zinc-200">No fixed version is out yet. Coderhelm checks again when the advisory gets one.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {f.pr && !reask ? (
            <a href={f.pr.url} target="_blank" rel="noreferrer" className={primaryButton} data-testid="fix-pr-link">
              PR #{f.pr.number}
              {f.pr.state === "merged"
                ? ", merged"
                : f.pr.state === "closed"
                  ? ", closed"
                  : f.pr.ci === "passing"
                    ? ", CI passing"
                    : f.pr.ci === "failing"
                      ? ", fixing CI"
                      : f.pr.ci
                        ? ", CI running"
                        : ""}
            </a>
          ) : (
            admin &&
            isActive(f) &&
            f.fixed_version && (
              <>
                {f.pr && (
                  <a href={f.pr.url} target="_blank" rel="noreferrer" className={secondaryButton} data-testid="fix-pr-link">
                    PR #{f.pr.number}, closed
                  </a>
                )}
                {!cannot && openPr && (
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => onAsk("one_pr")}
                    disabled={asking}
                    data-testid="add-to-pr"
                    title={`Add this fix to PR #${openPr.number}, the open security PR for this repo`}
                  >
                    Add to the open PR #{openPr.number}
                  </button>
                )}
                <button
                  type="button"
                  className={openPr && !cannot ? secondaryButton : primaryButton}
                  onClick={() => onAsk("per_package")}
                  disabled={!!cannot || asking}
                  title={cannot ?? "Open a fix pull request for this package version now"}
                  aria-describedby={cannot ? "fix-cannot" : undefined}
                  data-testid="open-fix-pr"
                >
                  Open fix PR
                </button>
                {!cannot && !openPr && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => onAsk("one_pr")}
                    disabled={asking}
                    data-testid="add-to-pr"
                    title="Add this fix to the repo's open security PR, or start one"
                  >
                    Add to a PR
                  </button>
                )}
              </>
            )
          )}
        </div>
      </div>
      {f.pr?.state === "closed" && isActive(f) && (
        <p className="text-xs text-zinc-300" data-testid="fix-closed">
          PR #{f.pr.number} was {closedWords(f.pr)} without merging.{" "}
          {reask ? "Open a new one when you want the fix; Coderhelm does not open one by itself for a week after a pull request is closed." : "A new one can be opened by an admin."}
        </p>
      )}
      {cannot && f.fixed_version && admin && !f.pr && isActive(f) && (
        <p id="fix-cannot" className="text-xs text-zinc-400" data-testid="fix-cannot">
          {cannot}
        </p>
      )}
      {f.pr && (
        <p className="text-zinc-300">
          <OutLink href={f.pr.url}>Pull request #{f.pr.number}</OutLink>{" "}
          {f.pr.state === "merged" ? "is merged." : f.pr.state === "closed" ? "was closed without merging." : ci ? `is open; ${ci}.` : "is open."}
          {f.pr.adopted && " Coderhelm adopted the pull request Dependabot or Renovate had opened, instead of opening a duplicate."}
        </p>
      )}

      <div className="rounded-md border border-zinc-800 bg-zinc-950/50" data-testid="fix-places">
        <Place
          manifest={f.manifest}
          from={f.version}
          to={f.fixed_version}
          major={major}
          note={others.length > 0 ? "This finding" : null}
          detail={`${f.relation === "transitive" ? "Indirect" : f.relation === "direct" ? "Direct" : "Dependency"}, ${f.scope === "dev" ? "development only" : f.scope === "runtime" ? "runtime" : "scope unknown"}`}
        />
        {others.map((g) => (
          <Place
            key={g.key}
            manifest={g.manifests.join(", ")}
            from={g.version}
            to={g.fixed_version}
            major={isMajor(g.version, g.fixed_version)}
            note={g.pr ? `PR #${g.pr.number}` : "See that finding"}
            href={`/security/detail?id=${encodeURIComponent(g.finding_ids[0])}`}
          />
        ))}
      </div>
      {others.length > 0 && (
        <p className="text-xs text-zinc-400" data-testid="fix-places-note">
          {f.package} is installed at {others.length + 1} versions in this repo. Each one is its own finding with its own fix.
        </p>
      )}

      <div>
        <h3 className="text-xs font-medium text-zinc-400">How it gets in</h3>
        <ol className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-xs" data-testid="dependency-path" aria-label="Dependency path">
          {path.map((p, i) => (
            <li key={`${p}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-zinc-500">
                  ›
                </span>
              )}
              <span
                className={`rounded border px-1.5 py-0.5 font-mono [overflow-wrap:anywhere] ${i === path.length - 1 ? "border-zinc-600 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}
              >
                {p}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {f.dependabot_alert && (
        <p className="text-zinc-400">
          <OutLink href={f.dependabot_alert.url}>Dependabot alert #{f.dependabot_alert.number}</OutLink> closes when the fix merges.
        </p>
      )}
      {f.private_report && (
        <p className="text-zinc-300" data-testid="private-report">
          A private report against this repository&apos;s own code. Coderhelm keeps it here only: it is never posted to a channel and never fixed in a public
          pull request or issue. Publishing the advisory on GitHub makes it public.
        </p>
      )}
    </section>
  );
}

function Place({
  manifest,
  from,
  to,
  major,
  note,
  detail,
  href,
}: {
  manifest: string;
  from: string;
  to: string | null;
  major: boolean;
  note: string | null;
  detail?: string;
  href?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 px-3 py-2.5 last:border-b-0"
      data-testid="fix-place"
    >
      <div className="min-w-0">
        <p className="font-mono text-xs text-zinc-300 [overflow-wrap:anywhere]">{manifest || "Manifest unknown"}</p>
        {detail && <p className="mt-0.5 text-xs text-zinc-400">{detail}</p>}
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-100">
        <span className="font-mono">{from || "?"}</span>
        <span className="text-zinc-400">to</span>
        {to ? <span className="font-mono">{to}</span> : <span className="text-zinc-400">no fix yet</span>}
        {major && <span className="rounded bg-amber-500/15 px-1.5 py-px text-xs font-medium text-amber-200">major</span>}
        {note &&
          (href ? (
            <Link href={href} className={`${linkButton} !text-xs`}>
              {note}
            </Link>
          ) : (
            <span className="text-xs text-zinc-400">{note}</span>
          ))}
      </p>
    </div>
  );
}

const SOURCE_WORD: Record<string, string> = {
  dependabot: "Dependabot",
  osv: "OSV",
  github_advisory: "GitHub advisories",
  repository_advisory: "the repository's own security advisory",
};

/** The advisory's first paragraph that is prose, for the collapsed view. */
function firstParagraph(md: string): string {
  // A heading line that leads its block ("### Summary") is dropped.
  const blocks = md.split(/\n\s*\n/).map((b) => b.replace(/^(#{1,6} .*\n)+/, "").trim());
  return blocks.find((b) => b && !/^(#|```|~~~|\||[-*] |\d+\. |>)/.test(b)) ?? blocks[0] ?? "";
}

function AdvisoryBlock({ f, facts }: { f: Finding; facts: string[] }) {
  const a = f.advisory;
  const [full, setFull] = useState(false);
  const summary = a.summary.trim();
  const short = firstParagraph(summary);
  const more = summary.length > short.length + 2;
  const links = a.urls.filter((u) => /github\.com\/advisories|osv\.dev/.test(u)).slice(0, 2);
  const rest = a.urls.filter((u) => !links.includes(u)).slice(0, 4);
  return (
    <section aria-labelledby="advisory-heading" className={`${cardClass} space-y-3 text-sm`} data-testid="advisory">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id="advisory-heading" className="text-sm font-semibold text-zinc-100">
          What it is
        </h2>
        <span className="flex flex-wrap gap-2">
          {links.map((u) => (
            <OutLink key={u} href={u}>
              {/osv\.dev/.test(u) ? "OSV" : "GitHub advisory"}
            </OutLink>
          ))}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2" data-testid="severity">
        {typeof a.cvss === "number" && (
          <Fact label="CVSS" value={`${a.cvss.toFixed(1)} ${severityWord(a.cvss).toLowerCase()}`} tone={a.cvss >= 9 ? "red" : a.cvss >= 7 ? "amber" : "zinc"} />
        )}
        {typeof a.epss === "number" && (
          <Fact
            label="Exploit chance (30 days)"
            value={epssText(a.epss, a.epss_percentile)?.replace(/^EPSS /, "") ?? ""}
            tone={a.epss >= 0.1 ? "amber" : "zinc"}
          />
        )}
        <Fact label="Exploited list" value={a.kev ? `Yes${a.kev_due ? `, due ${formatDate(a.kev_due)}` : ""}` : "No"} tone={a.kev ? "red" : "zinc"} />
        {a.cwe.length > 0 && <Fact label="Weakness" value={a.cwe.join(", ")} tone="zinc" />}
        {a.published_at && <Fact label="Published" value={formatDate(a.published_at)} tone="zinc" />}
      </div>
      <p className="font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="finding-facts">
        {facts.join(" · ")}
      </p>
      {summary && (
        <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 [&_pre]:max-w-full" data-testid="advisory-body">
          <Markdown>{full ? summary : short}</Markdown>
          {more && (
            <button type="button" className={`${linkButton} mt-1 !text-sm`} onClick={() => setFull((v) => !v)} aria-expanded={full} data-testid="advisory-more">
              {full ? "Show less" : "Read the full advisory"}
            </button>
          )}
        </div>
      )}
      {(a.cvss_vector || rest.length > 0) && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer select-none text-zinc-400 hover:text-zinc-200">More details</summary>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            {a.cvss_vector && (
              <>
                <dt>CVSS vector</dt>
                <dd className="font-mono text-zinc-200 [overflow-wrap:anywhere]">{a.cvss_vector}</dd>
              </>
            )}
            <dt>Found in</dt>
            <dd className="font-mono text-zinc-200 [overflow-wrap:anywhere]">
              {f.repo} · {f.manifest} · {f.ecosystem}
            </dd>
            <dt>First seen</dt>
            <dd className="text-zinc-200">
              <Time iso={f.first_seen_at} />
            </dd>
          </dl>
          {rest.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {rest.map((u) => (
                <li key={u} className="min-w-0">
                  <OutLink href={u}>{u}</OutLink>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {a.kev && <p className="sr-only">On CISA&apos;s list of exploited vulnerabilities</p>}
      <p className="text-xs text-zinc-400">Advisory data: {SOURCE_WORD[a.source] ?? a.source}, OSV and GitHub (CC-BY).</p>
    </section>
  );
}

const FACT_TONE = {
  red: "border-red-500/30 bg-red-500/10 text-red-200",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  zinc: "border-zinc-800 bg-zinc-950/40 text-zinc-200",
} as const;

function Fact({ label, value, tone }: { label: string; value: string; tone: keyof typeof FACT_TONE }) {
  return (
    <div className={`min-w-0 rounded-md border px-2.5 py-1.5 ${FACT_TONE[tone]}`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-sm font-medium [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

type EventKind = "alert" | "check" | "pr" | "run" | "risk" | "dismiss" | "other";

function eventKind(text: string): EventKind {
  if (/^PR #|pull request|Adopted|merged|CI passed/i.test(text)) return "pr";
  if (/Fix run|Fix PR requested|run started/i.test(text)) return "run";
  if (/Checked|verdict|reachab|Reading the code/i.test(text)) return "check";
  if (/EPSS|exploited|tier/i.test(text)) return "risk";
  if (/Dismiss|Reopen|withdrawn|Open again/i.test(text)) return "dismiss";
  if (/alert|advisory|Found|received|OSV/i.test(text)) return "alert";
  return "other";
}

const KIND_WORD: Record<EventKind, string> = {
  alert: "Found",
  check: "Checked",
  pr: "Pull request",
  run: "Fix run",
  risk: "Risk",
  dismiss: "Status",
  other: "Event",
};

function EventIcon({ kind }: { kind: EventKind }) {
  const common = {
    viewBox: "0 0 16 16",
    className: "h-3.5 w-3.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "alert":
      return (
        <svg {...common}>
          <path d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5v2.5L3 10.5h10l-1.5-2V6A3.5 3.5 0 0 0 8 2.5zM6.5 12.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4" />
          <path d="M10 10l3 3" />
        </svg>
      );
    case "pr":
      return (
        <svg {...common}>
          <circle cx="4.5" cy="3.5" r="1.5" />
          <circle cx="4.5" cy="12.5" r="1.5" />
          <circle cx="11.5" cy="12.5" r="1.5" />
          <path d="M4.5 5v6M11.5 11V6.5A2 2 0 0 0 9.5 4.5H7.5M9 3l-1.5 1.5L9 6" />
        </svg>
      );
    case "run":
      return (
        <svg {...common}>
          <path d="M5 3.5l7 4.5-7 4.5z" />
        </svg>
      );
    case "risk":
      return (
        <svg {...common}>
          <path d="M2.5 11.5l4-4 2.5 2.5 4.5-5M10 5h3.5v3.5" />
        </svg>
      );
    case "dismiss":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.5 8h5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
  }
}

const KIND_TONE: Record<EventKind, string> = {
  alert: "border-sky-500/40 text-sky-300",
  check: "border-violet-500/40 text-violet-300",
  pr: "border-emerald-500/40 text-emerald-300",
  run: "border-emerald-500/40 text-emerald-300",
  risk: "border-amber-500/40 text-amber-300",
  dismiss: "border-zinc-600 text-zinc-300",
  other: "border-zinc-700 text-zinc-400",
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section aria-labelledby="timeline-heading" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <h2 id="timeline-heading" className="text-sm font-semibold text-zinc-100">
        Timeline
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">Nothing has happened yet.</p>
      ) : (
        <ol
          className="relative mt-3 space-y-4 before:absolute before:bottom-2 before:left-[0.8rem] before:top-2 before:w-px before:bg-zinc-800"
          data-testid="timeline"
        >
          {events.map((e, i) => {
            const kind = eventKind(e.text);
            return (
              <li key={`${e.at}-${i}`} className="relative flex min-w-0 gap-3" data-kind={kind}>
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-0.5 flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-full border bg-zinc-950 ${KIND_TONE[kind]}`}
                >
                  <EventIcon kind={kind} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-zinc-400">
                    <span className="sr-only">{KIND_WORD[kind]}, </span>
                    <span title={new Date(e.at).toLocaleString()}>{formatDate(e.at, { time: true })}</span>
                  </p>
                  <p className="text-zinc-200 [overflow-wrap:anywhere]">{e.link ? <OutLink href={e.link}>{e.text}</OutLink> : e.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
