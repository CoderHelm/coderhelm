"use client";

import { ANY_CHANGE, can } from "@/lib/capabilities";
import { useCallback, useEffect, useState } from "react";
import { api, type TokenLimitKind, type TokenLimitsInput, type UsageInfo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { Disclosure } from "@/components/disclosure";
import { TokenMeters } from "@/components/token-meters";
import { SaveBar, SettingsRow, SettingsSection, useDirtyForm } from "@/components/settings";
import { inputClass } from "@/components/ui";
import { cacheHitRate, FEATURE_LABELS, formatTokens, LIMIT_HELP, LIMIT_LABELS, limitsTone, USAGE_CHANGED, usageBreakdown, usageLimits, usageParts, usageTotal } from "@/lib/usage";
import { Page, PageHeader } from "@/components/page";

// Who may change the limits. The gateway checks the same role on save.

/** The three limits a team sets, the body field each saves to, and its input id. */
type SetKind = Exclude<TokenLimitKind, "all_tokens">;
const LIMITS: { kind: SetKind; field: keyof TokenLimitsInput; id: string }[] = [
  { kind: "new_tokens", field: "max_new_tokens", id: "limit-new-tokens" },
  { kind: "cache_read", field: "max_cache_read_tokens", id: "limit-cache-read" },
  { kind: "cache_write", field: "max_cache_write_tokens", id: "limit-cache-write" },
];

const FIELD_LABELS: Record<SetKind, string> = {
  new_tokens: "New tokens (input + output)",
  cache_read: "Cache read tokens",
  cache_write: "Cache write tokens",
};

type Drafts = Record<SetKind, string>;

export default function TokenLimitPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <TokenLimitPage />
    </RoleGuard>
  );
}

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; usage: UsageInfo; canEdit: boolean };

/** Millions of tokens as typed, from a limit in tokens ("" = no limit). */
function draftsFrom(usage: UsageInfo): Drafts {
  const limits = usageLimits(usage);
  const of = (kind: SetKind) => {
    const max = limits.find((l) => l.kind === kind)?.max ?? 0;
    return max > 0 ? String(max / 1_000_000) : "";
  };
  return { new_tokens: of("new_tokens"), cache_read: of("cache_read"), cache_write: of("cache_write") };
}

/** A typed value in tokens: null = no limit, NaN = not a number of 0 or more. */
function parseDraft(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return NaN;
  const tokens = Math.round(n * 1_000_000);
  return tokens > 0 ? tokens : null;
}

function TokenLimitPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { toast } = useToast();
  // The three limits as typed, against what is saved: one save bar, a mark
  // on each changed limit, and a warning before leaving with changes.
  const form = useDirtyForm<Drafts>({ new_tokens: "", cache_read: "", cache_write: "" }, { disabled: load.state !== "ready" });
  const drafts = form.values;
  const { reset } = form;

  const fetchAll = useCallback(() => {
    setLoad({ state: "loading" });
    // Usage carries the stored limits too, so one read gives both.
    Promise.all([api.getUsage(), api.me()])
      .then(([usage, me]) => {
        setLoad({ state: "ready", usage, canEdit: can(me, "budget") });
        reset(draftsFrom(usage));
      })
      .catch(() => setLoad({ state: "error" }));
  }, [reset]);

  useEffect(fetchAll, [fetchAll]);

  const parsed = Object.fromEntries(LIMITS.map((l) => [l.kind, parseDraft(drafts[l.kind])])) as Record<SetKind, number | null>;
  const invalid = LIMITS.some((l) => Number.isNaN(parsed[l.kind]));
  // An old single limit that counts every kind of token: saving replaces it.
  const allTokens = load.state === "ready" ? usageLimits(load.usage).find((l) => l.kind === "all_tokens") : undefined;

  const handleSave = async () => {
    if (load.state !== "ready" || invalid) return;
    setSaving(true);
    setProblem(null);
    const body: TokenLimitsInput = {
      max_new_tokens: parsed.new_tokens,
      max_cache_read_tokens: parsed.cache_read,
      max_cache_write_tokens: parsed.cache_write,
    };
    try {
      await api.updateBudget(body);
      // Re-read so the meters show each limit against what it counts.
      const usage = await api.getUsage().catch(() => null);
      if (usage) {
        setLoad({ ...load, usage });
        reset(draftsFrom(usage));
      } else {
        reset(drafts);
      }
      window.dispatchEvent(new Event(USAGE_CHANGED));
      const set = LIMITS.filter((l) => parsed[l.kind] != null).length;
      toast(set > 0 ? `Token limits saved: ${set} of 3 set` : "Token limits removed");
    } catch (e) {
      setProblem(e instanceof Error && e.message ? `The limits weren't saved: ${e.message}` : "The limits weren't saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Token limit"
          lead="Monthly caps on the tokens your team uses: one for new tokens, one for cache reads and one for cache writes. When any limit is reached, new runs pause until the next month starts."
        />
      </div>

      {load.state === "loading" && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading token limit">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}

      {load.state === "error" && (
        <Problem title="Couldn't load the token limits" onRetry={fetchAll}>
          Nothing has changed. Check your connection and try again.
        </Problem>
      )}

      {load.state === "ready" && (
        <div className="max-w-3xl space-y-8">
          <UsageCard usage={load.usage} />

          {allTokens && (
            <Callout variant="neutral" live={false} title={`Current limit: ${formatTokens(allTokens.max)} tokens of every kind`}>
              <p>Your team has one limit that counts new tokens, cache reads and cache writes together. It stays in place until you save the limits below, which replace it.</p>
            </Callout>
          )}
          {load.canEdit ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              <SettingsSection id="limits" title="Monthly limits" description="Each limit is checked on its own. Leave one empty for no limit of that kind.">
                {LIMITS.map((l) => {
                  const v = parsed[l.kind];
                  const bad = Number.isNaN(v);
                  return (
                    <SettingsRow
                      key={l.kind}
                      label={FIELD_LABELS[l.kind]}
                      unsaved={form.isDirty(l.kind)}
                      controlClassName="sm:w-48"
                      help={
                        <>
                          {LIMIT_HELP[l.kind]} {v != null && !bad ? `Runs pause after ${formatTokens(v)} in a month.` : "Empty means no limit."}
                        </>
                      }
                      control={(ids) => (
                        <div>
                          <div className="relative">
                            <input
                              id={ids.inputId}
                              aria-describedby={[bad ? `${l.id}-error` : "", ids.helpId ?? ""].filter(Boolean).join(" ") || undefined}
                              aria-invalid={bad || undefined}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.5"
                              placeholder="No limit"
                              value={drafts[l.kind]}
                              onChange={(e) => form.set(l.kind, e.target.value)}
                              className={`${inputClass} pr-20`}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">M tokens</span>
                          </div>
                          {bad && (
                            <p id={`${l.id}-error`} role="alert" className="mt-1.5 text-sm text-red-300">
                              Enter a number of 0 or more.
                            </p>
                          )}
                        </div>
                      )}
                    />
                  );
                })}
              </SettingsSection>
              {/* Enter in a limit saves, as in any form. */}
              <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                Save
              </button>
              <SaveBar
                count={form.count}
                onSave={handleSave}
                onDiscard={() => {
                  form.discard();
                  setProblem(null);
                }}
                saving={saving}
                problem={invalid ? "Fix the limits marked in red first." : problem}
              />
            </form>
          ) : (
            <SettingsSection id="limits" title="Monthly limits" description="Only admins and the owner can change the limits.">
              <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3" aria-label="Monthly limits">
                {LIMITS.map((l) => {
                  const max = usageLimits(load.usage).find((u) => u.kind === l.kind)?.max ?? 0;
                  return (
                    <div key={l.kind} data-testid={`limit-${l.kind}`}>
                      <dt className="text-sm text-zinc-400">{LIMIT_LABELS[l.kind]}</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-zinc-100">{max > 0 ? `${formatTokens(max)} a month` : "No limit"}</dd>
                    </div>
                  );
                })}
              </dl>
            </SettingsSection>
          )}
        </div>
      )}
    </Page>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  const limits = usageLimits(usage);
  // All four parts: new input, read from cache, written to cache, output.
  const used = usageTotal(usage);
  const parts = usageParts(usage);
  const hitRate = Math.round(cacheHitRate(usage) * 100);
  const features = (usage.features ?? []).filter((f) => f.total_tokens > 0);
  const tone = limitsTone(limits);
  const month = new Date(`${usage.month}-01T00:00:00Z`).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section aria-labelledby="usage-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="usage-heading" className="text-sm font-semibold text-zinc-100">Used in {month}</h2>
        {limits.length > 0 && (
          <StatusPill tone={tone}>{tone === "error" ? "Limit reached" : tone === "warning" ? "Near a limit" : "Under the limits"}</StatusPill>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">
        {formatTokens(used)}
        <span className="text-sm font-normal text-zinc-400"> {limits.length > 0 ? "tokens in all" : "tokens, no limit set"}</span>
      </p>
      {limits.length > 0 && (
        <div className="mt-3">
          <TokenMeters limits={limits} testId="usage-limits" />
        </div>
      )}
      <p className="mt-2 text-sm text-zinc-400">
        {usage.total_runs.toLocaleString()} {usage.total_runs === 1 ? "run" : "runs"} this month
      </p>

      <div className="mt-4">
      <Disclosure summary="Details">
      <dl aria-label="Tokens by kind" className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} data-testid="usage-part">
            <dt className="text-sm text-zinc-400">{p.label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100" data-value={p.value}>
              {formatTokens(p.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-zinc-400" data-testid="cache-hit-rate">
        Cache hit rate {hitRate}%: the share of input read from the cache instead of sent new or written to it.
      </p>

      {features.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-medium text-zinc-200">Where the tokens went</h3>
          <ul className="mt-2 space-y-1.5" aria-label="Tokens by feature">
            {features.map((f) => (
              <li key={f.feature} className="flex items-center justify-between gap-3 text-sm" title={usageBreakdown(f)}>
                <span className="text-zinc-300">{FEATURE_LABELS[f.feature] ?? f.feature}</span>
                <span className="tabular-nums text-zinc-400">
                  {formatTokens(f.total_tokens)}
                  <span className="text-zinc-500"> · {used > 0 ? Math.round((f.total_tokens / used) * 100) : 0}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      </Disclosure>
      </div>
    </section>
  );
}
