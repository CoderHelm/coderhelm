"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type UsageInfo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { formatTokens, USAGE_CHANGED, usageTone } from "@/lib/usage";
import { hasRole, whoCan } from "@/lib/roles";

// Who may change the limit. The gateway checks the same role on save.
const EDIT_ROLE = "owner" as const;

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
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">Token limit</h1>
      <p className="text-sm text-zinc-400 mt-1 mb-6">
        A monthly cap on the tokens your team uses. When the team reaches it, new runs pause until the next month starts.
      </p>

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
                  <p>Only {whoCan(EDIT_ROLE)} can change the limit.</p>
                </Callout>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  const limit = usage.max_tokens;
  const used = usage.total_tokens;
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
    </section>
  );
}
