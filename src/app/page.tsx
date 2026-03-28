import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
    title: "Assign & Go",
    desc: "Assign an issue to d3ftly or label it — a draft PR appears, no prompting needed.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L12 22" />
        <path d="M5 6h14" />
        <path d="M7 10h10" />
        <path d="M5 14h14" />
        <path d="M7 18h10" />
      </svg>
    ),
    title: "7-Pass Pipeline",
    desc: "Triage → Plan → Implement → Review → PR → CI Fix → Feedback. Every change is self-reviewed before you see it.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Zero Data Retention",
    desc: "Your code is processed in-memory. We never store source files or train on your data.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Built in Rust",
    desc: "Engineered from the ground up in Rust for speed and reliability. Sub-second response times with minimal overhead.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    title: "Context-Aware",
    desc: "Reads your repo structure, AGENTS.md, README, and CI config to match your conventions.",
  },
  {
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
    desc: "One click — choose which repos to enable. d3ftly generates an AGENTS.md to learn your codebase.",
  },
  {
    step: "02",
    title: "Create an issue",
    desc: 'Write a GitHub issue describing what you need. Assign it to d3ftly[bot] or add the "d3ftly" label.',
  },
  {
    step: "03",
    title: "Review the PR",
    desc: "d3ftly opens a draft PR with implementation, tests, and a summary. Review, comment, merge.",
  },
];

export default function Home() {
  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        {/* Background glow */}
        <div className="pointer-events-none absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/5 blur-[120px]" />

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
              href="https://github.com/apps/d3ftly"
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

          {/* Code demo */}
          <div className="mx-auto mt-16 max-w-2xl code-window glow">
            <div className="code-window-header">
              <div className="code-dot bg-[#ff5f57]" />
              <div className="code-dot bg-[#febc2e]" />
              <div className="code-dot bg-[#28c840]" />
              <span className="ml-3 text-xs text-text-muted">issue #42</span>
            </div>
            <div className="p-6 text-left font-mono text-sm leading-relaxed">
              <p className="text-text-muted">
                <span className="text-brand">@you</span> opened issue <span className="text-white">#42</span>
              </p>
              <p className="mt-1 text-text-secondary">
                &quot;Add dark mode toggle to the settings page&quot;
              </p>
              <div className="mt-4 border-t border-[#21262d] pt-4">
                <p className="text-text-muted">
                  <span className="text-purple-400">d3ftly[bot]</span>{" "}
                  opened PR <span className="text-white">#43</span>
                </p>
                <p className="mt-1 text-green-400">
                  ✓ 3 files changed &nbsp;· &nbsp;+87 −12 &nbsp;· &nbsp;tests passing
                </p>
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

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-surface-border bg-surface-elevated p-6 transition-colors hover:border-brand/30"
              >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-surface text-text-secondary">{f.icon}</div>
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
                  <span className="text-green-400">✓</span> 20 runs / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> Public &amp; private repos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> All 7 passes
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span> CI self-healing
                </li>
              </ul>
              <a
                href="https://github.com/apps/d3ftly"
                className="mt-8 block rounded-lg border border-surface-border bg-transparent px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-surface-border"
              >
                Get started
              </a>
            </div>

            {/* Supporter */}
            <div className="relative rounded-xl border border-brand/40 bg-surface-elevated p-8 glow">
              <div className="absolute -top-3 left-6 rounded-full gradient-brand px-3 py-0.5 text-xs font-semibold">
                Supporter
              </div>
              <h3 className="text-lg font-semibold">Supporter</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">$29</span>
                <span className="text-text-secondary">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Unlimited runs
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Priority queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Custom instructions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-brand">✓</span> Support the project
                </li>
              </ul>
              <a
                href="https://github.com/apps/d3ftly"
                className="mt-8 block rounded-lg gradient-brand px-6 py-3 text-center text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
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
            Install d3ftly in 30 seconds. No credit card, no config.
          </p>
          <a
            href="https://github.com/apps/d3ftly"
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
