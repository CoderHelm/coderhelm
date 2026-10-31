// The uninstall guide's decisions, kept apart from the page so they can be
// tested without a browser (scripts/uninstall-core.test.mjs runs this file
// with Node's type stripping: erasable TypeScript only, no imports).
//
// The guide talks to two places only: the AWS console (a quick-create link
// the person opens) and the uninstaller's progress file in their own bucket.
// The contract is docs/self-host/uninstall.md in coderhelm-platform.

export const PUBLIC_BUCKET = 'coderhelm-public';
export const TAG_RE = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
export const STAGE_RE = /^[a-z][a-z0-9-]{0,19}$/;
export const STATUS_ID_RE = /^[a-z0-9]{16}$/;
export const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
/** The install guide's own storage (lib/install/core.ts), read to fill in its install. */
export const INSTALL_STORAGE_PREFIX = 'coderhelm-install:';
export const STORAGE_PREFIX = 'coderhelm-uninstall:';
export const STORAGE_LAST = `${STORAGE_PREFIX}last`;
/** AWS's shortest wait before a KMS key is deleted. */
export const KEY_DAYS = 7;

export type Mode = 'keep' | 'everything';
export type StepId = 'choose' | 'confirm' | 'remove' | 'check';
export const STEPS: { id: StepId; label: string; time: string }[] = [
  { id: 'choose', label: 'Choose', time: '1 min' },
  { id: 'confirm', label: 'Confirm', time: '1 min' },
  { id: 'remove', label: 'Remove', time: '10 to 40 min, by itself' },
  { id: 'check', label: 'Check', time: 'at the end' },
];

export interface UninstallState {
  stage: string;
  region: string;
  mode: Mode | null;
  /** The uninstaller's progress id (its bucket coderhelm-setup-<id>). */
  statusId: string;
  /** The install guide's progress id, so its bucket goes too. */
  installStatusId: string;
  /** What the person typed to confirm. */
  confirm: string;
  version: string;
  launchedAt: number | null;
  /** From Settings, System, Uninstall: a hybrid install, and what CoderHelm forwards to it. */
  hybrid: boolean;
  github: number | null;
  jira: boolean;
}

export function randomId(length = 16, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function newState(over: Partial<UninstallState> = {}): UninstallState {
  return { stage: '', region: 'us-east-1', mode: null, statusId: randomId(16), installStatusId: '', confirm: '', version: '', launchedAt: null, hybrid: false, github: null, jira: false, ...over };
}

/** What the address bar may set: the install (from Settings, System, Uninstall or the stack's output), never a choice to delete. */
export function queryToPartial(search: string): Partial<UninstallState> {
  const q = new URLSearchParams(search);
  const out: Partial<UninstallState> = {};
  const stage = q.get('stage') ?? '';
  if (STAGE_RE.test(stage)) out.stage = stage;
  const region = q.get('region') ?? '';
  if (REGION_RE.test(region)) out.region = region;
  const id = q.get('id') ?? '';
  if (STATUS_ID_RE.test(id)) out.statusId = id;
  const install = q.get('install') ?? '';
  if (STATUS_ID_RE.test(install)) out.installStatusId = install;
  if (q.get('hybrid') === '1') out.hybrid = true;
  const gh = Number(q.get('github'));
  if (q.has('github') && Number.isInteger(gh) && gh >= 0 && gh < 10_000) out.github = gh;
  if (q.get('jira') === '1') out.jira = true;
  return out;
}

/** The non-secret part for the address bar. The choice to delete is never in a link. */
export function stateToQuery(s: UninstallState): string {
  const q = new URLSearchParams();
  if (s.stage) q.set('stage', s.stage);
  if (s.region) q.set('region', s.region);
  if (s.launchedAt) q.set('id', s.statusId);
  if (s.hybrid) q.set('hybrid', '1');
  return q.toString();
}

/** A state saved in this browser, if it is one. */
export function parseStored(raw: string | null): UninstallState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<UninstallState>;
    if (!v || typeof v !== 'object' || !STATUS_ID_RE.test(String(v.statusId))) return null;
    return { ...newState(), ...v, mode: v.mode === 'keep' || v.mode === 'everything' ? v.mode : null };
  } catch {
    return null;
  }
}

