"use client";

// How Coderhelm runs a repository skill: the check of each item against what
// the team has in Coderhelm, shown as a status badge, an overview for the
// Skills page, and on an item's page a list of its steps with what each one
// relies on, what to connect, and the original and translated text.

import { CodeBlock } from "@/components/code-block";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { Segmented } from "@/components/segmented";
import { ToolSwitch } from "@/components/tools";
import { ChevronRightIcon, LockIcon } from "@/components/icons";
import { Chip as ListChip } from "@/components/list";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { lineDiff } from "@/lib/line-diff";
import {
  ago,
  splitFrontMatter,
  type Compat,
  type CompatShort,
  type CompatNeed,
  type NeedItem,
  type CompatStep,
  type Requirement,
  type RequirementStatus,
  type Skill,
  type SkillWithBody,
} from "@/lib/skills";

// ─── Status words, colors and icons ──────────────────────────

const SwapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4L3 8l4 4" />
    <path d="M3 8h13a4 4 0 014 4" />
    <path d="M17 20l4-4-4-4" />
    <path d="M21 16H8a4 4 0 01-4-4" />
  </svg>
);
const CheckSmall = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const PlugIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0V8zM12 18v4" />
  </svg>
);

/** One step's or requirement's status: word, colors, icon. */
export const STEP_STATUS: Record<RequirementStatus, { label: string; means: string; dot: string; text: string; icon: ReactNode }> = {
  available: {
    label: "Runs as written",
    means: "Coderhelm has exactly what this step uses.",
    dot: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
    text: "text-emerald-300",
    icon: <CheckSmall />,
  },
  translated: {
    label: "Translated",
    means: "Coderhelm does this with its own tool, named below.",
    dot: "border-sky-500/50 bg-sky-500/15 text-sky-300",
    text: "text-sky-300",
    icon: <SwapIcon />,
  },
  missing: {
    label: "Needs a tool",
    means: "Nothing connected to Coderhelm does this yet.",
    dot: "border-amber-500/50 bg-amber-500/15 text-amber-300",
    text: "text-amber-300",
    icon: <PlugIcon />,
  },
  blocked: {
    label: "Write blocked",
    means: "It writes to an outside system, and no connected tool can.",
    dot: "border-red-500/50 bg-red-500/15 text-red-300",
    text: "text-red-300",
    icon: <LockIcon />,
  },
};

type Badge = "ready" | "translated" | "needs_tools" | "partial" | "unchecked" | "failed" | "stale";

