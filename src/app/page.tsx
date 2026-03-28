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
    desc: "Assign a GitHub issue or Jira ticket — d3ftly creates a branch, opens a draft PR, and marks it ready when CI passes.",
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
    desc: "One click — choose repos, then connect Jira via webhook/automation. Run the Jira integration check endpoint to validate your payload before go-live.",
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

const infraMermaid = `architecture-beta
  group edge(logos:aws-cloudfront)[Edge]
  group compute(logos:aws-lambda)[Compute]
  group data(logos:aws-dynamodb)[Data]
  group async(logos:aws-sqs)[Queues]

  service dns(logos:aws-route53)[Route 53] in edge
  service cdn(logos:aws-cloudfront)[CloudFront] in edge
  service api(logos:aws-api-gateway)[API Gateway] in compute
  service gw(logos:aws-lambda)[Gateway Lambda] in compute
  service wk(logos:aws-lambda)[Worker Lambda] in compute
  service db(logos:aws-dynamodb)[DynamoDB] in data
  service s3(logos:aws-s3)[Artifacts S3] in data
  service q(logos:aws-sqs)[Ticket Queue] in async
  service dlq(logos:aws-sqs)[DLQ] in async

  dns:R --> L:cdn
  cdn:R --> L:api
  api:R --> L:gw
  gw:R --> L:db
  gw:B --> T:q
  q:R --> L:wk
  wk:R --> L:s3
  wk:B --> T:dlq`;

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
            Assign a GitHub issue or Jira ticket → get a production-ready PR. An autonomous
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
                  Describe a feature in plain English. d3ftly chats with you to scope the work, then generates an ordered list of GitHub issues or Jira tickets — each ready to become a PR with one click.
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
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00d4ff15] text-[9px] font-bold text-brand">d</div>
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

      {/* Infrastructure Analysis */}
      <section className="border-t border-surface-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Infrastructure Analysis</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-secondary">
            Visualize architecture and surface security, cost, and reliability risks fast.
          </p>

          <div className="mt-10 relative overflow-hidden rounded-2xl border border-teal-500/20 bg-surface-elevated">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at top right, #14b8a615, transparent 60%)" }}
            />
            <div className="relative grid md:grid-cols-2">
              <div className="flex items-center justify-center border-b border-teal-500/10 p-6 md:border-b-0 md:border-r md:border-teal-500/10">
                <div className="w-full max-w-lg rounded-xl border border-[#21262d] bg-[#0d1117] p-5">
                  <div className="mb-3 flex items-center justify-between border-b border-[#21262d] pb-3">
                    <span className="text-[11px] font-semibold text-text-secondary">ARCHITECTURE (MERMAID)</span>
                    <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[9px] font-semibold text-teal-400">live</span>
                  </div>
                  <MermaidDiagram chart={infraMermaid} className="overflow-x-auto rounded-md bg-[#0b0f14] p-2" />
                  <div className="mt-4 space-y-1.5 border-t border-[#21262d] pt-3">
                    <p className="mb-2 text-[10px] font-semibold text-text-muted">FINDINGS</p>
                    {[
                      { icon: "⚠", color: "#f59e0b", text: "No VPC isolation on Lambda" },
                      { icon: "⚠", color: "#f59e0b", text: "DynamoDB encryption not set" },
                      { icon: "ℹ", color: "#3b82f6", text: "Consider reserved concurrency" },
                    ].map((f) => (
                      <div key={f.text} className="flex items-center gap-2 text-[10px]">
                        <span style={{ color: f.color }}>{f.icon}</span>
                        <span className="text-text-secondary">{f.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center p-8 md:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="6" r="2" />
                      <circle cx="19" cy="6" r="2" />
                      <circle cx="12" cy="18" r="2" />
                      <line x1="7" y1="6" x2="17" y2="6" />
                      <line x1="5" y1="8" x2="12" y2="16" />
                      <line x1="19" y1="8" x2="12" y2="16" />
                      <circle cx="19" cy="6" r="5" />
                      <line x1="22" y1="9" x2="24" y2="11" />
                    </svg>
                  </div>
                </div>
                <h3 className="mt-4 text-2xl font-bold">Infrastructure Analysis</h3>
                <p className="mt-3 text-text-secondary leading-relaxed">
                  Scan your CDK or Terraform stacks and get a live architecture diagram plus a prioritized list of security, cost, and reliability findings — in seconds.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-text-secondary">
                  {[
                    "Live Mermaid architecture diagram",
                    "Security, cost & reliability findings by severity",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-teal-400">✓</span>
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
                <li className="flex items-center gap-2">
                  <span className="text-zinc-600">✗</span> AI plans
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
                  <span className="text-brand">✓</span> 30 runs / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> 5 AI plans / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> $5/run, $10/plan overage
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
