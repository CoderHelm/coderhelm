'use client';

// The browser uninstall guide for self-hosted CoderHelm: the install guide's
// look and flow, run backwards. Choose what to remove, type the install's
// name, open AWS with everything filled in, then follow the uninstaller's
// progress file in the person's own bucket to the final list of what went,
// what was kept and anything left. Everything it remembers is in this
// browser (localStorage) and the address bar (never the choice to delete).

import { useEffect, useMemo, useState } from 'react';
import { REGIONS } from '@/lib/install/core';
import {
  type Mode,
  type StepId,
  type UninstallDoc,
  type UninstallState,
  INSTALL_STORAGE_PREFIX,
  KEY_DAYS,
  NOT_REMOVED,
  STEPS,
  STORAGE_LAST,
  STORAGE_PREFIX,
  byKind,
  cliCommand,
  confirmed,
  fromInstallGuide,
  hybridWarning,
  newState,
  parseDoc,
  parseStored,
  percent,
  phaseRows,
  plural,
  queryToPartial,
  quickCreateUrl,
  split,
  stackName,
  stacksConsoleUrl,
  stateToQuery,
  statusFileUrl,
  stepOf,
  templateUrl,
  validate,
} from '@/lib/uninstall/core';
import { AwsLogo } from '@/components/install/logos';
import { CopyBox, Details, Dot, Field, Heading, Mono, Notice, Primary, Row, Secondary, getJson, inputCls, linkCls, newestRelease, templateExists, timing } from '@/components/install/wizard';

const POLL = () => timing('__CH_POLL_MS', 5000);

function store(s: UninstallState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + s.statusId, JSON.stringify(s));
    localStorage.setItem(STORAGE_LAST, s.statusId);
  } catch {
    // Private windows: the address bar still has the install.
  }
}

function load(): UninstallState {
  const fromUrl = queryToPartial(window.location.search);
  let stored: UninstallState | null = null;
  let install: Partial<UninstallState> | null = null;
  try {
    const id = fromUrl.statusId ?? localStorage.getItem(STORAGE_LAST);
    if (id) stored = parseStored(localStorage.getItem(STORAGE_PREFIX + id));
    const lastInstall = localStorage.getItem(`${INSTALL_STORAGE_PREFIX}last`);
    if (lastInstall) install = fromInstallGuide(localStorage.getItem(INSTALL_STORAGE_PREFIX + lastInstall));
  } catch {
    stored = null;
  }
  // A finished or other install's saved state doesn't carry over to a new uninstall.
  const sameInstall = stored && (!fromUrl.stage || stored.stage === fromUrl.stage) && (!fromUrl.statusId || stored.statusId === fromUrl.statusId);
  const base = sameInstall && stored ? stored : newState();
  const fromInstall = install && (!fromUrl.stage || install.stage === fromUrl.stage) && !base.stage ? install : {};
  const s = { ...base, ...fromInstall, ...fromUrl };
  if (fromUrl.statusId && !s.launchedAt) s.launchedAt = Date.now();
  return s;
}

type Release = { state: 'checking' } | { state: 'ready'; version: string } | { state: 'missing'; version: string | null };

/** The uninstall's progress: the share done and a moving bar. */
function Progress({ doc, failed }: { doc: UninstallDoc | null; failed: boolean }) {
  const pct = percent(doc);
  const done = doc?.phase === 'done';
  return (
    <div className="mb-5 rounded-2xl border border-fd-border bg-fd-card/50 p-4 sm:p-5" data-testid="live-progress">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{failed ? '–' : `${pct}%`}</span>
        <span className="text-sm text-fd-muted-foreground">{failed ? 'Stopped' : done ? 'Done' : doc ? doc.message || 'Working' : 'Waiting for AWS to start'}</span>
      </div>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-fd-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uninstall progress">
        <span className={`absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-700 ease-out ${failed ? 'bg-red-500' : done ? 'bg-emerald-500' : 'bg-fd-primary'}`} style={{ width: `${Math.max(3, pct)}%` }}>
          {!failed && !done ? <span className="ch-shimmer absolute inset-0" /> : null}
        </span>
      </div>
      <style>{`.ch-shimmer{background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);background-size:200% 100%;animation:ch-shimmer 1.6s linear infinite}@keyframes ch-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.ch-shimmer{animation:none}}`}</style>
    </div>
  );
}

