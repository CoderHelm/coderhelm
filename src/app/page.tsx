import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />

      <main>
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
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Now in closed beta
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
            <span className="gradient-text">Ship code,</span>{" "}
            not tickets.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary sm:text-xl">
            Assign a GitHub issue or Jira ticket — get a production-ready PR. Autonomous
            AI that reads your codebase, plans changes, implements, and self-reviews.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://app.coderhelm.com"
              className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Get started free
            </a>
            <a
              href="https://github.com/CoderHelm"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/20 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Star on GitHub
            </a>
            <p className="text-sm text-text-muted sm:hidden">Free &amp; open source — bring your own API keys.</p>
          </div>

          {/* Product workspace mockup — the "window into the product" */}
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="rounded-xl border border-[#21262d] bg-[#0d1117] shadow-2xl shadow-brand/5 overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border-b border-[#21262d]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-3 py-0.5 rounded-md bg-[#0d1117] border border-[#21262d] text-[11px] text-neutral-500">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    app.coderhelm.com
                  </div>
                </div>
              </div>

              {/* Dashboard layout */}
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[380px]">
                {/* Left sidebar — Agent activity feed */}
                <div className="border-r border-[#21262d] p-4 hidden md:block">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 rounded bg-brand/20 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    </div>
                    <span className="text-xs font-semibold text-white">Issue #42</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Running
                    </span>
                  </div>

                  {/* Pipeline steps */}
                  <div className="space-y-0.5">
                    {[
                      { step: "Triage", detail: "feature · medium", done: true },
                      { step: "Read context", detail: "notion, figma, 3 docs", done: true },
                      { step: "Plan", detail: "5 files · 3 functions", done: true },
                      { step: "Implement", detail: "+87 −12 across 3 files", done: true },
                      { step: "Run tests", detail: "12/12 passed", done: true },
                      { step: "Self-review", detail: "LGTM · 0 issues", done: true },
                      { step: "Security scan", detail: "OWASP passed", done: true },
                      { step: "Open PR", detail: "#43 → ready", active: true, done: false },
                    ].map((s) => (
                      <div key={s.step} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md text-left" style={s.active ? { background: "rgba(0,212,255,0.06)" } : {}}>
                        {s.done ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0"><circle cx="7" cy="7" r="6" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1.2" /><path d="M4.5 7l1.8 1.8 3.2-3.6" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        ) : s.active ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 animate-spin" style={{ animationDuration: "2s" }}><circle cx="7" cy="7" r="6" stroke="#00d4ff" strokeWidth="1.2" strokeDasharray="20 18" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0"><circle cx="7" cy="7" r="6" stroke="#333" strokeWidth="1.2" /></svg>
                        )}
                        <div className="min-w-0">
                          <div className={`text-[11px] font-medium ${s.active ? "text-brand" : s.done ? "text-neutral-300" : "text-neutral-600"}`}>{s.step}</div>
                          <div className="text-[10px] text-neutral-600 truncate">{s.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Timer */}
                  <div className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between text-[11px]">
                    <span className="text-neutral-500">Elapsed</span>
                    <span className="font-mono text-brand tabular-nums">3:47</span>
                  </div>
                </div>

                {/* Main content — agent workspace */}
                <div className="p-5 flex flex-col gap-4">
                  {/* Tabs */}
                  <div className="flex items-center gap-1 border-b border-[#21262d] -mx-5 px-5">
                    {[
                      { label: "Activity", active: false },
                      { label: "Code", active: true },
                      { label: "PR Preview", active: false },
                    ].map((tab) => (
                      <div key={tab.label} className={`px-3 py-2 text-[11px] font-medium border-b-2 ${tab.active ? "text-white border-brand" : "text-neutral-500 border-transparent"}`}>
                        {tab.label}
                      </div>
                    ))}
                    <div className="ml-auto flex items-center gap-1.5 pb-2">
                      <span className="text-[10px] text-neutral-600">3 files changed</span>
                      <span className="text-[10px] font-mono text-[#3fb950]">+87</span>
                      <span className="text-[10px] font-mono text-[#f85149]">−12</span>
                    </div>
                  </div>

                  {/* Code editor mockup */}
                  <div className="rounded-lg border border-[#21262d] bg-[#0a0e14] overflow-hidden flex-1">
                    {/* File tab bar */}
                    <div className="flex items-center bg-[#161b22] border-b border-[#21262d]">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border-r border-b-2 border-b-brand border-r-[#21262d] text-[11px] text-neutral-300">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>
                        ThemeToggle.tsx
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>
                        settings.tsx
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>
                        useTheme.ts
                      </div>
                    </div>

                    {/* Code lines */}
                    <div className="p-4 font-mono text-[11px] leading-[1.7] overflow-hidden">
                      <div className="flex">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">1</span>
                        <span><span className="text-[#ff7b72]">import</span> <span className="text-neutral-300">{"{"}</span> <span className="text-[#79c0ff]">useState</span><span className="text-neutral-300">,</span> <span className="text-[#79c0ff]">useEffect</span> <span className="text-neutral-300">{"}"}</span> <span className="text-[#ff7b72]">from</span> <span className="text-[#a5d6ff]">&apos;react&apos;</span></span>
                      </div>
                      <div className="flex">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">2</span>
                        <span className="text-neutral-600" />
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">3</span>
                        <span><span className="text-[#ff7b72]">export function</span> <span className="text-[#d2a8ff]">ThemeToggle</span><span className="text-neutral-400">() {"{"}</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">4</span>
                        <span>  <span className="text-[#ff7b72]">const</span> <span className="text-neutral-300">[</span><span className="text-[#79c0ff]">theme</span><span className="text-neutral-300">,</span> <span className="text-[#79c0ff]">setTheme</span><span className="text-neutral-300">]</span> <span className="text-[#ff7b72]">=</span> <span className="text-[#d2a8ff]">useTheme</span><span className="text-neutral-400">()</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">5</span>
                        <span className="text-neutral-600" />
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">6</span>
                        <span>  <span className="text-[#ff7b72]">return</span> <span className="text-neutral-400">(</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">7</span>
                        <span>    <span className="text-neutral-400">&lt;</span><span className="text-[#7ee787]">button</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">8</span>
                        <span>      <span className="text-[#79c0ff]">onClick</span><span className="text-neutral-400">={"{"}() =&gt;</span> <span className="text-[#d2a8ff]">setTheme</span><span className="text-neutral-400">(</span><span className="text-[#79c0ff]">theme</span> <span className="text-[#ff7b72]">===</span> <span className="text-[#a5d6ff]">&apos;dark&apos;</span> <span className="text-neutral-400">?</span> <span className="text-[#a5d6ff]">&apos;light&apos;</span> <span className="text-neutral-400">:</span> <span className="text-[#a5d6ff]">&apos;dark&apos;</span><span className="text-neutral-400">){"}"}</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">9</span>
                        <span>      <span className="text-[#79c0ff]">className</span><span className="text-neutral-400">=</span><span className="text-[#a5d6ff]">&quot;theme-toggle&quot;</span></span>
                      </div>
                      <div className="flex bg-[#0b3d22]/30 border-l-2 border-[#3fb950]">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">10</span>
                        <span>    <span className="text-neutral-400">&gt;</span></span>
                      </div>
                      <div className="flex">
                        <span className="w-8 text-right pr-4 text-neutral-700 select-none">11</span>
                        <span className="text-neutral-600">      ...</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom status bar */}
                  <div className="flex items-center gap-4 text-[10px] -mx-5 px-5 py-2 border-t border-[#21262d] bg-[#161b22]">
                    <div className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>
                      <span className="text-neutral-400">Issue #42</span>
                      <span className="text-neutral-600">→</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="#a371f7"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>
                      <span className="text-neutral-400">PR #43</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#3fb950" strokeWidth="1.2" /><path d="M3.5 5l1 1 2-2.5" stroke="#3fb950" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="text-[#3fb950]">CI passed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#3fb950" strokeWidth="1.2" /><path d="M5 1.5v3l2 1" stroke="#3fb950" strokeWidth="1" strokeLinecap="round" /></svg>
                      <span className="text-[#3fb950]">Security passed</span>
                    </div>
                    <span className="ml-auto text-neutral-500 font-mono tabular-nums">12 tests · 0 warnings</span>
                  </div>
                </div>
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

      {/* Agent Orchestra — Under the Hood */}
      <section className="border-t border-surface-border py-28 overflow-hidden relative">
        {/* Background grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand tracking-wider uppercase">Under the Hood</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">
              A team of agents,<br className="hidden sm:block" />
              <span className="gradient-text">not a single prompt.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-text-secondary text-lg">
              Every issue triggers an orchestrated state machine. Nine specialized agents pass structured state from stage to stage — with self-healing loops and automatic retries built into the fabric.
            </p>
          </div>

          {/* Orchestrator visualization */}
          <div className="mt-20 relative">
            {/* Central orchestrator hub */}
            <div className="flex justify-center mb-12">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-blue-500/10 agent-pulse" />
                <div className="absolute -inset-8 rounded-full bg-blue-500/5 agent-pulse-delayed" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-blue-500/30 bg-[#0d1117]">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="4" cy="6" r="1.5" /><circle cx="20" cy="6" r="1.5" />
                    <circle cx="4" cy="18" r="1.5" /><circle cx="20" cy="18" r="1.5" />
                    <path d="M5.5 6.5L10 10.5" /><path d="M18.5 6.5L14 10.5" />
                    <path d="M5.5 17.5L10 13.5" /><path d="M18.5 17.5L14 13.5" />
                  </svg>
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-blue-400">Orchestrator</div>
              </div>
            </div>

            {/* Flowing pipeline */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  name: "Triage",
                  color: "#06b6d4",
                  desc: "Classifies bug vs feature vs refactor. Scores priority and complexity.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                    </svg>
                  ),
                },
                {
                  name: "Resolve",
                  color: "#a78bfa",
                  desc: "Fetches external context — Notion docs, Figma designs, Sentry errors — via MCP tools.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  ),
                },
                {
                  name: "Plan",
                  color: "#8b5cf6",
                  desc: "Reads repo conventions and produces a step-by-step task list with file paths.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
                    </svg>
                  ),
                },
                {
                  name: "Validate",
                  color: "#10b981",
                  desc: "Verifies files exist, imports resolve, and scope matches the issue.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ),
                },
                {
                  name: "Implement",
                  color: "#f59e0b",
                  desc: "Agentic coding loop — reads files, writes code, runs commands across your repo.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                    </svg>
                  ),
                },
              ].map((agent, i) => (
                <div key={agent.name} className="relative group">
                  <div className="relative rounded-lg border border-zinc-800 bg-[#0d1117] p-5 h-full transition-all duration-300 hover:border-zinc-600 agent-card" style={{ "--agent-color": agent.color } as React.CSSProperties}>
                    {/* Top glow bar */}
                    <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${agent.color}40, transparent)` }} />
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border" style={{ borderColor: `${agent.color}30`, color: agent.color, background: `${agent.color}08` }}>
                        {agent.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                        <h3 className="text-sm font-semibold -mt-0.5" style={{ color: agent.color }}>{agent.name}</h3>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">{agent.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  name: "Test",
                  color: "#ec4899",
                  desc: "Runs CI. If tests fail, reads logs and auto-pushes fixes — up to 3 healing attempts.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                    </svg>
                  ),
                },
                {
                  name: "Review",
                  color: "#3b82f6",
                  desc: "Self-reviews like a senior engineer. Loops back to Implement up to 3 times if needed.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  ),
                  loop: true,
                },
                {
                  name: "Security",
                  color: "#ef4444",
                  desc: "OWASP audit for injection, XSS, SSRF, and secrets. Auto-remediates violations.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
                    </svg>
                  ),
                },
                {
                  name: "Ship",
                  color: "#22d3ee",
                  desc: "Formats the PR in your team\u2019s voice, adds test evidence, and marks ready for review.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                    </svg>
                  ),
                },
              ].map((agent, i) => (
                <div key={agent.name} className="relative group">
                  <div className="relative rounded-lg border border-zinc-800 bg-[#0d1117] p-5 h-full transition-all duration-300 hover:border-zinc-600 agent-card" style={{ "--agent-color": agent.color } as React.CSSProperties}>
                    <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${agent.color}40, transparent)` }} />
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border" style={{ borderColor: `${agent.color}30`, color: agent.color, background: `${agent.color}08` }}>
                        {agent.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-zinc-600">{String(i + 6).padStart(2, "0")}</span>
                        <h3 className="text-sm font-semibold -mt-0.5" style={{ color: agent.color }}>{agent.name}</h3>
                      </div>
                      {agent.loop && (
                        <div className="ml-auto flex items-center gap-1 text-[9px] text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                          loop
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">{agent.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The review loop — hero callout */}
          <div className="mt-14 relative">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5" />
            <div className="relative rounded-lg border border-zinc-800 bg-[#0d1117] p-6 sm:p-8">
              <div className="sm:flex sm:items-start sm:gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/[0.06]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                  </svg>
                </div>
                <div className="mt-4 sm:mt-0">
                  <h3 className="text-base font-semibold text-text-primary">Self-correcting review loop</h3>
                  <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                    When the Review Agent finds issues — logic bugs, missing edge cases, naming problems — it sends structured feedback back to Implementation. The code gets fixed and re-submitted automatically. Up to 3 loops. The result: cleaner code than most human first-pass PRs.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Review → Implement → Review
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Max 3 iterations
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Structured feedback protocol
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: "9", label: "Specialized agents", color: "#06b6d4" },
              { value: "3×", label: "Self-healing loops", color: "#3b82f6" },
              { value: "40+", label: "Tool calls per run", color: "#8b5cf6" },
              { value: "<5m", label: "Issue to PR", color: "#10b981" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-zinc-800 bg-[#0d1117] p-5 text-center">
                <div className="text-3xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-text-muted mt-1.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Memory — Learns Your Codebase */}
      <section className="border-t border-surface-border py-28 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-purple-500/[0.03] blur-[120px]" />

        <div className="relative mx-auto max-w-6xl px-6">
          {/* Header */}
          <div className="text-center">
            <p className="text-sm font-semibold text-purple-400 tracking-wider uppercase">Agent Memory</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">
              A knowledge graph<br className="hidden sm:block" />
              <span className="text-purple-400">that learns your codebase.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-text-secondary text-lg">
              Every run builds a living knowledge graph of your repository. Patterns, mistakes, conventions, architecture decisions — all
              connected, weighted, and retrieved exactly when the agent needs them.
            </p>
          </div>

          {/* Neural graph visualization + stats */}
          <div className="mt-20 grid gap-8 lg:grid-cols-[1fr_380px] items-center">
            {/* Animated knowledge graph SVG */}
            <div className="relative rounded-2xl border border-zinc-800 bg-[#080b10] p-8 overflow-hidden min-h-[400px]">
              {/* Grid background */}
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

              <svg viewBox="0 0 560 360" className="relative w-full h-auto" fill="none">
                {/* Edges (connections between memory nodes) */}
                <g opacity="0.15" stroke="#a78bfa" strokeWidth="1">
                  <line x1="280" y1="180" x2="140" y2="80" className="memory-edge" />
                  <line x1="280" y1="180" x2="420" y2="100" className="memory-edge" />
                  <line x1="280" y1="180" x2="180" y2="280" className="memory-edge" />
                  <line x1="280" y1="180" x2="400" y2="260" className="memory-edge" />
                  <line x1="280" y1="180" x2="100" y2="180" className="memory-edge" />
                  <line x1="280" y1="180" x2="480" y2="180" className="memory-edge" />
                  <line x1="140" y1="80" x2="60" y2="40" className="memory-edge" />
                  <line x1="140" y1="80" x2="220" y2="40" className="memory-edge" />
                  <line x1="420" y1="100" x2="500" y2="50" className="memory-edge" />
                  <line x1="420" y1="100" x2="500" y2="160" className="memory-edge" />
                  <line x1="180" y1="280" x2="100" y2="320" className="memory-edge" />
                  <line x1="180" y1="280" x2="260" y2="330" className="memory-edge" />
                  <line x1="400" y1="260" x2="460" y2="320" className="memory-edge" />
                  <line x1="400" y1="260" x2="340" y2="320" className="memory-edge" />
                  <line x1="100" y1="180" x2="40" y2="120" className="memory-edge" />
                  <line x1="480" y1="180" x2="530" y2="240" className="memory-edge" />
                </g>

                {/* Animated data flow pulses along edges */}
                <circle r="2.5" fill="#a78bfa" opacity="0.8">
                  <animateMotion dur="3s" repeatCount="indefinite" path="M280,180 L140,80" />
                </circle>
                <circle r="2.5" fill="#c084fc" opacity="0.8">
                  <animateMotion dur="2.5s" repeatCount="indefinite" path="M280,180 L420,100" />
                </circle>
                <circle r="2" fill="#a78bfa" opacity="0.6">
                  <animateMotion dur="4s" repeatCount="indefinite" path="M280,180 L180,280" />
                </circle>
                <circle r="2" fill="#c084fc" opacity="0.6">
                  <animateMotion dur="3.5s" repeatCount="indefinite" path="M280,180 L400,260" />
                </circle>
                <circle r="1.5" fill="#a78bfa" opacity="0.5">
                  <animateMotion dur="2.8s" repeatCount="indefinite" path="M140,80 L60,40" />
                </circle>
                <circle r="1.5" fill="#c084fc" opacity="0.5">
                  <animateMotion dur="3.2s" repeatCount="indefinite" path="M420,100 L500,50" />
                </circle>

                {/* Central hub node */}
                <circle cx="280" cy="180" r="22" fill="#7c3aed" fillOpacity="0.1" stroke="#7c3aed" strokeWidth="1.5" className="memory-hub" />
                <circle cx="280" cy="180" r="14" fill="#7c3aed" fillOpacity="0.2" stroke="#a78bfa" strokeWidth="1" />
                <text x="280" y="184" textAnchor="middle" fill="#c084fc" fontSize="9" fontWeight="600" fontFamily="monospace">REPO</text>

                {/* Primary cluster nodes (semantic memories) */}
                {[
                  { cx: 140, cy: 80, label: "Patterns", color: "#8b5cf6" },
                  { cx: 420, cy: 100, label: "Security", color: "#ef4444" },
                  { cx: 180, cy: 280, label: "Reviews", color: "#3b82f6" },
                  { cx: 400, cy: 260, label: "Tests", color: "#10b981" },
                  { cx: 100, cy: 180, label: "Style", color: "#f59e0b" },
                  { cx: 480, cy: 180, label: "Anti-patterns", color: "#ec4899" },
                ].map((n) => (
                  <g key={n.label}>
                    <circle cx={n.cx} cy={n.cy} r="16" fill={n.color} fillOpacity="0.08" stroke={n.color} strokeWidth="1" strokeOpacity="0.4" />
                    <circle cx={n.cx} cy={n.cy} r="4" fill={n.color} fillOpacity="0.6">
                      <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
                    </circle>
                    <text x={n.cx} y={n.cy + 28} textAnchor="middle" fill={n.color} fontSize="8" fontWeight="500" opacity="0.7" fontFamily="monospace">{n.label}</text>
                  </g>
                ))}

                {/* Leaf nodes (individual memories) */}
                {[
                  { cx: 60, cy: 40 }, { cx: 220, cy: 40 }, { cx: 500, cy: 50 },
                  { cx: 500, cy: 160 }, { cx: 100, cy: 320 }, { cx: 260, cy: 330 },
                  { cx: 460, cy: 320 }, { cx: 340, cy: 320 }, { cx: 40, cy: 120 },
                  { cx: 530, cy: 240 },
                ].map((n, i) => (
                  <circle key={i} cx={n.cx} cy={n.cy} r="3" fill="#a78bfa" fillOpacity="0.3" stroke="#a78bfa" strokeWidth="0.5" strokeOpacity="0.2">
                    <animate attributeName="fillOpacity" values="0.1;0.4;0.1" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
                  </circle>
                ))}

                {/* Decay visualization: fading old memory */}
                <g opacity="0.15">
                  <circle cx="40" cy="120" r="8" stroke="#a78bfa" strokeWidth="0.5" strokeDasharray="2 2" />
                  <text x="40" y="145" textAnchor="middle" fill="#a78bfa" fontSize="6" opacity="0.4" fontFamily="monospace">decayed</text>
                </g>
              </svg>

              {/* Labels overlaid */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/10">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="12" r="2" /><circle cx="4" cy="6" r="1.5" /><circle cx="20" cy="6" r="1.5" /><circle cx="4" cy="18" r="1.5" /><circle cx="20" cy="18" r="1.5" /><path d="M5.5 6.5L10 10.5" /><path d="M18.5 6.5L14 10.5" /><path d="M5.5 17.5L10 13.5" /><path d="M18.5 17.5L14 13.5" /></svg>
                </div>
                <span className="text-[10px] font-mono text-purple-400/60">Knowledge Graph</span>
              </div>
              <div className="absolute bottom-4 right-4 text-[10px] font-mono text-zinc-600">
                <span className="text-purple-400/40">●</span> 47 memories <span className="text-zinc-700 mx-1">·</span> <span className="text-purple-400/40">―</span> 83 edges
              </div>
            </div>

            {/* Right column: evolution stats */}
            <div className="space-y-4">
              {[
                {
                  run: "Run 1",
                  bar: "8%",
                  memories: "3",
                  label: "First encounter",
                  desc: "Learns repo structure, conventions, test runner",
                },
                {
                  run: "Run 10",
                  bar: "45%",
                  memories: "47",
                  label: "Pattern recognition",
                  desc: "Knows libraries, pitfalls, preferred patterns",
                },
                {
                  run: "Run 50",
                  bar: "88%",
                  memories: "200+",
                  label: "Deep expertise",
                  desc: "Domain expert. Catches bugs humans miss",
                },
              ].map((s) => (
                <div key={s.run} className="rounded-lg border border-zinc-800 bg-[#0d1117] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-purple-400">{s.run}</span>
                      <span className="text-[10px] text-zinc-500">{s.label}</span>
                    </div>
                    <span className="text-xs font-mono text-zinc-500">{s.memories} memories</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-1000" style={{ width: s.bar }} />
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">{s.desc}</p>
                </div>
              ))}

              {/* Key stat */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-4 text-center">
                <div className="text-3xl font-bold text-purple-400">11&times;</div>
                <div className="text-xs text-zinc-500 mt-1">fewer repeated mistakes by run 50</div>
              </div>
            </div>
          </div>

          {/* Technical capabilities grid */}
          <div className="mt-16">
            <h3 className="text-center text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-8">How the memory engine works</h3>
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-800">
              {[
                {
                  title: "Knowledge Graph",
                  desc: "Memories are connected by typed, weighted edges. The agent traverses the graph to find related context across runs.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.5 8.5l7 7" /><path d="M15.5 8.5l-7 7" /><path d="M6 9v6" /><path d="M18 9v6" />
                    </svg>
                  ),
                  color: "#8b5cf6",
                },
                {
                  title: "Semantic Search",
                  desc: "Vector similarity search finds relevant past learnings even when the wording is different. Understands intent, not just keywords.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><path d="M11 8a3 3 0 00-3 3" />
                    </svg>
                  ),
                  color: "#3b82f6",
                },
                {
                  title: "Contradiction Detection",
                  desc: "When new information conflicts with existing beliefs, the engine flags it. Old knowledge is superseded, not silently overwritten.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  ),
                  color: "#f59e0b",
                },
                {
                  title: "Salience Decay",
                  desc: "Old, irrelevant memories naturally fade. Frequently accessed knowledge stays strong. The graph stays lean and useful.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  ),
                  color: "#10b981",
                },
                {
                  title: "Anti-Pattern Learning",
                  desc: "When something breaks CI or fails review, it gets stored as an anti-pattern. The agent actively avoids repeating it.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  ),
                  color: "#ef4444",
                },
                {
                  title: "Belief Propagation",
                  desc: "When a fact changes, related beliefs are flagged for re-evaluation. Knowledge stays consistent across the entire graph.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                    </svg>
                  ),
                  color: "#ec4899",
                },
                {
                  title: "Memory Tiers",
                  desc: "Working, episodic, semantic, procedural. Different memory types are stored and retrieved with purpose-built strategies.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                    </svg>
                  ),
                  color: "#06b6d4",
                },
                {
                  title: "Team Isolation",
                  desc: "Each team\u2019s memory is cryptographically isolated. No cross-contamination. Your code patterns stay yours.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  ),
                  color: "#a78bfa",
                },
              ].map((feat) => (
                <div key={feat.title} className="bg-[#0d1117] p-5 group hover:bg-[#0f1318] transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${feat.color}08`, color: feat.color }}>
                      {feat.icon}
                    </div>
                    <h4 className="text-sm font-semibold text-text-primary">{feat.title}</h4>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
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
                {/* GitHub App */}
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                    </svg>
                    <span className="text-sm font-medium">GitHub App</span>
                  </div>
                  <ul className="space-y-1.5">
                    {["Assign issues → get PRs", "Live PR progress", "Self-healing CI"].map((item) => (
                      <li key={item} className="text-xs text-text-secondary flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#238636" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12" /></svg> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Jira App */}
                <div className="rounded-lg bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="16" height="16" viewBox="0 0 256 256" className="shrink-0">
                      <defs><linearGradient id="jira-grad" x1="98.031%" x2="58.888%" y1="0.161%" y2="40.766%"><stop offset="0%" stopColor="#0052CC" /><stop offset="92.3%" stopColor="#2684FF" /></linearGradient></defs>
                      <path d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.5 55.502V10.666C255.358 4.777 250.581 0 244.658 0Z" fill="#2684FF" />
                      <path d="M183.822 61.262H60.872c.019 30.625 24.84 55.447 55.501 55.502h22.649v21.868c.039 30.625 24.877 55.443 55.502 55.502V71.928c0-5.891-4.776-10.666-10.702-10.666Z" fill="url(#jira-grad)" />
                      <path d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.72v21.867c.02 30.597 24.798 55.426 55.378 55.502V133.156c0-5.891-4.776-10.667-10.649-10.667Z" fill="url(#jira-grad)" />
                    </svg>
                    <span className="text-sm font-medium">Jira App</span>
                  </div>
                  <ul className="space-y-1.5">
                    {["Native Forge app", "Label + assign = PR", "Project sync"].map((item) => (
                      <li key={item} className="text-xs text-text-secondary flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2684FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12" /></svg> {item}
                      </li>
                    ))}
                  </ul>
                </div>
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
                  { label: "Test", detail: "", done: false },
                  { label: "Review", detail: "", done: false },
                  { label: "Security", detail: "", done: false },
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

      {/* Product Section 3: AI Plans — Streaming Chat */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          {/* Section header — centered */}
          <div className="text-center">
            <p className="text-sm font-semibold text-cyan-400 tracking-wider uppercase">AI Plans</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Talk to your codebase.<br className="hidden sm:block" />
              <span className="text-cyan-400">Ship a plan in seconds.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary leading-relaxed">
              Describe what you want to build. Coderhelm&apos;s AI searches your Notion docs, reads your Figma designs,
              and generates an executable plan — streamed to you in real-time, token by token.
            </p>
          </div>

          {/* Full-width chat experience mockup */}
          <div className="mt-16 rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-[#21262d] px-5 py-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              </div>
              <span className="ml-2 text-[11px] text-text-muted">coderhelm — new plan</span>
            </div>

            <div className="flex">
              {/* Chat panel */}
              <div className="flex-1 p-5 space-y-4 border-r border-[#21262d]">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg rounded-tr-none bg-zinc-800 px-3.5 py-2.5 text-[11px] text-zinc-200 leading-relaxed">
                    Add Google Tag Manager to the marketing site and dashboard. Use the GTM ID from our Notion workspace.
                  </div>
                </div>

                {/* Assistant — thinking */}
                <div className="flex gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M12 2a7 7 0 00-4.7 12.2A3.5 3.5 0 0010 21h4a3.5 3.5 0 002.7-6.8A7 7 0 0012 2z" /></svg>
                  </div>
                  <div className="space-y-2.5 flex-1 min-w-0">
                    {/* Thinking block */}
                    <div className="rounded-lg border border-[#21262d] bg-[#161b22] px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 00-4.7 12.2A3.5 3.5 0 0010 21h4a3.5 3.5 0 002.7-6.8A7 7 0 0012 2z" /></svg>
                        Reasoning
                      </div>
                      <p className="text-[10px] text-zinc-500 italic leading-relaxed">
                        The user wants GTM added to two properties. They mentioned a GTM ID in Notion — I should search for it before generating the plan...
                      </p>
                    </div>

                    {/* Tool call card — Notion */}
                    <div className="rounded-lg border border-[#21262d] bg-[#161b22] px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-4 h-4 rounded bg-cyan-400/10">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-medium">notion</span>
                        <span className="text-[10px] text-zinc-600">search_pages</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1.5 pl-6">Found &quot;Analytics Config&quot; — GTM-XXXX47F</p>
                    </div>

                    {/* Tool call card — GitHub */}
                    <div className="rounded-lg border border-[#21262d] bg-[#161b22] px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-4 h-4 rounded bg-cyan-400/10">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-medium">github</span>
                        <span className="text-[10px] text-zinc-600">search_code</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1.5 pl-6">Scanned layout files — no existing GTM snippet</p>
                    </div>

                    {/* Streamed response text */}
                    <div className="rounded-lg rounded-tl-none border border-[#21262d] bg-[#161b22] px-3.5 py-2.5 text-[11px] text-text-secondary leading-relaxed">
                      <p className="text-text-primary">
                        I found your GTM ID (<code className="text-[10px] text-cyan-400 bg-cyan-400/5 px-1 py-0.5 rounded">GTM-XXXX47F</code>) in the Analytics Config page on Notion. Neither repo has GTM installed yet.
                      </p>
                      <p className="mt-2">Here&apos;s a 3-task plan:</p>
                      <span className="inline-block w-[3px] h-3.5 bg-cyan-400 ml-0.5 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Plan sidebar */}
              <div className="w-64 p-4 space-y-3 hidden md:block">
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">Generated plan</p>
                  <p className="text-[11px] font-semibold text-text-primary mt-1">Add GTM tracking</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">3 tasks · 2 repos</p>
                </div>
                {[
                  { n: 1, t: "Add GTM to marketing site", repo: "site" },
                  { n: 2, t: "Add GTM to dashboard app", repo: "dashboard" },
                  { n: 3, t: "Add CSP and cookie consent", repo: "site" },
                ].map((task) => (
                  <div key={task.n} className="rounded-lg border border-[#21262d] bg-[#161b22] p-2.5">
                    <div className="flex gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-[9px] font-bold">{task.n}</span>
                      <div>
                        <p className="text-[10px] text-zinc-300 font-medium leading-tight">{task.t}</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5 font-mono">{task.repo}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Skeleton for streaming task */}
                <div className="rounded-lg border border-[#21262d] bg-[#161b22] p-2.5 opacity-30">
                  <div className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-zinc-800 rounded w-3/4 animate-pulse" />
                      <div className="h-2 bg-zinc-800/60 rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature highlights — 4-col grid below the mockup */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                ),
                title: "Real-time streaming",
                desc: "See the AI think and type, token by token. No loading spinners — just answers appearing as they form.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                ),
                title: "Searches your tools",
                desc: "Connects to Notion, Figma, Linear, Sentry and more via MCP. Pulls in IDs, specs, and context automatically.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                ),
                title: "Live plan preview",
                desc: "Tasks appear in the sidebar as they stream in. Review and refine before any code is written.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ),
                title: "One-click execute",
                desc: "Approve the plan and Coderhelm opens PRs for each task — in order, with full specs and tests.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-lg bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05]">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-400/10 text-cyan-400 mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
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
                Connect your AWS account in one click. Coderhelm scans your CloudWatch Logs every 6 hours, surfaces errors with severity and root cause, and turns every finding into an actionable plan.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-text-secondary">
                {[
                  "One-click CloudFormation setup — read-only, nothing else",
                  "Zero logs stored — only error summaries leave your account",
                  "Secrets auto-detected and stripped before analysis",
                  "AI severity scoring with root-cause suggestions",
                  "One click from finding → executable plan",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-orange-400"><polyline points="20 6 9 17 4 12" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* CloudWatch analysis dashboard mockup */}
            <div className="rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-[#21262d] px-5 py-3">
                {/* AWS smile mark */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h16" />
                  <path d="M5 14c3 4 11 4 14 0" />
                </svg>
                <span className="text-[11px] font-semibold text-text-secondary">CloudWatch Analysis</span>
                <span className="ml-auto text-[9px] text-text-muted">us-east-1</span>
              </div>

              <div className="p-4 space-y-3">
                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Errors detected", value: "12", color: "text-orange-400" },
                    { label: "Critical", value: "3", color: "text-red-400" },
                    { label: "Last scan", value: "2h ago", color: "text-text-secondary" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-center">
                      <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-[9px] text-text-muted mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Error entries */}
                <div className="space-y-2">
                  {[
                    { severity: "critical", badge: "bg-red-500/15 text-red-400 border-red-500/20", msg: "OOMKilled in ecs-api-prod — container exceeded 512 MB limit", time: "34m ago" },
                    { severity: "critical", badge: "bg-red-500/15 text-red-400 border-red-500/20", msg: "Connection refused on RDS pg-main:5432 — 28 occurrences in 1h", time: "1h ago" },
                    { severity: "warning", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", msg: "Lambda timeout on invoice-processor — 15s exceeded 3 times", time: "2h ago" },
                  ].map((e) => (
                    <div key={e.msg} className="rounded-lg border border-[#21262d] bg-[#161b22] px-3.5 py-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${e.badge}`}>{e.severity}</span>
                        <span className="text-[9px] text-text-muted ml-auto">{e.time}</span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed">{e.msg}</p>
                      <div className="mt-2 flex justify-end">
                        <span className="text-[10px] text-orange-400 font-medium flex items-center gap-1 cursor-default">
                          Create Plan
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom bar */}
                <div className="pt-2 border-t border-[#21262d] text-center">
                  <span className="text-[10px] text-text-muted">Next scan in 4h · 3 log groups monitored</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature grid */}
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                ),
                title: "Zero-config setup",
                desc: "One CloudFormation click deploys a read-only IAM role. No agents, no daemons, nothing to maintain.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                ),
                title: "Privacy first",
                desc: "Logs never leave your AWS account. Only aggregated error summaries are analyzed — secrets are stripped automatically.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 00-4.7 12.2A3.5 3.5 0 0010 21h4a3.5 3.5 0 002.7-6.8A7 7 0 0012 2z" /></svg>
                ),
                title: "AI recommendations",
                desc: "Every finding includes severity, root cause analysis, and a suggested fix — ready to become an executable plan.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-lg bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05]">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-400/10 text-orange-400 mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MCP Servers */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          {/* Centered header */}
          <div className="text-center">
            <p className="text-sm font-semibold text-purple-400 tracking-wider uppercase">Integrate</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              MCP Servers.<br className="hidden sm:block" />
              <span className="text-purple-400">Your tools, connected.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-secondary leading-relaxed">
              Connect your tools so Coderhelm can pull context during planning and execution.
              Pull Figma designs, query Sentry errors, check Datadog metrics, or read Notion docs — all while building your PRs.
            </p>
          </div>

          {/* Connected tools dashboard mockup */}
          <div className="mt-16 rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-[#21262d] px-5 py-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              </div>
              <span className="ml-2 text-[11px] text-text-muted">coderhelm — integrations</span>
            </div>

            <div className="p-5">
              {/* Search bar */}
              <div className="flex items-center gap-2 rounded-lg border border-[#21262d] bg-[#161b22] px-3.5 py-2.5 mb-5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <span className="text-[11px] text-text-muted">Search integrations...</span>
              </div>

              {/* Integration groups */}
              <div className="space-y-4">
                {/* Development & Design */}
                <div>
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-2">Development & Design</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { name: "GitHub", cat: "Version Control", connected: true },
                      { name: "Figma", cat: "Design", connected: true },
                      { name: "Linear", cat: "Projects", connected: true },
                      { name: "Jira", cat: "Projects", connected: false },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center gap-2.5 rounded-lg border border-[#21262d] bg-[#161b22] px-3 py-2.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.connected ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-text-primary">{p.name}</div>
                          <div className="text-[9px] text-text-muted">{p.cat}</div>
                        </div>
                        <span className={`text-[9px] font-medium shrink-0 ${p.connected ? "text-emerald-400" : "text-text-muted"}`}>
                          {p.connected ? "Connected" : "Enable"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monitoring & Analytics */}
                <div>
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-2">Monitoring & Analytics</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { name: "Sentry", cat: "Error Tracking", connected: true },
                      { name: "Datadog", cat: "Monitoring", connected: true },
                      { name: "PostHog", cat: "Analytics", connected: false },
                      { name: "Vercel", cat: "Deploy", connected: true },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center gap-2.5 rounded-lg border border-[#21262d] bg-[#161b22] px-3 py-2.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.connected ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-text-primary">{p.name}</div>
                          <div className="text-[9px] text-text-muted">{p.cat}</div>
                        </div>
                        <span className={`text-[9px] font-medium shrink-0 ${p.connected ? "text-emerald-400" : "text-text-muted"}`}>
                          {p.connected ? "Connected" : "Enable"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Data & Communication */}
                <div>
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-2">Data & Communication</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { name: "Notion", cat: "Docs", connected: true },
                      { name: "Slack", cat: "Chat", connected: true },
                      { name: "Supabase", cat: "Database", connected: true },
                      { name: "Confluence", cat: "Docs", connected: false },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center gap-2.5 rounded-lg border border-[#21262d] bg-[#161b22] px-3 py-2.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.connected ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-text-primary">{p.name}</div>
                          <div className="text-[9px] text-text-muted">{p.cat}</div>
                        </div>
                        <span className={`text-[9px] font-medium shrink-0 ${p.connected ? "text-emerald-400" : "text-text-muted"}`}>
                          {p.connected ? "Connected" : "Enable"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="mt-4 pt-3 border-t border-[#21262d] text-center">
                <span className="text-[10px] text-text-muted">9 connected · 28 MCP servers available across 13 categories</span>
              </div>
            </div>
          </div>

          {/* Feature grid — 4 cols */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                ),
                title: "One-click setup",
                desc: "Enable any integration with an API key or OAuth token. No config files, no YAML.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                ),
                title: "28+ integrations",
                desc: "Design, monitoring, database, deployment, and more. New servers added every week.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                ),
                title: "Available everywhere",
                desc: "MCP servers are available during AI Plans, PR runs, and log analysis. Context flows automatically.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                ),
                title: "Encrypted credentials",
                desc: "All tokens encrypted at rest and tenant-isolated. Credentials never leave your organization boundary.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-lg bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05]">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-400/10 text-purple-400 mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-400 tracking-wider uppercase">Security</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Built for teams that don&apos;t compromise<br className="hidden sm:block" /> on security.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              Your code never leaves your control. Every run is fully isolated, every credential encrypted, every action auditable.
            </p>
          </div>

          {/* Top row — 3 feature cards */}
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M2 7h20" /><path d="M12 17v4" /><path d="M8 21h8" /></svg>
                ),
                title: "Isolated Execution",
                desc: "Every run executes in its own container. No shared state — one team cannot access another's data.",
                tag: "Container-per-run",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
                ),
                title: "No Code Storage",
                desc: "Source code is read through the GitHub API on-demand. Never cloned to disk or stored on our servers.",
                tag: "Zero persistence",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                ),
                title: "Encrypted Everything",
                desc: "All credentials, tokens, and secrets are encrypted at rest. Team data is partitioned — cross-team access is architecturally impossible.",
                tag: "AES-256",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-lg bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.05]">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-400/10 text-emerald-400 mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">{f.desc}</p>
                <div className="mt-4 pt-3 border-t border-[#21262d]">
                  <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-400/10 px-2 py-0.5 rounded">{f.tag}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom row — security dashboard bar */}
          <div className="mt-6 rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 md:divide-x md:divide-[#21262d]">
              {[
                {
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M2 7h20" /></svg>
                  ),
                  label: "Isolation",
                  value: "Container-per-run",
                },
                {
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="9" /></svg>
                  ),
                  label: "Code storage",
                  value: "None",
                },
                {
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  ),
                  label: "Encryption",
                  value: "AES-256 at rest",
                },
                {
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                  ),
                  label: "Access",
                  value: "Team-scoped RBAC",
                },
              ].map((m) => (
                <div key={m.label} className="flex items-center gap-3 md:justify-center md:px-4">
                  <span className="text-emerald-400 shrink-0">{m.icon}</span>
                  <div>
                    <div className="text-[10px] text-text-muted">{m.label}</div>
                    <div className="text-[12px] font-semibold text-text-primary">{m.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Open Source */}
      <section id="open-source" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-400 tracking-wider uppercase">Open Source</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Free and open source.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary">
              CoderHelm is fully open source. Self-host it, contribute, or run it as-is. Bring your own API keys and set your own token limits.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
            <div className="rounded-lg bg-white/[0.03] ring-1 ring-blue-500/30 p-8">
              <h3 className="text-lg font-semibold">Everything included</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-text-secondary"> forever</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> Public &amp; private repos</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> All passes (ticket, PR review, CI fix)</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> AI plans &amp; streaming chat</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> CI self-healing &amp; log analysis</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> MCP server integrations</li>
                <li className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400"><polyline points="20 6 9 17 4 12" /></svg> Bring your own API keys</li>
              </ul>
              <a
                href="https://app.coderhelm.com"
                className="mt-8 block rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Get started
              </a>
            </div>

            <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-8 flex flex-col">
              <h3 className="text-lg font-semibold">Self-host</h3>
              <p className="mt-4 text-sm text-text-secondary flex-1">
                Deploy to your own AWS account. Full control over your data, infrastructure, and costs. CDK included.
              </p>
              <a
                href="https://github.com/CoderHelm"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 flex items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                View on GitHub
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
            Free and open source. Deploy in minutes with your own API keys.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://app.coderhelm.com"
              className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Get started free
            </a>
            <a
              href="https://github.com/CoderHelm"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/20 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </>
  );
}
