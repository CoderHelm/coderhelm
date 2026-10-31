'use client';

// The uninstall page for self-hosted CoderHelm. A native install is one
// CloudFormation stack, so this is a short walk through Delete stack: which
// install, whether its data stays (the stack's KeepDataOnDelete parameter),
// the delete itself in the AWS console, and the read-only check afterwards.
// Nothing here calls AWS; it only builds links and commands.

import { useEffect, useMemo, useState } from 'react';
import { REGIONS } from '@/lib/install/core';
import {
  type Mode,
  type StepId,
  type UninstallState,
  INSTALL_STORAGE_PREFIX,
  KEY_DAYS,
  STEPS,
  consequences,
  deleteCommand,
  fromInstallGuide,
  keepDataCommand,
  releaseTemplateUrl,
  leftoversCommand,
  newState,
  queryToPartial,
  stackConsoleUrl,
  stackName,
  stateToQuery,
  validate,
} from '@/lib/uninstall/core';
import { AwsLogo } from '@/components/install/logos';
import { CopyBox, Details, Field, Heading, Mono, Notice, Primary, Secondary, inputCls, linkCls } from '@/components/install/wizard';

function load(): UninstallState {
  const fromUrl = queryToPartial(window.location.search);
  let install: Partial<UninstallState> | null = null;
  try {
    const last = localStorage.getItem(`${INSTALL_STORAGE_PREFIX}last`);
    if (last) install = fromInstallGuide(localStorage.getItem(INSTALL_STORAGE_PREFIX + last));
  } catch {
    install = null;
  }
  return newState({ ...(install && (!fromUrl.stage || install.stage === fromUrl.stage) ? install : {}), ...fromUrl });
}

