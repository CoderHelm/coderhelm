import type { ReactNode } from "react";
import type { FrameId } from "@/content/types";

// Pictures of the product, recreated in HTML from the CoderHelm dashboard and
// the GitHub views it writes to. They are text, so they stay sharp, cost no
// image request and can be read by search engines and screen readers. The
// examples are made up; no customer data appears here.

function Window({ url, children, label }: { url: string; children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_80px_-30px_rgba(59,130,246,0.25)]">
      <div className="flex items-center gap-3 border-b border-line bg-white/[0.02] px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <span className="truncate font-mono text-[11px] text-text-muted">{url}</span>
        <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-wider text-text-muted sm:inline">{label}</span>
      </div>
      <div className="p-4 text-[13px] sm:p-6">{children}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "info" | "muted"; children: ReactNode }) {
  const tones = {
    ok: "border-ok/30 bg-ok/10 text-ok",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
    info: "border-accent/40 bg-accent/10 text-accent-text",
    muted: "border-line bg-white/[0.03] text-text-secondary",
  } as const;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "info" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-accent" }[tone];
  return <span className={`mt-1.5 block h-2 w-2 flex-none rounded-full ${c}`} aria-hidden="true" />;
}

function Bot() {
  return (
    <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-[10px] font-bold text-black" aria-hidden="true">
      {"///"}
    </span>
  );
}

function MaintainFrame() {
  const events: { tone: "ok" | "warn" | "bad" | "info"; who: string; text: ReactNode; when: string }[] = [
    { tone: "info", who: "Jira", text: <>Ticket <b className="text-text-primary">WEB-412</b> assigned to CoderHelm</>, when: "09:02" },
    { tone: "info", who: "coderhelm", text: <>Opened draft <b className="text-text-primary">#318 Send start date at checkout</b> on <code className="font-mono text-text-primary">coderhelm/web-412</code></>, when: "09:14" },
    { tone: "bad", who: "CI", text: <>Check <code className="font-mono text-text-primary">unit-tests</code> failed: <span className="text-text-secondary">expected ISO date</span></>, when: "09:19" },
    { tone: "ok", who: "coderhelm", text: <>Read the logs, fixed the date format, pushed. All checks green</>, when: "09:26" },
    { tone: "warn", who: "reviewer", text: <>&ldquo;Can we reuse the existing date helper?&rdquo;</>, when: "11:40" },
    { tone: "ok", who: "coderhelm", text: <>Switched to <code className="font-mono text-text-primary">toIsoDate()</code>, replied with what changed</>, when: "11:47" },
    { tone: "ok", who: "GitHub", text: <>Approved and merged into main</>, when: "13:05" },
    { tone: "ok", who: "coderhelm", text: <>Deploy checks finished. No new failures since the merge</>, when: "13:31" },
  ];
  return (
    <Window url="github.com/example/web/pull/318" label="Pull request timeline">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-text-primary">Send start date at checkout</span>
        <span className="font-mono text-text-muted">#318</span>
        <Pill tone="ok">Merged</Pill>
      </div>
      <ol className="mt-5 grid gap-3.5 border-l border-line pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative flex gap-3">
            <span className="absolute -left-[21px] top-0"><Dot tone={e.tone} /></span>
            <span className="w-[74px] flex-none font-mono text-[11px] leading-5 text-text-muted">{e.who}</span>
            <span className="min-w-0 flex-1 leading-5 text-text-secondary">{e.text}</span>
            <span className="hidden flex-none font-mono text-[11px] leading-5 text-text-muted sm:inline">{e.when}</span>
          </li>
        ))}
      </ol>
    </Window>
  );
}

function ReviewFrame() {
  return (
    <Window url="github.com/example/web/pull/322" label="Code review">
      <div className="flex flex-wrap items-center gap-2">
        <Bot />
        <span className="font-semibold text-text-primary">coderhelm</span>
        <span className="text-text-muted">requested changes</span>
        <Pill tone="warn">risk: medium</Pill>
      </div>
      <p className="mt-3 leading-relaxed text-text-secondary">
        The new start date reaches 3 callers. One still sends the old field, and the checkout test does not cover the new path.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-text-muted">
          <span>src/checkout/submit.ts</span>
          <span>line 42</span>
        </div>
        <div className="font-mono text-[12px] leading-6">
          <div className="bg-bad/10 px-3 text-bad/90">- startDate: form.startDate,</div>
          <div className="bg-ok/10 px-3 text-ok/90">+ startDate: toIsoDate(form.startDate),</div>
        </div>
        <div className="border-t border-line px-3 py-2.5 text-text-secondary">
          <Pill tone="bad">high</Pill> <span className="ml-1">startDate is sent as a string; the API expects an ISO date.</span>
          <span className="mt-2 block font-mono text-[11px] text-accent-text">Suggested change · Commit suggestion</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
        <Pill tone="ok">2 earlier comments resolved</Pill>
        <span>Labels added: <code className="font-mono text-text-secondary">e2e:checkout</code></span>
      </div>
    </Window>
  );
}

