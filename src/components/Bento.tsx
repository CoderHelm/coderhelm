import type { ReactNode } from "react";
import Link from "next/link";
import type { MiniId } from "@/content/types";
import { Inline } from "./Md";

// Small product details for the bento cells. Text and CSS only, with made up
// example data, like the larger product views.

function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "info" }) {
  const c = {
    muted: "border-line bg-white/[0.03] text-text-secondary",
    ok: "border-ok/30 bg-ok/10 text-ok",
    info: "border-accent/40 bg-accent/10 text-accent-text",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${c}`}>{children}</span>;
}

function LookupMini() {
  return (
    <div className="grid gap-2 font-mono text-[12px]">
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-wrap gap-1.5"><Chip tone="info">postgres</Chip><Chip>read only</Chip><Chip>rolled back</Chip></div>
        <p className="mt-2 break-words text-text-secondary">SELECT id, renews_on FROM memberships WHERE id = 4182</p>
      </div>
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-wrap gap-1.5"><Chip tone="info">logs</Chip><Chip>/ecs/api</Chip></div>
        <p className="mt-2 break-words text-text-secondary">RenewalJob: skipped 214 rows, timezone not set</p>
      </div>
    </div>
  );
}

function PlansMini() {
  const tasks = ["Add the start date column", "Send it from checkout", "Show it on the receipt"];
  return (
    <ol className="grid gap-1.5 rounded-lg border border-line bg-panel p-3 text-[12px]">
      {tasks.map((t, i) => (
        <li key={t} className="flex items-center gap-2.5 text-text-secondary">
          <span className="font-mono text-text-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{t}</span>
          <Chip tone={i === 0 ? "ok" : "muted"}>{i === 0 ? "run" : "issue"}</Chip>
        </li>
      ))}
    </ol>
  );
}

function SkillsMini() {
  const files = ["AGENTS.md", "skills/release-checklist/SKILL.md", "agents/reviewer.md"];
  return (
    <ul className="grid gap-1.5 rounded-lg border border-line bg-panel p-3 font-mono text-[12px]">
      {files.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-text-secondary">
          <span aria-hidden="true" className="inline-flex h-3.5 w-6 flex-none items-center rounded-full bg-accent p-0.5"><span className="ml-auto h-2.5 w-2.5 rounded-full bg-white" /></span>
          <span className="min-w-0 truncate">{f}</span>
        </li>
      ))}
    </ul>
  );
}

function SecurityMini() {
  const items: [string, string][] = [
    ["branch", "coderhelm/web-412"],
    ["sandbox", "no credentials"],
    ["data", "read only"],
    ["secrets", "AWS KMS"],
    ["webhooks", "verified"],
    ["merge", "a person approves"],
  ];
  return (
    <ul className="grid grid-cols-1 gap-1.5 text-[12px] sm:grid-cols-2 lg:grid-cols-1">
      {items.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
          <svg className="h-3.5 w-3.5 flex-none text-ok" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-mono text-text-muted">{k}</span>
          <span className="min-w-0 truncate text-text-secondary">{v}</span>
        </li>
      ))}
    </ul>
  );
}

const MINIS: Record<MiniId, () => ReactNode> = {
  lookup: LookupMini,
  plans: PlansMini,
  skills: SkillsMini,
  security: SecurityMini,
};

export function Bento({ items }: { items: { title: string; text: string; href: string; mini: MiniId; wide?: boolean }[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => {
        const Mini = MINIS[c.mini];
        return (
          <li
            key={c.title}
            className={`group relative flex min-w-0 flex-col justify-center gap-6 rounded-xl border border-line bg-white/[0.015] p-6 transition-colors hover:border-white/20 ${c.wide ? "lg:col-span-2" : ""}`}
          >
            <div className={c.wide ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center [&>*]:min-w-0" : "grid gap-6"}>
              <div>
                <h3 className="text-[17px] font-semibold text-text-primary">
                  <Link href={c.href} className="after:absolute after:inset-0">{c.title}</Link>
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary"><Inline text={c.text} /></p>
                <span aria-hidden="true" className="mt-4 inline-flex text-[14px] font-medium text-accent-text group-hover:text-text-primary">Learn more</span>
              </div>
              <div aria-hidden="true">
                <Mini />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
