import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        <div className="aurora-container" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
          <div className="aurora-blob aurora-blob-4" />
          <div className="aurora-vignette" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-elevated px-4 py-1.5 text-sm text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Now in public beta
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
            <span className="gradient-text">Ship code,</span>{" "}
            not tickets.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary sm:text-xl">
            Assign a GitHub issue or Jira ticket — get a production-ready PR. Autonomous
            AI that reads your codebase, plans changes, implements, and self-reviews.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://app.coderhelm.com"
              className="rounded-xl bg-blue-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600"
            >
              Get Started — Free
            </a>
            <a
              href="https://app.coderhelm.com"
              className="rounded-xl border border-surface-border px-8 py-3.5 text-base font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Login
            </a>
          </div>

          {/* Code demo */}
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
                  { step: "ready     ", detail: "marked ready for review",    time: "",       color: "#10b981" },
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

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            <span className="text-text-muted">
              <span className="font-bold text-blue-400">~ 5 min</span> average run
            </span>
            <span className="hidden h-4 w-px bg-surface-border sm:block" />
            <span className="text-text-muted">
              <span className="font-bold text-blue-400">0 pushes</span> to main, ever
            </span>
            <span className="hidden h-4 w-px bg-surface-border sm:block" />
            <span className="text-text-muted">
              <span className="font-bold text-blue-400">Any stack</span> — React, Go, Python, Rust
            </span>
          </div>
        </div>
      </section>

      {/* How It Works — moved up, prominent */}
      <section id="how-it-works" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-400 tracking-wider uppercase">How it works</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Three steps. That&apos;s it.
            </h2>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Sign up",
                desc: "Create an account, connect GitHub and Jira. Takes 30 seconds.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Create an issue",
                desc: "Write a GitHub issue or Jira ticket. Assign it to Coderhelm or add the label.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Review the PR",
                desc: "Coderhelm opens a PR, runs CI, and marks it ready. Request changes — it iterates.",
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                ),
              },
            ].map((s) => (
              <div key={s.step} className="relative rounded-lg bg-white/[0.03] p-8 transition-colors hover:bg-white/[0.05]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                    {s.icon}
                  </div>
                  <span className="text-xs font-mono text-text-muted">{s.step}</span>
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Section 1: Intake */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-sm font-semibold text-emerald-400 tracking-wider uppercase">Intake</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Works where you work</h2>
              <p className="mt-4 text-text-secondary leading-relaxed">
                Native GitHub and Jira apps. Assign an issue to Coderhelm or add a label — a PR appears automatically.
                Comments on PRs with live progress. Reads your feedback, pushes fixes.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4">
                {[
                  { name: "GitHub App", color: "#238636", items: ["Assign issues → get PRs", "Live PR progress", "Self-healing CI"] },
                  { name: "Jira App", color: "#0052CC", items: ["Native Forge app", "Label + assign = PR", "Project sync"] },
                ].map((app) => (
                  <div key={app.name} className="rounded-lg bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: app.color }} />
                      <span className="text-sm font-medium">{app.name}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {app.items.map((item) => (
                        <li key={item} className="text-xs text-text-secondary flex items-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={app.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12" /></svg> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* GitHub PR mockup */}
            <div className="rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2 text-[11px] text-text-muted mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" /></svg>
                PR &middot; coderhelm[bot]
              </div>
              <div className="space-y-2">
                {[
                  { label: "Triage", detail: "feature · medium priority", done: true },
                  { label: "Plan", detail: "5 files, 3 functions", done: true },
                  { label: "Implement", detail: "in progress...", done: false, active: true },
                  { label: "Review", detail: "", done: false },
                  { label: "PR", detail: "", done: false },
                ].map((pass) => (
                  <div key={pass.label} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      pass.done ? "bg-emerald-500" : pass.active ? "bg-blue-500 animate-pulse" : "bg-zinc-700"
                    }`} />
                    <span className={pass.done ? "text-text-secondary" : pass.active ? "text-blue-400" : "text-text-muted"}>
                      {pass.label}
                    </span>
                    {pass.detail && <span className="text-text-muted">— {pass.detail}</span>}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-[#21262d] flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="3"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                </div>
                <span className="text-[10px] text-text-muted">&quot;Use a custom hook instead&quot;</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span className="text-[10px] text-emerald-400">Refactored to custom hook — pushed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Section 2: Pipeline */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-purple-400 tracking-wider uppercase">Execute</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Multi-pass pipeline</h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
              Triage → Plan → Implement → Review → PR → CI Fix → Feedback. Every change is self-reviewed before you see it.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Context-Aware",
                desc: "Reads your repo structure, AGENTS.md, README, and CI config to match your conventions.",
                color: "#a855f7",
              },
              {
                title: "Team Voice",
                desc: "Learns from your PRs, commits, and reviews. Writes descriptions that sound like your team.",
                color: "#a855f7",
              },
              {
                title: "Openspec",
                desc: "Every ticket gets a proposal, design, task list, and acceptance criteria committed to the branch.",
                color: "#a855f7",
              },
              {
                title: "Safety Agent",
                desc: "Every implementation is reviewed by a safety agent. Violations are caught and revised automatically.",
                color: "#a855f7",
              },
              {
                title: "Self-Healing CI",
                desc: "When CI fails, Coderhelm reads the logs and pushes a fix automatically.",
                color: "#a855f7",
              },
              {
                title: "Feedback Loop",
                desc: "Request changes or @mention Coderhelm on any PR comment. It fixes the code and pushes.",
                color: "#a855f7",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-lg bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                  <h3 className="text-base font-semibold">{f.title}</h3>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Guardrails highlight */}
          <div className="mt-12 rounded-lg bg-white/[0.03] p-8 md:flex md:items-center md:gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <h3 className="text-lg font-semibold">Guardrails</h3>
              </div>
              <p className="text-text-secondary leading-relaxed">
                Never pushes to main — built in. Add rules like &quot;always add tests&quot; or &quot;never delete migrations&quot;.
                Enforced on every single run, no exceptions.
              </p>
            </div>
            <div className="mt-6 md:mt-0 rounded-lg border border-[#21262d] bg-[#0d1117] p-4 font-mono text-xs md:w-80">
              <div className="text-text-muted mb-2"># .coderhelm/rules.md</div>
              <div className="text-emerald-400">✓ Always add tests</div>
              <div className="text-emerald-400">✓ Never push to main</div>
              <div className="text-emerald-400">✓ No migration deletes</div>
              <div className="text-red-400 mt-1">✗ Direct DB queries blocked</div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Section 3: AI Plans */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            {/* Chat mockup */}
            <div className="order-2 md:order-1 rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
              <div className="mb-3 flex items-center gap-2 border-b border-[#21262d] pb-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">P</div>
                <span className="text-[11px] font-semibold text-text-secondary">New Plan</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg rounded-tr-none bg-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
                    Add OAuth login with GitHub and Google
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">c</div>
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

            <div className="order-1 md:order-2">
              <p className="text-sm font-semibold text-cyan-400 tracking-wider uppercase">Plan</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">AI Plans</h2>
              <p className="mt-4 text-text-secondary leading-relaxed">
                Describe a feature in plain English. Coderhelm chats with you to scope the work,
                then generates an ordered list of executable issues — each ready to become a PR with one click.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-text-secondary">
                {[
                  "Conversational scoping — asks clarifying questions",
                  "Creates ordered GitHub issues or Jira tickets",
                  "One-click Approve → Execute per task",
                  "Set GitHub or Jira destination for the whole plan",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-cyan-400"><polyline points="20 6 9 17 4 12" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Log Analyzer */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-sm font-semibold text-orange-400 tracking-wider uppercase">Monitor</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">AWS Log Analyzer</h2>
              <p className="mt-4 text-text-secondary leading-relaxed">
                Connect your AWS account in one click. Coderhelm analyzes your CloudWatch Logs every 6 hours,
                detects errors and patterns, and gives you actionable recommendations — ready to become a plan with one click.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-text-secondary">
                {[
                  "One-click CloudFormation setup — read-only access, nothing else",
                  "No logs stored — only aggregated error summaries leave your account",
                  "Automatic secret & token detection — strips sensitive data before analysis",
                  "AI-powered recommendations with severity and suggested fixes",
                  "One click to create an executable plan from any recommendation",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-orange-400"><polyline points="20 6 9 17 4 12" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Security mockup */}
            <div className="rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-[#21262d] pb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-[11px] font-semibold text-text-secondary">Security First</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: "IAM Role", detail: "Read-only CloudWatch Logs — no write access", icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  ) },
                  { label: "External ID", detail: "Confused deputy prevention built in", icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  ) },
                  { label: "Temp Credentials", detail: "STS AssumeRole — no stored secrets", icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  ) },
                  { label: "Token Scrubbing", detail: "Secrets auto-detected and removed from logs", icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                  ) },
                  { label: "Tenant Isolation", detail: "Your data is never shared across accounts", icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                  ) },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3 text-[11px]">
                    <span className="shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <span className="text-text-primary font-medium">{item.label}</span>
                      <span className="text-text-muted ml-1.5">— {item.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-[#21262d]">
                <div className="rounded bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-[10px] text-orange-300 flex items-start gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px"><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>
                  We also recommend adding a log filter in your AWS account to strip tokens and secrets before they reach CloudWatch.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plugins */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div className="order-2 md:order-1 rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
              <div className="mb-4 flex items-center gap-2 border-b border-[#21262d] pb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                </svg>
                <span className="text-[11px] font-semibold text-text-secondary">Integrations</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Figma", cat: "Design" },
                  { name: "Sentry", cat: "Monitoring" },
                  { name: "Linear", cat: "Projects" },
                  { name: "Notion", cat: "Docs" },
                  { name: "Slack", cat: "Chat" },
                  { name: "Datadog", cat: "Monitoring" },
                  { name: "Vercel", cat: "Deploy" },
                  { name: "Stripe", cat: "Payments" },
                  { name: "PostHog", cat: "Analytics" },
                  { name: "Supabase", cat: "Database" },
                  { name: "Neon", cat: "Database" },
                  { name: "Cloudflare", cat: "Deploy" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <div>
                      <div className="text-[11px] font-medium text-text-primary">{p.name}</div>
                      <div className="text-[9px] text-text-muted">{p.cat}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#21262d] text-center">
                <span className="text-[10px] text-text-muted">28 plugins available across 13 categories</span>
              </div>
            </div>

            <div className="order-1 md:order-2">
              <p className="text-sm font-semibold text-purple-400 tracking-wider uppercase">Integrate</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Plugins</h2>
              <p className="mt-4 text-text-secondary leading-relaxed">
                Connect your tools so Coderhelm can pull context during planning and execution.
                Pull Figma designs, query Sentry errors, check Datadog metrics, or read Notion docs
                while building your PRs.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-text-secondary">
                {[
                  "One-click enable with API key or token",
                  "Available during both AI Plans and PR runs",
                  "Credentials encrypted at rest, tenant-isolated",
                  "28 plugins: Design, Monitoring, Database, Deployment, and more",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-purple-400"><polyline points="20 6 9 17 4 12" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-400 tracking-wider uppercase">Security</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Enterprise-grade security
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              Your code never leaves your control. Every run is fully isolated.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                color: "#10b981",
                title: "Isolated Execution",
                desc: "Every run executes in its own isolated container. No shared state — one team cannot access another's data.",
              },
              {
                color: "#3b82f6",
                title: "No Code Storage",
                desc: "Reads your code through the GitHub API on-demand. Source code is never cloned to disk or stored on our servers.",
              },
              {
                color: "#a855f7",
                title: "Team Isolation",
                desc: "All data is partitioned by team ID. Every API call is scoped to your organization — cross-team access is architecturally impossible.",
              },
              {
                color: "#00d4ff",
                title: "Webhook Verification",
                desc: "Every incoming webhook — GitHub, Stripe, Jira — is cryptographically verified before processing.",
              },
              {
                color: "#f43f5e",
                title: "Rate-Limited & Audited",
                desc: "Sensitive endpoints are rate-limited per organization. Every action is logged for full auditability.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-lg bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                  <h3 className="text-base font-semibold">{f.title}</h3>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-400 tracking-wider uppercase">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Simple pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              Start free, upgrade when you&apos;re ready.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* Free */}
            <div className="rounded-lg bg-white/[0.03] p-8">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-text-secondary">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> 500K tokens / month</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> Public &amp; private repos</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> All passes</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> CI self-healing</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-600"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> AI plans</li>
              </ul>
              <a
                href="https://app.coderhelm.com"
                className="mt-8 block rounded-lg bg-white/[0.06] px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-white/[0.1]"
              >
                Get started
              </a>
            </div>

            {/* Pro */}
            <div className="relative rounded-lg bg-white/[0.03] ring-1 ring-blue-500/30 p-8">
              <div className="absolute -top-3 left-6 rounded-full bg-blue-500 px-3 py-0.5 text-xs font-semibold text-white">
                Pro
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$199</span>
                <span className="text-text-secondary">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> 5M tokens / month</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> AI plans</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> $50/1M token overage</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> Priority queue</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> Custom instructions</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><polyline points="20 6 9 17 4 12" /></svg> Email support</li>
              </ul>
              <a
                href="https://app.coderhelm.com"
                className="mt-8 block rounded-lg bg-blue-500 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Upgrade
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to ship faster?
          </h2>
          <p className="mt-4 text-text-secondary">
            Sign up in 30 seconds. No credit card, no config.
          </p>
          <a
            href="https://app.coderhelm.com"
            className="mt-8 inline-block rounded-xl bg-blue-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600"
          >
            Get Started — Free
          </a>
        </div>
      </section>

      <Footer />
    </>
  );
}
