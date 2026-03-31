import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import MermaidDiagram from "@/components/MermaidDiagram";

const features = [
  {
    accentColor: "#00d4ff",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
    title: "GitHub Or Jira Intake",
    desc: "Assign a GitHub issue or Jira ticket — Coderhelm creates a branch, opens a draft PR, and marks it ready when CI passes.",
  },
  {
    accentColor: "#7928ca",
    icon: (
      // Pipeline: directed workflow graph (common pattern used for orchestration UX)
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="3" width="6" height="6" rx="1.5" />
        <rect x="15.5" y="3" width="6" height="6" rx="1.5" />
        <rect x="9" y="15" width="6" height="6" rx="1.5" />
        <path d="M8.5 6h7" />
        <path d="M12 9.5v5" />
        <path d="M18.5 9l1.8-1.8" />
        <path d="M10.5 14.5l-1.8-1.8" />
        <path d="M11 13.5l-1.2 1.2" />
        <path d="M13 13.5l1.2 1.2" />
      </svg>
    ),
    title: "Multi-Pass Pipeline",
    desc: "Triage → Plan → Implement → Review → PR → CI Fix → Feedback. Every change is self-reviewed before you see it.",
  },
  {
    accentColor: "#10b981",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Guardrails",
    desc: "Never pushes to main — built in. Add rules like \"always add tests\" or \"never delete migrations\". Enforced on every run.",
  },
  {
    accentColor: "#f59e0b",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 9h8M8 13h4" />
      </svg>
    ),
    title: "Team Voice",
    desc: "Learns from your existing PRs, commits, and reviews. Writes descriptions that sound like your team, not a bot.",
  },
  {
    accentColor: "#3b82f6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    title: "Context-Aware",
    desc: "Reads your repo structure, AGENTS.md, README, and CI config to match your conventions exactly.",
  },
  {
    accentColor: "#a855f7",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Openspec",
    desc: "Every ticket gets a proposal, design, task list, and acceptance criteria committed to the branch — full traceability, optionally toggled off.",
  },
  {
    accentColor: "#f43f5e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    title: "Self-Healing CI",
    desc: "When CI fails on its branch, Coderhelm reads the logs and pushes a fix automatically.",
  },
  {
    accentColor: "#8b5cf6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <circle cx="12" cy="11" r="3" />
        <path d="M12 8v0" />
      </svg>
    ),
    title: "Safety Agent",
    desc: "Every implementation is reviewed by a built-in safety agent before opening a PR. Violations are caught and the code is revised automatically.",
  },
  {
    accentColor: "#06b6d4",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    title: "Review Feedback Loop",
    desc: "Request changes, ask questions, or @mention Coderhelm on any PR comment. It reads your feedback, answers questions, fixes the code, and pushes — no back-and-forth needed.",
  },
];

const steps = [
  {
    step: "01",
    title: "Install the GitHub App",
    desc: "One click — choose repos, then connect Jira via webhook/automation. Run the Jira integration check endpoint to validate your payload before go-live.",
  },
  {
    step: "02",
    title: "Create an issue",
    desc: 'Write a GitHub issue or Jira ticket describing what you need. Assign it to Coderhelm[bot] or add the "Coderhelm" label.',
  },
  {
    step: "03",
    title: "Review the PR",
    desc: "Coderhelm opens a draft PR, runs CI, and marks it ready when checks pass. Request changes and it reads your comments, fixes the code, and pushes — iterate until you're happy, then merge.",
  },
];

const workflowMermaid = `flowchart LR
  issue["Issue Created"]
  triage["Triage"]
  plan["Plan"]
  impl["Implement"]
  review["Review + Safety"]
  pr["Open PR"]
  ci{"CI"}
  fix["CI Fix"]
  ready["Ready for Review"]
  fb{"Feedback?"}
  addr["Address Comments"]

  issue --> triage --> plan --> impl --> review --> pr --> ci
  ci -->|Pass| ready
  ci -->|Fail| fix --> ci
  ready --> fb
  fb -->|Yes| addr --> review
  fb -->|No| merge["Merge"]`;