function RunFrame() {
  const stages: [string, string, "ok" | "info"][] = [
    ["Triage", "Feature · touches checkout", "ok"],
    ["Plan", "4 tasks · 3 files", "ok"],
    ["Implement", "Build, lint and tests passed in the sandbox", "ok"],
    ["Review", "1 fix round", "ok"],
    ["Security", "No findings", "ok"],
    ["Pull request", "#318 ready for review", "info"],
  ];
  return (
    <Window url="app.coderhelm.com/runs/detail" label="Run">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-[11px] text-text-muted">WEB-412</span>
          <p className="text-[15px] font-semibold text-text-primary">Send start date at checkout</p>
        </div>
        <Pill tone="ok">Completed</Pill>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {stages.map(([name, detail, tone]) => (
          <li key={name} className="flex gap-3 rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
            <Dot tone={tone} />
            <span>
              <span className="block font-medium text-text-primary">{name}</span>
              <span className="block text-[12px] text-text-muted">{detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-text-muted">
        <span>checkout/submit.ts</span>
        <span>checkout/dates.ts</span>
        <span>checkout/submit.test.ts</span>
      </div>
    </Window>
  );
}

function AlertFrame() {
  return (
    <Window url="app.coderhelm.com/alerts" label="Alerts">
      <div className="grid gap-3">
        <div className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="bad">ALARM</Pill>
            <span className="font-mono text-text-primary">api-5xx-rate</span>
            <span className="ml-auto font-mono text-[11px] text-text-muted">02:14</span>
          </div>
          <p className="mt-2 text-text-secondary">Rule <b className="text-text-primary">API errors</b> → repository <code className="font-mono text-text-primary">example/api</code></p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center gap-2">
            <Bot />
            <span className="text-text-secondary">Analyzed and opened <b className="text-text-primary">#911 Retry token refresh once on timeout</b></span>
          </div>
          <p className="mt-2 text-[12px] text-text-muted">Waiting for a person to review and approve</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="ok">OK</Pill>
            <span className="font-mono text-text-primary">api-5xx-rate</span>
            <span className="text-text-muted">recovered, paired with the 02:14 alert</span>
            <span className="ml-auto font-mono text-[11px] text-text-muted">02:31</span>
          </div>
        </div>
      </div>
    </Window>
  );
}

function TestsFrame() {
  const rows: [string, string, "ok" | "warn" | "bad", string][] = [
    ["checkout › pays with saved card", "flaky", "warn", "✓✓✕✓✓✓✕✓✓✓"],
    ["account › updates email", "broken", "bad", "✕✕✕✕✕✕✕✕✓✕"],
    ["search › filters by size", "quarantined", "warn", "✓✕✓✓✓✓✕✓✓✓"],
    ["cart › removes last item", "passing", "ok", "✓✓✓✓✓✓✓✓✓✓"],
  ];
  return (
    <Window url="app.coderhelm.com/tests" label="Tests">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-left">
          <thead className="text-[11px] uppercase tracking-wider text-text-muted">
            <tr><th className="pb-2 font-medium">Test</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Last 10 runs</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([name, status, tone, runs]) => (
              <tr key={name}>
                <td className="py-2.5 pr-3 text-text-primary">{name}</td>
                <td className="py-2.5 pr-3"><Pill tone={tone}>{status}</Pill></td>
                <td className="py-2.5 font-mono tracking-[0.2em] text-text-secondary">{runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[12px] text-text-muted">Fix PR #327 for the flaky checkout test: 20 of 20 green runs, ready for review</p>
    </Window>
  );
}

function LookupFrame() {
  return (
    <Window url="app.coderhelm.com/data-sources/activity" label="Lookups">
      <p className="font-semibold text-text-primary">Bug: renewal date shows last year</p>
      <div className="mt-4 grid grid-cols-1 gap-3 [&>*]:min-w-0">
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
            <Pill tone="info">database</Pill>
            <span className="text-text-muted">read only · rolled back · 1 row</span>
          </div>
          <pre className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12px] text-text-secondary">SELECT id, renews_on FROM memberships WHERE id = 4182</pre>
        </div>
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
            <Pill tone="info">logs</Pill>
            <span className="text-text-muted">/ecs/api · last 24h</span>
          </div>
          <pre className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12px] text-text-secondary">RenewalJob: skipped 214 rows, timezone not set</pre>
        </div>
        <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-3 text-text-secondary">
          <b className="text-text-primary">Cause, with evidence:</b> the renewal job skips rows with no timezone. Plan: fix the job, not the screen.
        </div>
      </div>
      <p className="mt-3 text-[12px] text-text-muted">2 lookups · recorded with who asked and for which pull request</p>
    </Window>
  );
}

function SkillsFrame() {
  const items: [string, string, number][] = [
    ["skills/release-checklist/SKILL.md", "skill", 14],
    ["skills/graphql-conventions/SKILL.md", "skill", 31],
    ["agents/reviewer.md", "agent brief", 22],
    ["commands/add-migration.md", "command", 5],
  ];
  return (
    <Window url="app.coderhelm.com/skills" label="Skills">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-text-primary">example/team-skills</span>
        <Pill tone="ok">synced after last merge</Pill>
      </div>
      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {items.map(([path, kind, reads]) => (
          <li key={path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span aria-hidden="true" className="inline-flex h-4 w-7 flex-none items-center rounded-full bg-accent p-0.5"><span className="ml-auto h-3 w-3 rounded-full bg-white" /></span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">{path}</span>
            <span className="text-[12px] text-text-muted">{kind} · read {reads} times this week</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-text-muted">Text only. Nothing from this repository is ever run.</p>
    </Window>
  );
}

const FRAMES: Record<FrameId, () => ReactNode> = {
  maintain: MaintainFrame,
  review: ReviewFrame,
  run: RunFrame,
  alert: AlertFrame,
  tests: TestsFrame,
  lookup: LookupFrame,
  skills: SkillsFrame,
};

export function Frame({ id, caption, priority = false }: { id: FrameId; caption: string; priority?: boolean }) {
  const Body = FRAMES[id];
  return (
    <figure className="mx-auto w-full min-w-0 max-w-4xl" data-priority={priority || undefined}>
      <Body />
      <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-text-muted">{caption}</figcaption>
    </figure>
  );
}
