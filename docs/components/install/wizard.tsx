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
import { MOVE_TO_SELF_HOST_URL } from '@/lib/shared';
import {
  type Check,
  type DnsRecord,
  type InstallState,
  type SetupStatus,
  type StatusDoc,
  type StepId,
  AWS_ACCOUNT_PAGE,
  CREATES,
  DNS_PROVIDERS,
  GITHUB_OUTCOMES,
  HYBRID_GITHUB_OUTCOMES,
  NAME_ZONE,
  SETUPS,
  STEP_TIME,
  type Setup,
  cleanName,
  hybridError,
  hybridRows,
  hybridUrl,
  monthlyCost,
  nameCheckUrl,
  nameProblem,
  LATEST_URL,
  GITHUB_LATEST_URL,
  notPublishedText,
  templateUrl,
  versionFromGithub,
  PERMISSION_REASONS,
  GITHUB_PERMISSIONS,
  REGIONS,
  STORAGE_LAST,
  STORAGE_PREFIX,
  TAG_RE,
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
  joinsByDomain,
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
import { AnthropicLogo, AwsColorLogo, AwsLogo, GitHubLogo } from './logos';
import { track } from '@/components/analytics';
import { GUIDE_TRUST, installStepEvent } from '@/lib/analytics';

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

function load(): { state: InstallState; github?: string; app?: string; hybridGithub?: string } {
  const partial = queryToPartial(window.location.search);
  const { github, app, hybridGithub, ...fromUrl } = partial;
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
  return { state, github, app, hybridGithub };
}

/**
 * A call to the install's hybrid setup endpoints: a simple cross-origin POST
 * (the setup key in a text/plain body, so the browser sends no preflight).
 */
async function postInstall(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  try {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'text/plain' }, credentials: 'omit', cache: 'no-store' });
    let b: Record<string, unknown> | null = null;
    try {
      b = await r.json();
    } catch {
      b = null;
    }
    return { ok: r.ok, status: r.status, body: b };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** How far the install is, as a share of its usual 20 minutes. */
function livePercent(doc: StatusDoc | null, answering: boolean): number {
  if (answering) return 100;
  if (!doc) return 3;
  switch (doc.phase) {
    case 'starting': return 6;
    case 'preparing': return 14;
    case 'deploying': return Math.round(20 + 68 * ((doc.step ?? 0) / Math.max(1, doc.steps ?? 10)));
    case 'finishing': return 92;
    case 'done': return 97;
    default: return 0;
  }
}

/** The install's progress, alive: the share done, time left and a moving bar. */
function LiveProgress({ doc, answering, launchedAt, failed }: { doc: StatusDoc | null; answering: boolean; launchedAt: number | null; failed: boolean }) {
  const pct = livePercent(doc, answering);
  // Time left from how far it is (20 minutes in all), never less than a minute.
  void launchedAt;
  const left = Math.max(1, Math.round((20 * (100 - pct)) / 100));
  return (
    <div className="mb-5 rounded-2xl border border-fd-border bg-fd-card/50 p-4 sm:p-5" data-testid="live-progress">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{failed ? '–' : `${pct}%`}</span>
        <span className="text-sm text-fd-muted-foreground">{failed ? 'Stopped' : answering ? 'Done' : doc ? `About ${left} minute${left === 1 ? '' : 's'} left` : 'Waiting for AWS to start'}</span>
      </div>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-fd-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Install progress">
        <span className={`absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-700 ease-out ${failed ? 'bg-red-500' : answering ? 'bg-emerald-500' : 'bg-fd-primary'}`} style={{ width: `${Math.max(3, pct)}%` }}>
          {!failed && !answering ? <span className="ch-shimmer absolute inset-0" /> : null}
        </span>
      </div>
      <style>{`.ch-shimmer{background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);background-size:200% 100%;animation:ch-shimmer 1.6s linear infinite}@keyframes ch-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.ch-shimmer{animation:none}}`}</style>
    </div>
  );
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

/**
 * Whether a release's template is in the public bucket. The bucket answers
 * 403 for a key that isn't there, which CloudFormation would show as a bare
 * "S3 Access Denied", so the guide asks first.
 */
async function templateExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit' });
    return r.ok;
  } catch {
    return false;
  }
}

/** The newest release: launch/latest.json, else GitHub's latest release; null when neither names one. */
async function newestRelease(): Promise<string | null> {
  const latest = await getJson(LATEST_URL);
  const fromFile = latest.ok ? pickVersion(latest.body) : null;
  if (fromFile) return fromFile;
  const gh = await getJson(GITHUB_LATEST_URL);
  return gh.ok ? versionFromGithub(gh.body) : null;
}

type Release = { state: 'checking' } | { state: 'ready'; version: string } | { state: 'missing'; version: string | null };

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

type Brand = 'aws' | 'github' | 'anthropic' | 'plain';

