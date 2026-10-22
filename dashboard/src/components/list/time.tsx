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

/** A relative time with the exact time on hover. Renders nothing for no time. */
export function Time({ iso, className = "" }: { iso: string | null | undefined; className?: string }) {
  const words = timeAgo(iso);
  if (!words || !iso) return null;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={`whitespace-nowrap ${className}`}>
      {words}
    </time>
  );
}

/** 754 → "12m 34s". */
export function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
