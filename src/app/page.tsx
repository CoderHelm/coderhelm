import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const spotlightFeatures = [
  {
    accentColor: "#a855f7",
    badge: "New",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 9h8M8 13h4" />
      </svg>
    ),
    title: "AI Plans",
    desc: "Describe a feature in plain English. d3ftly chats with you to scope the work, then generates an ordered list of GitHub issues — each one ready to become a PR with one click.",
  },
  {
    accentColor: "#14b8a6",
    badge: "New",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M7 8h2M11 8h6M7 11h4M15 11h2" />
      </svg>
    ),
    title: "Infrastructure Analysis",
    desc: "Scan your CDK or Terraform stacks and get a live architecture diagram plus a prioritized list of security, cost, and reliability findings — in seconds.",
  },
];

const features = [
  {
    accentColor: "#00d4ff",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
    title: "Assign & Go",
    desc: "Assign a GitHub issue — d3ftly creates a branch, opens a draft PR, and marks it ready when CI passes.",
  },
  {
    accentColor: "#7928ca",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
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
    accentColor: "#f43f5e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    title: "Self-Healing CI",
    desc: "When CI fails on its branch, d3ftly reads the logs and pushes a fix automatically.",
  },
];

const steps = [
  {
    step: "01",
    title: "Install the GitHub App",
    desc: "One click — choose which repos to enable. Connect Jira for ticket sync. d3ftly generates an AGENTS.md to learn your codebase.",
  },
  {
    step: "02",
    title: "Create an issue",
    desc: 'Write a GitHub issue or Jira ticket describing what you need. Assign it to d3ftly[bot] or add the "d3ftly" label.',
  },
  {
    step: "03",
    title: "Review the PR",
    desc: "d3ftly opens a draft PR, runs CI, and marks it ready when checks pass. Review, comment, merge.",
  },
];

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
            Your code,{" "}
            <span className="gradient-text">d3ftly</span>{" "}
            handled.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary sm:text-xl">
            Assign a GitHub issue → get a production-ready PR. An autonomous
            AI agent that reads your codebase, plans changes, implements them,
            and self-reviews — all in minutes.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://github.com/apps/d3ftly-agent"
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
              <span className="ml-3 text-xs text-text-muted">d3ftly · issue #42</span>
            </div>
            <div className="p-6 text-left font-mono text-sm leading-relaxed">
              <p className="text-text-muted">
                $ <span className="text-brand">d3ftly</span> run --issue 42
              </p>
              <p className="mt-0.5 text-text-muted text-xs">
                &nbsp;&nbsp;→ &quot;Add dark mode toggle to the settings page&quot;
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
              <span className="font-bold text-brand">~5 min</span> average run
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

      {/* Features */}
      <section id="features" className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            Built for real engineering teams
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Not a code suggestion tool — a full autonomous agent that ships code end-to-end.
          </p>

          {/* Spotlight: new capabilities */}
          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {spotlightFeatures.map((f) => (
              <div
                key={f.title}
                className="relative overflow-hidden rounded-xl border p-8 transition-all"
                style={{ borderColor: f.accentColor + "40" }}
              >
                {/* ambient glow */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${f.accentColor}12, transparent 65%)`,
                  }}
                />
                <div className="relative">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ color: f.accentColor, backgroundColor: f.accentColor + "1a" }}
                  >
                    {f.badge}
                  </span>
                  <div
                    className="mt-4 flex h-12 w-12 items-center justify-center rounded-xl border"
                    style={{
                      color: f.accentColor,
                      backgroundColor: f.accentColor + "1a",
                      borderColor: f.accentColor + "40",
                    }}
                  >
                    {f.icon}
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm text-text-secondary leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Regular feature grid */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                  <span className="text-green-400">✓</span> 5 runs / month
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
              </ul>
              <a
                href="https://github.com/apps/d3ftly-agent"
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
                  <span className="text-brand">✓</span> 100 runs / month
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
                href="https://github.com/apps/d3ftly-agent"
                className="mt-8 block rounded-lg gradient-brand px-6 py-3 text-center text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
              >
                Upgrade
              </a>
            </div>
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
            Install d3ftly in 30 seconds. No credit card, no config.
          </p>
          <a
            href="https://github.com/apps/d3ftly-agent"
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
