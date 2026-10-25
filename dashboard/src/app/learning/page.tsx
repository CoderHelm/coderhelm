"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  api,
  errorStatus,
  type Learning,
  type LearningBandit,
  type LearningCategory,
  type LearningChange,
  type LearningExemplar,
} from "@/lib/api";
import { CardSkeleton, ChartSkeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { RepoFilter } from "@/components/list";
import { Callout } from "@/components/callout";
import { Disclosure } from "@/components/disclosure";
import { StatusPill } from "@/components/status-pill";
import { useConfirm } from "@/components/confirm-dialog";
import { SaveBar } from "@/components/settings";
import { useCan } from "@/hooks/use-can";
import { cardClass, Page, PageHeader, Section } from "@/components/page";
import { focusRing, inputClass, smallDangerButton, smallSecondaryButton } from "@/components/ui";

// What Coderhelm learned from how its work was received (comments acted on
// or dismissed, ratings, merges, reverts, CI), and every change in its
// behavior that came from it, with the evidence and a way to turn it off.

// Categorical slots for the dark chart surface (the first two match
// Analytics). Text never takes a series color.
const SERIES = ["#3987e5", "#d95926", "#2ba99b", "#a77de8", "#c9a227"];
const MAX_SERIES = 4;

const DAYS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type Days = (typeof DAYS)[number]["value"];

const AGENTS: Record<string, string> = { reviewer: "Reviewer", coder: "Coding agent", planner: "Planner" };
const agentLabel = (a: string) => AGENTS[a] ?? a;

const ADJUST: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error"; says: string }> = {
  suppress: { label: "Held back", tone: "warning", says: "Only raised when it blocks the merge" },
  downgrade: { label: "Softened", tone: "warning", says: "Raised as a note, not a request for changes" },
  raise: { label: "Looked for more", tone: "success", says: "The team acts on these, so the reviewer looks harder" },
  none: { label: "No change", tone: "neutral", says: "" },
};

const KIND_LABEL: Record<string, string> = { calibration: "Finding category", variant: "Variant", lesson: "Lesson" };

// ── Formatting ─────────────────────────────────────────────────────────────

const pct = (v: number) => `${Math.round(v * 100)}%`;
const count = (v: number) => v.toLocaleString();
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const shortDay = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const when = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// ── Pieces ─────────────────────────────────────────────────────────────────

function Tile({ label, value, basis, testId }: { label: string; value: string; basis?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4" data-testid={testId}>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {basis && <p className="mt-1 text-xs text-zinc-500">{basis}</p>}
    </div>
  );
}

/** A plain table; wide ones scroll inside their box, never the page. */
function Table({ head, rows, empty, label }: { head: string[]; rows: ReactNode[][]; empty: string; label: string }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
      <table className={`w-full text-sm ${head.length >= 5 ? "min-w-[640px]" : ""}`} aria-label={label}>
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2.5 font-medium sm:px-4 ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2.5 align-top sm:px-4 ${j > 0 ? "text-right tabular-nums text-zinc-300" : "min-w-0 text-zinc-100"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-zinc-400">{label ? shortDay(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-zinc-400">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-100">{signed(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const axis = { stroke: "transparent", tick: { fill: "#71717a", fontSize: 11 }, tickLine: false, axisLine: false };

/** Average reward per day for each agent or repository (the busiest few; the rest as "Other"). */
function trendSeries(trend: Learning["trend"], by: "agent" | "repo") {
  const volume = new Map<string, number>();
  for (const t of trend) volume.set(t[by], (volume.get(t[by]) ?? 0) + t.events);
  const ranked = [...volume.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const keep = new Set(ranked.slice(0, MAX_SERIES));
  const name = (k: string) => (keep.has(k) ? (by === "agent" ? agentLabel(k) : k) : "Other");
  const names = [...new Set(ranked.map(name))];
  const days = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const t of trend) {
    const day = days.get(t.date) ?? new Map();
    const s = day.get(name(t[by])) ?? { sum: 0, n: 0 };
    s.sum += t.reward * t.events;
    s.n += t.events;
    day.set(name(t[by]), s);
    days.set(t.date, day);
  }
  const rows = [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, m]) => {
      const row: Record<string, string | number | null> = { date };
      for (const n of names) {
        const s = m.get(n);
        row[n] = s && s.n > 0 ? Math.round((s.sum / s.n) * 100) / 100 : null;
      }
      return row;
    });
  return { rows, names };
}

