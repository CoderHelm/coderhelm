import type { Review, ReviewFinding } from "@/lib/api";

// A review as its page shows it: the summary, the findings one by one, and
// whatever else the text held. Reviews written since the findings were kept
// carry them as data; older ones have them only in the text, one per bullet:
//
//   - [high] src/app/page.tsx:84 — Title on one line
//     The body, indented two spaces, over as many lines as it needs.

export interface Finding extends ReviewFinding {
  /** Holds the merge, as far as the record says: null when it can't tell. */
  holds: boolean | null;
}

export interface ReviewParts {
  summary: string;
  findings: Finding[];
  /** Text after or between the findings that isn't one of them. */
  rest: string;
}

const SEVERITIES = ["blocking", "high", "medium", "low", "nit"];

// "- [severity] path:line — title". The path takes everything up to the last
// ":<digits>" before the dash, so a path with a colon in it still reads.
const FINDING_LINE = /^- \[([a-z]+)\] (.*?):(\d+) — (.*)$/;

/** Finds the findings in a review's text. */
export function parseBody(body: string): ReviewParts {
  const summary: string[] = [];
  const rest: string[] = [];
  const findings: ReviewFinding[] = [];
  let current: { f: ReviewFinding; lines: string[] } | null = null;
  const close = () => {
    if (!current) return;
    current.f.body = trimBlank(current.lines).join("\n");
    findings.push(current.f);
    current = null;
  };
  for (const line of body.split("\n")) {
    const m = FINDING_LINE.exec(line);
    if (m && SEVERITIES.includes(m[1])) {
      close();
      current = { f: { severity: m[1], file: m[2], line: Number(m[3]), title: m[4].trim(), body: "" }, lines: [] };
      continue;
    }
    if (current) {
      // The body is indented; a blank line may sit inside it.
      if (line.startsWith("  ") || line.trim() === "") {
        current.lines.push(line.startsWith("  ") ? line.slice(2) : line);
        continue;
      }
      close();
    }
    (findings.length === 0 ? summary : rest).push(line);
  }
  close();
  // The page heads the summary itself; a "## Summary" of its own would say it twice.
  const head = trimBlank(summary);
  if (head.length > 0 && /^#{1,4}\s*summary\s*$/i.test(head[0].trim())) head.shift();
  return { summary: trimBlank(head).join("\n"), findings: findings.map((f) => ({ ...f, holds: null })), rest: trimBlank(rest).join("\n") };
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b);
}

/**
 * The review's parts. Kept findings are used as they are; otherwise they are
 * read from the text, and whether one holds the merge is known only where it
 * can be: on an approval none does, and on a change request a "blocking" one
 * does. Anything else is left unsplit rather than guessed.
 */
export function reviewParts(review: Pick<Review, "body" | "findings" | "verdict">): ReviewParts {
  const parsed = parseBody(review.body || "");
  if (Array.isArray(review.findings)) {
    return {
      summary: parsed.summary,
      rest: parsed.rest,
      findings: review.findings.map((f) => ({ ...f, holds: typeof f.blocks === "boolean" ? f.blocks : null })),
    };
  }
  const anyBlocking = parsed.findings.some((f) => f.severity === "blocking");
  const holds = (f: Finding): boolean | null => {
    if (review.verdict === "APPROVE") return false;
    if (review.verdict === "REQUEST_CHANGES" && anyBlocking) return f.severity === "blocking";
    return null;
  };
  return { ...parsed, findings: parsed.findings.map((f) => ({ ...f, holds: holds(f) })) };
}

/** Most serious first, keeping the reviewer's order within a severity. */
export function bySeverity(a: Finding, b: Finding): number {
  const r = (s: string) => {
    const i = SEVERITIES.indexOf(s);
    return i < 0 ? SEVERITIES.length : i;
  };
  return r(a.severity) - r(b.severity);
}

/** github.com/<repo>/blob/<sha>/<path>#L<line>, or null when the commit is unknown. */
export function fileUrl(repo: string, sha: string, file: string, line: number): string | null {
  if (!repo || !sha || !file) return null;
  const path = file.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/blob/${sha}/${path}${line > 0 ? `#L${line}` : ""}`;
}