/** The install the install guide set up in this browser: its name, region and progress id. */
export function fromInstallGuide(raw: string | null): Partial<UninstallState> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { stage?: unknown; region?: unknown; statusId?: unknown };
    if (!STAGE_RE.test(String(v.stage)) || !REGION_RE.test(String(v.region))) return null;
    return { stage: String(v.stage), region: String(v.region), installStatusId: STATUS_ID_RE.test(String(v.statusId)) ? String(v.statusId) : '' };
  } catch {
    return null;
  }
}

export function validate(s: Pick<UninstallState, 'stage' | 'region' | 'mode'>): Partial<Record<'stage' | 'region' | 'mode', string>> {
  const p: Partial<Record<'stage' | 'region' | 'mode', string>> = {};
  if (!STAGE_RE.test(s.stage)) p.stage = 'Enter the install name: 1 to 20 lowercase letters, digits or hyphens, starting with a letter. Its resources start with coderhelm-<name>.';
  if (!REGION_RE.test(s.region)) p.region = 'Pick the region the install is in.';
  if (s.mode !== 'keep' && s.mode !== 'everything') p.mode = 'Choose what to remove.';
  return p;
}

/** The typed name matches exactly (no trimming, no case folding: the stack checks the same). */
export function confirmed(s: Pick<UninstallState, 'stage' | 'confirm'>): boolean {
  return STAGE_RE.test(s.stage) && s.confirm === s.stage;
}

/** The release's uninstall template in S3 (published next to its Launch Stack). */
export function templateUrl(version: string): string {
  if (!TAG_RE.test(version)) throw new Error(`not a release tag: ${version}`);
  return `https://${PUBLIC_BUCKET}.s3.amazonaws.com/launch/${version}/coderhelm-uninstall.yaml`;
}

/** The uninstall stack's name: outside every install's names (coderhelm--…), with its own id so a later uninstall never meets an earlier one's record. */
export function stackName(s: Pick<UninstallState, 'stage' | 'statusId'>): string {
  return `coderhelm--uninstall-${s.stage}-${s.statusId.slice(0, 6)}`;
}

/** The CloudFormation quick-create link, with the typed confirmation as the stack's own check. */
export function quickCreateUrl(s: UninstallState): string {
  if (!confirmed(s)) throw new Error('the install name is not confirmed');
  if (s.mode !== 'keep' && s.mode !== 'everything') throw new Error('no mode chosen');
  const params: [string, string][] = [
    ['templateURL', templateUrl(s.version)],
    ['stackName', stackName(s)],
    ['param_Stage', s.stage],
    ['param_ConfirmStage', s.confirm],
    ['param_Mode', s.mode],
    ['param_Version', s.version],
    ['param_StatusId', s.statusId],
  ];
  if (STATUS_ID_RE.test(s.installStatusId) && s.installStatusId !== s.statusId) params.push(['param_InstallStatusId', s.installStatusId]);
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://${s.region}.console.aws.amazon.com/cloudformation/home?region=${s.region}#/stacks/create/review?${q}`;
}

export function statusFileUrl(s: Pick<UninstallState, 'statusId' | 'region'>): string {
  return `https://coderhelm-setup-${s.statusId}.s3.${s.region}.amazonaws.com/status.json`;
}