function Rail({ current, done }: { current: StepId; done: Set<StepId> }) {
  return (
    <ol className="relative space-y-1" aria-label="Uninstall steps">
      {STEPS.map((st, i) => {
        const isCurrent = st.id === current;
        const isDone = done.has(st.id) && !isCurrent;
        return (
          <li key={st.id} className="relative flex items-start gap-3 py-2" aria-current={isCurrent ? 'step' : undefined}>
            {i < STEPS.length - 1 ? <span aria-hidden className={`absolute left-[15px] top-11 h-[calc(100%-28px)] w-px ${isDone ? 'bg-emerald-500/50' : 'bg-fd-border'}`} /> : null}
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
              isDone ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : isCurrent ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground shadow-[0_0_0_4px] shadow-fd-primary/15'
                : 'border-fd-border bg-fd-background text-fd-muted-foreground'}`}>
              {isDone ? <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg> : i + 1}
            </span>
            <span className="min-w-0 pt-1">
              <span className={`block text-sm font-semibold leading-5 ${isCurrent || isDone ? 'text-fd-foreground' : 'text-fd-muted-foreground'}`}>{st.label}</span>
              <span className="block text-xs leading-5 text-fd-muted-foreground">{isDone ? 'Done' : st.time}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MobileRail({ current }: { current: StepId }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.id === current));
  return (
    <div className="mb-5 lg:hidden" data-testid="mobile-steps">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">Step {at + 1} of {STEPS.length}: {STEPS[at].label}</span>
        <span className="shrink-0 text-xs text-fd-muted-foreground">{STEPS[at].time}</span>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i < at ? 'bg-emerald-500' : i === at ? 'bg-fd-primary' : 'bg-fd-border'}`} />)}
      </div>
    </div>
  );
}

