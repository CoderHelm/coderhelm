"use client";

import { useCan } from "@/hooks/use-can";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  type LogAutofix,
  type LogFinding,
  type LogFindingStatus,
  type LogFindingsList,
  type LogSample,
  type LogSeverity,
  type Repo,
  type RepoResolution,
} from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Modal, ModalFooter } from "@/components/modal";
import { RepoCombobox } from "@/components/repo-combobox";
import { ResolvedRepo, isSure } from "@/components/resolved-repo";
import { Segmented } from "@/components/segmented";
import { Callout } from "@/components/callout";
import { ChevronRightIcon, ExternalLinkIcon } from "@/components/icons";
import { FindingsNotify } from "@/components/findings-notify";
import { CodeBlock } from "@/components/code-block";
import { Code } from "@/components/settings/code";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { selectClass } from "@/components/select";
import {
  Chip,
  DetailBlock,
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  StatusText,
  timeAgo,
  useListParams,
  type StatusLook,
  type Tone,
} from "@/components/list";

// The Logs page: every finding of the log analyzer in one list, with the fix
// run and pull request started from it. A fix starts by hand ("Create fix
// PR") or, when the team turned it on, automatically for new findings.

const STATUS_LOOK: Record<LogFindingStatus, StatusLook> = {
  new: { label: "New", tone: "attention" },
  acknowledged: { label: "Acknowledged", tone: "waiting" },
  fixing: { label: "Fixing", tone: "live", live: true },
  fixed: { label: "Fixed", tone: "success" },
  ignored: { label: "Ignored", tone: "muted" },
};
const STATUS_ORDER: LogFindingStatus[] = ["new", "acknowledged", "fixing", "fixed", "ignored"];

const SEVERITY_LOOK: Record<LogSeverity, { label: string; tone: Tone; rank: number }> = {
  critical: { label: "Critical", tone: "danger", rank: 2 },
  warning: { label: "Warning", tone: "waiting", rank: 1 },
  info: { label: "Info", tone: "neutral", rank: 0 },
};
const SEVERITY_OPTIONS: { value: LogSeverity; label: string }[] = [
  { value: "critical", label: "Critical (high)" },
  { value: "warning", label: "Warning and up" },
  { value: "info", label: "Everything" },
];

const rowActionClass = `${buttonClass("secondary", "sm")} gap-1`;
const selectBox = selectClass("md");

/** "/aws/lambda/shop-checkout" -> "shop-checkout": the part of a log group people recognise. */
function serviceName(group: string): string {
  const parts = group.split("/").filter(Boolean);
  return parts[parts.length - 1] || group;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message && !/^API \d+/.test(e.message) ? e.message : fallback;
}

