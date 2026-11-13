"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsTokenUse, TokenNotComparable, TokenParts, TokenRunOutcome, TokenWorkKind } from "@/lib/api";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Callout } from "@/components/callout";
import { Section } from "@/components/page";
import { ChartCard, ChartTip, SERIES, Table, axis, delta, shortDay } from "@/components/charts";

// ── Words ──────────────────────────────────────────────────────────────────

export function tokens(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
const count = (v: number) => v.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
/** An estimate in dollars: cents under $100, whole dollars above. */
function usd(v: number | null | undefined) {
  if (v == null) return "—";
  if (v > 0 && v < 0.01) return "under $0.01";
  return v >= 100 ? `$${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;
}

const KIND: Record<TokenWorkKind, string> = {
  ticket_runs: "Ticket runs",
  security: "Security fixes",
  follow_ups: "Review and CI fixes on open PRs",
  reviews: "PR reviews",
  chat: "Chat and questions",
  logs: "Logs and alerts",
  other: "Other",
};
const kindLabel = (k: string) => KIND[k as TokenWorkKind] ?? k.replace(/_/g, " ");

/** What the usage meter calls each thing it counts, in plain words. */
const FEATURE: Record<string, string> = {
  run: "ticket runs",
  plan: "tasks of approved plans",
  security_fix: "runs that fix advisories",
  security: "sorting advisories",
  feedback: "review comments, CI fixes and conflicts",
  review: "reviews",
  chat: "plan chat",
  brain: "questions in chat",
  agent_ask: "questions to team agents",
  log_analysis: "log analysis",
  alert: "alerts",
  onboard: "repository setup",
  infra: "infrastructure analysis",
  skill_sync: "team agent knowledge",
  release_notes: "release notes",
  tests: "test results",
  live_sources: "data source descriptions",
  data_source: "data source fields",
  memory: "learning from finished work",
  plugin: "plugins",
  other: "calls outside any of these",
};
const featureLabel = (f: string) => FEATURE[f] ?? f.replace(/_/g, " ");

const OUTCOME: Record<TokenRunOutcome, string> = {
  merged: "Pull request merged",
  open: "Pull request still open",
  closed: "Pull request closed without merging",
  failed: "Run failed",
  no_pr: "No pull request (running, waiting or nothing to change)",
};
const outcomeLabel = (o: string) => OUTCOME[o as TokenRunOutcome] ?? o.replace(/_/g, " ");

/** Why there is no change shown, in one short line for a tile. */
function notCompared(why: TokenNotComparable | null, tu: AnalyticsTokenUse) {
  const from = why === "counting_started_later" ? tu.metered_from : tu.run_records_from;
  return from ? `Not compared: counted differently before ${shortDay(from)}` : "Not compared: the period before was counted differently";
}

/** The same, in full, for the top of the view. */
function whyNotCompared(why: TokenNotComparable, tu: AnalyticsTokenUse) {
  if (why === "counting_started_later") {
    return tu.metered_from
      ? `Coderhelm has counted every model call one by one since ${shortDay(tu.metered_from)}. The period before starts earlier, so its total is incomplete and no change is shown.`
      : "The period before was not counted call by call, so its total is incomplete and no change is shown.";
  }
  return `Until ${shortDay(tu.run_records_from)} a run that continued later (a CI fix, a resume) kept only its last step's tokens, so older runs read lower than they were. The period before starts earlier, so numbers built on run records are not compared with it.`;
}

/** The tokens that are not cache reads: new input, cache writes and output. */
const fullPrice = (p: TokenParts) => p.tokens_in + p.cache_write_tokens + p.tokens_out;

const partCells = (p: TokenParts) => [tokens(p.tokens_in), tokens(p.tokens_out), tokens(p.cache_read_tokens), tokens(p.cache_write_tokens), tokens(p.tokens)];
const PART_HEAD = ["New input", "Output", "Cache read", "Cache write", "All tokens"];

/** "▲ 12%" against the period before, or a dash when it was counted differently. */
function changeCell(cur: number, prev: number | null) {
  if (prev == null) return "—";
  return delta(cur, prev, "count", "").trim();
}

// ── The two headline tiles (Overview and this view) ────────────────────────

export function TokenTiles({ tu, span, vs }: { tu: AnalyticsTokenUse; span: string; vs: string }) {
  const per = tu.per_merged_pr;
  const total = tu.total;
  return (
    <>
      <StatTile
        testId="tile-tokens-per-pr"
        label="Tokens per merged PR"
        value={per.tokens_per_pr == null ? "—" : tokens(per.tokens_per_pr)}
        delta={{ text: per.comparable ? delta(per.tokens_per_pr, per.previous?.tokens_per_pr ?? null, "count", vs) : notCompared(per.not_comparable, tu), tone: "flat" }}
        note={
          per.prs
            ? `Only runs started in ${span} whose pull request merged: ${tokens(per.tokens)} tokens from ${plural(per.runs, "run")} on ${plural(per.prs, "PR")}`
            : `No run started in ${span} has a merged pull request yet`
        }
      />
      <StatTile
        testId="tile-tokens-total"
        label="Tokens used"
        value={tokens(total.tokens)}
        delta={{ text: tu.comparable ? delta(total.tokens, tu.previous?.tokens ?? null, "count", vs) : notCompared(tu.not_comparable, tu), tone: "flat" }}
        note={`${tu.basis === "metered" ? "Every model call: runs, reviews, chat and the rest" : "Runs started in the period only"} · ${share(total.cache_read_tokens, total.tokens)} were cache reads`}
      />
    </>
  );
}

// ── The view ───────────────────────────────────────────────────────────────

type Row = { label: string; cache_read: number; full_price: number };

function SplitBars({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <div style={{ height: Math.max(120, rows.length * 34 + 56) }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" barCategoryGap="28%" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="#27272a" />
          <XAxis type="number" tickFormatter={(v: number) => tokens(v)} {...axis} />
          <YAxis type="category" dataKey="label" width={150} {...axis} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip format={(v) => `${tokens(v)} tokens`} labelFormat={(l) => l} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
          <Bar dataKey="full_price" stackId="t" name="New input, cache writes and output" fill={SERIES.second} stroke="#18181b" strokeWidth={1} maxBarSize={16} />
          <Bar dataKey="cache_read" stackId="t" name="Cache reads" fill={SERIES.first} stroke="#18181b" strokeWidth={1} radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RunLink({ id, title, sub }: { id: string; title: string; sub: ReactNode }) {
  return (
    <span className="block min-w-0">
      <Link href={`/runs/detail?id=${id}`} className="text-zinc-100 underline-offset-2 hover:underline">{title || `Run ${id}`}</Link>
      <span className="block text-xs text-zinc-400">{sub}</span>
    </span>
  );
}

function PrLink({ url, number }: { url: string; number: number }) {
  if (!number) return null;
  return url ? (
    <>
      {" · "}
      <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">#{number}</a>
    </>
  ) : (
    <>{` · #${number}`}</>
  );
}

export function TokenUseSection({ tu, span, vs }: { tu: AnalyticsTokenUse | undefined; span: string; vs: string }) {
  if (!tu) {
    return (
      <div className="mt-6" data-testid="token-use-unavailable">
        <Callout title="This server doesn't report token use by kind of work yet">Update Coderhelm to see tokens by part, kind of work and model here. The Overview still shows the totals this server has.</Callout>
      </div>
    );
  }
  const total = tu.total;
  const metered = tu.basis === "metered";
  const per = tu.per_merged_pr;
  const reasons = [...new Set([tu.not_comparable, per.not_comparable].filter((x): x is TokenNotComparable => !!x))];
  const noUse = total.tokens === 0 && tu.runs.tokens === 0;
  const kindRows: Row[] = tu.by_kind.map((k) => ({ label: kindLabel(k.kind), cache_read: k.cache_read_tokens, full_price: fullPrice(k) }));
  const modelRows: Row[] = tu.by_model.map((m) => ({ label: m.model, cache_read: m.cache_read_tokens, full_price: fullPrice(m) }));
  const daily = tu.daily.map((d) => ({ day: d.day, cache_read: d.cache_read_tokens, full_price: fullPrice(d) }));
  const lumped = tu.by_kind.filter((k) => k.features.length > 1 || (k.features.length === 1 && k.kind === "other"));
  const unpriced = tu.by_model.filter((m) => !m.price_known);

  return (
    <div data-testid="token-use">
      {reasons.length > 0 && (
        <div className="mt-6" data-testid="token-use-not-compared">
          <Callout title="Some numbers here are not compared with the period before">
            {reasons.map((r) => (
              <p key={r} className="mt-1 first:mt-0">{whyNotCompared(r, tu)}</p>
            ))}
          </Callout>
        </div>
      )}

      <Section
        title="Token use"
        id="token-use"
        description={
          metered
            ? `Every model call Coderhelm made for your team in ${span}, on the day it was made: runs, reviews, chat, log analysis and the rest.`
            : `What the runs started in ${span} used. With one repository picked, reviews, chat and log analysis are left out: they are not kept per repository.`
        }
      >
        <StatGrid>
          <TokenTiles tu={tu} span={span} vs={vs} />
          <StatTile
            testId="tile-cache-share"
            label="Cache reads"
            value={share(total.cache_read_tokens, total.tokens)}
            note={`${tokens(total.cache_read_tokens)} of ${tokens(total.tokens)} tokens were text the model had already read. A cache read is billed at a small fraction of new input.`}
          />
          <StatTile
            testId="tile-token-cost"
            label="Estimated cost"
            value={usd(total.cost_usd)}
            delta={tu.comparable && tu.previous ? { text: delta(total.cost_usd, tu.previous.cost_usd, "count", vs), tone: "flat" } : undefined}
            note="Each call at its model's list price. Your provider's bill is the real figure."
          />
        </StatGrid>
      </Section>

      {noUse ? (
        <p className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400" data-testid="token-use-empty">No model calls recorded in {span}.</p>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            <ChartCard
              title={metered ? "Tokens per day, by part" : "Tokens per day, by part (runs, on the day each started)"}
              table={<Table label="Tokens per day by part" head={["Day", ...PART_HEAD, "Est. cost"]} rows={tu.daily.map((d) => [shortDay(d.day), ...partCells(d), usd(d.cost_usd)])} empty="No days." />}
            >
              <div className="h-56" role="img" aria-label="Stacked bar chart of tokens per day: cache reads, and new input, cache writes and output">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                    <YAxis width={44} tickFormatter={(v: number) => tokens(v)} {...axis} />
                    <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip format={(v) => `${tokens(v)} tokens`} />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                    <Bar dataKey="full_price" stackId="t" name="New input, cache writes and output" fill={SERIES.second} stroke="#18181b" strokeWidth={1} maxBarSize={18} />
                    <Bar dataKey="cache_read" stackId="t" name="Cache reads" fill={SERIES.first} stroke="#18181b" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Tokens by kind of work"
              table={
                <Table
                  label="Tokens by kind of work"
                  head={["Kind of work", ...PART_HEAD, "Share", "Est. cost", "Change"]}
                  rows={tu.by_kind.map((k) => [kindLabel(k.kind), ...partCells(k), share(k.tokens, total.tokens), usd(k.cost_usd), changeCell(k.tokens, k.previous_tokens)])}
                  empty="No model calls in this period."
                />
              }
            >
              {kindRows.length ? <SplitBars rows={kindRows} label="Bar chart of tokens by kind of work, cache reads apart from the rest" /> : <p className="flex h-40 items-center justify-center text-sm text-zinc-400">No model calls in this period.</p>}
            </ChartCard>
          </div>

          <div className="mt-3 space-y-1 text-xs text-zinc-400" data-testid="token-use-lumped">
            {metered ? (
              <>
                <p>Fixes after review comments, CI fixes and merge conflicts on an open pull request are counted together: the meter does not tell them apart. A CI fix made while a run is still going counts under that run.</p>
                {lumped.map((k) => (
                  <p key={k.kind}>
                    {kindLabel(k.kind)} is {k.features.map((f) => `${featureLabel(f.feature)} (${tokens(f.tokens)})`).join(", ")}.
                  </p>
                ))}
              </>
            ) : (
              <p>Each run&apos;s tokens include the fixes made on its pull request afterwards. The split by model needs every repository: pick All repositories to see it.</p>
            )}
          </div>

          {metered && (
            <div className="mt-6">
              <ChartCard
                title="Tokens by model"
                table={
                  <Table
                    label="Tokens by model"
                    head={["Model", ...PART_HEAD, "Cache hit share", "Calls", "Est. cost", "Change"]}
                    rows={tu.by_model.map((m) => [m.model, ...partCells(m), pct(m.cache_hit_share), count(m.calls), m.price_known ? usd(m.cost_usd) : `${usd(m.cost_usd)} at most`, changeCell(m.tokens, m.previous_tokens)])}
                    empty="No model calls in this period."
                  />
                }
              >
                {modelRows.length ? <SplitBars rows={modelRows} label="Bar chart of tokens by model, cache reads apart from the rest" /> : <p className="flex h-40 items-center justify-center text-sm text-zinc-400">No model calls in this period.</p>}
              </ChartCard>
              <p className="mt-3 text-xs text-zinc-400">
                Cache hit share is cache reads out of all input (cache reads, cache writes and new input): the higher it is, the less each call costs.
                {unpriced.length > 0 && ` No list price is known for ${unpriced.map((m) => m.model).join(", ")}: its cost is shown at the highest known price, so it is an upper bound.`}
              </p>
            </div>
          )}

          <Section
            title="What a merged pull request took"
            id="per-merged-pr"
            description={`Runs started in ${span} whose pull request has merged, with the fixes made on it afterwards. Failed runs, runs whose pull request is still open or was closed, and reviews of other people's pull requests are not in this number.`}
          >
            <Table
              label="Tokens per merged PR by kind of run"
              head={["Kind of run", "Merged PRs", "Runs", "Tokens per PR", "Est. cost per PR", "All tokens", "Cache read"]}
              rows={per.by_kind.map((k) => [kindLabel(k.kind), count(k.prs), count(k.runs), k.tokens_per_pr == null ? "—" : tokens(k.tokens_per_pr), usd(k.cost_per_pr), tokens(k.tokens), tokens(k.cache_read_tokens)])}
              empty={`No run started in ${span} has a merged pull request yet.`}
            />
            <div className="mt-6">
              <Table
                label="Run tokens by how the work ended"
                head={["How the work ended", "Runs", "All tokens", "Share of run tokens", "Est. cost"]}
                rows={tu.runs.by_outcome.map((o) => [outcomeLabel(o.outcome), count(o.runs), tokens(o.tokens), share(o.tokens, tu.runs.tokens), usd(o.cost_usd)])}
                empty="No runs in this period."
              />
              <p className="mt-3 text-xs text-zinc-400">Every run started in {span} is in exactly one row, by where its pull request stands now.</p>
            </div>
          </Section>

          <Section title="Heaviest pull requests" id="heaviest-prs" description="All the runs on one pull request, added up. Open one to see what it did.">
            <Table
              label="Heaviest pull requests"
              head={["Pull request", "Runs", ...PART_HEAD, "Est. cost"]}
              rows={tu.heaviest_prs.map((r) => [
                <RunLink key={`${r.repo}#${r.pr_number}`} id={r.run_id} title={r.title} sub={<>{r.repo}<PrLink url={r.pr_url} number={r.pr_number} />{" · "}{kindLabel(r.kind)}{" · "}{outcomeLabel(r.outcome)}</>} />,
                count(r.runs),
                ...partCells(r),
                usd(r.cost_usd),
              ])}
              empty="No pull requests from runs in this period."
            />
          </Section>

          <Section title="Heaviest runs" id="heaviest-runs">
            <Table
              label="Heaviest runs"
              head={["Run", ...PART_HEAD, "Est. cost"]}
              rows={tu.heaviest_runs.map((r) => [
                <RunLink key={r.run_id} id={r.run_id} title={r.title} sub={<>{r.repo}<PrLink url={r.pr_url} number={r.pr_number} />{" · "}{kindLabel(r.kind)}{" · "}{outcomeLabel(r.outcome)}</>} />,
                ...partCells(r),
                usd(r.cost_usd),
              ])}
              empty="No runs used tokens in this period."
            />
          </Section>
        </>
      )}
    </div>
  );
}
