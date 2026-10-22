import type { PassTrace } from "@/lib/api";
import type { AgentAsk } from "@/lib/skills";

// A run's asks to the team's own agents, read for the run page: which were
// review steps (the same framing question every time) and which were
// questions of the run's own, the gaps in each review's answer, and what the
// step did with them, from the step's trace.

/** A line of the framing every review step sends (worker `review_question`). */
const REVIEW_MARK = "Apply only the parts of your rubric";

export const isReviewAsk = (a: Pick<AgentAsk, "question">) => a.question.includes(REVIEW_MARK);

/** The step a review ask belongs to, from who asked. */
export type Step = "plan" | "prose" | "code" | "question";

export function stepOf(a: Pick<AgentAsk, "question" | "by">): Step {
  if (!isReviewAsk(a)) return "question";
  if (a.by === "planner") return "plan";
  if (a.by === "writer") return "prose";
  return "code";
}

export const STEP_TITLE: Record<Step, string> = {
  plan: "Plan review",
  prose: "PR description review",
  code: "Code review",
  question: "Questions",
};

const STEP_SUBJECT: Record<Exclude<Step, "question">, string> = {
  plan: "plan",
  prose: "PR description",
  code: "code",
};

const STEP_REVISER: Record<Exclude<Step, "question">, string> = {
  plan: "Planner",
  prose: "Writer",
  code: "Coder",
};

/**
 * True when an answer says there are no gaps. The same reading as the
 * worker's `gaps_in`: "none", "no gaps", or "None, fine for its size."
 */
export function saysNone(answer: string): boolean {
  const bare = answer
    .trim()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "")
    .toLowerCase();
  if (["", "none", "no gaps", "none found", "no gaps found", "n/a"].includes(bare)) return true;
  const rest = bare.startsWith("none") ? bare.slice(4).trimStart() : null;
  return !!rest && /^[,.:;\-—–(]/.test(rest) && bare.length <= 160 && !bare.includes("\n");
}

/** One gap of a review's answer: its text and the file it names, if any. */
export interface Gap {
  text: string;
  file: string | null;
}

const LIST_MARK = /^\s*(?:[-*•]|\d+[.)])\s+/;
// A file a gap points at: "proposal.md", "src/api/refunds.ts".
const FILE = /(?:^|[\s`'"(])((?:[\w.-]+\/)*[\w-]+\.(?:md|mdx|tsx?|jsx?|py|rs|go|java|kt|rb|json|ya?ml|toml|sql|tf|css|html))\b/i;

/** The gaps in a review's answer, one per line as the agents are asked to give them. */
export function gapsOf(answer: string): Gap[] {
  if (saysNone(answer)) return [];
  return answer
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      const text = l.replace(LIST_MARK, "");
      const m = FILE.exec(text);
      const file = m ? m[1] : null;
      // "proposal.md: the goal…": the chip says the file, so the line doesn't again.
      const lead = file ? new RegExp(`^[\`'"]?${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\`'"]?\\s*[:—–-]\\s*`) : null;
      const rest = lead ? text.replace(lead, "") : text;
      return { text: rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : text, file };
    });
}

/** What one review step did, from its trace's detail. */
export interface StepResult {
  revised: boolean;
  costByAgent: Map<string, number>;
}

interface ReviewDetail {
  step?: string;
  revised?: boolean;
  reviews?: { repo?: string; path?: string; cost_usd?: number }[];
}

const agentKey = (repo: string, path: string) => `${repo}#${path}`;

/** Each review step's latest result in the run's traces. */
export function stepResults(traces: PassTrace[]): Map<string, StepResult> {
  const out = new Map<string, StepResult>();
  for (const t of traces) {
    const d = t.detail as ReviewDetail | null | undefined;
    if (!d || typeof d !== "object" || !d.step || !Array.isArray(d.reviews)) continue;
    const costByAgent = new Map<string, number>();
    for (const r of d.reviews) {
      if (r.repo && r.path && typeof r.cost_usd === "number") costByAgent.set(agentKey(r.repo, r.path), r.cost_usd);
    }
    // Traces come in the order they ran: a later review of the step wins.
    out.set(d.step, { revised: !!d.revised, costByAgent });
  }
  return out;
}