/** The primary button: one per screen. A provider's own look when it opens that provider. */
function Primary({ children, href, onClick, disabled, type = 'button', newTab, testId, brand = 'plain' }: {
  children: React.ReactNode; href?: string; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; newTab?: boolean; testId?: string; brand?: Brand;
}) {
  const look = {
    aws: 'bg-[#232F3E] text-white ring-1 ring-inset ring-white/10 hover:bg-[#2b394c]',
    github: 'bg-[#1f2328] text-white ring-1 ring-inset ring-white/10 hover:bg-[#2b3036]',
    anthropic: 'bg-[#1f1e1d] text-[#f5f0e8] ring-1 ring-inset ring-white/10 hover:bg-[#2a2826]',
    plain: 'bg-fd-primary text-fd-primary-foreground hover:opacity-90',
  }[brand];
  const cls = `group/btn inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-base font-semibold shadow-sm transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${look}`;
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

type RailCheck = { id: string; label: string; status: RowStatusLike };
type RowStatusLike = 'pass' | 'fail' | 'active' | 'pending';

/**
 * The steps on the left: each one's state, how long it takes, and, for the
 * step under way, its checks as they pass. Done steps can be opened again.
 */
function StepsRail({ steps, current, done, onPick, checks }: {
  steps: { id: StepId; label: string }[]; current: StepId; done: Set<StepId>; onPick: (s: StepId) => void; checks: RailCheck[];
}) {
  return (
    <ol className="relative space-y-1" aria-label="Install steps">
      {steps.map((st, i) => {
        const isCurrent = st.id === current;
        const isDone = done.has(st.id) && !isCurrent;
        const can = isDone || isCurrent;
        return (
          <li key={st.id} className="relative">
            {i < steps.length - 1 ? (
              <span aria-hidden className={`absolute left-[15px] top-9 h-[calc(100%-20px)] w-px ${isDone ? 'bg-emerald-500/50' : 'bg-fd-border'}`} />
            ) : null}
            <button
              type="button"
              disabled={!can}
              onClick={() => onPick(st.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`relative flex w-full items-start gap-3 rounded-xl px-0 py-2 text-left transition disabled:cursor-default ${can && !isCurrent ? 'hover:opacity-80' : ''}`}
            >
              <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
                isDone ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : isCurrent ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground shadow-[0_0_0_4px] shadow-fd-primary/15'
                  : 'border-fd-border bg-fd-background text-fd-muted-foreground'}`}>
                {isDone ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                ) : i + 1}
              </span>
              <span className="min-w-0 pt-1">
                <span className={`block text-sm font-semibold leading-5 ${isCurrent ? 'text-fd-foreground' : isDone ? 'text-fd-foreground/80' : 'text-fd-muted-foreground'}`}>{st.label}</span>
                <span className="block text-xs leading-5 text-fd-muted-foreground">{isDone ? 'Done' : STEP_TIME[st.id]}</span>
              </span>
            </button>
            {isCurrent && checks.length ? (
              <ul className="mb-2 ml-11 space-y-1.5 border-l border-transparent" data-testid="rail-checks">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-xs leading-5" data-rail-status={c.status}>
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${c.status === 'pass' ? 'bg-emerald-500' : c.status === 'fail' ? 'bg-red-500' : c.status === 'active' ? 'animate-pulse bg-fd-primary' : 'bg-fd-border'}`} />
                    <span className={c.status === 'pending' ? 'text-fd-muted-foreground/70' : 'text-fd-muted-foreground'}>{c.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Phones: the step, its number and a progress bar, in one line. */
function MobileSteps({ steps, current }: { steps: { id: StepId; label: string }[]; current: StepId }) {
  const at = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <div className="mb-5 lg:hidden" data-testid="mobile-steps">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">Step {at + 1} of {steps.length}: {steps[at]?.label}</span>
        <span className="shrink-0 text-xs text-fd-muted-foreground">{STEP_TIME[steps[at]?.id ?? 'aws']}</span>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.id} className={`h-1 flex-1 rounded-full transition-colors ${i < at ? 'bg-emerald-500' : i === at ? 'bg-fd-primary' : 'bg-fd-border'}`} />
        ))}
      </div>
    </div>
  );
}

/** Small trust cues under the steps: open source, where it runs, what leaves the account. */
function TrustCard({ hybrid }: { hybrid: boolean }) {
  return (
    <div className="mt-8 space-y-3 rounded-2xl border border-fd-border bg-fd-card/40 p-4 text-xs leading-5 text-fd-muted-foreground" data-testid="trust">
      <p className="flex gap-2"><Dot />Runs in your AWS account. You own every resource.</p>
      <p className="flex gap-2"><Dot /><span>Source available: <a className="font-medium text-fd-foreground underline decoration-fd-border underline-offset-2 hover:decoration-fd-foreground" href="https://github.com/CoderHelm/coderhelm-platform" target="_blank" rel="noopener noreferrer">read the code</a>.</span></p>
      <p className="flex gap-2"><Dot />{hybrid ? <span>Hybrid: GitHub events pass through CoderHelm, never your code. <a className="font-medium text-fd-foreground underline decoration-fd-border underline-offset-2 hover:decoration-fd-foreground" href="/self-host/hybrid/#trust-model">Exactly what</a></span> : 'Fully private: nothing about your install reaches CoderHelm.'}</p>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fd-muted-foreground/60" />;
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
      {lead ? <p className="mt-2 text-pretty text-base leading-relaxed text-fd-muted-foreground">{lead}</p> : null}
    </header>
  );
}

type NameState = { kind: 'idle' | 'checking' | 'free' | 'taken' | 'reserved' | 'problem' | 'offline'; text?: string };

/** The verdict word before the reason, so the answer reads at a glance. */
const NAME_VERDICT: Partial<Record<NameState['kind'], string>> = { free: 'Available', taken: 'Taken', reserved: 'Reserved', problem: 'Not allowed' };

/**
 * A CoderHelm address: the name, with the suffix shown, checked with
 * CoderHelm as people type (the rules first, then whether it's free).
 */
function NamePicker({ value, onChange, error, testId = 'name-picker', compact }: { value: string; onChange: (v: string) => void; error?: string; testId?: string; compact?: boolean }) {
  const [st, setSt] = useState<NameState>({ kind: 'idle' });
  const name = cleanName(value);
  useEffect(() => {
    if (!value.trim()) {
      setSt({ kind: 'idle' });
      return;
    }
    const p = nameProblem(value);
    if (p) {
      setSt({ kind: 'problem', text: p });
      return;
    }
    setSt({ kind: 'checking' });
    let live = true;
    const t = setTimeout(async () => {
      const r = await getJson(nameCheckUrl(value));
      if (!live) return;
      const b = r.body as { available?: unknown; error?: unknown; code?: unknown } | null;
      // Only a failed request (or an answer that isn't one) is "couldn't check".
      if (!r.ok || !b || typeof b.available !== 'boolean') setSt({ kind: 'offline', text: 'Couldn’t check right now. You can go on: your install claims it later and says if it’s taken.' });
      else if (b.available) setSt({ kind: 'free' });
      else {
        const kind = b.code === 'taken' ? 'taken' : b.code === 'reserved' ? 'reserved' : 'problem';
        const fallback = kind === 'taken' ? 'That name is taken. Try another one.' : kind === 'reserved' ? 'That name is reserved. Try another one.' : 'That name can’t be used.';
        setSt({ kind, text: typeof b.error === 'string' && b.error ? b.error : fallback });
      }
    }, timing('__CH_NAME_DEBOUNCE_MS', 350));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value]);
  const tone = st.kind === 'free' ? 'border-emerald-500/60 focus-within:ring-emerald-500/30' : st.kind === 'taken' || st.kind === 'reserved' || st.kind === 'problem' || error ? 'border-red-500/60 focus-within:ring-red-500/30' : 'border-fd-border focus-within:border-fd-primary focus-within:ring-fd-ring/40';
  return (
    <div data-testid={testId} data-name-state={st.kind}>
      <label htmlFor={`${testId}-input`} className="mb-1.5 block text-sm font-medium">{compact ? 'Another name' : 'Your CoderHelm address name'}</label>
      <div className={`flex min-h-12 items-stretch overflow-hidden rounded-xl border bg-fd-background transition focus-within:ring-2 ${tone}`}>
        <input
          id={`${testId}-input`}
          className="min-w-0 flex-1 bg-transparent px-3.5 text-base outline-none"
          value={value}
          placeholder="yourname"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
        <span className="flex items-center border-l border-fd-border bg-fd-secondary/60 px-3 text-sm text-fd-muted-foreground">.{NAME_ZONE}</span>
      </div>
      <p className="mt-1.5 flex min-h-5 items-center gap-1.5 text-sm" aria-live="polite" data-testid={`${testId}-status`}>
        {error && st.kind === 'idle' ? <span className="text-red-600 dark:text-red-400">{error}</span>
          : st.kind === 'checking' ? <span className="text-fd-muted-foreground">Checking {name}.{NAME_ZONE}…</span>
          : st.kind === 'free' ? <span className="text-emerald-700 dark:text-emerald-400"><strong className="font-semibold" data-testid={`${testId}-verdict`}>{NAME_VERDICT.free}:</strong> {name}.{NAME_ZONE} is free. It’s claimed for you once your install answers.</span>
          : st.kind === 'taken' || st.kind === 'reserved' || st.kind === 'problem' ? <span className="text-red-600 dark:text-red-400"><strong className="font-semibold" data-testid={`${testId}-verdict`}>{NAME_VERDICT[st.kind]}:</strong> {st.text}</span>
          : st.kind === 'offline' ? <span className="text-fd-muted-foreground">{st.text}</span>
          : <span className="text-fd-muted-foreground">Lowercase letters, digits and hyphens. Your company’s name works well.</span>}
      </p>
    </div>
  );
}

function Toggle({ checked, onChange, title, help, testId }: { checked: boolean; onChange: (v: boolean) => void; title: string; help: string; testId: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-fd-border p-3.5 transition hover:border-fd-foreground/25">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span aria-hidden className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-fd-ring ${checked ? 'bg-fd-primary' : 'bg-fd-border'}`}>
        <span className={`size-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-6">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-fd-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

/** One line for teams coming from the hosted service: a person helps them move. */
function MovingNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-sm text-fd-muted-foreground ${className}`} data-testid="moving-note">
      Moving from CoderHelm cloud?{' '}
      <a className="font-medium text-fd-primary hover:underline" href={MOVE_TO_SELF_HOST_URL}>Talk to us</a>{' '}
      and we&apos;ll help move your data.
    </p>
  );
}

/** What will be created, where it will answer and what it costs, before anyone opens AWS. */
function Summary({ s, cost }: { s: InstallState; cost: { low: number; high: number; model: string } }) {
  const address = s.domainChoice === 'coderhelm'
    ? `${cleanName(s.coderhelmName) || 'yourname'}.${NAME_ZONE}`
    : s.domainChoice === 'own' ? cleanHostname(s.hostname) || 'your domain' : 'a cloudfront.net address';
  return (
    <section className="rounded-2xl border border-fd-border bg-fd-card/50" aria-label="Summary" data-testid="summary">
      <div className="grid gap-px overflow-hidden rounded-2xl bg-fd-border sm:grid-cols-3">
        {[
          ['Address', address],
          ['GitHub', s.githubChoice === 'hosted' ? 'CoderHelm’s app' : 'Your own app'],
          ['AWS cost', `about $${cost.low} to $${cost.high} a month`],
        ].map(([k, v]) => (
          <div key={k} className="bg-fd-card px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">{k}</div>
            <div className="mt-0.5 text-sm font-semibold wrap-anywhere">{v}</div>
          </div>
        ))}
      </div>
      <details className="group px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fd-muted-foreground marker:hidden hover:text-fd-foreground">
          <svg viewBox="0 0 16 16" width="12" height="12" className="transition group-open:rotate-90" fill="currentColor" aria-hidden><path d="M6 3.5l5 4.5-5 4.5z" /></svg>
          What gets created in {REGIONS.find((r) => r.id === s.region)?.name ?? s.region}
        </summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CREATES.map((c) => (
            <li key={c.what} className="rounded-lg bg-fd-secondary/50 px-3 py-2">
              <span className="block font-medium">{c.what}</span>
              <span className="block text-xs text-fd-muted-foreground">{c.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-fd-muted-foreground">A small team&apos;s estimate; most of it scales with use. Not included: {cost.model.charAt(0).toLowerCase() + cost.model.slice(1)}.</p>
      </details>
      <MovingNote className="border-t border-fd-border px-4 py-3" />
    </section>
  );
}

/** A name or path in the disclosure, kept whole on wide screens and wrapped on phones. */
function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-fd-secondary px-1 py-0.5 font-mono text-[12.5px] wrap-anywhere">{children}</code>;
}

const linkCls = 'font-medium text-fd-foreground underline decoration-fd-border underline-offset-2 hover:decoration-fd-foreground';

/**
 * What the Launch Stack does in the person's AWS account, before they open
 * AWS: every resource and role in a few lines, then the risks and what to do
 * about them. The full page is AWS_ACCOUNT_PAGE.
 *
 * ADMIN ROLE: the installer's role is the AWS managed AdministratorAccess
 * policy today (infra/cfn/coderhelm-selfhost-launch.yaml, InstallerRole, in
 * coderhelm-platform). When the scoped installer role with a permissions
 * boundary ships there, update the lines marked ADMIN ROLE here and the parts
 * of content/self-host-site/aws-account.mdx its front matter names.
 */
function AccountDisclosure({ s, hybrid }: { s: InstallState; hybrid: boolean }) {
  const item = 'flex gap-2.5';
  return (
    <section className="rounded-2xl border border-fd-border bg-fd-card/50 p-4 text-sm sm:p-5" aria-labelledby="ch-account-title" data-testid="account-disclosure">
      <h2 id="ch-account-title" className="text-base font-semibold">What this creates in your AWS account</h2>
      <ul className="mt-3 space-y-2.5 leading-relaxed text-fd-muted-foreground">
        <li className={item}><Dot /><span>A CloudFormation stack, <Mono>{stackName(s)}</Mono>, that runs the installer once.</span></li>
        {/* ADMIN ROLE */}
        <li className={item} data-testid="disclosure-admin"><Dot /><span><span className="font-medium text-fd-foreground">An installer in CodeBuild with full administrator rights</span> (the AWS managed AdministratorAccess policy). It downloads the CoderHelm release, checks its signatures and checksums, and only then deploys it.</span></li>
        <li className={item}><Dot /><span>CoderHelm itself: Lambda functions, DynamoDB tables, S3 buckets, CloudFront, Cognito, queues, and a role for each service with only what that service uses. Also CDK&apos;s setup stack, CDKToolkit, if this region has none yet.</span></li>
        <li className={item}><Dot /><span>A small function that starts the installer. Its role can only start that build and write the progress file.</span></li>
        <li className={item}><Dot /><span>A progress bucket, <Mono>coderhelm-setup-&lt;id&gt;</Mono>, with one file: the install&apos;s progress and, at the end, its address. No emails, keys or account numbers. It is public if your account allows it, the file expires after 30 days, and the bucket stays when you delete the stack.</span></li>
        <li className={item}><Dot /><span><span className="font-medium text-fd-foreground">No access for CoderHelm the company.</span> No role for another account, and nothing that trusts an account outside yours.{hybrid ? <> Hybrid adds no AWS access either: <a className={linkCls} href="/self-host/hybrid/#trust-model">what CoderHelm sees</a>.</> : null}</span></li>
      </ul>
      <Details summary="Risks and how to reduce them">
        <div data-testid="disclosure-risks" className="space-y-3">
          {/* ADMIN ROLE */}
          <p><b className="text-fd-foreground">The installer has full admin rights.</b> Anyone in your account who can start or change its CodeBuild project can act as an admin. Keep CodeBuild and IAM rights to the people who already run this account. Once CoderHelm is running, you can delete the stack: that removes the installer and its role, and CoderHelm keeps running.</p>
          <p><b className="text-fd-foreground">Updates deploy new release code with broad rights.</b> They run in their own build and deploy through the CDK roles in your account, which have administrator rights by default. Before anything runs, the release is checked: its tag must be on main and signed by a CoderHelm maintainer or attested by CoderHelm&apos;s release workflow, and its files must carry that workflow&apos;s signature and match their checksums. If CoderHelm&apos;s release pipeline were ever broken into, automatic updates would bring that into your account. They are off unless you turn them on in More options, and you can turn them off any time in Settings, System; then an admin starts each update.</p>
          <p><b className="text-fd-foreground">The progress file is public while the install runs.</b> It holds only the install&apos;s progress and address. If your account blocks public access to S3, that&apos;s fine: the install still runs, and this page asks you for the address from the stack&apos;s Outputs.</p>
          <p><b className="text-fd-foreground">The AWS link holds your one-time setup key.</b> Don&apos;t share it or paste it anywhere. Until your GitHub App exists, someone with the key could give your install a GitHub App of their own. The link to this page holds no secret.</p>
        </div>
      </Details>
      <p className="mt-4 text-sm">
        <a className={linkCls} href={AWS_ACCOUNT_PAGE} data-testid="disclosure-page">Everything it creates, what each part can do, and how to remove it</a>
      </p>
    </section>
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
  const [release, setRelease] = useState<Release>({ state: 'checking' });
  const [releaseTry, setReleaseTry] = useState(0);
  const [, tick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Load what this browser and the address bar remember.
  useEffect(() => {
    const { state, github, app, hybridGithub } = load();
    setS(state);
    if (state.org) setOrgMode(true);
    if (github) setOutcome({ code: github, app });
    if (hybridGithub) setHybridOutcome(hybridGithub);
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

  // The newest release, and whether its template is published: before launch, and
  // for an install resumed from its link on another device (which doesn't know
  // its release). No hard-coded fallback: a version without a template can't launch.
  const knowsRelease = !!s && TAG_RE.test(s.version);
  useEffect(() => {
    if (!s || (s.launchedAt && knowsRelease)) return;
    let live = true;
    setRelease({ state: 'checking' });
    void (async () => {
      const version = await newestRelease();
      const ok = version ? await templateExists(templateUrl(version)) : false;
      if (!live) return;
      if (version && ok) {
        setRelease({ state: 'ready', version });
        setS((p) => (p && (!p.launchedAt || !TAG_RE.test(p.version)) ? { ...p, version } : p));
      } else {
        setRelease({ state: 'missing', version });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.launchedAt, knowsRelease, releaseTry]);

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
  // Analytics counts the step reached, by name only.
  const loaded = s !== null;
  useEffect(() => {
    if (loaded) track(installStepEvent(view));
  }, [view, loaded]);
  const steps = stepsFor({ domainChoice: s?.domainChoice ?? 'aws' });
  const done = useMemo(() => {
    const order: StepId[] = ['aws', 'domain', 'address', 'github', 'models', 'ready'];
    const i = order.indexOf(derived);
    return new Set<StepId>(i < 0 ? [] : order.slice(0, i));
  }, [derived]);
  const [provider, setProvider] = useState('');
  // Hybrid: register, send the choices, claim the name, all by themselves.
  const [hyb, setHyb] = useState<{ error: { title: string; fix: string } | null; claimRefused: boolean; settingsSent: boolean; lastTry: number; busy: boolean }>({ error: null, claimRefused: false, settingsSent: false, lastTry: 0, busy: false });
  const [newName, setNewName] = useState('');
  const [hybridOutcome, setHybridOutcome] = useState<string | null>(null);
  const hybridWanted = !!s && (s.domainChoice === 'coderhelm' || s.githubChoice === 'hosted' || s.emailTransport === 'coderhelm');
  useEffect(() => {
    if (!s || !hybridWanted || !s.url || !setup || !s.setupToken || hyb.busy) return;
    if (Date.now() - hyb.lastTry < timing('__CH_HYBRID_RETRY_MS', 8000)) return;
    const reg = findCheck(setup, 'hybrid_registered');
    const nm = findCheck(setup, 'hybrid_name');
    let path: '' | '/register' | '/name' | '/settings' | null = null;
    let body: Record<string, unknown> = { setup_token: s.setupToken };
    if (!reg || reg.code === 'not_registered') path = '/register';
    else if (reg.status !== 'pass') path = '';
    else if (!hyb.settingsSent) {
      path = '/settings';
      body = { ...body, github_mode: s.githubChoice, sharing: { enabled: s.sharing, payloads: false } };
    } else if (s.domainChoice === 'coderhelm' && !nm && !hyb.claimRefused && cleanName(s.coderhelmName)) {
      path = '/name';
      body = { ...body, name: cleanName(s.coderhelmName) };
    }
    if (path === null) return;
    setHyb((h) => ({ ...h, busy: true, lastTry: Date.now() }));
    void postInstall(hybridUrl(s.url, path), body).then(async (r) => {
      const code = (r.body?.code as string | undefined) ?? undefined;
      const refused = path === '/name' && !r.ok && (code === 'taken' || code === 'reserved');
      setHyb((h) => ({
        ...h,
        busy: false,
        settingsSent: h.settingsSent || (path === '/settings' && r.ok),
        claimRefused: h.claimRefused || refused,
        error: r.ok ? null : hybridError(code, r.status === 0 ? 'Your CoderHelm didn’t answer.' : (r.body?.error as string) ?? 'Your CoderHelm refused the request.'),
      }));
      if (r.ok) await refresh(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, hybridWanted, s?.url, hyb.busy, hyb.settingsSent, hyb.claimRefused]);

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
    if (release.state !== 'ready') return;
    setTouched(true);
    const problems = Object.keys(validate(s));
    if (problems.length) {
      // A problem inside More options opens it, so the sentence is seen.
      if (problems.some((k) => k !== 'email' && k !== 'region')) setShowMore(true);
      return;
    }
    const next = { ...s, version: release.version, email: s.email.trim(), hostname: s.domainChoice === 'own' ? cleanHostname(s.hostname) : '', domainDoc: null, domainSkipped: false, launchedAt: Date.now() };
    setS(next);
    setDoc(null);
    setManual(null);
    window.open(quickCreateUrl(next), '_blank', 'noopener');
  };

  const relaunch = () => {
    if (!TAG_RE.test(s.version)) return;
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
      localStorage.removeItem(STORAGE_PREFIX + s.statusId);
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
    const cost = monthlyCost(s.provider);
    const hybrid = s.setup === 'hybrid';
    const pickSetup = (id: Setup) =>
      update(id === 'hybrid'
        ? { setup: 'hybrid', domainChoice: 'coderhelm', githubChoice: 'hosted' }
        : { setup: 'private', domainChoice: s.domainChoice === 'coderhelm' ? 'aws' : s.domainChoice, githubChoice: 'own' });
    screen = (
      <section data-testid="screen-start">
        <Heading title="Install CoderHelm in your AWS account" lead="About 25 minutes, mostly waiting. You press a few buttons; this page does the rest and checks every step." />
        <form
          className="space-y-7"
          onSubmit={(e) => {
            e.preventDefault();
            launch();
          }}
          noValidate
        >
          <fieldset data-testid="setup-choice">
            <legend className="mb-3 text-sm font-semibold">Choose a setup</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SETUPS.map((x) => {
                const on = s.setup === x.id;
                return (
                  <label
                    key={x.id}
                    data-setup={x.id}
                    className={`relative flex cursor-pointer flex-col rounded-2xl border p-4 transition sm:p-5 ${on ? 'border-fd-primary bg-fd-primary/[0.06] shadow-[0_0_0_3px] shadow-fd-primary/15' : 'border-fd-border bg-fd-background hover:border-fd-foreground/25'}`}
                  >
                    <input type="radio" name="setup" className="sr-only" checked={on} onChange={() => pickSetup(x.id)} />
                    <span className="flex items-center gap-3">
                      <span className={`flex size-9 items-center justify-center rounded-xl ${on ? 'bg-fd-primary text-fd-primary-foreground' : 'bg-fd-secondary text-fd-muted-foreground'}`}>
                        {x.id === 'private' ? (
                          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 016 0V9" /></svg>
                        ) : (
                          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1" /><path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1" /></svg>
                        )}
                      </span>
                      <span className="font-semibold">{x.title}</span>
                      {x.tag ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{x.tag}</span> : null}
                      <span aria-hidden className={`ml-auto flex size-5 items-center justify-center rounded-full border-2 ${on ? 'border-fd-primary' : 'border-fd-border'}`}>
                        {on ? <span className="size-2.5 rounded-full bg-fd-primary" /> : null}
                      </span>
                    </span>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {x.gets.map((g) => (
                        <li key={g} className="flex gap-2">
                          <svg viewBox="0 0 16 16" width="14" height="14" className="mt-[3px] shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-fd-border pt-3 text-xs leading-5 text-fd-muted-foreground">{x.tradeoff}</p>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your email" htmlFor="ch-email" help="You will be the first admin." error={errors.email}>
              <input id="ch-email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" className={inputCls} value={s.email} onChange={(e) => update({ email: e.target.value })} />
            </Field>
            <Field label="AWS region" htmlFor="ch-region" help="Pick the one closest to your team." error={errors.region}>
              <select id="ch-region" className={`${inputCls} appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10`} value={s.region} onChange={(e) => update({ region: e.target.value })}
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E\")" }}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {s.domainChoice === 'coderhelm' ? <NamePicker value={s.coderhelmName} onChange={(v) => update({ coderhelmName: v })} error={errors.coderhelmName} /> : null}

          {hybrid ? (
            <fieldset className="space-y-3" data-testid="hybrid-options">
              <legend className="mb-1 text-sm font-semibold">What CoderHelm sets up for you</legend>
              <Toggle
                checked={s.githubChoice === 'hosted'}
                onChange={(v) => update({ githubChoice: v ? 'hosted' : 'own' })}
                testId="hosted-github"
                title="Use CoderHelm’s GitHub App"
                help="Install one app on your organization instead of creating your own. Events come through CoderHelm, checked and re-signed; your install gets short-lived tokens only for the repositories you pick."
              />
              <Toggle
                checked={s.sharing}
                onChange={(v) => update({ sharing: v })}
                testId="share-deliveries"
                title="Share delivery data with CoderHelm support"
                help="Off unless you turn it on. Support sees which deliveries failed and why (source, event type, status, reason, attempts and timings) and can warn you about relay failures. Never headers, never payloads. Your own Deliveries page works either way."
              />
            </fieldset>
          ) : null}

          <div>
            <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-fd-primary hover:underline" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              <svg viewBox="0 0 16 16" width="12" height="12" className={`transition ${showMore ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden><path d="M6 3.5l5 4.5-5 4.5z" /></svg>
              {showMore ? 'Fewer options' : 'More options'}
            </button>
            {showMore ? (
              <div className="mt-4 space-y-6 rounded-xl border border-fd-border p-4">
                <fieldset data-testid="domain-choice">
                  <legend className="mb-2 text-sm font-medium">Web address</legend>
                  {(
                    [
                      ['aws', 'The AWS address', 'Free and ready right away, like d1234abcd.cloudfront.net. You can add a domain later.'],
                      ['coderhelm', 'A CoderHelm address', 'Like yourname.coderhelm.com. CoderHelm sets up the DNS for you; the certificate stays in your AWS account.'],
                      ['own', 'My own domain', 'Like coderhelm.example.com. Set up for you when its zone is in Route 53 in this AWS account; anywhere else you add two DNS records.'],
                    ] as const
                  ).map(([id, title, help]) => (
                    <label key={id} className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${s.domainChoice === id ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input type="radio" name="domain" className="mt-1 accent-[var(--color-fd-primary)]" checked={s.domainChoice === id} onChange={() => update({ domainChoice: id, ...(id === 'coderhelm' ? { setup: 'hybrid' as const } : {}) })} />
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
                <fieldset data-testid="email-choice">
                  <legend className="mb-2 text-sm font-medium">Send email</legend>
                  {([
                    ['coderhelm', 'Send email through CoderHelm (easiest)', 'No Amazon SES setup. CoderHelm sees each recipient’s address and the email’s details (such as names and PR titles), and keeps only delivery records. Needs your install registered with CoderHelm, which this page does.'],
                    ['ses', 'Through my own Amazon SES', 'Email leaves from your AWS account. Nothing passes through CoderHelm.'],
                  ] as const).map(([id, title, help]) => (
                    <label key={id} className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${s.emailTransport === id ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input type="radio" name="email-transport" className="mt-1 accent-[var(--color-fd-primary)]" checked={s.emailTransport === id} onChange={() => update({ emailTransport: id })} />
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="block text-sm text-fd-muted-foreground">{help}</span>
                      </span>
                    </label>
                  ))}
                  {s.emailTransport === '' ? (
                    <p className="text-sm text-fd-muted-foreground">Not chosen: email goes through your own Amazon SES until you pick in Settings, Emails.</p>
                  ) : null}
                  {s.emailTransport !== 'coderhelm' ? (
                    <div className="mt-3">
                      <Field label="Send email from" htmlFor="ch-email-from" help="Optional. Empty uses your email: AWS emails you a link to confirm it, no DNS needed." error={errors.emailFrom}>
                        <input id="ch-email-from" type="email" className={inputCls} value={s.emailFrom} placeholder="coderhelm@example.com" onChange={(e) => update({ emailFrom: e.target.value })} autoCapitalize="off" spellCheck={false} />
                      </Field>
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm text-fd-muted-foreground">Optional emails such as the weekly summary start off; turn them on in Settings, Emails.</p>
                </fieldset>
                <fieldset data-testid="who-may-join">
                  <legend className="mb-1 text-sm font-medium">Let people from your company join</legend>
                  <p className="mb-2 text-sm text-fd-muted-foreground">This install is for one organization only: nobody else can sign up.</p>
                  {(
                    [
                      [false, 'Only people I invite', 'You invite each person by email from Settings.'],
                      [true, 'Anyone with an email at', 'Your company\'s domain. You can still invite people from elsewhere.'],
                    ] as const
                  ).map(([byDomain, title, help]) => (
                    <label key={title} className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${joinsByDomain(s) === byDomain ? 'border-fd-primary bg-fd-primary/5' : 'border-fd-border hover:bg-fd-accent'}`}>
                      <input
                        type="radio"
                        name="join"
                        className="mt-1 accent-[var(--color-fd-primary)]"
                        checked={joinsByDomain(s) === byDomain}
                        onChange={() => update({ joinDomain: byDomain, ...(byDomain && !s.signupDomain && s.email.includes('@') ? { signupDomain: s.email.split('@')[1].toLowerCase() } : {}) })}
                      />
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="block text-sm text-fd-muted-foreground">{help}</span>
                      </span>
                    </label>
                  ))}
                  {joinsByDomain(s) ? (
                    <div className="mt-1">
                      <Field label="Company email domain" htmlFor="ch-signup" error={errors.signupDomain}>
                        <input id="ch-signup" className={inputCls} value={s.signupDomain} placeholder="example.com" onChange={(e) => update({ signupDomain: e.target.value })} autoCapitalize="off" spellCheck={false} />
                      </Field>
                    </div>
                  ) : null}
                  <label className="mt-3 flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-fd-primary)]"
                      checked={!!s.requireTwoFactor}
                      data-testid="require-two-factor"
                      onChange={(e) => update({ requireTwoFactor: e.target.checked })}
                    />
                    <span>
                      <span className="block font-medium">Require two-factor sign-in</span>
                      <span className="block text-sm text-fd-muted-foreground">Everyone, you included, sets up an authenticator app before they can use CoderHelm.</span>
                    </span>
                  </label>
                  <p className="mt-2 text-sm text-fd-muted-foreground">You can change both later in Settings, Sign-in.</p>
                </fieldset>
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
                <Field label="Name in your AWS account" htmlFor="ch-stage" help="Names the AWS resources this install creates, so you can find them in the AWS console. Keep it unless this AWS account already has a CoderHelm; each install in one account needs its own name." error={errors.stage}>
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
                  <p className="text-sm text-fd-muted-foreground">You can change this later in Settings, System.</p>
                </fieldset>
              </div>
            ) : null}
          </div>


          <Summary s={s} cost={cost} />

          <AccountDisclosure s={s} hybrid={hybrid} />

          {release.state === 'missing' ? (
            <div data-testid="release-missing">
              <Notice tone="warn" title={notPublishedText(release.version)} />
              <div className="mt-3">
                <Secondary onClick={() => setReleaseTry((n) => n + 1)} testId="release-retry">Try again</Secondary>
              </div>
            </div>
          ) : (
            <div>
              <Primary type="submit" testId="launch" brand="aws" disabled={release.state !== 'ready'}>
                <AwsColorLogo size={30} />
                {release.state === 'ready' ? 'Open AWS with everything filled in' : 'Checking the newest release…'}
                <svg viewBox="0 0 16 16" width="14" height="14" className="opacity-60 transition group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 3.5l4.5 4.5L6 12.5" /></svg>
              </Primary>
              <p className="mt-3 text-sm text-fd-muted-foreground">Sign in to AWS if it asks. Then tick the box at the bottom of the page and press <b className="text-fd-foreground">Create stack</b>.</p>
            </div>
          )}
        </form>
        <Details summary="What happens in AWS">
          <p>A CloudFormation stack starts the installer in CodeBuild, inside your account. It downloads CoderHelm {release.state === 'ready' ? release.version : 'the newest release'}, checks its signature and deploys CoderHelm: Lambda functions, DynamoDB tables, an S3 bucket, CloudFront and Cognito sign-in. Nothing to install on your computer.</p>
          <p>Everything it creates is named after the name in your AWS account, {s.stage}: the stack is {stackName(s)}, and every resource name starts with coderhelm-{s.stage}, so you can find them in the AWS console.</p>
          <p>The box you tick lets the stack create IAM roles. The installer needs administrator rights in your account to create CoderHelm&apos;s own, narrower roles.</p>
          <p>{s.domainChoice === 'own' ? `Your domain: when its zone is in Route 53 in this account, the install makes the certificate and the records. Anywhere else, CoderHelm starts on its free cloudfront.net address and this page shows the two records to add; it moves to ${cleanHostname(s.hostname) || 'your domain'} once they work.` : s.domainChoice === 'coderhelm' ? `Your CoderHelm address: once your install answers, this page registers it with CoderHelm and claims ${cleanName(s.coderhelmName) || 'your name'}.${NAME_ZONE}. Your install requests the certificate in your account; CoderHelm adds the DNS records. Nothing for you to do.` : 'No domain or DNS work: CoderHelm gets a free cloudfront.net address. You can add your own domain later, in More options or in CoderHelm.'}</p>
          <p>Two random values from this page go along in the AWS link: a progress ID, so this page can follow the install, and a one-time setup key, so GitHub (or CoderHelm, for hybrid) can talk to your CoderHelm directly. Both stay in your account and this browser; the setup key stops working once your GitHub App exists.</p>
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
        <LiveProgress doc={doc} answering={answering} launchedAt={s.launchedAt} failed={failed} />
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
              {knowsRelease ? (
                <Primary onClick={relaunch} testId="relaunch">
                  <AwsLogo size={24} /> Launch again
                </Primary>
              ) : release.state === 'missing' ? (
                <>
                  <p data-testid="release-missing">{notPublishedText(release.version)}</p>
                  <Secondary onClick={() => setReleaseTry((n) => n + 1)} testId="release-retry">Try again</Secondary>
                </>
              ) : null}
              {doc?.logUrl ? <Secondary href={doc.logUrl} newTab>Open the log</Secondary> : null}
            </div>
            <p className="mt-3">The new try uses the stack name {stackName({ stage: s.stage, attempt: s.attempt + 1 })}. You can delete the failed stack in CloudFormation afterwards.</p>
          </Notice>
        ) : null}

        {noSign ? (
          <Notice tone="warn" title="No sign of the install yet" testId="no-sign">
            <p>Did you press Create stack? If not, open AWS again. If you did, your account may keep the progress file private (S3 Block Public Access). The install still runs: when the stack says CREATE_COMPLETE, copy your install’s address from its Outputs tab and paste it below.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              {knowsRelease ? <Secondary href={quickCreateUrl(s)} newTab testId="reopen-aws">Open AWS again</Secondary> : null}
              <Secondary href={stacksConsoleUrl(s.region)} newTab>See your stacks</Secondary>
              <Secondary onClick={startOver} testId="start-over-no-sign">Start over</Secondary>
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
            {!doc && !s.url && knowsRelease ? <Secondary href={quickCreateUrl(s)} newTab testId="reopen-aws">Open AWS again</Secondary> : null}
            {!s.url ? (
              <Secondary onClick={() => setPasteOpen((v) => !v)} testId="paste-toggle">I have my install’s address</Secondary>
            ) : null}
            {s.launchedAt && !s.url ? <Secondary onClick={startOver} testId="start-over-waiting">Start over</Secondary> : null}
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
            <label htmlFor="ch-paste" className="sr-only">Your install’s address</label>
            <input id="ch-paste" className={`${inputCls} sm:flex-1`} placeholder="https://d1234abcd.cloudfront.net" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Secondary onClick={usePasted} testId="paste-use">Use this address</Secondary>
          </form>
        ) : null}
        {pasteError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pasteError}</p> : null}

        <Details summary="What is happening">
          <p>The installer runs in CodeBuild in your account. It writes its progress to a small file in your account (bucket coderhelm-setup-{s.statusId}) that this page reads: the phase, the step and, at the end, your install’s address. Nothing else.</p>
          <p>Stack name: {stackName(s)} (from the name in your AWS account, {s.stage}), in {REGIONS.find((r) => r.id === s.region)?.name ?? s.region}. Release {s.version}.</p>
        </Details>
      </section>
    );
  } else if (view === 'address') {
    const name = cleanName(s.coderhelmName);
    const host = `${name || 'yourname'}.${NAME_ZONE}`;
    const nm = findCheck(setup, 'hybrid_name');
    const reg = findCheck(setup, 'hybrid_registered');
    const rows = hybridRows(setup, name, hyb.claimRefused);
    const now = nm ? checkText(nm) : reg && reg.status !== 'pass' ? checkText(reg) : { title: hyb.claimRefused ? 'That name can’t be used' : 'Connecting your install to CoderHelm', fix: hyb.claimRefused ? 'Pick another name below; this page claims it for you.' : 'This page registers your install and claims the name by itself.' };
    const tone = nm?.status === 'pass' ? 'pass' : nm?.status === 'fail' || reg?.status === 'fail' || hyb.claimRefused ? 'fail' : 'todo';
    screen = (
      <section data-testid="screen-address">
        <Heading title={`Setting up ${host}`} lead="CoderHelm does this by itself: no DNS records to add. You can close this page and come back; it picks up here." />
        <Notice tone={tone} title={now.title} testId="address-status">
          {now.fix ? <p>{now.fix}</p> : null}
        </Notice>
        {hyb.error && !hyb.claimRefused ? (
          <Notice tone="warn" title={hyb.error.title} testId="hybrid-error">
            <p>{hyb.error.fix}</p>
          </Notice>
        ) : null}
        <ul className="mt-5 divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="address-progress">
          {rows.map((r) => <Row key={r.id} tone={r.status} title={r.label} />)}
        </ul>
        {hyb.claimRefused ? (
          <form
            className="mt-6 space-y-4 rounded-2xl border border-fd-border p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameProblem(newName)) return;
              update({ coderhelmName: cleanName(newName) });
              setHyb((h) => ({ ...h, claimRefused: false, error: null, lastTry: 0 }));
            }}
          >
            <NamePicker value={newName} onChange={setNewName} testId="rename" compact />
            <Primary type="submit" testId="claim-name" disabled={!!nameProblem(newName)}>Claim this name</Primary>
          </form>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
          <Secondary onClick={() => update({ domainSkipped: true })} testId="skip-address">Use the AWS address for now</Secondary>
        </div>
        <p className="mt-3 text-sm text-fd-muted-foreground">This page checks again by itself every few seconds. Skipping finishes on the AWS address; the name keeps being set up and CoderHelm moves to it when it’s ready.</p>
        <Details summary="What CoderHelm does, and what it sees">
          <p>Your install registers with CoderHelm and proves it answers on its own CloudFront address. CoderHelm reserves {host} and shows a “being set up” page there.</p>
          <p>Your install asks AWS for a certificate in your own account. CoderHelm writes its validation record, then, once the certificate is issued and your install has moved, the record that sends {host} to your CloudFront. It can only ever write those records, for this name.</p>
          <p>Visitors go straight to your CloudFront: no traffic passes through CoderHelm. <a className="underline" href="/self-host/hybrid/#trust-model">The trust model</a> lists everything.</p>
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
  } else if (view === 'github' && s.githubChoice === 'hosted') {
    const installed = findCheck(setup, 'github_installed');
    const linked = installed?.status === 'pass' && installed.code === 'ok';
    const ho = hybridOutcome ? HYBRID_GITHUB_OUTCOMES[hybridOutcome] : undefined;
    const ready = hyb.settingsSent || findCheck(setup, 'github_app')?.code === 'hosted_app';
    const [linkError, setLinkError] = [hyb.error, (e: { title: string; fix: string } | null) => setHyb((h) => ({ ...h, error: e }))];
    const startLink = async () => {
      if (!s.url) return;
      const back = `${window.location.origin}${window.location.pathname}?${stateToQuery(s)}`;
      const r = await postInstall(hybridUrl(s.url, '/github/link'), { setup_token: s.setupToken, return_url: back });
      const url = r.body?.install_url as string | undefined;
      if (r.ok && url) window.location.assign(url);
      else setLinkError(hybridError(r.body?.code as string | undefined, (r.body?.error as string) ?? 'Your CoderHelm couldn’t start the link.'));
    };
    screen = (
      <section data-testid="screen-github">
        <Heading title="Install CoderHelm’s GitHub App" lead="One app on your organization, and you pick the repositories. GitHub asks you to sign in once, which proves the installation is yours. CoderHelm then shows which install it is about to link: check the address and press Link." />
        {ho ? (
          <Notice tone={ho.ok ? 'pass' : 'fail'} title={ho.title} testId="hybrid-github-outcome">
            {ho.fix ? <p>{ho.fix}</p> : null}
          </Notice>
        ) : null}
        {linkError ? (
          <Notice tone="fail" title={linkError.title} testId="hybrid-error">
            <p>{linkError.fix}</p>
          </Notice>
        ) : null}
        <ul className="mb-6 mt-5 divide-y divide-fd-border rounded-xl border border-fd-border px-4" data-testid="github-hosted-progress">
          <Row tone={ready ? 'pass' : 'active'} title={ready ? 'Your install is connected to CoderHelm' : 'Connecting your install to CoderHelm'} />
          <Row tone={linked ? 'pass' : ready ? 'active' : 'pending'} title={linked ? 'Installed and linked to your install' : 'Installed on your repositories'}>
            {!linked && ready ? 'Waiting for you to install it on GitHub.' : null}
          </Row>
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Primary onClick={() => void startLink()} disabled={!ready} testId="install-hosted-app" brand="github">
            <GitHubLogo size={22} /> Install on GitHub
          </Primary>
          <Secondary onClick={() => void checkAgain()} testId="check-again">{checking ? 'Checking…' : 'Check again'}</Secondary>
        </div>
        <p className="mt-3 text-sm text-fd-muted-foreground">
          Prefer your own app?{' '}
          <button
            type="button"
            className="font-medium text-fd-primary hover:underline"
            data-testid="use-own-app"
            onClick={() => {
              update({ githubChoice: 'own' });
              setHyb((h) => ({ ...h, settingsSent: false, lastTry: 0 }));
            }}
          >
            Create my own GitHub App instead
          </button>{' '}
          (fully private: nothing passes through CoderHelm).
        </p>
        <Details summary="What passes through CoderHelm">
          <p>GitHub sends the app&apos;s events to CoderHelm, which checks GitHub&apos;s signature and forwards each one to your install, re-signed with your install&apos;s own key. Your install refuses anything older than 5 minutes or seen before.</p>
          <p>When your install works on a repository it asks CoderHelm for a token that lasts an hour, only for the repositories you chose. CoderHelm stores no code; an event is held only while its forward is retried, and delivery records are kept for 14 days.</p>
          <ul className="space-y-1.5">
            {Object.entries(GITHUB_PERMISSIONS).filter(([k]) => k !== 'email_addresses').map(([k, v]) => (
              <li key={k} className="flex flex-col sm:flex-row sm:gap-2">
                <span className="font-mono text-[13px] text-fd-foreground">{k}: {v}</span>
                <span>{PERMISSION_REASONS[k]}</span>
              </li>
            ))}
          </ul>
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
                  ? 'Your CoderHelm has no setup key from this page (it was installed another way, or the key was used), so GitHub can’t hand the keys to it directly.'
                  : 'This browser no longer has the setup key from the launch, so GitHub can’t hand the keys to your CoderHelm directly.'}{' '}
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
        <MovingNote className="mt-4" />
      </section>
    );
  }

  // The checks of the step under way, for the rail.
  const railChecks: RailCheck[] = (() => {
    // Something still to do (not installed yet) is under way, not a failure.
    const waiting = ['not_installed', 'not_linked', 'needs_app', 'missing', 'not_signed_up', 'use_case_required', 'subscription_pending'];
    const tone = (c?: Check): RowStatusLike => (!c ? 'pending' : c.status === 'pass' || c.status === 'skip' ? 'pass' : c.status === 'fail' && !waiting.includes(c.code) ? 'fail' : 'active');
    switch (view) {
      case 'start': return [
        { id: 'email', label: s.email.trim() ? 'Admin email entered' : 'Enter your email', status: s.email.trim() ? 'pass' : 'active' },
        { id: 'setup', label: s.setup === 'hybrid' ? 'Hybrid setup' : 'Fully private setup', status: 'pass' },
        { id: 'aws', label: 'Open AWS and press Create stack', status: 'pending' },
      ];
      case 'aws': return progressRows(doc, !!setup, !!s.launchedAt).map((r) => ({ id: r.id, label: r.label, status: r.status }));
      case 'address': return hybridRows(setup, cleanName(s.coderhelmName), hyb.claimRefused).map((r) => ({ id: r.id, label: r.label, status: r.status }));
      case 'domain': return domainRows(findCheck(setup, 'domain')?.code, s.domainDoc?.mode ?? 'external').map((r) => ({ id: r.id, label: r.label, status: r.status }));
      case 'github': return [
        { id: 'app', label: s.githubChoice === 'hosted' ? 'CoderHelm’s app' : 'GitHub App created', status: tone(findCheck(setup, 'github_app')) },
        { id: 'installed', label: 'Installed on your repositories', status: tone(findCheck(setup, 'github_installed')) },
      ];
      case 'models': return [{ id: 'models', label: 'Claude answers', status: tone(findCheck(setup, 'models')) }];
      default: return [{ id: 'admin', label: 'You sign up as the admin', status: tone(findCheck(setup, 'admin')) }];
    }
  })();
  const current = view === 'start' ? 'aws' : view;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <MobileSteps steps={steps} current={current} />
      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <StepsRail steps={steps} current={current} done={done} onPick={(id) => setManual(id === derived ? null : id)} checks={railChecks} />
            <TrustCard hybrid={s.setup === 'hybrid' || hybridWanted} />
          </div>
        </aside>
        <div className="min-w-0">
          {manual && manual !== derived ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-fd-border px-4 py-2 text-sm">
              <span className="text-fd-muted-foreground">You are looking at a finished step.</span>
              <button type="button" className="font-medium text-fd-primary hover:underline" onClick={() => setManual(null)}>Back to where you are</button>
            </div>
          ) : null}
          <div key={view} className="ch-enter rounded-3xl border border-fd-border bg-fd-card/30 p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_24px_48px_-24px_rgba(0,0,0,0.35)] sm:p-8">
            {screen}
          </div>
          <style>{`.ch-enter{animation:ch-enter .28s ease-out}@keyframes ch-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.ch-enter{animation:none}}`}</style>
          <footer className="mt-6 flex flex-col gap-3 px-1 text-sm text-fd-muted-foreground sm:flex-row sm:items-start sm:justify-between">
            <p className="flex gap-2" data-testid="privacy">
              <svg viewBox="0 0 16 16" width="16" height="16" className="mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
              <span>
                {s.setup === 'hybrid' || hybridWanted
                  ? <>{GUIDE_TRUST.hybrid} <a className="underline decoration-fd-border underline-offset-2 hover:text-fd-foreground" href="/self-host/hybrid/#trust-model">What CoderHelm sees</a></>
                  : GUIDE_TRUST.private}
              </span>
            </p>
            {s.launchedAt || s.url ? (
              <button type="button" onClick={startOver} className="shrink-0 font-medium hover:text-fd-foreground" data-testid="start-over">Start over</button>
            ) : null}
          </footer>
        </div>
      </div>
    </div>
  );
}
