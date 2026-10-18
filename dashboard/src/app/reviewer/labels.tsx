import { StatusPill } from "@/components/status-pill";

// Plain words for the reviewer's stored codes, shared by the list and the detail
// page so a review reads the same everywhere.

const VERDICTS: Record<string, { tone: "success" | "error" | "neutral"; label: string }> = {
  APPROVE: { tone: "success", label: "Approved" },
  REQUEST_CHANGES: { tone: "error", label: "Changes requested" },
  QUESTION: { tone: "neutral", label: "Answered" },
};

export function VerdictPill({ verdict }: { verdict: string }) {
  const v = VERDICTS[verdict];
  if (v) return <StatusPill tone={v.tone}>{v.label}</StatusPill>;
  return <StatusPill>{verdict ? sentence(verdict) : "No verdict"}</StatusPill>;
}

const RISK_TEXT: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-red-400",
};

/** "High risk", or null when the review has no risk rating. */
export function riskLabel(risk: string): string | null {
  if (!risk || risk === "N/A") return null;
  return `${sentence(risk)} risk`;
}

export function RiskText({ risk }: { risk: string }) {
  const label = riskLabel(risk);
  if (!label) return <span className="text-zinc-600 text-xs">—</span>;
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

export function triggerLabel(trigger: string): string {
  if (!trigger) return "";
  return TRIGGERS[trigger] ?? sentence(trigger);
}

function sentence(code: string): string {
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
