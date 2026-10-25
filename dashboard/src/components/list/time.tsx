// One way to say "when" in every list.

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
}

/** "Oct 25, 2026"; with `time`, "Oct 25, 2026, 11:25 AM". The one date format. */
export function formatDate(iso: string | number | null | undefined, opts: { time?: boolean } = {}): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, opts.time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

/**
 * A time, said one way everywhere: relative ("5 min ago") by default, or a
 * date (`mode="date"`, "Oct 25, 2026"). The exact time shows on hover.
 * Renders nothing for no time.
 */
export function Time({ iso, className = "", mode = "relative" }: { iso: string | null | undefined; className?: string; mode?: "relative" | "date" }) {
  const words = mode === "date" ? formatDate(iso) : timeAgo(iso);
  if (!words || !iso) return null;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={`whitespace-nowrap ${className}`}>
      {words}
    </time>
  );
}

/** 754 → "12m 34s". The one duration format, from seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** The same, from milliseconds: 450 → "450 ms", 4200 → "4.2s", 610000 → "10m 10s". */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatDuration(ms / 1000);
}
