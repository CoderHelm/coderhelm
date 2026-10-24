import type { TokenLimitUse } from "@/lib/api";
import { formatTokens, LIMIT_HELP, LIMIT_LABELS, limitBarClass, limitPct, usageTone } from "@/lib/usage";

/**
 * One small bar per monthly limit that is set (new tokens, cache read, cache
 * write). Used by the sidebar (compact) and the Token limit page. Renders
 * nothing when no limit is set.
 */
export function TokenMeters({
  limits,
  compact = false,
  testId,
}: {
  limits: TokenLimitUse[];
  compact?: boolean;
  testId?: string;
}) {
  if (limits.length === 0) return null;
  return (
    <ul className={compact ? "space-y-2" : "space-y-3"} aria-label="Monthly token limits" data-testid={testId}>
      {limits.map((l) => {
        const tone = usageTone(l.used, l.max);
        const pct = limitPct(l);
        const label = LIMIT_LABELS[l.kind];
        return (
          <li key={l.kind} data-testid={`token-meter-${l.kind}`} title={`${label}: ${LIMIT_HELP[l.kind]} ${formatTokens(l.used)} of ${formatTokens(l.max)} this month.`}>
            <div className={`flex items-center justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
              <span className={compact ? "text-zinc-500" : "text-zinc-300"}>{label}</span>
              <span
                data-testid="token-meter-value"
                className={`tabular-nums font-medium ${
                  tone === "error" ? "text-red-400" : tone === "warning" ? "text-yellow-400" : compact ? "text-zinc-300" : "text-zinc-100"
                }`}
              >
                {formatTokens(l.used)} / {formatTokens(l.max)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${label} limit used`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className={`${compact ? "mt-1 h-1" : "mt-1.5 h-2"} overflow-hidden rounded-full bg-zinc-800`}
            >
              <div className={`h-full rounded-full transition-all ${limitBarClass(l)}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