function matches(f: LogFinding, q: string): boolean {
  if (!q) return true;
  const hay = `${f.title} ${f.summary} ${f.log_group} ${f.error_pattern}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

/** UTC hour → "22:00 UTC (6 PM here)". */
function hourLabel(h: number): string {
  const d = new Date(Date.UTC(2026, 0, 1, h));
  const local = d.toLocaleTimeString([], { hour: "numeric" });
  return `${String(h).padStart(2, "0")}:00 UTC (${local} here)`;
}

export default function LogsGuarded() {
  return (
    <RoleGuard need="recommendations">
      <Suspense
        fallback={
          <Page>
            <PageHeader title="Logs" />
            <div className="mt-6">
              <ListSkeleton />
            </div>
          </Page>
        }
      >
        <LogsPage />
      </Suspense>
    </RoleGuard>
  );
}

function LogsPage() {
  // ?q= search, ?status= one status, ?severity=, ?group= one log group,
  // ?finding= the open row, ?auto=1 the automatic fix PR settings.
  const [params, setParams] = useListParams({ q: "", status: "all", severity: "", group: "", finding: "", auto: "" });
  const q = params.q.trim();
  const status = (STATUS_ORDER as string[]).includes(params.status) ? (params.status as LogFindingStatus) : "all";
  const severity = params.severity in SEVERITY_LOOK ? (params.severity as LogSeverity) : "";
  const { toast } = useToast();

  const [data, setData] = useState<LogFindingsList | null>(null);
  const [error, setError] = useState(false);
  const { can } = useCan();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [autofix, setAutofix] = useState<{ autofix: LogAutofix; runs_today: number } | null>(null);
  const [fixing, setFixing] = useState<LogFinding | null>(null);
  const [busy, setBusy] = useState("");
  const autoButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    api
      .listLogFindings()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  const loadAutofix = useCallback(() => {
    api.getLogAutofix().then(setAutofix).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadAutofix();
    api.listRepos().then((d) => setRepos(d.repos.filter((r) => r.enabled))).catch(() => {});
  }, [load, loadAutofix]);

  // A fix's status follows its run: refresh while any is moving.
  const moving = !!data?.findings.some((f) => f.status === "fixing");
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [moving, load]);

  // Automatic fixes are alert settings; acting on a finding is its own
  // capability; remembering one writes team memory.
  const canEditAutofix = can("alerts");
  const canAct = can("recommendations");
  const canRemember = can("memory");

  const findings = useMemo(() => data?.findings ?? [], [data]);
  const searched = useMemo(
    () =>
      findings
        .filter((f) => matches(f, q))
        .filter((f) => !severity || f.severity === severity)
        .filter((f) => !params.group || f.log_group === params.group),
    [findings, q, severity, params.group],
  );
  const counts = useMemo(() => {
    const c: Record<LogFindingStatus, number> = { new: 0, acknowledged: 0, fixing: 0, fixed: 0, ignored: 0 };
    for (const f of searched) c[f.status] += 1;
    return c;
  }, [searched]);
  const shown = useMemo(
    () =>
      (status === "all" ? searched : searched.filter((f) => f.status === status)).sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          SEVERITY_LOOK[b.severity].rank - SEVERITY_LOOK[a.severity].rank ||
          b.last_seen.localeCompare(a.last_seen),
      ),
    [searched, status],
  );
  const filtered = !!(q || status !== "all" || severity || params.group);
  const clear = () => setParams({ q: "", status: "all", severity: "", group: "" });

  const setStatus = async (f: LogFinding, action: "ignore" | "acknowledge" | "reopen") => {
    setBusy(`${action}:${f.rec_id}`);
    try {
      await api.setLogFindingStatus(f.rec_id, action);
      toast(action === "ignore" ? "Finding ignored" : action === "acknowledge" ? "Finding acknowledged" : "Finding reopened");
      load();
    } catch (e) {
      toast(errorText(e, "Could not update the finding"), "error");
    } finally {
      setBusy("");
    }
  };

  const groups = data?.log_groups ?? [];
  const on = !!autofix?.autofix.enabled;

  return (
    <Page testId="logs-page">
      <PageHeader
        title="Logs"
        lead={
          <>
            Errors Coderhelm found in your AWS logs. It looks every 6 hours. Create a fix PR from any
            finding, or let Coderhelm open one for new findings.
          </>
        }
        actions={
          <>
            <button
              ref={autoButton}
              type="button"
              onClick={() => setParams({ auto: params.auto ? "" : "1" }, { replace: true })}
              aria-expanded={!!params.auto}
              aria-controls="autofix-panel"
              className={secondaryButton}
              data-testid="autofix-toggle"
            >
              <span
                aria-hidden="true"
                className={`relative mr-2 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-zinc-700"}`}
              >
                <span className={`absolute left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
              </span>
              Automatic fix PRs: {on ? "On" : "Off"}
              <span aria-hidden="true" className={`ml-1.5 text-zinc-400 transition-transform ${params.auto ? "rotate-90" : ""}`}>
                <ChevronRightIcon />
              </span>
            </button>
            <Link href="/settings/integrations/aws" className={secondaryButton}>
              AWS settings
            </Link>
          </>
        }
      />

      {params.auto && autofix && (
        <AutofixPanel
          initial={autofix.autofix}
          runsToday={autofix.runs_today}
          groups={groups}
          repos={repos}
          canEdit={canEditAutofix}
          onSaved={(a) => setAutofix((prev) => ({ runs_today: prev?.runs_today ?? 0, autofix: a }))}
          onClose={() => {
            setParams({ auto: "" }, { replace: true });
            autoButton.current?.focus();
          }}
        />
      )}

      {data && !data.aws_connected ? (
        <div className="mt-6">
          <ListEmpty
            title="Connect AWS to see log findings"
            action={
              <Link href="/settings/integrations/aws" className={primaryButton}>
                Connect AWS in Settings
              </Link>
            }
          >
            Coderhelm reads the CloudWatch log groups you choose with a read-only role, finds errors worth fixing, and
            can open a fix PR for them.
          </ListEmpty>
        </div>
      ) : (
        <>
          <ListToolbar
            className="mt-6 mb-4"
            search={{
              value: params.q,
              onChange: (v) => setParams({ q: v }, { replace: true }),
              placeholder: "Search by title, error or log group",
              label: "Search findings",
            }}
            status={{
              label: "Show findings",
              value: status,
              onChange: (v) => setParams({ status: v }),
              options: [
                { value: "all", label: GROUP_LABEL.all, count: searched.length },
                ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LOOK[s].label, count: counts[s], tone: STATUS_LOOK[s].tone })),
              ],
            }}
            onClear={filtered ? clear : undefined}
          />
          {/* Severity and log group: the list's second row of filters, right under the toolbar. */}
          <div className="-mt-2 mb-4" data-testid="logs-filters">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select
                aria-label="Severity"
                value={severity}
                onChange={(e) => setParams({ severity: e.target.value })}
                className={selectBox}
              >
                <option value="">All severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              {groups.length > 1 && (
                <select
                  aria-label="Log group"
                  value={params.group}
                  onChange={(e) => setParams({ group: e.target.value })}
                  className={`${selectBox} sm:max-w-[20rem]`}
                >
                  <option value="">All log groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {!data && !error ? (
            <ListSkeleton rows={4} label="Loading findings" />
          ) : error && !data ? (
            <ListError title="Could not load the findings" onRetry={load} />
          ) : findings.length === 0 ? (
            <ListEmpty title="No findings yet">
              New ones appear here after each analysis of the log groups you chose in{" "}
              <Link href="/settings/integrations/aws" className={linkButton}>
                AWS settings
              </Link>
              .
            </ListEmpty>
          ) : shown.length === 0 ? (
            <ListEmpty title={q ? `No findings match “${q}”` : "No findings here"} onClear={clear} />
          ) : (
            <List label="Log findings">
              {shown.map((f) => (
                <FindingRow
                  key={f.rec_id}
                  f={f}
                  canAct={canAct}
                  busy={busy}
                  open={params.finding === f.rec_id}
                  onOpenChange={(v) => setParams({ finding: v ? f.rec_id : "" }, { replace: true })}
                  onFix={() => setFixing(f)}
                  onStatus={(a) => setStatus(f, a)}
                />
              ))}
            </List>
          )}
        </>
      )}

      <Modal
        open={!!fixing}
        onOpenChange={(v) => !v && setFixing(null)}
        title="Create a fix PR"
        description="Coderhelm starts a run with this finding, its log lines and the recommendation, and opens a pull request for review."
      >
        {fixing && (
          <CreateFixForm
            onCancel={() => setFixing(null)}
            finding={fixing}
            repos={repos}
            canRemember={canRemember}
            onDone={() => {
              setFixing(null);
              load();
            }}
          />
        )}
      </Modal>
    </Page>
  );
}

// ── One finding ─────────────────────────────────────────────────────

function fixLink(f: LogFinding) {
  const fix = f.fix;
  if (!fix) return null;
  if (fix.pr_url && fix.pr_number) {
    return (
      <a
        href={fix.pr_url}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-1 rounded text-xs font-medium text-zinc-200 underline underline-offset-2 hover:text-white ${focusRing}`}
      >
        PR #{fix.pr_number}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  if (fix.run_id) {
    return (
      <Link href={`/runs/detail?id=${encodeURIComponent(fix.run_id)}`} className={`rounded text-xs font-medium text-zinc-200 underline underline-offset-2 hover:text-white ${focusRing}`}>
        Run
      </Link>
    );
  }
  return null;
}