function TrendCard({ data }: { data: Learning }) {
  const [by, setBy] = useState<"agent" | "repo">("agent");
  const [showTable, setShowTable] = useState(false);
  const { rows, names } = useMemo(() => trendSeries(data.trend, by), [data.trend, by]);
  return (
    <div className={cardClass}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">Average reward per day</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Show reward by"
            options={[
              { value: "agent", label: "By agent" },
              { value: "repo", label: "By repository" },
            ]}
            value={by}
            onChange={setBy}
          />
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-label={`${showTable ? "Show chart" : "Show table"}: Average reward per day`}
            className={`rounded text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline ${focusRing}`}
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No outcomes in this period.</p>
      ) : showTable ? (
        <div className="max-h-64 overflow-auto">
          <Table
            label="Average reward per day"
            head={["Day", ...names]}
            rows={rows.map((r) => [shortDay(String(r.date)), ...names.map((n) => (r[n] == null ? "—" : signed(Number(r[n]))))])}
            empty="No outcomes in this period."
          />
        </div>
      ) : (
        <div className="h-[260px]" data-testid="reward-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid vertical={false} stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={shortDay} {...axis} minTickGap={24} />
              <YAxis domain={[-1, 1]} tickFormatter={(v: number) => signed(v)} {...axis} width={44} />
              <Tooltip cursor={{ stroke: "#3f3f46" }} content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
              {names.map((n, i) => (
                <Line key={n} type="monotone" dataKey={n} name={n} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Each outcome scores between −1 and +1 by the weights below; the line is the average for the day. Volume never raises it: more comments do not mean more reward.
      </p>
    </div>
  );
}

function AdjustmentPill({ c }: { c: LearningCategory }) {
  if (c.reverted) return <StatusPill tone="neutral">Turned off</StatusPill>;
  const a = ADJUST[c.adjustment] ?? ADJUST.none;
  return <StatusPill tone={a.tone}>{a.label}</StatusPill>;
}

function CategoryName({ c }: { c: LearningCategory }) {
  return (
    <div className="min-w-0">
      <span className="font-medium">{c.category}</span>
      {c.exempt && (
        <span className="ml-2 align-middle">
          <StatusPill tone="success">Always kept</StatusPill>
        </span>
      )}
      <span className="block text-xs text-zinc-500">{c.repo}</span>
      {c.reason && <span className="block text-xs text-zinc-500">{c.reason}</span>}
    </div>
  );
}

function categoryRows(list: LearningCategory[]) {
  return list.map((c) => [
    <CategoryName key="n" c={c} />,
    count(c.accepted),
    count(c.dismissed),
    count(c.ignored),
    pct(c.accept_rate),
    <AdjustmentPill key="a" c={c} />,
  ]);
}

function Categories({ data }: { data: Learning }) {
  const seen = data.categories.filter((c) => c.accepted + c.dismissed + c.ignored > 0);
  const accepted = [...seen].filter((c) => c.accepted > 0).sort((a, b) => b.accept_rate - a.accept_rate || b.accepted - a.accepted).slice(0, 8);
  const dismissed = [...seen].filter((c) => c.dismissed > 0).sort((a, b) => a.accept_rate - b.accept_rate || b.dismissed - a.dismissed).slice(0, 8);
  const head = ["Category", "Acted on", "Dismissed", "Left open", "Accept rate", "Change"];
  return (
    <Section
      title="Review comments by category"
      id="categories"
      description={`How people answered the reviewer's comments, per repository. A category changes the reviewer's behavior only after ${plural(data.min_samples, "answer")}. Security and correctness comments are always kept, however often they are dismissed.`}
    >
      {/* Six columns each: stacked, so neither table scrolls inside a half-width box. */}
      <div className="min-w-0 space-y-6">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Most acted on</h3>
          <Table label="Most acted on categories" head={head} rows={categoryRows(accepted)} empty="No comments acted on yet." />
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Most dismissed</h3>
          <Table label="Most dismissed categories" head={head} rows={categoryRows(dismissed)} empty="No comments dismissed yet." />
        </div>
      </div>
    </Section>
  );
}

function ChangeItem({
  change,
  labels,
  canManage,
  busy,
  onRevert,
  onRestore,
}: {
  change: LearningChange;
  /** Signal names, the same words as the weights table. */
  labels: Record<string, string>;
  canManage: boolean;
  busy: boolean;
  onRevert: (c: LearningChange) => void;
  onRestore: (c: LearningChange) => void;
}) {
  const refusal = canManage ? undefined : "Only an admin or the owner can turn changes off";
  return (
    <li className={cardClass} data-testid={`change-${change.id}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500">
            {KIND_LABEL[change.kind] ?? change.kind} · {change.repo || "All repositories"} · {when(change.at)}
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-100">
            {change.key}: {change.from || "none"} <span aria-hidden="true">→</span>
            <span className="sr-only"> to </span> {change.to}
          </p>
          <p className="mt-1 text-sm text-zinc-400">{change.reason}</p>
          {change.reverted && (
            <p className="mt-1 text-xs text-zinc-500">
              Turned off{change.reverted_by ? ` by ${change.reverted_by}` : ""}{change.reverted_at ? ` on ${when(change.reverted_at)}` : ""}.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {change.reverted ? <StatusPill tone="neutral">Turned off</StatusPill> : <StatusPill tone="success">In use</StatusPill>}
          {change.reverted ? (
            <button type="button" className={smallSecondaryButton} disabled={!canManage || busy} title={refusal} onClick={() => onRestore(change)}>
              Turn back on
            </button>
          ) : (
            <button type="button" className={smallDangerButton} disabled={!canManage || busy} title={refusal} onClick={() => onRevert(change)}>
              Turn off
            </button>
          )}
        </div>
      </div>
      {change.evidence.length > 0 && (
        <div className="mt-3">
          <Disclosure summary={`Evidence (${plural(change.evidence.length, "outcome")})`}>
            <ul className="space-y-1.5">
              {change.evidence.map((e, i) => (
                <li key={i} className="min-w-0 text-xs text-zinc-400">
                  <span className="text-zinc-300">{labels[e.kind] ?? e.kind.replace(/_/g, " ")}</span>
                  {e.pr ? ` · PR #${e.pr}` : ""} · {when(e.at)}
                  {e.detail && <span className="block text-zinc-500">{e.detail}</span>}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </li>
  );
}


function Exemplar({ e }: { e: LearningExemplar }) {
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="text-xs text-zinc-500">
        {e.kind === "fix" ? "Code change" : "Review comment"}
        {e.category ? ` · ${e.category}` : ""}
        {e.area ? ` · ${e.area}` : ""}
      </p>
      <p className="mt-1 text-sm text-zinc-200">{e.text}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {e.repo}
        {e.pr ? ` · PR #${e.pr}` : ""} · reward {signed(e.reward)} · {e.uses === 0 ? "not used yet" : `used ${plural(e.uses, "time")}`}
      </p>
    </li>
  );
}

function Exemplars({ list }: { list: LearningExemplar[] }) {
  const good = list.filter((e) => e.polarity === "good");
  const avoid = list.filter((e) => e.polarity === "avoid");
  return (
    <Section
      title="Examples in use"
      id="exemplars"
      description="Past work with the best and worst outcomes in each repository. The agents read the closest ones before they write a review or a change: the first to follow, the second to avoid."
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">To follow</h3>
          {good.length ? <ul className="space-y-2">{good.map((e) => <Exemplar key={e.id} e={e} />)}</ul> : <p className="text-sm text-zinc-400">None yet.</p>}
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">To avoid</h3>
          {avoid.length ? <ul className="space-y-2">{avoid.map((e) => <Exemplar key={e.id} e={e} />)}</ul> : <p className="text-sm text-zinc-400">None yet.</p>}
        </div>
      </div>
    </Section>
  );
}

function BanditCard({ b, canManage, busy, minSamples, onPin }: { b: LearningBandit; canManage: boolean; busy: boolean; minSamples: number; onPin: (agent: string, arm: string | null) => void }) {
  const refusal = canManage ? undefined : "Only an admin or the owner can pin a variant";
  return (
    <div className={cardClass} data-testid={`bandit-${b.agent}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-zinc-200">{agentLabel(b.agent)}</h3>
          <p className="text-xs text-zinc-500">
            {b.pinned
              ? `Pinned to ${b.arms.find((a) => a.key === b.pinned)?.label ?? b.pinned}: no trying others.`
              : `Tries other variants on at most ${pct(b.exploration_cap)} of its work; a variant needs ${plural(minSamples, "outcome")} before it can win.`}
          </p>
        </div>
        {b.pinned && (
          <button type="button" className={smallSecondaryButton} disabled={!canManage || busy} title={refusal} onClick={() => onPin(b.agent, null)}>
            Unpin
          </button>
        )}
      </div>
      <Table
        label={`${agentLabel(b.agent)} variants`}
        head={["Variant", "Uses", "Average", "Best case", "Status", ""]}
        empty="No variants."
        rows={b.arms.map((a) => {
          const status = b.pinned === a.key ? "Pinned" : a.key === b.default_arm ? "Default" : a.eligible ? "Competing" : "Gathering outcomes";
          return [
            <span key="l" className="font-medium">{a.label}</span>,
            count(a.pulls),
            a.pulls ? signed(a.mean) : "—",
            a.pulls ? signed(a.ucb) : "—",
            <StatusPill key="s" tone={status === "Pinned" ? "success" : "neutral"}>{status}</StatusPill>,
            b.pinned === a.key ? null : (
              <button key="p" type="button" className={smallSecondaryButton} disabled={!canManage || busy} title={refusal} onClick={() => onPin(b.agent, a.key)} aria-label={`Pin ${a.label} for ${agentLabel(b.agent)}`}>
                Pin
              </button>
            ),
          ];
        })}
      />
    </div>
  );
}

function Weights({ data, canManage, onSaved }: { data: Learning; canManage: boolean; onSaved: (w: Record<string, number>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const changed = Object.entries(draft).filter(([k, v]) => Number(v) !== data.weights[k]);
  const save = async (weights: Record<string, number>) => {
    setSaving(true);
    setProblem("");
    try {
      const res = await api.putRewardWeights(weights);
      setDraft({});
      onSaved(res.weights);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };
  const invalid = changed.some(([, v]) => v.trim() === "" || Number.isNaN(Number(v)) || Number(v) < -3 || Number(v) > 3);
  return (
    <Section
      title="How outcomes are scored"
      id="weights"
      description="Each signal's weight, between −3 and 3. Reverts, dismissed comments and fixes that broke CI count against; the number of comments never counts for anything."
      actions={
        canManage ? (
          <button type="button" className={smallSecondaryButton} disabled={saving} onClick={() => void save({})}>
            Back to defaults
          </button>
        ) : undefined
      }
    >
      <Table
        label="Signal weights"
        head={["Signal", "Seen", "Weight", "Default"]}
        empty="No signals."
        rows={data.signals.map((s) => [
          <span key="l">{s.label}</span>,
          count(s.count),
          canManage ? (
            <div key="w" className="ml-auto w-24">
            <input
              type="number"
              step="0.1"
              min={-3}
              max={3}
              aria-label={`Weight for ${s.label}`}
              value={draft[s.kind] ?? String(data.weights[s.kind] ?? s.weight)}
              onChange={(e) => setDraft((d) => ({ ...d, [s.kind]: e.target.value }))}
              className={`${inputClass} text-right tabular-nums`}
            />
            </div>
          ) : (
            signed(data.weights[s.kind] ?? s.weight)
          ),
          signed(data.default_weights[s.kind] ?? s.weight),
        ])}
      />
      {canManage && (
        <SaveBar
          // An invalid weight leaves nothing savable (Save off) but Discard stays on.
          count={invalid ? 0 : changed.length}
          idleText={invalid ? "Fix the weight to save" : undefined}
          saving={saving}
          problem={problem || (invalid ? "Each weight must be a number between −3 and 3." : undefined)}
          onDiscard={() => {
            setDraft({});
            setProblem("");
          }}
          onSave={() => void save({ ...data.weights, ...Object.fromEntries(changed.map(([k, v]) => [k, Number(v)])) })}
          testId="weights-save-bar"
        />
      )}
    </Section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LearningPage() {
  const [days, setDays] = useState<Days>("30");
  const [repo, setRepo] = useState("");
  const [repoNames, setRepoNames] = useState<string[]>([]);
  const [data, setData] = useState<Learning | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getLearning(Number(days), repo || undefined);
      setData(res);
      if (!repo) setRepoNames(res.repos.map((r) => r.repo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [days, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one admin action, then reloads; a refusal is said in words above the controls. */
  const act = async (what: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await what();
      setNotice(done);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The request failed.";
      setActionError(errorStatus(e) === 403 ? "Your role does not allow this. Only an admin or the owner can change what Coderhelm learned (error 403)." : msg);
    } finally {
      setBusy(false);
    }
  };

  // Pin, turn off, turn on and weights need the "learning" capability. The
  // API's `can_manage` stands in only until `/api/me` has answered with
  // capabilities (an older gateway), so nothing shows that the server refuses.
  const access = useCan();
  const canManage = access.me?.capabilities ? access.can("learning") : access.ready ? !!data?.can_manage && access.can("learning") : false;
  const labels = useMemo(() => Object.fromEntries((data?.signals ?? []).map((s) => [s.kind, s.label])), [data?.signals]);
  const active = data?.changes.filter((c) => !c.reverted && (!repo || c.repo === repo)).length ?? 0;

  const revertRepo = async () => {
    if (!repo) return;
    const ok = await confirm({
      title: `Turn off every change for ${repo}?`,
      message: `Coderhelm goes back to its default behavior on ${repo}: ${plural(active, "change")} stop applying. The outcomes are kept, and you can turn each change back on.`,
      confirmLabel: "Turn off all",
      destructive: true,
    });
    if (ok === "primary") await act(() => api.revertRepo(repo), `Turned off every change for ${repo}.`);
  };

  return (
    <Page>
      <PageHeader
        title="Learning"
        lead="What Coderhelm learned from how its work was received: review comments acted on or dismissed, ratings, merges, reverts and CI. Every change it made because of that is listed with its evidence, and can be turned off."
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={[...DAYS]} value={days} onChange={setDays} />
        <RepoFilter value={repo} onChange={setRepo} repos={repoNames} />
      </div>

      {error ? (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load what Coderhelm learned">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className={`mt-2 rounded text-sm font-medium underline ${focusRing}`}>Try again</button>
          </Callout>
        </div>
      ) : loading && !data ? (
        <div className="mt-6 space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <ChartSkeleton />
        </div>
      ) : data ? (
        <div aria-busy={loading || busy}>
          <div className="mt-6 space-y-3">
            {!canManage && (
              <Callout variant="neutral" title="You can see everything here" live={false}>
                <p>Only an admin or the owner can pin a variant, turn a change off or on, or change how outcomes are scored. Ask one of them if something here looks wrong.</p>
              </Callout>
            )}
            {actionError && (
              <Callout variant="error" title="That was not changed">
                <p>{actionError}</p>
              </Callout>
            )}
            {notice && !actionError && <Callout variant="success">{notice}</Callout>}
          </div>

          {data.totals.events === 0 ? (
            <div className="mt-6">
              <Callout variant="neutral" title="Nothing learned yet">
                <p>
                  Coderhelm learns from what happens to its reviews and pull requests. It needs {plural(data.min_samples, "outcome")} in a repository before anything changes how it works. Try a longer period, or another repository.
                </p>
              </Callout>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Outcomes" value={count(data.totals.events)} basis={`in the last ${data.days} days`} testId="tile-events" />
                <Tile label="Average reward" value={signed(data.totals.reward)} basis="from −1 to +1 per outcome" testId="tile-reward" />
                <Tile label="Changes in use" value={count(active)} basis="each with its evidence below" />
                <Tile label="Examples in use" value={count(data.exemplars.length)} basis="to follow or to avoid" />
              </div>

              <Section title="Reward over time" id="trend">
                <TrendCard data={data} />
                <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                  <Table
                    label="Reward by agent"
                    head={["Agent", "Outcomes", "Good", "Bad", "Average"]}
                    empty="No outcomes."
                    rows={data.agents.map((a) => [agentLabel(a.agent), count(a.events), count(a.positive), count(a.negative), signed(a.reward)])}
                  />
                  <Table
                    label="Reward by repository"
                    head={["Repository", "Outcomes", "Good", "Bad", "Average"]}
                    empty="No outcomes."
                    rows={data.repos.map((r) => [r.repo, count(r.events), count(r.positive), count(r.negative), signed(r.reward)])}
                  />
                </div>
              </Section>

              <Categories data={data} />
            </>
          )}

          <Section
            title="What changed and why"
            id="changes"
            description="Every change in behavior that came from outcomes. Turning one off puts that repository back on the default; the outcomes are kept."
            actions={
              repo ? (
                <button type="button" className={smallDangerButton} disabled={!canManage || busy || active === 0} title={canManage ? undefined : "Only an admin or the owner can turn changes off"} onClick={() => void revertRepo()}>
                  Turn off all for this repository
                </button>
              ) : undefined
            }
          >
            {!repo && data.changes.length > 0 && <p className="mb-3 text-xs text-zinc-500">Pick a repository above to turn off all of its changes at once.</p>}
            {data.changes.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
                No changes yet. Nothing changes until a repository has {plural(data.min_samples, "outcome")} pointing the same way.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.changes.map((c) => (
                  <ChangeItem
                    key={c.id}
                    change={c}
                    labels={labels}
                    canManage={canManage}
                    busy={busy}
                    onRevert={(x) => void act(() => api.revertChange(x.id), `Turned off: ${x.key} on ${x.repo || "all repositories"}.`)}
                    onRestore={(x) => void act(() => api.restoreChange(x.id), `Turned back on: ${x.key} on ${x.repo || "all repositories"}.`)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Exemplars list={data.exemplars} />

          <Section
            title="Variants"
            id="variants"
            description="Where an agent has more than one way to work, it mostly uses the one with the best outcomes and sometimes tries the others. Pin one to stop the trying."
          >
            {data.bandit.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">No agent has variants to choose between.</p>
            ) : (
              <div className="space-y-4">
                {data.bandit.map((b) => (
                  <BanditCard
                    key={b.agent}
                    b={b}
                    canManage={canManage}
                    busy={busy}
                    minSamples={data.min_samples}
                    onPin={(agent, arm) =>
                      void act(
                        () => api.pinVariant(agent, arm),
                        arm ? `Pinned ${b.arms.find((a) => a.key === arm)?.label ?? arm} for ${agentLabel(agent)}.` : `${agentLabel(agent)} chooses by results again.`,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Weights key={JSON.stringify(data.weights)} data={data} canManage={canManage} onSaved={(w) => setData((d) => (d ? { ...d, weights: w } : d))} />
        </div>
      ) : null}
    </Page>
  );
}
