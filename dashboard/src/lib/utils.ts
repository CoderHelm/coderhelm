/**
 * Returns a human-readable relative time string (e.g. "5 minutes ago") for a
 * given ISO date string. Falls back to "—" for missing or invalid input.
 */
export function formatTimeAgo(isoString: string): string {
  if (!isoString) return "—";

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

/**
 * Returns a locale-formatted absolute date/time string for a given ISO date
 * string (e.g. "7/15/2025, 3:42:11 PM"). Falls back to "" for missing input.
 */
export function formatAbsoluteDate(isoString: string): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString();
}