const BADGE: Record<Badge, { label: string; cls: string; title: string }> = {
  ready: { label: "Ready", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", title: "Every step runs as written." },
  translated: { label: "Translated", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300", title: "Some steps use Coderhelm's own tools instead." },
  needs_tools: { label: "Needs tools", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", title: "Some steps need a tool the team hasn't connected." },
  partial: { label: "Partly checked", cls: "border-zinc-600 text-zinc-300", title: "The check couldn't list its steps yet; it's read as written." },
  unchecked: { label: "Not checked yet", cls: "border-zinc-700 text-zinc-400", title: "Coderhelm checks each item after it syncs." },
  failed: { label: "Check failed", cls: "border-red-500/30 bg-red-500/10 text-red-300", title: "The last check didn't finish." },
  stale: { label: "Checking again", cls: "border-zinc-700 text-zinc-400", title: "The text changed since the last check." },
};

/** Which badge an item gets from its last check. */
export function badgeOf(s: Pick<Skill, "compat">): Badge {
  const c = s.compat;
  if (!c) return "unchecked";
  if (!c.current) return "stale";
  if (c.error && !c.status) return "failed";
  if (c.status === "ready" || c.status === "translated" || c.status === "needs_tools" || c.status === "partial") return c.status;
  return c.error ? "failed" : "unchecked";
}

export function CompatBadge({ item }: { item: Pick<Skill, "compat"> }) {
  const b = BADGE[badgeOf(item)];
  return (
    <span title={b.title} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${b.cls}`}>
      {b.label}
    </span>
  );
}

/** Where to connect what a step needs, when the check didn't say. GitHub
 * is never offered: every team has it connected already. */
const CONNECT: Record<Requirement["connect"], { href: string; label: string } | null> = {
  plugins: { href: "/settings/integrations#other-tools", label: "Integrations" },
  data_sources: { href: "/data-sources", label: "Data sources" },
  github: null,
  none: null,
};

/** Monitoring, docs and pipeline connections, by id. Metrics and Airflow
 * are abilities of the AWS account card. */
const CONNECTION: Record<string, { label: string; card: string; verb: string }> = {
  newrelic: { label: "New Relic", card: "newrelic", verb: "Set up" },
  confluence: { label: "Confluence", card: "confluence", verb: "Set up" },
  metrics: { label: "CloudWatch metrics", card: "aws", verb: "Turn on" },
  airflow: { label: "Airflow", card: "aws", verb: "Turn on" },
};

/** The link a gap offers, if any: connecting it, or adding the credentials
 * of a server that's switched on. Never one for something already
 * connected. The check's own `link` (to the right Integrations card) wins. */
export function linkFor(
  g: Pick<Requirement, "connect" | "action" | "connection" | "link"> & { server?: string; status?: string; write?: Requirement["write"] },
): { href: string; text: string } | null {
  const where = CONNECT[g.connect];
  if (!where || g.action === "none") return null;
  const c = g.connection ? CONNECTION[g.connection] : undefined;
  if (c) {
    // A Confluence write needs the write switch and page list, whether
    // Confluence is connected with a token or through the Jira app.
    const writes = g.connection === "confluence" && (g.status === "blocked" || g.write === "outside");
    return {
      href: g.link || `/settings/integrations#integration-${c.card}`,
      text: writes ? `Set up ${c.label} writes in Integrations` : `${c.verb} ${c.label} in Integrations`,
    };
  }
  const href = g.link || (g.connect === "plugins" && g.server ? `/settings/integrations#integration-${g.server}` : where.href);
  if (g.action === "credentials") return { href, text: `Add credentials in ${where.label}` };
  return { href, text: `Connect in ${where.label}` };
}

// ─── The Skills page overview ────────────────────────────────

/** Counts by status and the tools most items need, across the library. */
export function CompatOverview({
  items,
  filter,
  onFilter,
}: {
  items: Skill[];
  filter: string;
  onFilter: (f: string) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<Badge, number> = { ready: 0, translated: 0, needs_tools: 0, partial: 0, unchecked: 0, failed: 0, stale: 0 };
    for (const i of items) c[badgeOf(i)]++;
    return c;
  }, [items]);
  const { needs, local } = useMemo(() => {
    const by = new Map<string, { name: string; items: number }>();
    const onMachine = new Map<string, { name: string; instead: string; items: number }>();
    for (const i of items) {
      if (badgeOf(i) !== "needs_tools") continue;
      const seen = new Set<string>();
      for (const n of needItemsOf(i.compat)) {
        const key = n.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (n.local) {
          const e = onMachine.get(key) ?? { name: n.name, instead: n.instead ?? "", items: 0 };
          e.items++;
          onMachine.set(key, e);
        } else if (canConnect(n)) {
          const e = by.get(key) ?? { name: n.name, items: 0 };
          e.items++;
          by.set(key, e);
        }
      }
    }
    const sort = <T extends { name: string; items: number }>(m: Map<string, T>) =>
      [...m.values()].sort((a, b) => b.items - a.items || a.name.localeCompare(b.name));
    return { needs: sort(by), local: sort(onMachine) };
  }, [items]);
  if (items.length === 0) return null;
  const checked = counts.ready + counts.translated + counts.needs_tools;
  const waiting = counts.unchecked + counts.stale + counts.failed + counts.partial;
  const tiles: { key: Badge; label: string; n: number; tone: string }[] = [
    { key: "ready", label: "Ready", n: counts.ready, tone: "bg-emerald-400" },
    { key: "translated", label: "Translated", n: counts.translated, tone: "bg-sky-400" },
    { key: "needs_tools", label: "Need tools", n: counts.needs_tools, tone: "bg-amber-400" },
  ];
  const total = Math.max(1, items.length);
  return (
    <section aria-labelledby="compat-overview-heading" className="mt-8 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5" data-testid="compat-overview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="compat-overview-heading" className="text-sm font-semibold text-zinc-100">
          How Coderhelm runs your skills
        </h2>
        <p className="text-xs text-zinc-500">
          {checked} of {items.length} checked against what your team has connected
          {waiting > 0 && <> · {waiting} waiting for a check</>}
        </p>
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
        {tiles.map((t) => (t.n > 0 ? <span key={t.key} className={t.tone} style={{ width: `${(t.n / total) * 100}%` }} /> : null))}
      </div>
      <div role="group" aria-label="Show items" className="mt-3 flex flex-wrap gap-2">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={filter === t.key}
            onClick={() => onFilter(filter === t.key ? "" : t.key)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              filter === t.key ? "border-zinc-400 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
            } ${focusRing}`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${t.tone}`} />
            <span className="font-semibold tabular-nums">{t.n}</span> {t.label}
          </button>
        ))}
      </div>
      {needs.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-500">Most needed</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {needs.slice(0, 6).map((n) => {
              const key = `need:${n.name.toLowerCase()}`;
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => onFilter(filter === key ? "" : key)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      filter === key ? "border-amber-400/60 bg-amber-500/15 text-amber-100" : "border-amber-500/30 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10"
                    } ${focusRing}`}
                  >
                    <span className="font-medium">{n.name}</span>
                    <span className="text-amber-200/70">
                      needed by {n.items} item{n.items === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {local.length > 0 && (
        <details className="mt-4 border-t border-zinc-800 pt-4" data-testid="compat-local">
          <summary className={`cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-300 rounded ${focusRing}`}>
            Assumes a local machine ({local.length})
          </summary>
          <p className="mt-2 text-xs text-zinc-500">Nothing to connect: these only exist on a person&apos;s own computer. What Coderhelm does instead:</p>
          <ul className="mt-2 space-y-1.5">
            {local.map((n) => (
              <li key={n.name} className="text-sm text-zinc-300">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.name}</span>
                  <ListChip tone="muted">
                    {n.items} item{n.items === 1 ? "" : "s"}
                  </ListChip>
                </span>
                {n.instead && <span className="block text-xs text-zinc-400">{n.instead}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** What an item needs, each with what to do. An item checked before the
 * actions were kept gives its names with no action. */
export function needItemsOf(c?: CompatShort | null): NeedItem[] {
  if (!c) return [];
  if (c.need_items && c.need_items.length > 0) return c.need_items;
  return (c.needs ?? []).map((name) => ({ name, action: "" as const }));
}

/** Whether a need is something to connect: a link to connect it, or to add
 * a switched-on server's credentials. Nothing else is "most needed". */
export const canConnect = (n: NeedItem) => n.action === "connect" || n.action === "credentials";

/** Whether an item shows under an overview filter. */
export function matchesCompatFilter(s: Skill, filter: string): boolean {
  if (!filter) return true;
  if (filter.startsWith("need:")) {
    const name = filter.slice(5);
    return badgeOf(s) === "needs_tools" && (s.compat?.needs ?? []).some((n) => n.toLowerCase() === name);
  }
  return badgeOf(s) === filter;
}

// ─── An item's page ──────────────────────────────────────────

/**
 * "How Coderhelm runs this": the summary, what to connect, the steps with
 * what each relies on, the admin's choice of version, and the two texts.
 */
export function CompatSection({
  item,
  canManage,
  onRecheck,
  onUseTranslated,
  busy,
  agentNote,
  showText = true,
}: {
  item: SkillWithBody;
  canManage: boolean;
  onRecheck: () => void;
  onUseTranslated: (on: boolean) => void;
  busy: "" | "recheck" | "translated";
  /** For a team agent: it answers asks without tools. */
  agentNote?: boolean;
  /** Show the original and translated texts (an agent's page shows its
   * instructions apart, so only when there's a translation). */
  showText?: boolean;
}) {
  const c = item.compat ?? null;
  const steps = c?.steps ?? [];
  const translated = (item.translated ?? "").trim();
  const badge = badgeOf(item);
  const usable = !!translated && !!c?.current;
  return (
    <section aria-labelledby="compat-heading" className="min-w-0" data-testid="compat-section">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="compat-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            How Coderhelm runs this
          </h2>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">
            Coderhelm read every step and checked each tool and command it relies on against what your team has connected.
            {agentNote && " For an agent, that is the read-only tools its own file lists: those are all it gets when asked."}
          </p>
        </div>
        {canManage && (
          <button type="button" className={secondaryButton} disabled={busy === "recheck"} onClick={onRecheck}>
            {busy === "recheck" ? "Starting…" : "Re-check"}
          </button>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CompatBadge item={item} />
              {c?.summary && badge !== "unchecked" && <p className="text-sm text-zinc-200" data-testid="compat-summary">{c.summary}</p>}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {!c
                ? "Not checked yet. Coderhelm checks each item after it syncs, or when an admin asks."
                : badge === "stale"
                  ? `The text changed since the check ${ago(c.at)}. A new check runs on the next sync, or now with Re-check.`
                  : badge === "failed"
                    ? `The last check didn't finish (${c.error}). Re-check to try again.`
                    : `Checked ${ago(c.at)}${c.model ? ` with ${c.model}` : ""}${typeof c.cost_usd === "number" && c.cost_usd > 0 ? ` · cost $${c.cost_usd.toFixed(3)}` : ""}.`}
            </p>
          </div>
        </div>

        {(c?.notes?.length ?? 0) > 0 && badge !== "stale" && (
          <ul className="border-b border-zinc-800 px-5 py-3 text-xs text-zinc-400" data-testid="compat-notes">
            {c!.notes!.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {(c?.needs_detail?.length ?? 0) > 0 && badge !== "stale" && <NeedsList needs={c!.needs_detail!} />}

        {steps.length > 0 ? (
          <ol aria-label="Steps" className="p-5">
            {steps.map((s, i) => (
              <StepRow key={`${i}-${s.title}`} step={s} index={i} last={i === steps.length - 1} />
            ))}
          </ol>
        ) : c && badge !== "failed" && badge !== "partial" ? (
          <p className="p-5 text-sm text-zinc-400">No steps were found in this item.</p>
        ) : null}
      </div>

      {translated && (
        <VersionChoice item={item} canManage={canManage} usable={usable} busy={busy === "translated"} onChange={onUseTranslated} />
      )}

      {showText && <TextViews original={item.body} translated={translated} />}
    </section>
  );
}

/** What to connect, like a setup checklist: each with its fix and a link. */
function NeedsList({ needs }: { needs: CompatNeed[] }) {
  return (
    <div className="border-b border-zinc-800 p-5" data-testid="compat-needs">
      <h3 className="text-xs font-medium text-zinc-500">To run every step</h3>
      <ul className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {needs.map((n) => {
          const link = linkFor(n);
          const s = STEP_STATUS[n.status === "blocked" ? "blocked" : "missing"];
          return (
            <li key={`${n.status}-${n.name}`} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${s.dot}`}>
                {s.icon}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm text-zinc-100">
                  <span className="font-medium">{n.name}</span>
                  <span className="text-zinc-500">
                    {" "}
                    · {n.status === "blocked" ? "a write" : "needed"} in {n.steps} step{n.steps === 1 ? "" : "s"}
                  </span>
                </p>
                {n.fix && <p className="mt-0.5 text-sm text-zinc-400">{n.fix}</p>}
                {n.local && n.instead && <p className="mt-0.5 text-xs text-zinc-500">Assumes a local machine. Instead: {n.instead}</p>}
              </div>
              {link && (
                <Link href={link.href} className={`${secondaryButton} min-h-8 px-3 py-1 text-xs`}>
                  {link.text}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One step: a status dot on a line, its title and what it does, and what it
 * relies on, opened on demand. */
function StepRow({ step, index, last }: { step: CompatStep; index: number; last: boolean }) {
  const s = STEP_STATUS[step.status] ?? STEP_STATUS.available;
  const [open, setOpen] = useState(step.status === "missing" || step.status === "blocked");
  const reqs = step.requirements;
  const id = `step-${index}-details`;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0" data-testid="compat-step" data-status={step.status}>
      {!last && <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-800" />}
      <span aria-hidden="true" className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${s.dot}`}>
        {s.icon}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
            <span className="mr-1.5 tabular-nums text-zinc-500">{index + 1}.</span>
            {step.title}
          </p>
          <span className={`text-xs font-medium ${s.text}`} title={s.means}>
            {s.label}
            {step.dropped && <span className="text-zinc-500"> · left out of the translation</span>}
          </span>
        </div>
        {step.does && <p className="mt-0.5 text-sm text-zinc-400">{step.does}</p>}
        {reqs.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen(!open)}
              className={`mt-1.5 inline-flex min-h-7 items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}
            >
              <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
                <ChevronRightIcon />
              </span>
              {open ? "Hide" : "Show"} what it relies on ({reqs.length})
            </button>
            {open && (
              <div id={id} className="mt-2 overflow-hidden rounded-lg border border-zinc-800">
                <div className="hidden grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-2 border-b border-zinc-800 bg-zinc-950/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:grid">
                  <span>The skill asks for</span>
                  <span />
                  <span>Coderhelm uses</span>
                </div>
                <ul className="divide-y divide-zinc-800">
                  {reqs.map((r, i) => (
                    <RequirementRow key={`${i}-${r.asks}`} r={r} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Chip({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "sky" | "emerald" }) {
  const cls =
    tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-zinc-700 bg-zinc-950 text-zinc-300";
  return <span className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere] ${cls}`}>{children}</span>;
}

const KIND_WORD: Record<Requirement["kind"], string> = { tool: "tool", command: "command", data: "data", path: "file path", person: "talk to a person", other: "other" };

function RequirementRow({ r }: { r: Requirement }) {
  const s = STEP_STATUS[r.status] ?? STEP_STATUS.missing;
  const link = linkFor(r);
  return (
    <li className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] sm:items-start" data-testid="compat-requirement" data-status={r.status}>
      <div className="min-w-0">
        <span className="sr-only">The skill asks for: </span>
        <Chip>{r.asks}</Chip>
        <span className="ml-1.5 text-[11px] text-zinc-500">{KIND_WORD[r.kind] ?? r.kind}</span>
        {r.write === "outside" && <span className="ml-1.5 text-[11px] text-red-300">writes outside</span>}
      </div>
      <span aria-hidden="true" className="hidden text-zinc-600 sm:block">
        →
      </span>
      <div className="min-w-0">
        <span className="sr-only">Coderhelm uses: </span>
        {(r.status === "available" || r.status === "translated") && r.uses.length === 0 && r.instead ? (
          <p className={`text-xs ${s.text}`}>{r.instead}</p>
        ) : r.status === "available" || r.status === "translated" ? (
          <div className="flex flex-wrap gap-1">
            {r.uses.map((u) => (
              <Chip key={u} tone={r.status === "translated" ? "sky" : "emerald"}>
                {u}
              </Chip>
            ))}
            <span className={`ml-1 text-[11px] ${s.text}`}>{r.status === "translated" ? "equivalent" : "same"}</span>
          </div>
        ) : (
          <div>
            <p className={`text-xs font-medium ${s.text}`}>
              {r.status === "blocked" ? "Can't write there" : link ? "Not connected in Coderhelm" : r.instead ? "Assumes a local machine" : "Not available in Coderhelm"}
            </p>
            {r.fix && <p className="mt-0.5 text-xs text-zinc-400">{r.fix}</p>}
            {r.instead && <p className="mt-0.5 text-xs text-zinc-400">Instead: {r.instead}</p>}
            {link && (
              <Link href={link.href} className={`${linkButton} mt-0.5 text-xs`}>
                {link.text.replace(/^(Connect|Add credentials)/, (m) => (m === "Connect" ? `Connect ${r.needs || "it"}` : `Add ${r.needs || "its"} credentials`))}
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** The admin's choice: give agents the translated version or the original. */
function VersionChoice({
  item,
  canManage,
  usable,
  busy,
  onChange,
}: {
  item: SkillWithBody;
  canManage: boolean;
  usable: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
}) {
  const on = !!item.use_translated;
  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5" data-testid="compat-version">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-medium text-zinc-100">Use the translated version</p>
        <p className="mt-1 text-sm text-zinc-400">
          Agents read the version rewritten for Coderhelm&apos;s own tools, with every gap marked so a run reports it instead of skipping
          it. The repository file doesn&apos;t change, and the original stays here.
        </p>
        {on && !usable && (
          <p className="mt-1 text-xs text-amber-300">The text changed since the translation, so agents read the original until the next check.</p>
        )}
        {item.translated_by && (
          <p className="mt-1 text-xs text-zinc-500">
            Last switched {on ? "on" : "off"} by {item.translated_by} {item.translated_at ? ago(item.translated_at) : ""}.
          </p>
        )}
      </div>
      {canManage ? (
        <ToolSwitch on={on} label={`Give agents the translated version of ${item.name}`} busy={busy} onToggle={() => onChange(!on)} />
      ) : (
        <span className="text-sm text-zinc-300">{on ? "On" : "Off"}</span>
      )}
    </div>
  );
}

type View = "original" | "translated" | "changes";

/** The original and translated texts, and what the translation changed. */
function TextViews({ original, translated }: { original: string; translated: string }) {
  const [view, setView] = useState<View>("original");
  const text = splitFrontMatter(original).text.trim();
  const diff = useMemo(() => (view === "changes" ? lineDiff(text, translated) : []), [view, text, translated]);
  const changed = diff.filter((d) => d.kind !== "same").length;
  const options: { value: View; label: string }[] = translated
    ? [
        { value: "original", label: "Original" },
        { value: "translated", label: "Translated" },
        { value: "changes", label: "Changes" },
      ]
    : [{ value: "original", label: "Original" }];
  return (
    <div className="mt-6 min-w-0" data-testid="compat-text">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">The text</h3>
        {translated && <Segmented label="Which text" options={options} value={view} onChange={setView} />}
      </div>
      <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        {view === "original" && <Markdown>{text || "_This file has no text after its settings._"}</Markdown>}
        {view === "translated" && <Markdown>{translated}</Markdown>}
        {view === "changes" && (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              {changed} line{changed === 1 ? "" : "s"} changed. <span className="text-red-300">Removed lines</span> are from the original,{" "}
              <span className="text-emerald-300">added lines</span> from the translation.
            </p>
            <CodeBlock
              code={diff.map((d) => `${d.kind === "added" ? "+" : d.kind === "removed" ? "-" : " "}${d.text}`).join("\n")}
              lang="markdown"
              diff
              wrap
              label="Changes from the original"
              maxHeightClass="max-h-[36rem]"
            />
          </>
        )}
      </div>
    </div>
  );
}