function ModeCard({ mode, chosen, onPick }: { mode: Mode; chosen: boolean; onPick: () => void }) {
  const copy = mode === 'keep'
    ? { title: 'Remove CoderHelm, keep my data', tag: 'Recommended', lines: ['Everything CoderHelm runs on goes', 'Tables, data bucket, KMS keys, user pool and secret stay', 'You can delete those later'] }
    : { title: 'Delete everything', tag: 'Can’t be undone', lines: ['Everything, data included', `KMS keys are scheduled for deletion in ${KEY_DAYS} days (AWS’s minimum)`, 'Nothing can be recovered'] };
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={chosen}
      data-testid={`mode-${mode}`}
      className={`flex h-full flex-col rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring ${
        chosen ? (mode === 'everything' ? 'border-red-500/70 bg-red-500/5 ring-1 ring-red-500/40' : 'border-fd-primary bg-fd-primary/5 ring-1 ring-fd-primary/40') : 'border-fd-border hover:border-fd-foreground/25'}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{copy.title}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${mode === 'everything' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>{copy.tag}</span>
      </span>
      <ul className="mt-2 space-y-1 text-sm text-fd-muted-foreground">
        {copy.lines.map((l) => <li key={l} className="flex gap-2"><Dot />{l}</li>)}
      </ul>
    </button>
  );
}

function ItemList({ title, items, tone, testId }: { title: string; items: ReturnType<typeof split>['remove']; tone: 'remove' | 'keep'; testId: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-5" data-testid={testId}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2 divide-y divide-fd-border rounded-xl border border-fd-border">
        {items.map((i) => (
          <li key={i.what} className="flex gap-3 px-3.5 py-2.5 text-sm">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone === 'remove' ? (i.data ? 'bg-red-500' : 'bg-fd-primary') : 'bg-emerald-500'}`} aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">{i.what}</span>
              <span className="block text-xs text-fd-muted-foreground wrap-anywhere"><Mono>{i.names}</Mono>{i.note ? ` · ${i.note}` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryList({ title, list, testId, tone }: { title: string; list: UninstallDoc['removed']; testId: string; tone: 'pass' | 'warn' | 'fail' }) {
  if (!list.length) return null;
  return (
    <section className="mt-5" data-testid={testId}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2">
        {byKind(list).map((g) => (
          <Row key={g.kind} tone={tone} title={`${g.count} ${plural(g.kind, g.count)}`}>
            <span className="wrap-anywhere">{g.names.slice(0, 8).join(', ')}{g.names.length > 8 ? `, and ${g.names.length - 8} more` : ''}</span>
            {list.filter((e) => e.kind === g.kind && (e.error || e.date)).slice(0, 5).map((e) => (
              <span key={e.name} className="mt-1 block text-xs">{e.error ? `${e.name}: ${e.error}` : `Deleted by AWS on ${e.date?.slice(0, 10)}; until then you can cancel it in KMS.`}</span>
            ))}
          </Row>
        ))}
      </ul>
    </section>
  );
}

export function UninstallGuide() {
  const [s, setS] = useState<UninstallState | null>(null);
  const [doc, setDoc] = useState<UninstallDoc | null>(null);
  const [readable, setReadable] = useState(true);
  const [touched, setTouched] = useState(false);
  const [release, setRelease] = useState<Release>({ state: 'checking' });
  // Continue moves on from the choice; the list stays in view until then.
  const [proceed, setProceed] = useState(false);

  useEffect(() => setS(load()), []);

  useEffect(() => {
    if (!s) return;
    store(s);
    const q = stateToQuery(s);
    const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [s]);

  // The newest release with an uninstall template: the guided uninstall needs one.
  useEffect(() => {
    if (!s || s.launchedAt) return;
    let live = true;
    void (async () => {
      const version = await newestRelease();
      const ok = version ? await templateExists(templateUrl(version)) : false;
      if (!live) return;
      if (version && ok) {
        setRelease({ state: 'ready', version });
        setS((p) => (p ? { ...p, version } : p));
      } else setRelease({ state: 'missing', version });
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.launchedAt]);

  // The progress file, while the uninstaller runs. Once it says done, it stops: the file goes with the uninstaller.
  const finished = doc?.phase === 'done' || doc?.phase === 'failed';
  useEffect(() => {
    if (!s?.launchedAt || finished) return;
    let live = true;
    const read = async () => {
      const r = await getJson(statusFileUrl(s));
      if (!live) return;
      const d = r.ok ? parseDoc(r.body) : null;
      if (d) {
        setDoc(d);
        setReadable(true);
      } else if (r.status === 403 && Date.now() - (s.launchedAt ?? 0) > 3 * 60_000) setReadable(false);
    };
    void read();
    const t = setInterval(() => void read(), POLL());
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [s, finished]);

  const derived = s ? stepOf(s, doc) : 'choose';
  const step: StepId = derived === 'confirm' && !proceed ? 'choose' : derived;
  const done = useMemo(() => {
    const i = STEPS.findIndex((x) => x.id === step);
    return new Set(STEPS.slice(0, i).map((x) => x.id));
  }, [step]);

  if (!s) return <div className="mx-auto w-full max-w-6xl" aria-busy="true" />;
  const set = (p: Partial<UninstallState>) => setS((prev) => (prev ? { ...prev, ...p } : prev));
  const problems = validate(s);
  const lists = split(s.stage, s.mode);
  const warning = hybridWarning(s);
  const startOver = () => {
    setDoc(null);
    setTouched(false);
    setProceed(false);
    setS(newState({ stage: s.stage, region: s.region, installStatusId: s.installStatusId, hybrid: s.hybrid, github: s.github, jira: s.jira }));
  };

  let screen: React.ReactNode;
  if (step === 'choose') {
    screen = (
      <form onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.keys(problems).length) { set({ confirm: '' }); setProceed(true); } }}>
        <Heading title="Uninstall CoderHelm" lead="Remove CoderHelm from your AWS account, with its data or without. Nothing is deleted until you type the install’s name and AWS starts the uninstaller." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Install name" htmlFor="stage" error={touched ? problems.stage : undefined} help="Its resources start with coderhelm-<name>. Settings, System shows it.">
            <input id="stage" className={inputCls} value={s.stage} placeholder="prod" autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={(e) => set({ stage: e.target.value.trim().toLowerCase(), confirm: '' })} data-testid="stage" />
          </Field>
          <Field label="Region" htmlFor="region" error={touched ? problems.region : undefined}>
            <select id="region" className={inputCls} value={s.region} onChange={(e) => set({ region: e.target.value })} data-testid="region">
              {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
            </select>
          </Field>
        </div>
        <h2 className="mt-6 text-sm font-semibold">What to remove</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2" role="group" aria-label="What to remove">
          <ModeCard mode="keep" chosen={s.mode === 'keep'} onPick={() => set({ mode: 'keep' })} />
          <ModeCard mode="everything" chosen={s.mode === 'everything'} onPick={() => set({ mode: 'everything' })} />
        </div>
        {touched && problems.mode ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problems.mode}</p> : null}
        {warning ? <Notice tone="warn" title="This install is hybrid" testId="hybrid-warning">{warning}</Notice> : null}
        {s.mode ? (
          <>
            <ItemList title={`Deleted from ${s.region}`} items={lists.remove} tone="remove" testId="will-delete" />
            <ItemList title="Kept (your data)" items={lists.keep} tone="keep" testId="will-keep" />
          </>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Primary type="submit" testId="continue">Continue</Primary>
        </div>
        <Details summary="Not removed by either choice">
          <ul className="space-y-1">{NOT_REMOVED.map((x) => <li key={x} className="flex gap-2"><Dot />{x}</li>)}</ul>
        </Details>
      </form>
    );
  } else if (step === 'confirm') {
    const ok = confirmed(s);
    const everything = s.mode === 'everything';
    screen = (
      <div>
        <Heading
          title={everything ? `Delete CoderHelm ${s.stage} and all its data` : `Remove CoderHelm ${s.stage}`}
          lead={<>AWS opens with everything filled in. You type the name once more there, tick the IAM box and press <strong>Create stack</strong>. The uninstaller deletes only what is named or tagged for <Mono>coderhelm-{s.stage}</Mono> in {s.region}.</>}
        />
        {everything ? (
          <Notice tone="fail" title="This deletes your data for good" testId="everything-warning">
            Tables, backups, the data bucket, everyone’s sign-in and the secret are deleted. The KMS keys are scheduled for deletion in {KEY_DAYS} days, AWS’s shortest wait; until then you can cancel their deletion in KMS, but the data they encrypted is already gone.
          </Notice>
        ) : (
          <Notice tone="info" title="Your data stays" testId="keep-note">Tables, the data bucket, KMS keys, the user pool and the secret are kept. Delete them later from the uninstall guide or in the AWS console.</Notice>
        )}
        {warning ? <Notice tone="warn" title="GitHub and Jira go back to CoderHelm hosted" testId="hybrid-warning">{warning}</Notice> : null}
        <div className="mt-6">
          <Field label={`Type ${s.stage} to confirm`} htmlFor="confirm" error={s.confirm && !ok ? 'That isn’t the install name. Type it exactly.' : undefined}>
            <input id="confirm" className={inputCls} value={s.confirm} autoCapitalize="off" autoComplete="off" spellCheck={false} onChange={(e) => set({ confirm: e.target.value })} data-testid="confirm" />
          </Field>
        </div>
        {release.state === 'missing' ? (
          <Notice tone="warn" title="The guided uninstall isn’t published yet" testId="no-template">
            {release.version ? `CoderHelm ${release.version} has no uninstall template.` : 'No release could be read.'} Uninstall from a terminal with credentials for the account:
            <CopyBox text={cliCommand(s)} />
          </Notice>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {ok && release.state === 'ready' ? (
            <Primary brand="aws" href={quickCreateUrl(s)} newTab testId="open-aws" onClick={() => set({ launchedAt: Date.now() })}>
              <AwsLogo />{everything ? 'Open AWS to delete everything' : 'Open AWS to uninstall'}
            </Primary>
          ) : (
            <Primary disabled testId="open-aws">{release.state === 'checking' ? 'Checking the latest release…' : 'Type the name to continue'}</Primary>
          )}
          <Secondary onClick={() => { set({ confirm: '' }); setProceed(false); }} testId="back">Back</Secondary>
        </div>
        <Details summary="How the uninstaller is kept to this install">
          <p>Its build can delete nothing until a window function checks it is this stack’s own build, with exactly this template’s steps, and gives it a window bound to that build and an end time. The window reaches only resources named or tagged for this install, never another install whose name starts with this one’s, and never the uninstaller itself. When it ends, the stack rolls itself back with your credentials, which removes the uninstaller too.</p>
          <p><a className={linkCls} href="/self-host/uninstall-details/#what-the-uninstaller-may-touch">Everything it may touch</a></p>
        </Details>
      </div>
    );
  } else if (step === 'remove') {
    const failed = doc?.phase === 'failed';
    screen = (
      <div>
        <Heading title={failed ? 'The uninstall stopped' : 'Removing CoderHelm'} lead={<>In AWS, the stack <Mono>{stackName(s)}</Mono> runs the uninstaller. You can close this page; it picks up where it was.</>} />
        <Progress doc={doc} failed={failed} />
        <ul data-testid="phases">
          {phaseRows(doc, s.mode).map((r) => <Row key={r.id} tone={r.status === 'pass' ? 'pass' : r.status === 'active' ? 'active' : r.status === 'fail' ? 'fail' : 'pending'} title={r.label} />)}
        </ul>
        {doc?.hybrid?.registered ? (
          <Notice tone={doc.hybrid.released ? 'pass' : 'warn'} title={doc.hybrid.released ? 'Left CoderHelm hybrid' : 'CoderHelm couldn’t be reached'}>
            {doc.hybrid.released ? 'The address is released; GitHub and Jira events go back to CoderHelm hosted.' : 'The address is released when the install stops answering.'}
          </Notice>
        ) : null}
        {failed ? (
          <Notice tone="fail" title={doc?.message ?? 'The uninstall stopped'} testId="failed">
            {doc?.fix} {doc?.logUrl ? <a className={linkCls} href={doc.logUrl} target="_blank" rel="noopener noreferrer">Open the log</a> : null}
          </Notice>
        ) : null}
        {!readable ? (
          <Notice tone="warn" title="The progress file can’t be read" testId="unreadable">This account blocks public files, so the guide can’t follow along. Follow the stack in CloudFormation: it ends with the reason “Done: CoderHelm is uninstalled”.</Notice>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Secondary href={stacksConsoleUrl(s.region)} newTab>Open CloudFormation</Secondary>
          <Secondary onClick={startOver} testId="start-over">Start over</Secondary>
        </div>
      </div>
    );
  } else {
    const clean = doc?.phase === 'done' && !doc.left.length;
    screen = (
      <div>
        <Heading title={clean ? 'Nothing left' : 'Almost everything is removed'} lead={doc?.message} />
        {clean ? <Notice tone="pass" title={`Nothing named or tagged for coderhelm-${s.stage} is left in ${s.region}`} testId="nothing-left">{doc?.mode === 'keep' ? 'Except your data, kept on purpose (below).' : 'The uninstaller removes itself next.'}</Notice> : null}
        <EntryList title="Still there" list={[...(doc?.left ?? []), ...(doc?.problems ?? [])]} testId="left" tone="fail" />
        <EntryList title="Scheduled for deletion" list={doc?.scheduled ?? []} testId="scheduled" tone="warn" />
        <EntryList title="Kept (your data)" list={doc?.kept ?? []} testId="kept" tone="warn" />
        {doc?.notRemoved.length ? (
          <Notice tone="info" title="Left for you" testId="not-removed">
            {doc.notRemoved.map((e) => <span key={e.name} className="block wrap-anywhere">{e.kind} {e.name}{e.why ? `: ${e.why}` : ''}</span>)}
          </Notice>
        ) : null}
        <EntryList title="Removed" list={doc?.removed ?? []} testId="removed" tone="pass" />
        <section className="mt-6 rounded-xl border border-fd-border p-4 text-sm leading-relaxed text-fd-muted-foreground" data-testid="self-removal">
          <p className="font-semibold text-fd-foreground">The uninstaller removes itself last</p>
          <p className="mt-1">Its stack rolls back with your credentials, because an AWS role can’t delete itself. CloudFormation then lists <Mono>{stackName(s)}</Mono> as <Mono>ROLLBACK_COMPLETE</Mono>: it holds nothing and costs nothing, and you can delete it from the list. Check any time, read-only:</p>
          <CopyBox text={cliCommand(s, true)} testId="verify-command" />
        </section>
        <Details summary="Not removed, because CoderHelm didn’t create them">
          <ul className="space-y-1">{NOT_REMOVED.map((x) => <li key={x} className="flex gap-2"><Dot />{x}</li>)}</ul>
        </Details>
        <div className="mt-6 flex flex-wrap gap-3">
          {!clean ? <Primary onClick={startOver} testId="again">Launch the uninstaller again</Primary> : null}
          <Secondary href="/self-host/install/">Install CoderHelm again</Secondary>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <MobileRail current={step} />
      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <Rail current={step} done={done} />
            <div className="mt-8 space-y-3 rounded-2xl border border-fd-border bg-fd-card/40 p-4 text-xs leading-5 text-fd-muted-foreground" data-testid="trust">
              <p className="flex gap-2"><Dot />Runs in your AWS account, with your approval in CloudFormation.</p>
              <p className="flex gap-2"><Dot />Touches only what is named or tagged for this install.</p>
              <p className="flex gap-2"><Dot /><span>Terminal instead: <a className={linkCls} href="/self-host/uninstall-details/#from-a-terminal">uninstall from a terminal</a>.</span></p>
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <div key={step} className="ch-enter rounded-3xl border border-fd-border bg-fd-card/30 p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_24px_48px_-24px_rgba(0,0,0,0.35)] sm:p-8">
            {screen}
          </div>
          <style>{`.ch-enter{animation:ch-enter .28s ease-out}@keyframes ch-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.ch-enter{animation:none}}`}</style>
          <footer className="mt-6 px-1 text-sm text-fd-muted-foreground">
            <p data-testid="privacy">The guide talks only to AWS and your own progress file. Nothing you type is sent to CoderHelm.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