function fixWords(f: LogFinding): string | null {
  const fix = f.fix;
  if (!fix) return null;
  const who = fix.auto ? "Started automatically" : "Started by a person";
  switch (fix.state) {
    case "starting":
      return `${who}, waiting for the run to begin.`;
    case "running":
      return `${who}. The run is working on it.`;
    case "pr_open":
      return `${who}. Pull request open, waiting for review.`;
    case "merged":
      return "The fix merged.";
    case "pr_closed":
      return "The fix PR was closed without merging.";
    case "failed":
      return "The last fix run ended without a pull request.";
    default:
      return null;
  }
}

function FindingRow({
  f,
  canAct,
  busy,
  open,
  onOpenChange,
  onFix,
  onStatus,
}: {
  f: LogFinding;
  canAct: boolean;
  busy: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFix: () => void;
  onStatus: (action: "ignore" | "acknowledge" | "reopen") => void;
}) {
  const look = STATUS_LOOK[f.status];
  const sev = SEVERITY_LOOK[f.severity] ?? SEVERITY_LOOK.info;
  const canFix = canAct && f.status !== "fixing" && f.status !== "fixed" && f.status !== "ignored";
  const link = fixLink(f);
  const autoNote =
    f.auto && f.auto.status !== "started" && f.status !== "fixing" ? `Not started automatically: ${f.auto.reason}.` : null;

  return (
    <ListRow
      testId={`finding-${f.rec_id}`}
      data={{ status: f.status, severity: f.severity }}
      status={look}
      title={f.title}
      titleText={f.title}
      quiet={f.status === "ignored"}
      meta={[
        <span key="g" title={f.log_group} className="font-medium text-zinc-300">
          {serviceName(f.log_group)}
        </span>,
        typeof f.error_count === "number" && f.error_count > 0 ? `${plural(f.error_count, "line")} in the last analysis` : null,
        f.first_seen ? `first seen ${timeAgo(f.first_seen)}` : null,
        f.last_seen ? `last seen ${timeAgo(f.last_seen)}` : null,
        f.repo ? <span key="r">{f.repo}</span> : null,
      ]}
      summary={fixWords(f) ?? autoNote ?? undefined}
      summaryTone={f.fix ? (f.fix.state === "merged" ? "success" : f.fix.state === "failed" || f.fix.state === "pr_closed" ? "attention" : "live") : "muted"}
      chips={
        <>
          <Chip tone={sev.tone}>{sev.label}</Chip>
          <StatusText look={look} />
          {f.fix?.auto && <Chip tone="info" title="Started automatically from this finding">Auto</Chip>}
          {link}
        </>
      }
      // One visible action; the rest in the row's menu.
      actions={
        canFix ? (
          <button type="button" onClick={onFix} className={rowActionClass} aria-label={`Create fix PR for ${f.title}`}>
            Create fix PR
          </button>
        ) : canAct && f.status === "ignored" ? (
          <button type="button" onClick={() => onStatus("reopen")} disabled={!!busy} className={rowActionClass}>
            Reopen
          </button>
        ) : undefined
      }
      menu={[
        ...(canAct && f.status === "new" ? [{ label: "Acknowledge", onSelect: () => onStatus("acknowledge"), disabled: !!busy }] : []),
        ...(canAct && f.status !== "ignored" && f.status !== "fixing" && f.status !== "fixed"
          ? [{ label: "Ignore", onSelect: () => onStatus("ignore"), disabled: !!busy }]
          : []),
        ...(f.console_url
          ? [{ label: "Open logs in CloudWatch", hint: "New tab", onSelect: () => window.open(f.console_url ?? undefined, "_blank", "noopener,noreferrer") }]
          : []),
      ]}
      menuLabel={`More actions for ${f.title}`}
      details={<FindingDetail f={f} canAct={canAct} onStatus={onStatus} busy={busy} />}
      detailsFor={`details of ${f.title}`}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function FindingDetail({
  f,
  canAct,
  busy,
  onStatus,
}: {
  f: LogFinding;
  canAct: boolean;
  busy: string;
  onStatus: (action: "ignore" | "acknowledge" | "reopen") => void;
}) {
  return (
    <>
      <DetailBlock title="What's wrong">
        <p className="text-zinc-300">{f.summary}</p>
      </DetailBlock>
      <DetailBlock title="Log group">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Code>{f.log_group}</Code>
          {f.console_url && (
            <a
              href={f.console_url}
              target="_blank"
              rel="noreferrer"
              className={`${linkButton} !text-xs gap-1`}
              aria-label={`Open logs for ${f.log_group} in CloudWatch (opens in a new tab)`}
            >
              Open logs
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      </DetailBlock>
      {f.suggested_action && (
        <DetailBlock title="Recommendation">
          <p className="text-zinc-300">{f.suggested_action}</p>
        </DetailBlock>
      )}
      {f.suspected_location && (
        <DetailBlock title="Suspected code location">
          <Code>{f.suspected_location}</Code>
        </DetailBlock>
      )}
      {f.error_pattern && (
        <DetailBlock title="Error pattern">
          <CodeBlock code={f.error_pattern} label="Error pattern" wrap maxHeightClass="max-h-40" />
        </DetailBlock>
      )}
      {canAct && <Samples id={f.rec_id} />}
      {f.auto && (
        <DetailBlock title="Automatic fix">
          {f.auto.status === "started" ? "Started automatically for this finding." : `Not started: ${f.auto.reason}.`}
        </DetailBlock>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {f.seen_count ? <span>{plural(f.seen_count, "matching line")} since first seen</span> : null}
        {f.plan_id && (
          <Link href={`/plans/detail?id=${encodeURIComponent(f.plan_id)}`} className={`${linkButton} !text-xs`}>
            Its plan
          </Link>
        )}
        {canAct && f.status === "new" && (
          <button type="button" onClick={() => onStatus("acknowledge")} disabled={!!busy} className={`${linkButton} !text-xs`}>
            Acknowledge
          </button>
        )}
        {canAct && f.status === "acknowledged" && (
          <button type="button" onClick={() => onStatus("reopen")} disabled={!!busy} className={`${linkButton} !text-xs`}>
            Mark as new
          </button>
        )}
      </div>
    </>
  );
}

/** Recent lines of the error, read live (and scrubbed) when the row opens. */
function Samples({ id }: { id: string }) {
  const [state, setState] = useState<{ lines: LogSample[]; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    api
      .logFindingSamples(id)
      .then((r) => live && setState({ lines: r.samples, error: r.error }))
      .catch(() => live && setState({ lines: [], error: "Could not read the log lines." }));
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <DetailBlock title="Sample log lines">
      {!state ? (
        <p role="status" className="text-zinc-500">
          Reading recent lines…
        </p>
      ) : state.lines.length === 0 ? (
        <p className="text-zinc-500">{state.error ?? "No matching lines in the last 24 hours."}</p>
      ) : (
        <>
          <CodeBlock
            testId="sample-lines"
            code={state.lines.map((l) => `${l.timestamp}  ${l.message}`).join("\n")}
            label="Sample log lines"
            wrap
            maxHeightClass="max-h-56"
          />
          <p className="mt-1 text-xs text-zinc-400">Secrets, emails and card numbers are hidden. These lines are read live and not stored.</p>
        </>
      )}
    </DetailBlock>
  );
}

// ── Create fix PR ───────────────────────────────────────────────────

function CreateFixForm({
  finding,
  repos,
  canRemember,
  onDone,
  onCancel,
}: {
  onCancel: () => void;
  finding: LogFinding;
  repos: Repo[];
  canRemember: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  // Coderhelm works the repo out (a saved mapping, or the evidence); a
  // person's own pick always stands.
  const [resolution, setResolution] = useState<RepoResolution | null>(null);
  const [resolving, setResolving] = useState(true);
  const [repo, setRepo] = useState("");
  const [touched, setTouched] = useState(false);
  const [remember, setRemember] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api
      .getLogFindingRepo(finding.rec_id)
      .then((r) => {
        if (!live) return;
        setResolution(r);
        if (r.repo) setRepo((prev) => prev || r.repo!);
        // Remembering defaults on only when Coderhelm is sure and nothing is saved yet.
        setRemember(isSure(r) && r.source !== "saved");
      })
      .catch(() => live && setResolution(null))
      .finally(() => live && setResolving(false));
    return () => {
      live = false;
    };
  }, [finding.rec_id]);

  const choose = (name: string) => {
    setTouched(true);
    setRepo(name);
  };
  const saved = resolution?.source === "saved" ? resolution.repo : (resolution?.saved ?? null);
  const showRemember = canRemember && !!repo && repo !== saved;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo) return;
    setSending(true);
    setError("");
    try {
      await api.createLogFix(finding.rec_id, { repo, remember: showRemember && remember });
      toast(`Fix run started in ${repo}`);
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not start the fix run. Try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <form id="create-fix-form" onSubmit={submit} className="flex flex-col gap-4">
      <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
        <p className="font-medium text-zinc-100">{finding.title}</p>
        <p className="mt-0.5 text-xs text-zinc-400"><Code>{finding.log_group}</Code></p>
      </div>
      <div className="min-w-0">
        <label htmlFor="fix-repo" className="mb-1 block text-sm font-medium text-zinc-300">
          Repository
        </label>
        <ResolvedRepo
          id="fix-repo"
          label="Repository"
          resolution={resolution}
          loading={resolving && !touched}
          repos={repos}
          selected={repo}
          onSelect={choose}
        />
      </div>
      {showRemember && (
        <label className="flex min-w-0 items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1" />
          <span className="min-w-0 break-words">Always use this repo for {finding.log_group}</span>
        </label>
      )}
      {error && <Callout variant="error">{error}</Callout>}
      <ModalFooter>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" form="create-fix-form" disabled={!repo || sending} className={primaryButton}>
          {sending ? "Starting…" : "Start fix run"}
        </button>
      </ModalFooter>
    </form>
  );
}

// ── Automatic fix PRs ───────────────────────────────────────────────

type Override = LogAutofix["overrides"][number];

/** The body sent on save: only groups with something of their own. */
function autofixBody(a: LogAutofix): LogAutofix {
  return {
    enabled: a.enabled,
    min_severity: a.min_severity,
    daily_cap: a.daily_cap,
    scope: a.scope,
    quiet_hours: a.quiet_hours,
    overrides: a.overrides
      .filter((o) => o.repo || o.auto !== null || o.min_severity !== null)
      .sort((x, y) => x.log_group.localeCompare(y.log_group))
      .map((o) => ({ log_group: o.log_group, repo: o.repo, auto: o.auto, min_severity: o.min_severity })),
  };
}

function AutofixPanel({
  initial,
  runsToday,
  groups,
  repos,
  canEdit,
  onSaved,
  onClose,
}: {
  initial: LogAutofix;
  runsToday: number;
  groups: string[];
  repos: Repo[];
  canEdit: boolean;
  onSaved: (a: LogAutofix) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [a, setA] = useState<LogAutofix>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<LogAutofix>) => setA((prev) => ({ ...prev, ...patch }));

  // Every known log group gets a row, with its saved override if any.
  const rows: Override[] = useMemo(() => {
    const names = [...new Set([...a.overrides.map((o) => o.log_group), ...groups])].sort();
    return names.map((g) => a.overrides.find((o) => o.log_group === g) ?? { log_group: g, repo: "", auto: null, min_severity: null });
  }, [a.overrides, groups]);
  const setRow = (g: string, patch: Partial<Override>) =>
    setA((prev) => {
      const existing = prev.overrides.find((o) => o.log_group === g) ?? { log_group: g, repo: "", auto: null, min_severity: null };
      const next = { ...existing, ...patch };
      return { ...prev, overrides: [...prev.overrides.filter((o) => o.log_group !== g), next] };
    });

  const dirty = JSON.stringify(autofixBody(a)) !== JSON.stringify(autofixBody(initial));
  const capOk = Number.isInteger(a.daily_cap) && a.daily_cap >= 1 && a.daily_cap <= 20;
  const mapped = rows.filter((r) => r.repo).length;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await api.saveLogAutofix(autofixBody(a));
      onSaved(r.autofix);
      setA(r.autofix);
      toast(r.autofix.enabled ? "Automatic fix PRs are on" : "Automatic fix PR settings saved");
    } catch (e) {
      setError(errorText(e, "Could not save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit;
  return (
    <section id="autofix-panel" aria-labelledby="autofix-heading" className="mt-6 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5" data-testid="autofix-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="autofix-heading" className="text-base font-semibold text-zinc-100">
            Automatic fix PRs
          </h2>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">
            After each analysis, Coderhelm can start a fix run for new findings and open a PR for review. Each run says
            it started automatically. Nothing merges without a person&apos;s approval.
          </p>
        </div>
        <button type="button" onClick={onClose} className={`${linkButton} !text-xs`}>
          Close
        </button>
      </div>

      {!canEdit && (
        <p className="mt-3 text-sm text-zinc-500">Only an admin or the owner can change these settings.</p>
      )}

      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={a.enabled}
              disabled={disabled}
              onChange={(e) => set({ enabled: e.target.checked })}
              className="mt-1"
              data-testid="autofix-enabled"
            />
            <span>
              <span className="font-medium">Automatically create a fix PR for new findings</span>
              <span className="block text-xs text-zinc-400">Only findings made after this is turned on. Off by default.</span>
            </span>
          </label>

          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-zinc-300">Minimum severity</p>
            <div className="max-w-full overflow-x-auto">
              <Segmented label="Minimum severity" options={SEVERITY_OPTIONS} value={a.min_severity} onChange={(v) => set({ min_severity: v })} disabled={disabled} />
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-zinc-300">Which log groups</p>
            <div className="max-w-full overflow-x-auto">
              <Segmented
                label="Which log groups"
                options={[
                  { value: "all", label: "Every group with a known repo" },
                  { value: "listed", label: "Only groups turned on below" },
                ]}
                value={a.scope}
                onChange={(v) => set({ scope: v })}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <label htmlFor="autofix-cap" className="mb-1 block text-sm font-medium text-zinc-300">
              Most automatic runs per day
            </label>
            <input
              id="autofix-cap"
              type="number"
              min={1}
              max={20}
              value={Number.isNaN(a.daily_cap) ? "" : a.daily_cap}
              disabled={disabled}
              onChange={(e) => set({ daily_cap: e.target.value === "" ? NaN : Number(e.target.value) })}
              aria-describedby="autofix-cap-help"
              className={`${inputClass} !w-28`}
            />
            <p id="autofix-cap-help" className="mt-1 text-xs text-zinc-400">
              {runsToday > 0 ? `${plural(runsToday, "run")} started today (UTC). ` : ""}Never more than one open run or PR for the same error.
              Runs count toward the team&apos;s token limit.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={!!a.quiet_hours}
                disabled={disabled}
                onChange={(e) => set({ quiet_hours: e.target.checked ? { start_hour: 22, end_hour: 6 } : null })}
              />
              Quiet hours
            </label>
            {a.quiet_hours && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <select
                  aria-label="Quiet hours start"
                  value={a.quiet_hours.start_hour}
                  disabled={disabled}
                  onChange={(e) => set({ quiet_hours: { ...a.quiet_hours!, start_hour: Number(e.target.value) } })}
                  className={selectBox}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                to
                <select
                  aria-label="Quiet hours end"
                  value={a.quiet_hours.end_hour}
                  disabled={disabled}
                  onChange={(e) => set({ quiet_hours: { ...a.quiet_hours!, end_hour: Number(e.target.value) } })}
                  className={selectBox}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                <p className="w-full text-xs text-zinc-400">Findings that arrive then start when the quiet hours end.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 min-w-0">
        <h3 className="text-sm font-medium text-zinc-300">Log groups</h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          The repo each log group&apos;s code lives in ({mapped} of {rows.length} saved). For a group without one, Coderhelm works the
          repo out from AWS and your code: it fixes there when it&apos;s sure and asks you when it isn&apos;t.
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Log groups appear here once the analyzer finds something in them.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
            {rows.map((r) => (
              <li key={r.log_group} className="grid min-w-0 gap-2 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto] md:items-center" data-testid={`group-${r.log_group}`}>
                <span className="min-w-0 text-xs"><Code>{r.log_group}</Code></span>
                <div className="min-w-0">
                  {disabled ? (
                    <span className="text-xs text-zinc-400">{r.repo || "No repo"}</span>
                  ) : (
                    <RepoCombobox
                      repos={repos}
                      selected={r.repo}
                      onSelect={(name) => setRow(r.log_group, { repo: name })}
                      label={`Repo for ${r.log_group}`}
                      placeholder="Choose a repo"
                      className=""
                    />
                  )}
                </div>
                <select
                  aria-label={`Automatic fixes for ${r.log_group}`}
                  value={r.auto === null ? "" : r.auto ? "on" : "off"}
                  disabled={disabled}
                  onChange={(e) => setRow(r.log_group, { auto: e.target.value === "" ? null : e.target.value === "on" })}
                  className={selectBox}
                >
                  <option value="">Team default</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
                <select
                  aria-label={`Minimum severity for ${r.log_group}`}
                  value={r.min_severity ?? ""}
                  disabled={disabled}
                  onChange={(e) => setRow(r.log_group, { min_severity: (e.target.value || null) as LogSeverity | null })}
                  className={selectBox}
                >
                  <option value="">Team severity</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning and up</option>
                  <option value="info">Everything</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Callout variant="error">{error}</Callout>
        </div>
      )}
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || !capOk || saving} className={primaryButton} data-testid="autofix-save">
            {saving ? "Saving…" : "Save"}
          </button>
          {!capOk && <p className="text-xs text-red-300">Choose between 1 and 20 runs per day.</p>}
        </div>
      )}

      {canEdit && (
        <div className="mt-6">
          <FindingsNotify />
        </div>
      )}
    </section>
  );
}
