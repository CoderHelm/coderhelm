'use client';

// The browser install guide for self-hosted CoderHelm.
//
// One primary action per screen: open AWS with everything filled in, point
// your own domain (when you chose one), create the GitHub App, turn on
// Claude, open CoderHelm, then the optional setup list. Between them the page
// checks the real thing: the installer's progress file in the person's own
// bucket, then their install's /api/setup/status. Everything it remembers
// is in this browser (localStorage) and the address bar (no secrets), so a
// refresh or a later visit picks up where it was, and the install's own
// answers decide the screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Check,
  type DnsRecord,
  type InstallState,
  type SetupStatus,
  type StatusDoc,
  type StepId,
  DNS_PROVIDERS,
  GITHUB_OUTCOMES,
  LATEST_URL,
  PERMISSION_REASONS,
  GITHUB_PERMISSIONS,
  REGIONS,
  STORAGE_LAST,
  STORAGE_PREFIX,
  parseSetupStatus,
  checkText,
  baseDomain,
  cleanHostname,
  cliGithubCommand,
  deriveStep,
  domainRows,
  domainUrl,
  elapsed,
  findCheck,
  githubManifest,
  newAppUrl,
  newState,
  optionalSetup,
  parseStatusDoc,
  parseStored,
  pickVersion,
  progressRows,
  queryToPartial,
  quickCreateUrl,
  randomId,
  relativeName,
  stackName,
  stacksConsoleUrl,
  stateToQuery,
  statusFileUrl,
  stepsFor,
  urlFromPaste,
  validate,
  withDomainDoc,
} from '@/lib/install/core';
import { AnthropicLogo, AwsLogo, GitHubLogo } from './logos';

// Timings (the end-to-end tests shorten them through window.__CH_*).
function timing(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const v = (window as unknown as Record<string, unknown>)[name];
  return typeof v === 'number' ? v : fallback;
}
const POLL = () => timing('__CH_POLL_MS', 5000);
const NO_SIGN_AFTER = () => timing('__CH_NO_SIGN_MS', 3 * 60_000);
const NOT_ANSWERING_AFTER = () => timing('__CH_NOT_ANSWERING_MS', 5 * 60_000);

function store(s: InstallState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + s.statusId, JSON.stringify(s));
    localStorage.setItem(STORAGE_LAST, s.statusId);
  } catch {
    // Private windows: the address bar still has the progress ID.
  }
}