export function stacksConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks`;
}

/** The terminal way, for the same install. */
export function cliCommand(s: Pick<UninstallState, 'stage' | 'region' | 'mode'>, verify = false): string {
  const base = `npx -y github:CoderHelm/coderhelm-platform uninstall`;
  if (verify) return `${base} --verify --stage ${s.stage || 'prod'} --region ${s.region}`;
  return `${base}${s.mode === 'everything' ? ' --everything' : ''} --stage ${s.stage || 'prod'} --region ${s.region}`;
}

// ── What goes and what stays ─────────────────────────────────────────────

export interface Item { what: string; names: string; data?: boolean; note?: string }

/** Every kind of thing an install has, with its names (docs/self-host/uninstall.md). */
export function inventory(stage: string): Item[] {
  const p = `coderhelm-${stage || '<name>'}`;
  return [
    { what: 'CoderHelm’s stacks', names: `${p}-database, -storage, -api, -worker, -streaming, -web, -email, -updates, -monitoring, -log-analyzer`, note: 'functions, queues, the API, CloudFront, the dashboard, schedules, alarms, the build sandbox' },
    { what: 'The Launch Stack that installed it', names: `${p} (and ${p}-2, -3 for later tries)`, note: 'its installer, window and starter functions and their roles' },
    { what: 'The permissions boundary and the deploy role', names: `${p}-boundary-<id>, ${p}-deploy-<id>` },
    { what: 'The assets bucket and the install guide’s progress bucket', names: `${p}-assets-<id>-<account>, coderhelm-setup-<id>`, note: 'emptied first' },
    { what: 'Log groups and parameters', names: `/aws/lambda/${p}-*, /aws/codebuild/${p}-*, /${p}/…` },
    { what: 'DynamoDB tables and their backups', names: `${p}, ${p}-runs, ${p}-settings, …`, data: true },
    { what: 'The data bucket, every version too', names: `${p}-data-<account>`, data: true, note: 'knowledge files, attachments' },
    { what: 'The user pool', names: `${p}-users`, data: true, note: 'everyone’s sign-in' },
    { what: 'The secret', names: `coderhelm/${stage || '<name>'}/secrets`, data: true, note: 'deleted at once, no recovery window' },
    { what: 'The KMS keys', names: `${p}-dynamo, ${p}-secrets, ${p}-s3`, data: true, note: `scheduled for deletion in ${KEY_DAYS} days, AWS’s shortest wait` },
  ];
}

export function split(stage: string, mode: Mode | null): { remove: Item[]; keep: Item[] } {
  const all = inventory(stage);
  if (mode === 'everything') return { remove: all, keep: [] };
  return { remove: all.filter((i) => !i.data), keep: all.filter((i) => i.data) };
}

/** Not removed, because CoderHelm didn't create them or they aren't only CoderHelm's. */
export const NOT_REMOVED = [
  'A certificate the updater requested for your own domain: it is in us-east-1 whatever the install’s region, so the final list names it for you to delete in ACM',
  'DNS records you added at another DNS provider for your own domain',
  'The read-only roles your teams created for CoderHelm (CoderHelmLogReader, CoderhelmReadOnly): delete their stacks in each account',
  'Your GitHub App: uninstall it from GitHub',
];

/** The plain warning for a hybrid install, from what Settings, System, Uninstall saw. */
export function hybridWarning(s: Pick<UninstallState, 'hybrid' | 'github' | 'jira'>): string | null {
  if (!s.hybrid) return null;
  const parts: string[] = [];
  if (s.github) parts.push(`${s.github} GitHub installation${s.github === 1 ? '' : 's'}`);
  if (s.jira) parts.push('a Jira site');
  const forwarded = parts.length
    ? `CoderHelm forwards ${parts.join(' and ')} to this install today. Uninstalling hands ${parts.length > 1 || (s.github ?? 0) > 1 ? 'them' : 'it'} back to CoderHelm hosted: their events go to CoderHelm hosted again, as before the move.`
    : 'If CoderHelm forwards a team’s GitHub or Jira events to this install, uninstalling hands them back to CoderHelm hosted.';
  return `${forwarded} The CoderHelm address is released and the install’s broker key stops working first, before anything is deleted.`;
}

// ── The progress file ────────────────────────────────────────────────────

export type Phase = 'starting' | 'preparing' | 'hybrid' | 'stacks' | 'data' | 'launch' | 'cleanup' | 'verifying' | 'done' | 'failed';
export const PHASES: Phase[] = ['starting', 'preparing', 'hybrid', 'stacks', 'data', 'launch', 'cleanup', 'verifying', 'done', 'failed'];

export interface Entry { kind: string; name: string; date?: string; error?: string; why?: string }
export interface UninstallDoc {
  schema: 1;
  kind: 'uninstall';
  phase: Phase;
  message: string;
  mode: Mode | null;
  stage: string | null;
  step: number | null;
  steps: number | null;
  removed: Entry[];
  kept: Entry[];
  scheduled: Entry[];
  left: Entry[];
  notRemoved: Entry[];
  problems: Entry[];
  hybrid: { registered: boolean; released: boolean; github: number | null; jira: boolean } | null;
  fix: string | null;
  logUrl: string | null;
  updatedAt: string;
}

const entries = (v: unknown): Entry[] =>
  (Array.isArray(v) ? v : []).filter((e) => e && typeof e.kind === 'string' && typeof e.name === 'string').slice(0, 500)
    .map((e) => ({ kind: e.kind, name: e.name, ...(typeof e.date === 'string' ? { date: e.date } : {}), ...(typeof e.error === 'string' ? { error: e.error } : {}), ...(typeof e.why === 'string' ? { why: e.why } : {}) }));

export function parseDoc(v: unknown): UninstallDoc | null {
  const d = v as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.schema !== 1 || d.kind !== 'uninstall' || !PHASES.includes(d.phase as Phase)) return null;
  const num = (x: unknown) => (Number.isInteger(x) ? (x as number) : null);
  const h = d.hybrid as Record<string, unknown> | null;
  const url = typeof d.logUrl === 'string' && /^https:\/\/[a-z0-9-]+\.console\.aws\.amazon\.com\//.test(d.logUrl) ? d.logUrl : null;
  return {
    schema: 1,
    kind: 'uninstall',
    phase: d.phase as Phase,
    message: typeof d.message === 'string' ? d.message : '',
    mode: d.mode === 'keep' || d.mode === 'everything' ? d.mode : null,
    stage: typeof d.stage === 'string' ? d.stage : null,
    step: num(d.step),
    steps: num(d.steps),
    removed: entries(d.removed),
    kept: entries(d.kept),
    scheduled: entries(d.scheduled),
    left: entries(d.left),
    notRemoved: entries(d.notRemoved),
    problems: entries(d.problems),
    hybrid: h && typeof h === 'object' ? { registered: !!h.registered, released: !!h.released, github: num(h.github), jira: !!h.jira } : null,
    fix: typeof d.fix === 'string' ? d.fix : null,
    logUrl: url,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
  };
}

/** How far it is, 0 to 100. */
export function percent(doc: UninstallDoc | null): number {
  if (!doc) return 2;
  switch (doc.phase) {
    case 'starting': return 4;
    case 'preparing': return 8;
    case 'hybrid': return 12;
    case 'stacks': return Math.round(15 + 50 * (doc.steps ? Math.min(1, (doc.step ?? 0) / doc.steps) : 0));
    case 'data': return 70;
    case 'launch': return 80;
    case 'cleanup': return 88;
    case 'verifying': return 95;
    case 'done': return 100;
    default: return 0;
  }
}

/** The phases people see, each pass, active or waiting. */
export function phaseRows(doc: UninstallDoc | null, mode: Mode | null): { id: Phase; label: string; status: 'pass' | 'active' | 'pending' | 'fail' }[] {
  const rows: { id: Phase; label: string }[] = [
    { id: 'preparing', label: 'Find the install’s pieces' },
    { id: 'stacks', label: 'Delete CoderHelm’s stacks' },
    ...(mode === 'everything' ? [{ id: 'data' as Phase, label: 'Delete the data' }] : []),
    { id: 'launch', label: 'Delete the Launch Stack' },
    { id: 'cleanup', label: 'Remove logs, buckets, roles and the boundary' },
    { id: 'verifying', label: 'Check nothing is left' },
  ];
  const order = PHASES;
  const at = doc ? order.indexOf(doc.phase === 'hybrid' ? 'preparing' : doc.phase) : -1;
  return rows.map((r) => {
    const i = order.indexOf(r.id);
    if (doc?.phase === 'done') return { ...r, status: 'pass' };
    if (doc?.phase === 'failed') return { ...r, status: 'pending' };
    return { ...r, status: i < at ? 'pass' : i === at ? 'active' : 'pending' };
  });
}

/** Entries by kind: "3 stacks", "1 data bucket". */
export function byKind(list: Entry[]): { kind: string; count: number; names: string[] }[] {
  const m = new Map<string, string[]>();
  for (const e of list) m.set(e.kind, [...(m.get(e.kind) ?? []), e.name]);
  return [...m].map(([kind, names]) => ({ kind, count: names.length, names }));
}

export function plural(kind: string, n: number): string {
  if (n === 1) return kind;
  if (kind.endsWith('y') && !kind.endsWith('ey')) return `${kind.slice(0, -1)}ies`;
  return `${kind}s`;
}

export function stepOf(s: UninstallState, doc: UninstallDoc | null): StepId {
  if (doc && (doc.phase === 'done' || (doc.phase === 'failed' && doc.left.length + doc.problems.length > 0))) return 'check';
  if (s.launchedAt) return 'remove';
  if (Object.keys(validate(s)).length) return 'choose';
  return 'confirm';
}