export function askCost(a: AgentAsk, results: Map<string, StepResult>): number | null {
  const step = stepOf(a);
  if (step === "question") return null;
  return results.get(step)?.costByAgent.get(agentKey(a.repo, a.path)) ?? null;
}

/** How one ask went, in words and a tone. */
export function outcomeOf(a: AgentAsk): { label: string; tone: "success" | "waiting" | "danger" | "live" | "neutral"; gaps: Gap[] } {
  if (a.outcome === "pending") return { label: "Thinking…", tone: "live", gaps: [] };
  if (a.outcome === "timed_out") return { label: "Timed out", tone: "danger", gaps: [] };
  if (a.outcome !== "answered") return { label: "Failed", tone: "danger", gaps: [] };
  if (!isReviewAsk(a)) return { label: "Answered", tone: "success", gaps: [] };
  const gaps = gapsOf(a.answer);
  if (gaps.length === 0) return { label: "No gaps", tone: "success", gaps };
  return { label: `${gaps.length} gap${gaps.length === 1 ? "" : "s"}`, tone: "waiting", gaps };
}

/** "Planner revised the plan on these notes", or null when nothing was found or it's unknown. */
export function whatNext(step: Step, asks: AgentAsk[], results: Map<string, StepResult>): string | null {
  if (step === "question") return null;
  const anyGaps = asks.some((a) => outcomeOf(a).gaps.length > 0);
  const r = results.get(step);
  if (!anyGaps) return asks.some((a) => a.outcome === "answered") ? `No gaps, so the ${STEP_SUBJECT[step]} was kept as written.` : null;
  if (!r) return null;
  return r.revised
    ? `${STEP_REVISER[step]} revised the ${STEP_SUBJECT[step]} on these notes.`
    : `${STEP_REVISER[step]} kept the draft: the revision didn't hold.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The section's one line: "2 team agents reviewed the plan · 5 gaps · plan revised once". */
export function summaryLine(asks: AgentAsk[], results: Map<string, StepResult>): string {
  const steps = new Set(asks.map(stepOf));
  const failed = asks.filter((a) => a.outcome === "failed" || a.outcome === "timed_out").length;
  // Several kinds of ask: one short line over all of them; each group says its own.
  if (steps.size > 1) {
    const agents = new Set(asks.map((a) => agentKey(a.repo, a.path))).size;
    const gaps = asks.reduce((n, a) => n + outcomeOf(a).gaps.length, 0);
    const revised = (["plan", "prose", "code"] as const).filter((st) => results.get(st)?.revised && asks.some((a) => stepOf(a) === st && outcomeOf(a).gaps.length > 0));
    return [
      `${plural(asks.length, "ask")} to ${plural(agents, "team agent")}`,
      gaps > 0 ? plural(gaps, "gap") : "no gaps",
      ...revised.map((st) => `${STEP_SUBJECT[st]} revised`),
      failed > 0 && `${failed} without an answer`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const bits: string[] = [];
  for (const step of ["plan", "prose", "code"] as const) {
    const of = asks.filter((a) => stepOf(a) === step);
    if (of.length === 0) continue;
    const agents = new Set(of.map((a) => agentKey(a.repo, a.path))).size;
    const gaps = of.reduce((n, a) => n + outcomeOf(a).gaps.length, 0);
    bits.push(`${plural(agents, "team agent")} reviewed the ${STEP_SUBJECT[step]}`);
    bits.push(gaps > 0 ? plural(gaps, "gap") : "no gaps");
    const r = results.get(step);
    if (gaps > 0 && r) bits.push(r.revised ? `${STEP_SUBJECT[step]} revised once` : `${STEP_SUBJECT[step]} kept`);
  }
  const questions = asks.filter((a) => stepOf(a) === "question").length;
  if (questions > 0) bits.push(`${plural(questions, "question")} asked`);
  if (failed > 0) bits.push(`${failed} without an answer`);
  return bits.join(" · ");
}

/** 14200 → "14s", 95000 → "1m 35s", 120000 → "2m". */
export function askDuration(ms: number): string | null {
  if (!ms || ms < 0) return null;
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`;
}

export function askCostText(usd: number | null): string | null {
  if (usd === null) return null;
  return usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}