function load(): { state: InstallState; github?: string; app?: string } {
  const partial = queryToPartial(window.location.search);
  const { github, app, ...fromUrl } = partial;
  let stored: InstallState | null = null;
  try {
    const id = fromUrl.statusId ?? localStorage.getItem(STORAGE_LAST);
    if (id) stored = parseStored(localStorage.getItem(STORAGE_PREFIX + id));
  } catch {
    stored = null;
  }
  // The address bar wins (it may come from the stack's InstallGuide output on another device).
  const base = stored && (!fromUrl.statusId || stored.statusId === fromUrl.statusId) ? stored : newState({ setupToken: '' });
  const state = { ...base, ...fromUrl };
  if (fromUrl.statusId && !state.launchedAt && !stored) state.launchedAt = Date.now();
  if (!state.setupToken && !fromUrl.statusId) state.setupToken = newState().setupToken;
  return { state, github, app };
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** The install's own checks: its public GET /api/setup/status (shared with the CLI and the dashboard). */
async function readInstall(url: string, region: string, fresh = false): Promise<SetupStatus | null> {
  const r = await getJson(`${url}/api/setup/status${fresh ? '?fresh=1' : ''}`);
  return r.ok ? parseSetupStatus(r.body, region) : null;
}

// ── Small pieces ─────────────────────────────────────────────────────────

type Tone = 'pass' | 'fail' | 'warn' | 'active' | 'pending' | 'wait' | 'skip';

function StatusIcon({ tone }: { tone: Tone }) {
  const base = 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full';
  if (tone === 'pass')
    return (
      <span className={`${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`} aria-label="Done">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </span>
    );
  if (tone === 'fail')
    return (
      <span className={`${base} bg-red-500/15 text-red-600 dark:text-red-400`} aria-label="Needs attention">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
      </span>
    );
  if (tone === 'warn')
    return (
      <span className={`${base} bg-amber-500/15 text-amber-600 dark:text-amber-400`} aria-label="Optional">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="7" y="3.5" width="2" height="6" rx="1" /><circle cx="8" cy="12" r="1.2" /></svg>
      </span>
    );
  if (tone === 'active' || tone === 'wait')
    return (
      <span className={`${base} text-fd-primary`} aria-label="Working">
        <svg viewBox="0 0 24 24" width="20" height="20" className="animate-spin" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" /><path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </span>
    );
  return <span className={`${base} border-2 border-fd-border`} aria-label="Not started" />;
}

function Row({ tone, title, children }: { tone: Tone; title: React.ReactNode; children?: React.ReactNode }) {
  const muted = tone === 'pending' || tone === 'skip';
  return (
    <li className="flex gap-3 py-2.5" data-row-status={tone}>
      <StatusIcon tone={tone} />
      <div className="min-w-0 flex-1">
        <div className={`font-medium leading-6 ${muted ? 'text-fd-muted-foreground' : ''}`}>{title}</div>
        {children ? <div className="mt-1 text-sm text-fd-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}

function Primary({ children, href, onClick, disabled, type = 'button', newTab, testId }: {
  children: React.ReactNode; href?: string; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; newTab?: boolean; testId?: string;
}) {
  const cls = 'inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-fd-primary px-6 py-3 text-base font-semibold text-fd-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';
  if (href)
    return (
      <a className={cls} href={href} data-testid={testId} onClick={onClick} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  );
}

function Secondary({ children, href, onClick, newTab, testId }: { children: React.ReactNode; href?: string; onClick?: () => void; newTab?: boolean; testId?: string }) {
  const cls = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fd-border bg-fd-background px-4 py-2 text-sm font-medium transition hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring';
  if (href)
    return (
      <a className={cls} href={href} data-testid={testId} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  return (
    <button className={cls} type="button" onClick={onClick} data-testid={testId}>
      {children}
    </button>
  );
}

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-6 rounded-xl border border-fd-border bg-fd-card/40 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fd-muted-foreground marker:hidden hover:text-fd-foreground">
        <svg viewBox="0 0 16 16" width="12" height="12" className="transition group-open:rotate-90" fill="currentColor"><path d="M6 3.5l5 4.5-5 4.5z" /></svg>
        {summary}
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed text-fd-muted-foreground">{children}</div>
    </details>
  );
}

function CopyBox({ text, testId }: { text: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-stretch overflow-hidden rounded-lg border border-fd-border bg-fd-secondary">
      <code className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere px-3 py-2.5 font-mono text-[13px] leading-relaxed" data-testid={testId}>{text}</code>
      <button
        type="button"
        className="shrink-0 border-l border-fd-border px-3 text-sm font-medium hover:bg-fd-accent"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function TodoIcon() {
  return (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-fd-primary/15 text-fd-primary" aria-label="To do">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="8" cy="8" r="3" /></svg>
    </span>
  );
}

function Notice({ tone, title, children, testId }: { tone: 'fail' | 'warn' | 'pass' | 'info' | 'todo'; title: string; children?: React.ReactNode; testId?: string }) {
  const ring = {
    fail: 'border-red-500/30 bg-red-500/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    pass: 'border-emerald-500/30 bg-emerald-500/5',
    info: 'border-fd-border bg-fd-card/60',
    todo: 'border-fd-primary/30 bg-fd-primary/5',
  }[tone];
  return (
    <div className={`mt-5 flex gap-3 rounded-xl border p-4 ${ring}`} role={tone === 'fail' ? 'alert' : 'status'} data-testid={testId} data-tone={tone}>
      {tone === 'info' ? null : tone === 'todo' ? <TodoIcon /> : <StatusIcon tone={tone} />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-6">{title}</div>
        {children ? <div className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

function Stepper({ steps, current, done, onPick }: { steps: { id: StepId; label: string }[]; current: StepId; done: Set<StepId>; onPick: (s: StepId) => void }) {
  const at = steps.findIndex((s) => s.id === current);
  return (
    <ol className={`mb-8 grid gap-2 ${steps.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`} aria-label="Install steps">
      {steps.map((s, i) => {
        const isDone = done.has(s.id) && s.id !== current;
        const isCurrent = s.id === current;
        const can = isDone || isCurrent;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!can}
              onClick={() => onPick(s.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className="group flex w-full flex-col items-start gap-2 text-left disabled:cursor-default"
            >
              <span className={`h-1.5 w-full rounded-full ${isDone ? 'bg-emerald-500' : isCurrent ? 'bg-fd-primary' : i < at ? 'bg-emerald-500' : 'bg-fd-border'}`} />
              <span className={`flex items-center gap-1.5 text-xs font-medium sm:text-sm ${isCurrent ? 'text-fd-foreground' : 'text-fd-muted-foreground'} ${can && !isCurrent ? 'group-hover:text-fd-foreground' : ''}`}>
                <span className="hidden sm:inline">{i + 1}.</span>
                {s.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, help, error, children, htmlFor }: { label: string; help?: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p> : help ? <p className="mt-1.5 text-sm text-fd-muted-foreground">{help}</p> : null}
    </div>
  );
}

const inputCls = 'block min-h-12 w-full rounded-xl border border-fd-border bg-fd-background px-3.5 text-base outline-none transition focus:border-fd-primary focus:ring-2 focus:ring-fd-ring/40';

function Heading({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="step-title">{title}</h1>
      {lead ? <p className="mt-2 text-base leading-relaxed text-fd-muted-foreground">{lead}</p> : null}
    </header>
  );
}

// ── The guide ────────────────────────────────────────────────────────────

export function InstallWizard() {
  const [s, setS] = useState<InstallState | null>(null);
  const [outcome, setOutcome] = useState<{ code: string; app?: string } | null>(null);
  const [doc, setDoc] = useState<StatusDoc | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [answeringSince, setAnsweringSince] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState<StepId | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [touched, setTouched] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const [orgMode, setOrgMode] = useState(false);
  const [, tick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Load what this browser and the address bar remember.
  useEffect(() => {
    const { state, github, app } = load();
    setS(state);
    if (state.org) setOrgMode(true);
    if (github) setOutcome({ code: github, app });
    if (app) setS((p) => (p ? { ...p, appSlug: app } : p));
  }, []);

  // Remember, and keep the address bar in step (no secrets in it).
  useEffect(() => {
    if (!s) return;
    store(s);
    const q = stateToQuery(s);
    const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [s]);

  // The newest release (before launch only).
  useEffect(() => {
    if (!s || s.launchedAt) return;
    let live = true;
    void getJson(LATEST_URL).then((r) => {
      if (live && r.ok) setS((p) => (p && !p.launchedAt ? { ...p, version: pickVersion(r.body) } : p));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.launchedAt]);

  const update = useCallback((patch: Partial<InstallState>) => setS((p) => (p ? { ...p, ...patch } : p)), []);

  // Follow the installer's progress file until the install's URL is known.
  useEffect(() => {
    if (!s?.launchedAt || s.url) return;
    let live = true;
    const read = async () => {
      const r = await getJson(statusFileUrl(s));
      if (!live) return;
      const d = r.ok ? parseStatusDoc(r.body) : null;
      if (d) {
        setDoc(d);
        setS((p) => (p ? withDomainDoc(p, d) ?? p : p));
        if (d.phase === 'done' && d.url) {
          const u = urlFromPaste(d.url);
          if (u) update({ url: u });
        }
      }
    };
    void read();
    const t = setInterval(read, POLL());
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [s?.launchedAt, s?.url, s?.statusId, s?.region, update]); // eslint-disable-line react-hooks/exhaustive-deps

  // Their own domain, after a refresh or on another device: the records come
  // from the progress file (read once; the install never publishes them).
  useEffect(() => {
    if (!s?.url || s.domainDoc || !s.launchedAt) return;
    let live = true;
    void getJson(statusFileUrl(s)).then((r) => {
      const d = r.ok ? parseStatusDoc(r.body) : null;
      if (live && d) setS((p) => (p ? withDomainDoc(p, d) ?? p : p));
    });
    return () => {
      live = false;
    };
  }, [s?.url, s?.statusId, s?.region]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask the install itself.
  const refresh = useCallback(
    async (fresh: boolean) => {
      if (!s?.url) return;
      const v = await readInstall(s.url, s.region, fresh);
      setSetup(v);
      if (v) setAnsweringSince(null);
      else setAnsweringSince((t) => t ?? Date.now());
    },
    [s?.url, s?.region],
  );
  useEffect(() => {
    if (!s?.url) return;
    void refresh(!!outcome);
    const t = setInterval(() => void refresh(false), POLL());
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.url, refresh]);

  // A clock for "started N minutes ago" and the waits.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), Math.min(15_000, POLL()));
    return () => clearInterval(t);
  }, []);

  // Once the domain answers, follow the install there (the GitHub App then gets the domain's URLs).
  const nextUrl = s ? domainUrl(s, setup) : null;
  useEffect(() => {
    if (nextUrl) update({ url: nextUrl });
  }, [nextUrl, update]);

  const derived: StepId = s ? deriveStep(s, setup) : 'start';
  const view: StepId = manual ?? derived;
  const steps = stepsFor({ domainChoice: s?.domainChoice ?? 'aws' });
  const done = useMemo(() => {
    const order: StepId[] = ['aws', 'domain', 'github', 'models', 'ready'];
    const i = order.indexOf(derived);
    return new Set<StepId>(i < 0 ? [] : order.slice(0, i));
  }, [derived]);
  const [provider, setProvider] = useState('');

  const checkAgain = async () => {
    setChecking(true);
    setManual(null);
    await refresh(true);
    setChecking(false);
  };

  if (!s) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  // ── Screens ──

  const launch = () => {
    setTouched(true);
    const problems = Object.keys(validate(s));
    if (problems.length) {
      // A problem inside More options opens it, so the sentence is seen.
      if (problems.some((k) => k !== 'email' && k !== 'region')) setShowMore(true);
      return;
    }
    const next = { ...s, email: s.email.trim(), hostname: s.domainChoice === 'own' ? cleanHostname(s.hostname) : '', domainDoc: null, domainSkipped: false, launchedAt: Date.now() };
    setS(next);
    setDoc(null);
    setManual(null);
    window.open(quickCreateUrl(next), '_blank', 'noopener');
  };

  const relaunch = () => {
    // A failed stack keeps its name and its progress bucket: new ones for the new try.
    const next = { ...s, statusId: randomId(16), setupToken: newState().setupToken, attempt: s.attempt + 1, launchedAt: Date.now(), url: '' };
    setS(next);
    setDoc(null);
    setSetup(null);
    window.open(quickCreateUrl(next), '_blank', 'noopener');
  };

  const usePasted = () => {
    const u = urlFromPaste(paste);
    if (!u) {
      setPasteError('That doesn’t look like a web address. It looks like https://d1234abcd.cloudfront.net');
      return;
    }
    setPasteError('');
    setPasteOpen(false);
    update({ url: u, launchedAt: s.launchedAt ?? Date.now() });
  };

  const startOver = () => {
    if (!window.confirm('Start a new install? This browser forgets the current one (your AWS install is not changed).')) return;
    try {
      localStorage.removeItem(STORAGE_LAST);
    } catch {
      /* ignore */
    }
    setS(newState({ email: s.email, region: s.region, domainChoice: s.domainChoice, hostname: s.hostname }));
    setDoc(null);
    setSetup(null);
    setOutcome(null);
    setManual(null);
  };

  const errors = touched ? validate(s) : {};
  const host = s.url ? s.url.replace(/^https?:\/\//, '') : '';

  let screen: React.ReactNode;

  if (view === 'start') {
    screen = (
      <section data-testid="screen-start">
        <Heading title="Install CoderHelm in your AWS account" lead="About 25 minutes, mostly waiting. You press a few buttons; this page does the rest and checks every step." />
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            launch();
          }}
          noValidate
        >
          <Field label="Your email" htmlFor="ch-email" help="You will be the first admin." error={errors.email}>
            <input id="ch-email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" className={inputCls} value={s.email} onChange={(e) => update({ email: e.target.value })} />
          </Field>
          <Field label="AWS region" htmlFor="ch-region" help="Where CoderHelm runs. Pick the one closest to your team." error={errors.region}>
            <select id="ch-region" className={`${inputCls} appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10`} value={s.region} onChange={(e) => update({ region: e.target.value })}
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E\")" }}>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>

          <div>
            <button type="button" className="text-sm font-medium text-fd-primary hover:underline" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              {showMore ? 'Fewer options' : 'More options'}
            </button>
            {showMore ? (
              <div className="mt-4 space-y-6 rounded-xl border border-fd-border p-4">
                <fieldset data-testid="domain-choice">
                  <legend className="mb-2 text-sm font-medium">Web address</legend>
                  {(
                    [
                      ['aws', 'The AWS address', 'Free and ready right away, like d1234abcd.cloudfront.net. You can add a domain later.'],
                      ['own', 'My own domain', 'Like coderhelm.example.com. Set up for you when its zone is in Route 53 in this AWS account; anywhere else you add two DNS records.'],
                    ] as const
                  ).map(([id, title, help]) => (
                    <label key={id} className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${s.domainChoice === id ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input type="radio" name="domain" className="mt-1 accent-[var(--color-fd-primary)]" checked={s.domainChoice === id} onChange={() => update({ domainChoice: id })} />
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="block text-sm text-fd-muted-foreground">{help}</span>
                      </span>
                    </label>
                  ))}
                  {s.domainChoice === 'own' ? (
                    <div className="mt-3">
                      <Field label="Your domain" htmlFor="ch-hostname" help="The address people will open. A subdomain such as coderhelm.example.com is easiest." error={errors.hostname}>
                        <input id="ch-hostname" className={inputCls} value={s.hostname} placeholder="coderhelm.example.com" onChange={(e) => update({ hostname: e.target.value })} autoCapitalize="off" spellCheck={false} inputMode="url" />
                      </Field>
                    </div>
                  ) : null}
                </fieldset>
                <Field label="Send email from" htmlFor="ch-email-from" help="Optional. Empty uses your email: AWS emails you a link to confirm it, no DNS needed." error={errors.emailFrom}>
                  <input id="ch-email-from" type="email" className={inputCls} value={s.emailFrom} placeholder="coderhelm@example.com" onChange={(e) => update({ emailFrom: e.target.value })} autoCapitalize="off" spellCheck={false} />
                </Field>
                <Field label="Who else may sign up" htmlFor="ch-signup" help="Optional. Anyone with an email at this domain may create an account. Empty for only you; you can invite people later." error={errors.signupDomain}>
                  <input id="ch-signup" className={inputCls} value={s.signupDomain} placeholder="example.com" onChange={(e) => update({ signupDomain: e.target.value })} autoCapitalize="off" spellCheck={false} />
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Updates</legend>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-fd-primary)]"
                      checked={s.autoUpdate}
                      data-testid="auto-update"
                      onChange={(e) => {
                        let tz = s.updateTimezone;
                        try {
                          if (e.target.checked && tz === 'UTC') tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                        } catch {
                          /* keep UTC */
                        }
                        update({ autoUpdate: e.target.checked, updateTimezone: tz });
                      }}
                    />
                    <span>
                      <span className="block font-medium">Install new releases by themselves</span>
                      <span className="block text-sm text-fd-muted-foreground">In a maintenance window, health checked, rolled back if unhealthy. Off: admins get an email about each release.</span>
                    </span>
                  </label>
                  {s.autoUpdate ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Field label="Day" htmlFor="ch-day">
                        <select id="ch-day" className={inputCls} value={s.updateWindow.split(' ')[0]} onChange={(e) => update({ updateWindow: `${e.target.value} ${s.updateWindow.split(' ')[1] ?? '03:00'}` })}>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'daily'].map((d) => <option key={d} value={d}>{d === 'daily' ? 'Every day' : d}</option>)}
                        </select>
                      </Field>
                      <Field label="Hour" htmlFor="ch-hour">
                        <select id="ch-hour" className={inputCls} value={s.updateWindow.split(' ')[1] ?? '03:00'} onChange={(e) => update({ updateWindow: `${s.updateWindow.split(' ')[0]} ${e.target.value}` })}>
                          {Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`).map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </Field>
                      <Field label="Time zone" htmlFor="ch-tz" error={errors.updateTimezone}>
                        <input id="ch-tz" className={inputCls} value={s.updateTimezone} onChange={(e) => update({ updateTimezone: e.target.value.trim() })} autoCapitalize="off" spellCheck={false} />
                      </Field>
                    </div>
                  ) : null}
                </fieldset>
                <Field label="Install name" htmlFor="ch-stage" help="Change it to run a second CoderHelm in the same account." error={errors.stage}>
                  <input id="ch-stage" className={inputCls} value={s.stage} onChange={(e) => update({ stage: e.target.value.toLowerCase() })} autoCapitalize="off" spellCheck={false} />
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Models</legend>
                  {(
                    [
                      ['bedrock', 'Claude on Amazon Bedrock', 'Recommended. Runs in your AWS account; no API key.', <AwsLogo key="a" size={18} />],
                      ['anthropic', 'Anthropic API keys', 'Each team adds its own key after signing in.', <AnthropicLogo key="b" size={16} />],
                    ] as const
                  ).map(([id, title, help, logo]) => (
                    <label key={id} className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${s.provider === id ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input type="radio" name="provider" className="mt-1 accent-[var(--color-fd-primary)]" checked={s.provider === id} onChange={() => update({ provider: id })} />
                      <span>
                        <span className="flex items-center gap-2 font-medium">{logo}{title}</span>
                        <span className="block text-sm text-fd-muted-foreground">{help}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
            ) : null}
          </div>

          <div className="pt-2">
            <Primary type="submit" testId="launch">
              <AwsLogo size={26} />
              Open AWS with everything filled in
            </Primary>
            <p className="mt-3 text-sm text-fd-muted-foreground">Sign in to AWS if it asks. Then tick the box at the bottom of the page and press <b className="text-fd-foreground">Create stack</b>.</p>
          </div>
        </form>
        <Details summary="What happens in AWS">
          <p>A CloudFormation stack starts the installer in CodeBuild, inside your account. It downloads CoderHelm {s.version}, checks its signature and deploys CoderHelm: Lambda functions, DynamoDB tables, an S3 bucket, CloudFront and Cognito sign-in. Nothing to install on your computer.</p>
          <p>The box you tick lets the stack create IAM roles. The installer needs administrator rights in your account to create CoderHelm&apos;s own, narrower roles.</p>
          <p>{s.domainChoice === 'own' ? `Your domain: when its zone is in Route 53 in this account, the install makes the certificate and the records. Anywhere else, CoderHelm starts on its free cloudfront.net address and this page shows the two records to add; it moves to ${cleanHostname(s.hostname) || 'your domain'} once they work.` : 'No domain or DNS work: CoderHelm gets a free cloudfront.net address. You can add your own domain later, in More options or in CoderHelm.'}</p>
          <p>AWS bills your account for what CoderHelm uses. The services are pay per use, so an idle install costs little; model calls are most of the bill.</p>
          <p>Two random values from this page go along: a progress ID, so this page can follow the install, and a one-time setup key, so GitHub can hand your app&apos;s keys straight to your CoderHelm. Both stay in your account and this browser.</p>
        </Details>
      </section>
    );
  } else if (view === 'aws') {
    const launchedAgo = s.launchedAt ? Date.now() - s.launchedAt : 0;
    const failed = doc?.phase === 'failed';
    const answering = !!setup;
    const noSign = !doc && !s.url && launchedAgo > NO_SIGN_AFTER();
    const notAnswering = !!s.url && !setup && answeringSince !== null && Date.now() - answeringSince > NOT_ANSWERING_AFTER();
    const rows = progressRows(doc, answering, !!s.launchedAt);
    const title = failed ? 'The install stopped' : doc ? 'Creating your CoderHelm' : s.url ? 'Connecting to your CoderHelm' : 'Waiting for AWS';
    const lead = failed ? undefined : doc || s.url ? (
      'This takes about 20 minutes. You can close this page: open the same link later and it picks up here.'
    ) : (
      <>In the AWS tab, tick <b className="text-fd-foreground">I acknowledge that AWS CloudFormation might create IAM resources</b>, then press <b className="text-fd-foreground">Create stack</b>.</>
    );
    screen = (
      <section data-testid="screen-aws">
        <Heading title={title} lead={lead} />
        <ul className="divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="progress">
          {rows.map((r) => (
            <Row key={r.id} tone={r.status} title={r.label}>
              {r.id === 'deploy' && r.status === 'active' && doc?.steps ? (
                <span>
                  <span className="mb-1.5 block">Part {doc.step ?? 0} of {doc.steps}</span>
                  <span className="block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-fd-border">
                    <span className="block h-full rounded-full bg-fd-primary transition-all" style={{ width: `${Math.max(4, Math.round(((doc.step ?? 0) / doc.steps) * 100))}%` }} />
                  </span>
                </span>
              ) : r.id === 'answering' && r.status !== 'pending' ? (
                host
              ) : null}
            </Row>
          ))}
        </ul>
        {s.launchedAt && !failed && !answering ? <p className="mt-3 text-sm text-fd-muted-foreground">Started {elapsed(launchedAgo)} ago.</p> : null}

        {failed ? (
          <Notice tone="fail" title={doc?.message || 'The install stopped.'} testId="failure">
            {doc?.fix ? <p>{doc.fix}</p> : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Primary onClick={relaunch} testId="relaunch">
                <AwsLogo size={24} /> Launch again
              </Primary>
              {doc?.logUrl ? <Secondary href={doc.logUrl} newTab>Open the log</Secondary> : null}
            </div>
            <p className="mt-3">The new try uses the stack name {stackName({ stage: s.stage, attempt: s.attempt + 1 })}. You can delete the failed stack in CloudFormation afterwards.</p>
          </Notice>
        ) : null}

        {noSign ? (
          <Notice tone="warn" title="No sign of the install yet" testId="no-sign">
            <p>Did you press Create stack? If not, open AWS again. If you did, your account may keep the progress file private (S3 Block Public Access). The install still runs: when the stack says CREATE_COMPLETE, copy the CoderHelm address from its Outputs tab and paste it below.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Secondary href={quickCreateUrl(s)} newTab testId="reopen-aws">Open AWS again</Secondary>
              <Secondary href={stacksConsoleUrl(s.region)} newTab>See your stacks</Secondary>
            </div>
          </Notice>
        ) : null}

        {notAnswering ? (
          <Notice tone="warn" title="CoderHelm is deployed but not answering yet" testId="not-answering">
            <p>CloudFront can take a few minutes to reach every location. This page keeps trying.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Secondary onClick={() => void checkAgain()}>{checking ? 'Checking…' : 'Check again'}</Secondary>
              <Secondary href={s.url} newTab>Open {host}</Secondary>
            </div>
          </Notice>
        ) : null}

        {!failed && !answering && !noSign ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {!doc && !s.url ? <Secondary href={quickCreateUrl(s)} newTab testId="reopen-aws">Open AWS again</Secondary> : null}
            {!s.url ? (
              <Secondary onClick={() => setPasteOpen((v) => !v)} testId="paste-toggle">I have my CoderHelm address</Secondary>
            ) : null}
          </div>
        ) : null}
        {(pasteOpen || noSign) && !s.url ? (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              usePasted();
            }}
          >
            <label htmlFor="ch-paste" className="sr-only">Your CoderHelm address</label>
            <input id="ch-paste" className={`${inputCls} sm:flex-1`} placeholder="https://d1234abcd.cloudfront.net" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Secondary onClick={usePasted} testId="paste-use">Use this address</Secondary>
          </form>
        ) : null}
        {pasteError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pasteError}</p> : null}

        <Details summary="What is happening">
          <p>The installer runs in CodeBuild in your account. It writes its progress to a small file in your account (bucket coderhelm-setup-{s.statusId}) that this page reads: the phase, the step and, at the end, your CoderHelm address. Nothing else.</p>
          <p>Stack name: {stackName(s)}, in {REGIONS.find((r) => r.id === s.region)?.name ?? s.region}. Release {s.version}.</p>
        </Details>
      </section>
    );
  } else if (view === 'domain') {
    const d = findCheck(setup, 'domain');
    const code = d?.code;
    const text = d ? checkText(d) : { title: 'Checking your domain' };
    const dd = s.domainDoc;
    const mode = dd?.mode ?? 'external';
    const hostname = cleanHostname(s.hostname || dd?.hostname || '');
    const base = hostname ? baseDomain(hostname) : 'your domain';
    const records: DnsRecord[] = dd?.records ?? [];
    const rows = domainRows(code, mode);
    const p = DNS_PROVIDERS.find((x) => x.id === provider);
    const tone = d?.status === 'pass' ? 'pass' : d?.status === 'fail' ? 'fail' : d?.status === 'warn' ? 'warn' : 'todo';
    const show = records;
    screen = (
      <section data-testid="screen-domain">
        <Heading
          title={mode === 'route53' ? 'Setting up your domain' : 'Point your domain at CoderHelm'}
          lead={mode === 'route53'
            ? <>The zone for {base} is in Route 53 in your AWS account, so CoderHelm adds the records itself. This page checks each part.</>
            : <>Add two records where the DNS for {base} is hosted. This page checks them and moves CoderHelm to <b className="text-fd-foreground">{hostname}</b> once they work.</>}
        />
        <Notice tone={tone} title={text.title} testId="domain-status">
          {text.fix ? <p>{text.fix}</p> : null}
        </Notice>
        <ul className="mt-5 divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="domain-progress">
          {rows.map((r) => <Row key={r.id} tone={r.status} title={r.label} />)}
        </ul>

        {mode === 'external' && show.length ? (
          <div className="mt-6" data-testid="dns-records">
            <h2 className="text-lg font-semibold">The records to add</h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">Type CNAME for both. If the form shows .{base} after the name box, type only the short name.</p>
            <ol className="mt-3 space-y-4">
              {show.map((r, i) => (
                <li key={`${r.name}-${i}`} className="rounded-xl border border-fd-border p-4" data-testid={`record-${r.purpose}`}>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="rounded-full border border-fd-border px-2 py-0.5 text-xs font-normal text-fd-muted-foreground">{r.type}</span>
                    {r.purpose === 'certificate' ? 'For the certificate' : 'For the address'}
                  </div>
                  <p className="mt-1 text-sm text-fd-muted-foreground">
                    {r.purpose === 'certificate' ? 'Proves to AWS that the domain is yours. Keep it: AWS renews the certificate with it.' : 'Sends people who open your domain to CoderHelm.'}
                  </p>
                  <div className="mt-2 text-sm font-medium">Name <span className="font-normal text-fd-muted-foreground">(short name: <code className="wrap-anywhere font-mono text-[13px]">{relativeName(r.name, hostname)}</code>)</span></div>
                  <CopyBox text={r.name} testId={`record-${r.purpose}-name`} />
                  <div className="mt-3 text-sm font-medium">Value</div>
                  <CopyBox text={r.value} testId={`record-${r.purpose}-value`} />
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <Field label="Where is your domain's DNS?" htmlFor="ch-provider" help={p ? p.where : 'Pick one for where to add the records.'}>
                <select id="ch-provider" className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} data-testid="dns-provider">
                  <option value="">Choose…</option>
                  {DNS_PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        ) : null}
        {mode === 'external' && !records.length ? (
          <Notice tone="info" title="The records to add aren't readable here" testId="domain-no-records">
            <p>Your account keeps the progress file private. Sign up at {host || 'your CoderHelm'} and open Settings, System, Domain: it shows the same records and checks.</p>
          </Notice>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {p?.url ? (
            <Primary href={p.url} newTab testId="open-provider">Open {p.name.replace(/ \(.*\)$/, '')}</Primary>
          ) : null}
          <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
          <Secondary onClick={() => update({ domainSkipped: true })} testId="skip-domain">Skip for now</Secondary>
        </div>
        <p className="mt-3 text-sm text-fd-muted-foreground">This page checks again by itself every few seconds. Skip finishes the install on the AWS address; you can add the domain later in Settings, System.</p>
        <Details summary="Why this step comes before GitHub">
          <p>CoderHelm gives its address to GitHub when it creates its GitHub App. Doing the domain first means the app points at {hostname || 'your domain'} from the start.</p>
          <p>AWS issues the certificate once it sees the first record (usually within 30 minutes of it showing up). CoderHelm then moves to your domain by itself, which takes about 10 minutes, and keeps working on the AWS address meanwhile.</p>
          <p>The records are checked from your own install, through public DNS. This page reads only the results.</p>
        </Details>
      </section>
    );
  } else if (view === 'github') {
    const app = findCheck(setup, 'github_app');
    const installed = findCheck(setup, 'github_installed');
    const hasApp = app?.status === 'pass' || (installed && installed.status !== 'wait' && app === undefined);
    const o = outcome ? GITHUB_OUTCOMES[outcome.code] : undefined;
    const slug = outcome?.app || s.appSlug || undefined;
    // Without the slug (another device), the app list on GitHub has the Install button.
    const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : 'https://github.com/settings/apps';
    // One click when the install says it will take the app, or (before it can
    // say so) when this browser launched it with its setup key.
    const hasKey = !!s.setupToken && s.setupToken.length >= 32;
    const canManifest = hasKey && (setup?.github_manifest_ready === true || (setup?.github_manifest_ready === undefined && !!s.launchedAt));
    const manifest = JSON.stringify(githubManifest(s));
    screen = (
      <section data-testid="screen-github">
        <Heading
          title={hasApp ? 'Install the app on your repositories' : 'Connect GitHub'}
          lead={hasApp ? 'Pick the repositories CoderHelm may work on. You can add more later.' : 'Create CoderHelm’s own GitHub App. GitHub shows what it may do; you press Create GitHub App.'}
        />
        {o && (!o.ok || o.fix || !hasApp) ? (
          <Notice tone={o.ok ? (o.fix ? 'warn' : 'pass') : 'fail'} title={o.title} testId="github-outcome">
            {o.fix ? <p>{o.fix}</p> : null}
          </Notice>
        ) : null}

        {!hasApp ? (
          canManifest ? (
            <form ref={formRef} method="post" action={newAppUrl(orgMode ? s.org : '', s.setupToken)} className="mt-6 space-y-5">
              <input type="hidden" name="manifest" value={manifest} />
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Where should the app live?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    [false, 'My GitHub account'],
                    [true, 'An organization'],
                  ] as const).map(([org, label]) => (
                    <label key={label} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${orgMode === org ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input type="radio" name="where" checked={orgMode === org} onChange={() => setOrgMode(org)} className="accent-[var(--color-fd-primary)]" />
                      <span className="font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {orgMode ? (
                <Field label="Organization name" htmlFor="ch-org" help="As in github.com/your-org. You need to be an owner.">
                  <input id="ch-org" className={inputCls} value={s.org} onChange={(e) => update({ org: e.target.value.trim() })} placeholder="your-org" autoCapitalize="off" spellCheck={false} />
                </Field>
              ) : null}
              <div>
                <Primary type="submit" disabled={orgMode && !s.org} testId="create-app">
                  <GitHubLogo size={24} /> Create GitHub App on GitHub
                </Primary>
                <p className="mt-3 text-sm text-fd-muted-foreground">Its keys go straight from GitHub to your CoderHelm.</p>
              </div>
            </form>
          ) : (
            <Notice tone="info" title="Create the app from a terminal" testId="github-cli">
              <p>
                {s.setupToken && setup && !setup.github_manifest_ready
                  ? 'Your CoderHelm has no setup key from this page (it was installed another way, or the key was used), so GitHub can\u2019t hand the keys to it directly.'
                  : 'This browser no longer has the setup key from the launch, so GitHub can\u2019t hand the keys to your CoderHelm directly.'}{' '}
                Run this from a computer with Node.js 20 and AWS credentials for the account. It opens GitHub for the same one click.
              </p>
              <CopyBox text={cliGithubCommand(s)} testId="cli-command" />
              <div className="mt-4">
                <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
              </div>
            </Notice>
          )
        ) : (
          <div className="mt-2">
            <ul className="mb-6 divide-y divide-fd-border rounded-xl border border-fd-border px-4">
              <Row tone="pass" title={outcome?.code === 'created' ? GITHUB_OUTCOMES.created.title : checkText({ id: 'github_app', code: 'ok', status: 'pass' }).title}>{slug ? `github.com/apps/${slug}` : null}</Row>
              {installed ? (
                <Row tone={installed.status === 'pass' ? 'pass' : installed.status === 'fail' && installed.code !== 'not_installed' ? 'fail' : 'active'} title={checkText(installed).title}>
                  {installed.status !== 'pass' && installed.code !== 'not_installed' ? checkText(installed).fix : installed.status !== 'pass' ? 'Waiting for GitHub to tell your CoderHelm.' : null}
                </Row>
              ) : null}
            </ul>
            {installed?.code === 'app_rejected' || installed?.code === 'bad_key' ? <CopyBox text={`${cliGithubCommand(s)} --force`} /> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {installUrl ? (
                <Primary href={installUrl} newTab testId="install-app">
                  <GitHubLogo size={24} /> Install it on your repositories
                </Primary>
              ) : null}
              <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
            </div>
          </div>
        )}
        {o && !o.ok && canManifest ? <CopyBox text={cliGithubCommand(s)} /> : null}

        <Details summary="What the app may do">
          <ul className="space-y-1.5">
            {Object.entries(GITHUB_PERMISSIONS).map(([k, v]) => (
              <li key={k} className="flex flex-col sm:flex-row sm:gap-2">
                <span className="font-mono text-[13px] text-fd-foreground">{k}: {v}</span>
                <span>{PERMISSION_REASONS[k]}</span>
              </li>
            ))}
          </ul>
          <p>The app is private to you and sends its events to your CoderHelm at {host || 'your address'}. GitHub sends the app&apos;s keys to your CoderHelm, never to this page or to CoderHelm&apos;s servers.</p>
        </Details>
      </section>
    );
  } else if (view === 'models') {
    const m = findCheck(setup, 'models');
    const text = m ? checkText(m) : { title: 'Checking model access' };
    const models = ((m?.detail?.models as { id: string; status: string }[] | undefined) ?? []).filter((x) => x.status !== 'pass');
    const consoleUrl = m?.detail?.console_url as string | undefined;
    const ok = m?.status === 'pass' || m?.status === 'skip';
    screen = (
      <section data-testid="screen-models">
        <Heading title="Turn on Claude" lead="CoderHelm calls Claude through Amazon Bedrock in your account." />
        <Notice
          tone={ok ? 'pass' : m?.code === 'subscription_pending' ? 'warn' : ['use_case_required', 'access_denied', undefined].includes(m?.code) ? 'todo' : 'fail'}
          title={text.title}
          testId="models-status"
        >
          {text.fix ? <p>{text.fix}</p> : null}
          {models.length ? (
            <p className="mt-2">
              Models CoderHelm uses:{' '}
              {models.map((x, i) => (
                <span key={x.id}>
                  {i ? ', ' : ''}
                  <code className="rounded bg-fd-secondary px-1 py-0.5 font-mono text-[13px] text-fd-foreground">{x.id}</code>
                </span>
              ))}
            </p>
          ) : null}
        </Notice>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!ok && consoleUrl && m?.code !== 'subscription_pending' && m?.code !== 'iam_denied' && m?.code !== 'not_available' ? (
            <Primary href={consoleUrl} newTab testId="open-bedrock">
              <AnthropicLogo size={18} /> Open the Anthropic page in Bedrock
            </Primary>
          ) : null}
          <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
        </div>
        {!ok ? <p className="mt-3 text-sm text-fd-muted-foreground">This page checks again by itself every few seconds.</p> : null}
        <Details summary="Why this step">
          <p>Since late 2025 AWS turns on Bedrock models by itself, except Anthropic&apos;s: those need a short use case form, once per account (or once for your whole AWS Organization). Approval is usually immediate; the first call can take a few minutes while AWS sets up the subscription.</p>
          <p>Your install checks access by making one tiny call to each model it uses.</p>
        </Details>
      </section>
    );
  } else {
    const admin = findCheck(setup, 'admin');
    const extra = (setup?.checks ?? []).filter(
      (c: Check) => ['github_installed', 'models'].includes(c.id) || (c.id === 'admin' && c.code === 'unconfirmed'),
    ).filter((c) => c.status !== 'pass' && c.status !== 'skip');
    const optional = optionalSetup(s, setup);
    const optTone = (st: string): Tone => (st === 'done' || st === 'auto' ? 'pass' : st === 'todo' ? 'warn' : 'pending');
    screen = (
      <section data-testid="screen-ready">
        <Heading title="Your CoderHelm is ready" lead={<>It runs at <a className="font-medium text-fd-foreground underline decoration-fd-border underline-offset-4" href={s.url} target="_blank" rel="noopener noreferrer">{host}</a>.</>} />
        <div className="rounded-2xl border border-fd-border bg-fd-card/60 p-5">
          <p className="text-base">
            <b>Last step:</b> sign up with {s.email ? <b data-testid="admin-email">{s.email}</b> : 'your admin email'}. You become the admin.
          </p>
          <div className="mt-4">
            <Primary href={`${s.url}/?signup=1`} newTab testId="open-coderhelm">
              Open CoderHelm
            </Primary>
          </div>
          {admin?.status !== 'pass' ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-fd-muted-foreground" data-testid="waiting-signup">
              <StatusIcon tone="active" /> This page notices when you have signed up.
            </p>
          ) : null}
        </div>
        {extra.length ? (
          <ul className="mt-6 divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="ready-checks">
            {extra.map((c) => {
              const t = checkText(c);
              return (
                <Row key={c.id} tone={c.status === 'wait' ? 'active' : c.status} title={c.required === false ? <>{t.title} <span className="ml-1 rounded-full border border-fd-border px-2 py-0.5 text-xs font-normal text-fd-muted-foreground">Optional</span></> : t.title}>
                  {t.fix}
                </Row>
              );
            })}
          </ul>
        ) : null}
        {admin?.status === 'pass' ? <Notice tone="pass" title="You are signed up as the admin. Setup is complete." testId="complete" /> : null}
        {s.domainSkipped && s.domainChoice === 'own' ? (
          <Notice tone="info" title="Your domain is waiting" testId="domain-later">
            <p>CoderHelm runs on its AWS address for now. Add {cleanHostname(s.hostname)} any time in CoderHelm: Settings, System, Domain. It shows the same records and checks.</p>
            <div className="mt-3">
              <Secondary onClick={() => update({ domainSkipped: false })} testId="back-to-domain">Back to the domain step</Secondary>
            </div>
          </Notice>
        ) : null}

        <h2 className="mt-8 text-lg font-semibold">Optional setup</h2>
        <p className="mt-1 text-sm text-fd-muted-foreground">None of these is needed to start. Each says whether it is done, checked by your install where it can be.</p>
        <ul className="mt-3 divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="optional-setup">
          {optional.map((o) => (
            <li key={o.id} className="flex gap-3 py-3" data-optional={o.id} data-state={o.state}>
              <StatusIcon tone={optTone(o.state)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium leading-6">
                  {o.title}
                  <span className="rounded-full border border-fd-border px-2 py-0.5 text-xs font-normal text-fd-muted-foreground">
                    {o.state === 'done' ? 'Done' : o.state === 'auto' ? 'Done by the install' : o.state === 'todo' ? 'Not yet' : 'In CoderHelm'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-fd-muted-foreground">{o.why}</p>
                {o.fix && o.state === 'todo' ? <p className="mt-1 text-sm">{o.fix}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {o.action && o.state !== 'done' ? (
                    <a className="font-medium text-fd-primary hover:underline" href={o.action.href} target="_blank" rel="noopener noreferrer" data-testid={`optional-${o.id}-action`}>{o.action.label}</a>
                  ) : null}
                  <a className="text-fd-muted-foreground hover:text-fd-foreground hover:underline" href={o.doc}>How it works</a>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-lg font-semibold">Next</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ['Run your first task', 'Assign a GitHub issue to CoderHelm.', '/getting-started/first-run/'],
            ['Check your install', 'The same checks from a terminal, any time.', '/self-host/check-your-install/'],
          ].map(([t, d, href]) => (
            <li key={t}>
              <a href={href} className="block h-full rounded-xl border border-fd-border p-4 transition hover:bg-fd-accent">
                <span className="block font-medium">{t}</span>
                <span className="block text-sm text-fd-muted-foreground">{d}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Stepper steps={steps} current={view === 'start' ? 'aws' : view} done={done} onPick={(id) => setManual(id === derived ? null : id)} />
      {manual && manual !== derived ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-fd-border px-4 py-2 text-sm">
          <span className="text-fd-muted-foreground">You are looking at a finished step.</span>
          <button type="button" className="font-medium text-fd-primary hover:underline" onClick={() => setManual(null)}>Back to where you are</button>
        </div>
      ) : null}
      {screen}
      <footer className="mt-10 flex flex-col gap-3 border-t border-fd-border pt-5 text-sm text-fd-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <p className="flex gap-2" data-testid="privacy">
          <svg viewBox="0 0 16 16" width="16" height="16" className="mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
          <span>This page talks only to AWS, GitHub and your own CoderHelm. Nothing about your install goes to CoderHelm&apos;s servers.</span>
        </p>
        {s.launchedAt || s.url ? (
          <button type="button" onClick={startOver} className="shrink-0 font-medium hover:text-fd-foreground" data-testid="start-over">Start over</button>
        ) : null}
      </footer>
    </div>
  );
}