export default function Home() {
  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        {/* Aurora background — animated color blobs */}
        <div className="aurora-container" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
          <div className="aurora-blob aurora-blob-4" />
          {/* Vignette to keep text readable */}
          <div className="aurora-vignette" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-elevated px-4 py-1.5 text-sm text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Now in public beta
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
            <span className="gradient-text">Ship code,</span>{" "}
            not tickets.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary sm:text-xl">
            Assign a GitHub issue or Jira ticket → get a production-ready PR. An autonomous
            AI agent that reads your codebase, plans changes, implements them,
            and self-reviews — all in minutes.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://github.com/apps/coderhelm"
              className="gradient-brand rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
            >
              Install on GitHub — Free
            </a>
            <a
              href="#how-it-works"
              className="rounded-xl border border-surface-border px-8 py-3.5 text-base font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              See how it works
            </a>
          </div>

          {/* Code demo — pipeline run */}
          <div className="mx-auto mt-16 max-w-2xl code-window glow">
            <div className="code-window-header">
              <div className="code-dot bg-[#ff5f57]" />
              <div className="code-dot bg-[#febc2e]" />
              <div className="code-dot bg-[#28c840]" />
              <span className="ml-3 text-xs text-text-muted">Coderhelm · issue #42</span>
            </div>
            <div className="p-6 text-left font-mono text-sm leading-relaxed">
              <p className="text-text-muted">
                <span className="text-brand">@you</span> opened issue <span className="text-white">#42</span>
              </p>
              <p className="mt-0.5 text-text-muted text-xs">
                &nbsp;&nbsp;&quot;Add dark mode toggle to the settings page&quot;
              </p>
              <div className="mt-4 space-y-1.5">
                {[
                  { step: "triage    ", detail: "feature · medium priority", time: "0.8s",   color: "#10b981" },
                  { step: "plan      ", detail: "5 files · 3 new functions", time: "2.1s",   color: "#10b981" },
                  { step: "implement ", detail: "+87 −12 across 3 files",    time: "47s",    color: "#10b981" },
                  { step: "review    ", detail: "LGTM · tests added",        time: "4.3s",   color: "#10b981" },
                  { step: "pr        ", detail: "#43 opened as draft",        time: "0.3s",   color: "#10b981" },
                  { step: "ci        ", detail: "12/12 checks passed",        time: "3m 22s", color: "#10b981" },
                  { step: "ready     ", detail: "marked ready for review",    time: "",       color: "#00d4ff" },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-3">
                    <span style={{ color: s.color }} className="shrink-0 text-xs">✓</span>
                    <span className="shrink-0 text-text-muted">{s.step}</span>
                    <span className="flex-1 text-text-secondary">{s.detail}</span>
                    {s.time && <span className="text-text-muted text-xs tabular-nums">{s.time}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            <span className="text-text-muted">
              <span className="font-bold text-brand">~ 5 min</span> average run
            </span>
            <span className="hidden h-4 w-px bg-surface-border sm:block" />
            <span className="text-text-muted">
              <span className="font-bold text-brand">0 pushes</span> to main, ever
            </span>
            <span className="hidden h-4 w-px bg-surface-border sm:block" />
            <span className="text-text-muted">
              <span className="font-bold text-brand">Any stack</span> — React, Go, Python, Rust
            </span>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Works where you work</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Native GitHub and Jira apps — no tokens to paste, no webhooks to wire. Install and go.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* GitHub App */}
            <div className="relative overflow-hidden rounded-2xl border border-[#238636]/30 bg-surface-elevated">
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at top left, #23863615, transparent 60%)" }} />
              <div className="relative p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#238636]/30 bg-[#238636]/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="1.5">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold">GitHub App</h3>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-4">
                    <div className="flex items-center gap-2 text-[11px] text-text-muted mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                      PR Comment
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#238636]/20 flex items-center justify-center shrink-0 mt-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="2.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" /></svg>
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed">
                          <span className="text-text-primary font-medium">coderhelm[bot]</span> commented on <span className="text-[#238636]">#43</span>
                          <div className="mt-1.5 rounded border border-[#21262d] bg-[#161b22] p-2.5 text-[10px]">
                            <p className="text-text-primary font-medium mb-1">Coderhelm is working on this</p>
                            <div className="space-y-0.5 text-text-muted">
                              <p className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Triage — feature, medium priority</p>
                              <p className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Plan — 5 files, 3 new functions</p>
                              <p className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" /> Implement — in progress...</p>
                              <p className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" /> Review</p>
                              <p className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" /> PR</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed">
                          <span className="text-text-primary font-medium">@you</span> requested changes
                          <div className="mt-1.5 rounded border border-[#21262d] bg-[#161b22] p-2.5 text-[10px] text-text-muted">
                            &quot;Use a custom hook instead of inline state&quot;
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#238636]/20 flex items-center justify-center shrink-0 mt-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="2.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" /></svg>
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed">
                          <span className="text-text-primary font-medium">coderhelm[bot]</span> pushed 1 commit
                          <div className="mt-1 text-[10px] text-emerald-400 flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                            Refactored to useThemeToggle hook — LGTM
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 text-sm text-text-secondary">
                    {[
                      "Assign issues → get PRs automatically",
                      "Comments on PRs with live progress",
                      "Reads your feedback, pushes fixes",
                      "Self-healing CI — reads logs, pushes fix",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-[#238636]">✓</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Jira App */}
            <div className="relative overflow-hidden rounded-2xl border border-[#0052CC]/30 bg-surface-elevated">
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at top right, #0052CC15, transparent 60%)" }} />
              <div className="relative p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0052CC]/30 bg-[#0052CC]/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0052CC">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.36 4.36 0 004.34 4.34h1.8v1.72a4.36 4.36 0 004.34 4.34V7.63a.84.84 0 00-.83-.83H6.77zM2 11.6a4.35 4.35 0 004.35 4.35h1.78v1.71c0 2.4 1.94 4.35 4.34 4.34v-9.56a.84.84 0 00-.84-.84H2z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold">Jira App</h3>
                  <span className="rounded-full bg-[#0052CC]/15 px-2 py-0.5 text-[9px] font-semibold text-[#0052CC]">Forge</span>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-4">
                    <div className="flex items-center gap-2 text-[11px] text-text-muted mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
                      Jira Board
                    </div>
                    <div className="space-y-2">
                      {[
                        { key: "KAN-12", title: "Add OAuth login flow", status: "In Progress", statusColor: "#0052CC" },
                        { key: "KAN-13", title: "Build settings API", status: "Done", statusColor: "#36B37E" },
                        { key: "KAN-14", title: "Add rate limiting", status: "In Review", statusColor: "#FF991F" },
                      ].map((ticket) => (
                        <div key={ticket.key} className="flex items-center gap-3 rounded border border-[#21262d] bg-[#161b22] px-3 py-2">
                          <span className="text-[10px] font-mono text-[#0052CC]">{ticket.key}</span>
                          <span className="text-[11px] text-text-secondary flex-1">{ticket.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: ticket.statusColor, background: ticket.statusColor + "20" }}>
                            {ticket.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-text-muted border-t border-[#21262d] pt-3">
                      <span className="text-emerald-400">→</span>
                      <span>Assign + label <code className="text-[#0052CC] bg-[#0052CC]/10 px-1 rounded text-[9px]">coderhelm</code> = PR created automatically</span>
                    </div>
                  </div>

                  <ul className="space-y-2 text-sm text-text-secondary">
                    {[
                      "Native Forge app — install from Atlassian Marketplace",
                      "Auto-detects repo from ticket context",
                      "Label + assign = Coderhelm starts working",
                      "Syncs Jira projects from the dashboard",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-[#0052CC]">✓</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Plans */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">AI Plans</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Turn a rough idea into an ordered set of executable GitHub issues.
          </p>

          <div className="mt-12 relative overflow-hidden rounded-2xl border border-purple-500/20 bg-surface-elevated">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at top left, #a855f715, transparent 60%)" }}
            />
            <div className="relative grid md:grid-cols-2">
              <div className="flex flex-col justify-center p-8 md:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <path d="M9 12h6M9 16h4" />
                      <path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-4 text-2xl font-bold">AI Plans</h3>
                <p className="mt-3 text-text-secondary leading-relaxed">
                  Describe a feature in plain English. Coderhelm chats with you to scope the work, then generates an ordered list of GitHub issues or Jira tickets — each ready to become a PR with one click.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-text-secondary">
                  {[
                    "Conversational scoping — it asks clarifying questions",
                    "Ordered GitHub issues created automatically",
                    "One-click Approve → Execute",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-purple-400">✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-center border-t border-purple-500/10 p-6 md:border-l md:border-t-0">
                <div className="w-full max-w-sm rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
                  <div className="mb-3 flex items-center gap-2 border-b border-[#21262d] pb-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-[9px] font-bold text-purple-400">P</div>
                    <span className="text-[11px] font-semibold text-text-secondary">New Plan</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg rounded-tr-none bg-purple-500/20 px-3 py-2 text-[11px] text-purple-200">
                        Add OAuth login with GitHub and Google
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00d4ff15] text-[9px] font-bold text-brand">c</div>
                      <div className="rounded-lg rounded-tl-none border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-[11px] text-text-secondary">
                        <p className="mb-2 text-text-primary">I&apos;ll scope this as 4 tasks:</p>
                        {[
                          "#1 Add OAuth provider config",
                          "#2 Build login / logout flow",
                          "#3 Protect authenticated routes",
                          "#4 Session management",
                        ].map((t) => (
                          <div key={t} className="flex items-center gap-1.5 text-[10px] leading-5">
                            <span className="text-green-400">·</span>
                            <span>{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Per-Repo Workflow */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Per-Repo Workflow</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Every issue follows the same autonomous pipeline — from triage to merge-ready PR.
          </p>

          <div className="mt-10 relative overflow-hidden rounded-2xl border border-blue-500/20 bg-surface-elevated">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at top left, #3b82f615, transparent 60%)" }}
            />
            <div className="relative grid md:grid-cols-2">
              <div className="flex items-center justify-center border-b border-blue-500/10 p-6 md:border-b-0 md:border-r md:border-blue-500/10">
                <div className="w-full max-w-lg rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
                  <div className="mb-3 flex items-center justify-between border-b border-[#21262d] pb-3">
                    <span className="text-[11px] font-semibold text-text-secondary">PIPELINE (MERMAID)</span>
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-400">per repo</span>
                  </div>
                  <MermaidDiagram chart={workflowMermaid} className="overflow-x-auto rounded-md bg-[#0b0f14] p-2" />
                </div>
              </div>

              <div className="flex flex-col justify-center p-8 md:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-4 text-2xl font-bold">Per-Repo Workflow</h3>
                <p className="mt-3 text-text-secondary leading-relaxed">
                  Each repository gets an autonomous pipeline. Coderhelm triages, plans, implements, self-reviews with your guardrails, opens a PR, and fixes CI failures — all without human intervention.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-text-secondary">
                  {[
                    "Triage → Plan → Implement → Review → PR",
                    "Self-healing CI: reads logs, pushes fixes",
                    "Feedback loop: addresses reviewer comments",
                    "Guardrails enforced on every pass",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-blue-400">✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Features */}
      <section id="features" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            Built for real engineering teams
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Not a code suggestion tool — a full autonomous agent that ships code end-to-end.
          </p>

          {/* Regular feature grid */}
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="relative overflow-hidden rounded-xl border border-surface-border bg-surface-elevated p-6 transition-all hover:border-brand/20"
              >
                {/* top accent line */}
                <div
                  className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${f.accentColor}90, transparent)`,
                  }}
                />
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg border"
                  style={{
                    color: f.accentColor,
                    backgroundColor: f.accentColor + "1a",
                    borderColor: f.accentColor + "33",
                  }}
                >
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            Three steps. That&apos;s it.
          </h2>

          <div className="mt-16 space-y-12">
            {steps.map((s) => (
              <div key={s.step} className="flex gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-brand text-sm font-bold">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-text-secondary">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            Simple pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Start free, upgrade when you&apos;re ready.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* Free */}
            <div className="rounded-xl border border-surface-border bg-surface-elevated p-8">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-text-secondary">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> 500K tokens / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Public &amp; private repos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> All passes
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> CI self-healing
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-zinc-600">✗</span> AI plans
                </li>
              </ul>
              <a
                href="https://github.com/apps/coderhelm"
                className="mt-8 block rounded-lg border border-surface-border bg-transparent px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-surface-border"
              >
                Get started
              </a>
            </div>

            {/* Pro */}
            <div className="relative rounded-xl border border-brand/40 bg-surface-elevated p-8 glow">
              <div className="absolute -top-3 left-6 rounded-full gradient-brand px-3 py-0.5 text-xs font-semibold">
                Pro
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$199</span>
                <span className="text-text-secondary">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> 5M tokens / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> AI plans
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> $50/1M token overage
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Priority queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Custom instructions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Email support
                </li>
              </ul>
              <a
                href="https://github.com/apps/coderhelm"
                className="mt-8 block rounded-lg gradient-brand px-6 py-3 text-center text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
              >
                Upgrade
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Isolation */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            Enterprise-grade security
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Your code never leaves your control. Every run is fully isolated.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                color: "#10b981",
                title: "Isolated Execution",
                desc: "Every run executes in its own isolated container. No shared state, no shared filesystem — one tenant cannot access another's data.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                color: "#3b82f6",
                title: "No Code Storage",
                desc: "Coderhelm reads your code through the GitHub API on-demand. Your source code is never cloned to disk or stored on our servers.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                color: "#a855f7",
                title: "Tenant Isolation",
                desc: "All data is partitioned by tenant ID. Every API call is scoped to your organization — cross-tenant access is architecturally impossible.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                ),
                color: "#00d4ff",
                title: "Webhook Verification",
                desc: "Every incoming webhook — GitHub, Stripe, Jira — is cryptographically verified before processing. Spoofed requests are rejected.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                ),
                color: "#f43f5e",
                title: "Rate-Limited & Audited",
                desc: "All billing and sensitive endpoints are rate-limited per tenant. Every action is logged for full auditability.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="relative overflow-hidden rounded-xl border border-surface-border bg-surface-elevated p-6 transition-all hover:border-brand/20"
              >
                <div
                  className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${f.color}90, transparent)`,
                  }}
                />
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg border"
                  style={{
                    color: f.color,
                    backgroundColor: f.color + "1a",
                    borderColor: f.color + "33",
                  }}
                >
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-surface-border py-24">
        {/* mini aurora */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-[#00d4ff0d] blur-[80px]" />
          <div className="absolute right-1/4 bottom-0 h-80 w-80 rounded-full bg-[#7928ca0d] blur-[80px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to <span className="gradient-text">ship faster</span>?
          </h2>
          <p className="mt-4 text-text-secondary">
            Install Coderhelm in 30 seconds. No credit card, no config.
          </p>
          <a
            href="https://github.com/apps/coderhelm"
            className="mt-8 inline-block gradient-brand rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
          >
            Install on GitHub — Free
          </a>
        </div>
      </section>

      <Footer />
    </>
  );
}
