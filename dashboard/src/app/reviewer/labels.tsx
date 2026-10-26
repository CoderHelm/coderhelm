import { StatusPill } from "@/components/status-pill";

// Plain words for the reviewer's stored codes, shared by the list and the detail
// page so a review reads the same everywhere.

const VERDICTS: Record<string, { tone: "success" | "error" | "neutral"; label: string }> = {
  APPROVE: { tone: "success", label: "Approved" },
  REQUEST_CHANGES: { tone: "error", label: "Changes requested" },
  QUESTION: { tone: "neutral", label: "Answered" },
  COMMENT: { tone: "neutral", label: "Left comments" },
};

/**
 * The verdict as one pill. A risk rating rides on the same pill: a high-risk
 * approval turns amber and every risk is in the hover text and read aloud,
 * so a row never needs a second, differently styled badge for it.
 */
export function VerdictPill({ verdict, risk }: { verdict: string; risk?: string }) {
  const v = VERDICTS[verdict];
  const r = risk ? riskLabel(risk) : null;
  const tone = v ? (v.tone === "success" && risk === "HIGH" ? "warning" : v.tone) : "neutral";
  const label = v ? v.label : verdict ? sentence(verdict) : "No verdict";
  return (
    <span title={r ?? undefined} className="inline-flex max-w-full">
      <StatusPill tone={tone}>
        {label}
        {r && <span className="sr-only">, {r.toLowerCase()}</span>}
      </StatusPill>
    </span>
  );
}

const RISK_TEXT: Record<string, string> = {
  LOW: "text-emerald-300",
  MEDIUM: "text-amber-300",
  HIGH: "text-red-300",
};

/** "High risk", or null when the review has no risk rating. */
export function riskLabel(risk: string): string | null {
  if (!risk || risk === "N/A") return null;
  return `${sentence(risk)} risk`;
}

export function RiskText({ risk }: { risk: string }) {
  const label = riskLabel(risk);
  if (!label) return <span className="text-xs text-zinc-400">No risk rating</span>;
  return <span className={`text-xs font-medium whitespace-nowrap ${RISK_TEXT[risk] ?? "text-zinc-400"}`}>{label}</span>;
}

// What started a review: GitHub pull request actions, a reply to the reviewer,
// or an explicit ask (an "@coderhelm re-review" comment or the dashboard button).
const TRIGGERS: Record<string, string> = {
  labeled: "Label added",
  opened: "PR opened",
  reopened: "PR reopened",
  synchronize: "New commits",
  ready_for_review: "Marked ready",
  reply: "Reply to the reviewer",
  rerequest: "Asked again",
};

// The same, as a row's meta line: what made this review happen.
const TRIGGER_META: Record<string, string> = {
  labeled: "Reviewed after the label was added",
  opened: "Reviewed when the PR opened",
  reopened: "Reviewed when the PR reopened",
  synchronize: "Reviewed after new commits",
  ready_for_review: "Reviewed when marked ready",
  reply: "Reviewed after a reply",
  rerequest: "Reviewed on request",
};

export function triggerMeta(trigger: string): string {
  if (!trigger) return "";
  return TRIGGER_META[trigger] ?? `Reviewed after: ${sentence(trigger).toLowerCase()}`;
}

export function triggerLabel(trigger: string): string {
  if (!trigger) return "";
  return TRIGGERS[trigger] ?? sentence(trigger);
}

function sentence(code: string): string {
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