function Steps({ current }: { current: StepId }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Uninstall steps">
      {STEPS.map((s, i) => (
        <li key={s.id} aria-current={i === at ? 'step' : undefined}
          className={`rounded-full border px-3 py-1 ${i === at ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground' : i < at ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-fd-border text-fd-muted-foreground'}`}>
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

function List({ items, testId }: { items: string[]; testId: string }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" data-testid={testId}>
      {items.map((x) => <li key={x}>{x}</li>)}
    </ul>
  );
}

export function UninstallGuide() {
  const [s, setS] = useState<UninstallState>(() => newState());
  const [step, setStep] = useState<StepId>('choose');
  const [touched, setTouched] = useState(false);

  useEffect(() => setS(load()), []);
  useEffect(() => {
    const q = stateToQuery(s);
    const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [s]);

  const problems = useMemo(() => validate(s), [s]);
  const set = (p: Partial<UninstallState>) => setS((x) => ({ ...x, ...p }));
  const mode = s.mode as Mode | null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Steps current={step} />

      {step === 'choose' ? (
        <section data-testid="step-choose">
          <Heading title="Uninstall CoderHelm" lead={<>Your install is one CloudFormation stack, <Mono>coderhelm-&lt;name&gt;</Mono>. Deleting it removes CoderHelm; you choose whether the data stays.</>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Install name" htmlFor="stage" error={touched ? problems.stage : undefined} help="The name you gave it, e.g. prod.">
              <input id="stage" className={inputCls} value={s.stage} onChange={(e) => set({ stage: e.target.value.trim().toLowerCase() })} autoComplete="off" />
            </Field>
            <Field label="Region" htmlFor="region" error={touched ? problems.region : undefined}>
              <select id="region" className={inputCls} value={s.region} onChange={(e) => set({ region: e.target.value })}>
                <option value="">Choose a region</option>
                {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.id} ({r.name})</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-6">
            <Primary testId="next-choose" onClick={() => { setTouched(true); if (!problems.stage && !problems.region) setStep('data'); }}>Next</Primary>
          </div>
          <Details summary="An install from before one-stack releases">
            <p>If CloudFormation shows several stacks named <Mono>coderhelm-&lt;name&gt;-database</Mono>, <Mono>-api</Mono> and so on, move it to one stack first with <Mono>coderhelm-selfhost migrate</Mono>, or remove it by name with <Mono>coderhelm-selfhost uninstall</Mono> (add <Mono>--everything</Mono> for the data). See <a className={linkCls} href="/self-host/migrate/">Migrate to one stack</a>.</p>
          </Details>
        </section>
      ) : null}

      {step === 'data' ? (
        <section data-testid="step-data">
          <Heading title="Keep the data or not" lead={<>The stack's <Mono>KeepDataOnDelete</Mono> parameter decides. It is <Mono>true</Mono> unless you changed it.</>} />
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What happens to the data">
            {(['keep', 'everything'] as Mode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} data-testid={`mode-${m}`} onClick={() => set({ mode: m })}
                className={`rounded-xl border p-4 text-left transition ${mode === m ? 'border-fd-primary ring-2 ring-fd-primary/30' : 'border-fd-border hover:bg-fd-accent'}`}>
                <span className="block font-semibold">{m === 'keep' ? 'Remove CoderHelm, keep my data' : 'Delete everything'}</span>
                <span className="mt-1 block text-sm text-fd-muted-foreground">{m === 'keep' ? 'KeepDataOnDelete = true (the default). Nothing to change.' : `KeepDataOnDelete = false. Nothing can be recovered afterwards; KMS keys after AWS's ${KEY_DAYS}-day wait.`}</span>
              </button>
            ))}
          </div>
          {mode ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><span className="text-sm font-semibold">Deleted with the stack</span><List items={consequences(mode).goes} testId="goes" /></div>
              <div><span className="text-sm font-semibold">Kept</span>{consequences(mode).stays.length ? <List items={consequences(mode).stays} testId="stays" /> : <p className="mt-2 text-sm text-fd-muted-foreground" data-testid="stays">Nothing.</p>}</div>
            </div>
          ) : null}
          {mode === 'everything' ? (
            <Notice tone="warn" title="First set KeepDataOnDelete to false" testId="set-keep-false">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open the stack <Mono>{stackName(s)}</Mono>, then <b>Outputs</b>, and note <b>Version</b> (for example <Mono>v0.8.6</Mono>).</li>
                <li>Choose <b>Update</b>, then <b>Replace existing template</b>, <b>Amazon S3 URL</b>: <Mono>{releaseTemplateUrl('<Version>')}</Mono> with that version. It is the release you run. Don&apos;t choose <b>Use existing template</b>: on an install from v0.8.4 or v0.8.5 it reports success and keeps the data anyway.</li>
                <li>Choose <b>Next</b>, set <Mono>KeepDataOnDelete</Mono> to <Mono>false</Mono>, leave everything else, then <b>Next</b>, tick the boxes, and <b>Submit</b>. It takes a minute and changes nothing that runs.</li>
                <li>When it says <Mono>UPDATE_COMPLETE</Mono>, check <b>Outputs</b> again: <b>KeepDataOnDelete</b> must say <Mono>false</Mono> before you delete the stack.</li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2"><Primary href={stackConsoleUrl(s)} newTab testId="open-stack-update" brand="aws"><AwsLogo /> Open the stack</Primary></div>
              <Details summary="Or from a terminal"><CopyBox text={keepDataCommand(s, false)} testId="keep-false-command" /></Details>
            </Notice>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Secondary onClick={() => setStep('choose')}>Back</Secondary>
            <Primary testId="next-data" disabled={!mode} onClick={() => setStep('delete')}>Next</Primary>
          </div>
        </section>
      ) : null}

      {step === 'delete' ? (
        <section data-testid="step-delete">
          <Heading title="Delete the stack" lead={<>In CloudFormation, select <Mono>{stackName(s)}</Mono> and choose <b>Delete</b>. CloudFormation removes every part in order, usually in 15 to 30 minutes (CloudFront takes the longest).</>} />
          <div className="flex flex-wrap gap-2"><Primary href={stackConsoleUrl(s)} newTab testId="open-stack" brand="aws"><AwsLogo /> Open {stackName(s)}</Primary></div>
          <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm">
            <li>A hybrid install releases its CoderHelm address and links first.</li>
            {mode === 'everything' ? <li>The stack empties its buckets and deletes its tables itself, waiting while DynamoDB finishes, so the delete doesn't stop on them.</li> : <li>The data stays, listed by the check in the next step.</li>}
            <li>If the delete stops, the stack's <b>Events</b> tab says which piece and why in AWS's own words. Choose <b>Delete</b> again to retry; CloudFormation picks up where it stopped.</li>
          </ul>
          <Details summary="Or from a terminal"><CopyBox text={deleteCommand(s)} testId="delete-command" /></Details>
          <div className="mt-6 flex flex-wrap gap-2">
            <Secondary onClick={() => setStep('data')}>Back</Secondary>
            <Primary testId="next-delete" onClick={() => setStep('check')}>The stack is deleted</Primary>
          </div>
        </section>
      ) : null}

      {step === 'check' ? (
        <section data-testid="step-check">
          <Heading title="Check nothing is left" lead="This only reads. It lists anything still named or tagged for the install in this region." />
          <CopyBox text={leftoversCommand(s)} testId="leftovers-command" />
          <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm">
            <li>{mode === 'keep' ? 'Your data is listed: that is expected.' : `KMS keys show as scheduled for deletion until AWS's ${KEY_DAYS}-day wait ends.`}</li>
            <li>It also finds pieces an earlier failed install left (two user pools of the same name are both listed), and the auto-update role if auto-update was ever on.</li>
            <li>To remove what it lists, add <Mono>--delete</Mono>; it asks you to type the install name and prints every result.</li>
          </ul>
          <Details summary="Remove what is left"><CopyBox text={leftoversCommand(s, true)} testId="leftovers-delete-command" /></Details>
          <div className="mt-6"><Secondary onClick={() => setStep('delete')}>Back</Secondary></div>
        </section>
      ) : null}
    </div>
  );
}
