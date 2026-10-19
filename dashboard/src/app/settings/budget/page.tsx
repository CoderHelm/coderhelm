"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type UsageInfo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { cacheHitRate, FEATURE_LABELS, formatTokens, USAGE_CHANGED, usageBreakdown, usageParts, usageTone, usageTotal } from "@/lib/usage";
import { hasRole } from "@/lib/roles";
import { Page, PageHeader } from "@/components/page";

// Who may change the limit. The gateway checks the same role on save.
const EDIT_ROLE = "admin" as const;

export default function TokenLimitPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <TokenLimitPage />
    </RoleGuard>
  );
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; usage: UsageInfo; canEdit: boolean };

function TokenLimitPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAll = useCallback(() => {
    setLoad({ state: "loading" });
    // Usage carries the stored limit too, so one read gives both numbers.
    Promise.all([api.getUsage(), api.me()])
      .then(([usage, me]) => {
        setLoad({ state: "ready", usage, canEdit: hasRole(me.role, EDIT_ROLE) });
        setValue(usage.max_tokens > 0 ? String(usage.max_tokens / 1_000_000) : "");
      })
      .catch(() => setLoad({ state: "error" }));
  }, []);

  useEffect(fetchAll, [fetchAll]);

  const parsed = value.trim() === "" ? 0 : Number(value);
  const invalid = !Number.isFinite(parsed) || parsed < 0;
  const tokens = invalid ? 0 : Math.round(parsed * 1_000_000);

  const handleSave = async () => {
    if (load.state !== "ready" || invalid) return;
    setSaving(true);
    try {
      await api.updateBudget(tokens);
      setLoad({ ...load, usage: { ...load.usage, max_tokens: tokens } });
      window.dispatchEvent(new Event(USAGE_CHANGED));
      toast(tokens > 0 ? `Token limit set to ${formatTokens(tokens)} a month` : "Token limit removed");
    } catch (e) {
      toast(e instanceof Error && e.message ? `Could not save: ${e.message}` : "Could not save the token limit", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader title="Token limit" lead="A monthly cap on the tokens your team uses. When the team reaches it, new runs pause until the next month starts." />
      </div>

      {load.state === "loading" && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading token limit">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}

      {load.state === "error" && (
        <Callout variant="error" title="Could not load the token limit">
          <p>Check your connection and try again.</p>
          <p className="pt-1">
            <button type="button" onClick={fetchAll} className={secondaryButton}>
              Try again
            </button>
          </p>
        </Callout>
      )}

      {load.state === "ready" && (
        <div className="space-y-4">
          <UsageCard usage={load.usage} />

          <section aria-labelledby="limit-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 id="limit-heading" className="text-sm font-semibold text-zinc-100">Monthly limit</h2>
            {load.canEdit ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                <label htmlFor="token-limit" className="block text-sm text-zinc-300">
                  Millions of tokens a month
                </label>
                <div className="relative">
                  <input
                    id="token-limit"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="No limit"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-describedby="token-limit-help"
                    aria-invalid={invalid || undefined}
                    className={`${inputClass} pr-28`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">M tokens</span>
                </div>
                <p id="token-limit-help" className={`text-xs ${invalid ? "text-red-400" : "text-zinc-500"}`}>
                  {invalid
                    ? "Enter a number of 0 or more."
                    : tokens > 0
                      ? `Runs pause after ${formatTokens(tokens)} tokens in a month.`
                      : "Leave empty or enter 0 for no limit."}
                </p>
                <div className="flex justify-end pt-1">
                  <button type="submit" disabled={saving || invalid} className={primaryButton}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-2xl font-semibold text-zinc-100">
                  {load.usage.max_tokens > 0 ? `${formatTokens(load.usage.max_tokens)} tokens a month` : "No limit"}
                </p>
                <Callout variant="info" live={false}>
                  <p>Only admins and the owner can change the limit.</p>
                </Callout>
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  const limit = usage.max_tokens;
  // All four parts: new input, read from cache, written to cache, output.
  const used = usageTotal(usage);
  const parts = usageParts(usage);
  const hitRate = Math.round(cacheHitRate(usage) * 100);
  const features = (usage.features ?? []).filter((f) => f.total_tokens > 0);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = usageTone(used, limit);
  const bar = tone === "error" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : "bg-emerald-500";
  const month = new Date(`${usage.month}-01T00:00:00Z`).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section aria-labelledby="usage-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="usage-heading" className="text-sm font-semibold text-zinc-100">Used in {month}</h2>
        {limit > 0 && (
          <StatusPill tone={tone}>{tone === "error" ? "Limit reached" : tone === "warning" ? "Near the limit" : "Under the limit"}</StatusPill>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">
        {formatTokens(used)}
        <span className="text-sm font-normal text-zinc-400"> {limit > 0 ? `of ${formatTokens(limit)} tokens` : "tokens, no limit set"}</span>
      </p>
      {limit > 0 && (
        <div
          role="progressbar"
          aria-label="Share of the monthly limit used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"
        >
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {usage.total_runs.toLocaleString()} {usage.total_runs === 1 ? "run" : "runs"} this month
        {limit > 0 ? ` · ${pct}% of the limit` : ""}
      </p>

      <dl aria-label="Tokens by kind" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-800 pt-4 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} data-testid="usage-part">
            <dt className="text-xs text-zinc-500">{p.label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100" data-value={p.value}>
              {formatTokens(p.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-zinc-500" data-testid="cache-hit-rate">
        Cache hit rate {hitRate}%: the share of input read from the cache instead of sent new or written to it.
      </p>

      {features.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-medium text-zinc-400">Where the tokens went</h3>
          <ul className="mt-2 space-y-1.5" aria-label="Tokens by feature">
            {features.map((f) => (
              <li key={f.feature} className="flex items-center justify-between gap-3 text-sm" title={usageBreakdown(f)}>
                <span className="text-zinc-300">{FEATURE_LABELS[f.feature] ?? f.feature}</span>
                <span className="tabular-nums text-zinc-400">
                  {formatTokens(f.total_tokens)}
                  <span className="text-zinc-600"> · {used > 0 ? Math.round((f.total_tokens / used) * 100) : 0}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {limit > 0 && usage.limit_counts_cache === false && (
        <p className="mt-4 text-xs text-zinc-500" data-testid="limit-rule">
          Runs pause when new input and output reach the limit ({formatTokens(usage.counted_tokens ?? usage.tokens_in + usage.tokens_out)} so far).
          Tokens read from or written to the cache are shown above but not counted toward it yet.
        </p>
      )}
    </section>
  );
}
