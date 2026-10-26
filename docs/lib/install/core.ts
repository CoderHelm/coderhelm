// The install guide's decisions, kept apart from the page so they can be
// tested without a browser (scripts/install-core.test.mjs runs this file
// with Node's type stripping: erasable TypeScript only, no imports).
//
// The guide talks to three places only: the AWS console (a link the person
// opens), GitHub (a form the person submits) and the person's own install
// (its progress file in their S3 bucket, then its /api/setup/status). The
// contract is docs/self-host/setup-checks.md in coderhelm-platform.

/** Used when launch/latest.json can't be read: the first release with the Launch Stack. */
export const FALLBACK_VERSION = 'v0.7.0';
export const PUBLIC_BUCKET = 'coderhelm-public';
export const LATEST_URL = `https://${PUBLIC_BUCKET}.s3.amazonaws.com/launch/latest.json`;
export const REPO = 'CoderHelm/coderhelm-platform';

export type Provider = 'bedrock' | 'anthropic';
export type StepId = 'start' | 'aws' | 'domain' | 'address' | 'github' | 'models' | 'ready';
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'aws', label: 'AWS' },
  { id: 'github', label: 'GitHub' },
  { id: 'models', label: 'Models' },
  { id: 'ready', label: 'Ready' },
];

/** The steps for this install: a Domain step after AWS for their own domain, an Address step for a CoderHelm address. */
export function stepsFor(s: Pick<InstallState, 'domainChoice'>): { id: StepId; label: string }[] {
  if (s.domainChoice === 'own') return [STEPS[0], { id: 'domain', label: 'Domain' }, ...STEPS.slice(1)];
  if (s.domainChoice === 'coderhelm') return [STEPS[0], { id: 'address', label: 'Address' }, ...STEPS.slice(1)];
  return STEPS;
}

/** How long each step takes, as people should expect it. */
export const STEP_TIME: Record<StepId, string> = {
  start: '1 min',
  aws: 'about 20 min, mostly waiting',
  domain: 'up to 30 min',
  address: 'about 30 min, by itself',
  github: '1 min',
  models: '1 to 15 min',
  ready: '1 min',
};

// ── Setups: fully private or hybrid ──────────────────────────────────────

export type Setup = 'private' | 'hybrid';

/** The two setups, side by side, with honest trade-offs. */
export const SETUPS: { id: Setup; title: string; tag?: string; gets: string[]; tradeoff: string }[] = [
  {
    id: 'private',
    title: 'Fully private',
    gets: ['The AWS address or your own domain', 'Your own GitHub App, made in one click', 'Nothing goes through CoderHelm'],
    tradeoff: 'One more step: you create a GitHub App (GitHub asks you to press one button).',
  },
  {
    id: 'hybrid',
    title: 'Hybrid',
    tag: 'Easiest',
    gets: ['yourname.coderhelm.com, set up for you', 'CoderHelm\u2019s GitHub App: install it and you\u2019re done', 'Your code and data still stay in your AWS account'],
    tradeoff: 'GitHub events pass through CoderHelm on their way to you (checked, re-signed, never stored past retries).',
  },
];

/** The suffix every CoderHelm address has. */
export const NAME_ZONE = 'coderhelm.com';
/** CoderHelm's API, which the guide asks whether a name is free. */
export const HOSTED_API = 'https://api.coderhelm.com';
export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** A name as people type it: lowercase, without the suffix. */
export function cleanName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.coderhelm\.com\.?$/, '').replace(/\s+/g, '-');
}

/** What's wrong with a name before asking CoderHelm (the same rules as the server). */
export function nameProblem(raw: string): string | null {
  const n = cleanName(raw);
  if (!n) return 'Type a name, such as your company\u2019s.';
  if (!/^[a-z0-9-]+$/.test(n)) return 'Use lowercase letters, digits and hyphens only.';
  if (n.length < 3) return 'Use at least 3 characters.';
  if (n.length > 40) return 'Use at most 40 characters.';
  if (n.startsWith('-') || n.endsWith('-')) return 'Start and end with a letter or a digit.';
  if (n.includes('--')) return 'Two hyphens in a row aren\u2019t allowed.';
  return null;
}

export function nameCheckUrl(name: string): string {
  return `${HOSTED_API}/hybrid/names/${encodeURIComponent(cleanName(name))}`;
}

/** What the guide calls on the install itself for hybrid (simple POSTs: the setup key is in the body). */
export function hybridUrl(installUrl: string, path: '' | '/register' | '/name' | '/github/link' | '/settings'): string {
  return `${installUrl.replace(/\/+$/, '')}/api/setup/hybrid${path}`;
}

/** The monthly AWS cost for a small team (the same lines as the CLI's summary). */
export const COST_LINES: [string, number, number][] = [
  ['Lambda, API Gateway, SQS, DynamoDB, EventBridge', 2, 15],
  ['CloudFront and the dashboard bucket', 1, 5],
  ['KMS keys (4)', 4, 4],
  ['Secrets Manager, SSM', 0.4, 1],
  ['CloudWatch Logs', 1, 10],
  ['Build sandbox (CodeBuild, by the minute)', 3, 25],
  ['Updates and email', 0, 2],
];
export function monthlyCost(provider: Provider): { low: number; high: number; model: string } {
  const low = Math.round(COST_LINES.reduce((a, l) => a + l[1], 0));
  const high = Math.round(COST_LINES.reduce((a, l) => a + l[2], 0));
  return { low, high, model: provider === 'bedrock' ? 'Claude on Bedrock is per token, on this AWS bill' : 'Claude is per token, on each team\u2019s Anthropic bill' };
}

/** What the stack creates in their account, in plain words. */
export const CREATES: { what: string; why: string }[] = [
  { what: 'A CloudFormation stack', why: 'Runs the installer once, in CodeBuild' },
  { what: 'Lambda functions and an HTTP API', why: 'CoderHelm itself: pay per use, nothing idling' },
  { what: 'DynamoDB tables and an S3 bucket', why: 'Your runs, settings and files, encrypted' },
  { what: 'CloudFront and Cognito', why: 'The web address and sign-in' },
];

/** Regions with Claude on Amazon Bedrock, by the names people know them by. */
export const REGIONS: { id: string; name: string }[] = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'ca-central-1', name: 'Canada (Central)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-west-3', name: 'Europe (Paris)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'eu-north-1', name: 'Europe (Stockholm)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
  { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { id: 'sa-east-1', name: 'South America (São Paulo)' },
];

/** Everything the guide remembers (localStorage). The setup key never goes in the URL. */
export interface InstallState {
  statusId: string;
  setupToken: string;
  region: string;
  stage: string;
  email: string;
  provider: Provider;
  org: string;
  version: string;
  url: string;
  launchedAt: number | null;
  attempt: number;
  /** The GitHub App's slug, from GitHub's return (the shared status has none). */
  appSlug: string;
  /** The AWS address (default), the person's own domain, or a CoderHelm address. */
  domainChoice: 'aws' | 'own' | 'coderhelm';
  /** Fully private or hybrid. */
  setup: Setup;
  /** The CoderHelm address name (domainChoice 'coderhelm'). */
  coderhelmName: string;
  /** Their own GitHub App, or CoderHelm's through the relay. */
  githubChoice: 'own' | 'hosted';
  /** Share failed-delivery metadata with CoderHelm support (off by default). */
  sharing: boolean;
  /** Their domain, e.g. coderhelm.example.com (only with domainChoice 'own'). */
  hostname: string;
  /** They chose to finish on the AWS address and add the domain later. */
  domainSkipped: boolean;
  /** Who sends CoderHelm's email; empty uses their own address. */
  emailFrom: string;
  /** An email domain anyone may sign up from; empty for only them (they invite people later). */
  signupDomain: string;
  /** Install new releases by themselves, in the window. */
  autoUpdate: boolean;
  updateWindow: string;
  updateTimezone: string;
  /** The domain part of the progress file, kept so a refresh still shows the records. */
  domainDoc: DomainDoc | null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STAGE_RE = /^[a-z][a-z0-9-]{0,19}$/;
export const STATUS_ID_RE = /^[a-z0-9]{16}$/;
export const TAG_RE = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
/** A hostname people type: lowercase labels, a dot, a real top-level domain. */
export const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const WINDOW_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|daily) ([01]\d|2[0-3]):00$/;
export const TIMEZONE_RE = /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/;
export const DEFAULT_WINDOW = 'Sun 03:00';

/** Random lowercase letters and digits from the browser's crypto. */
export function randomId(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function newState(over: Partial<InstallState> = {}): InstallState {
  return {
    statusId: randomId(16),
    setupToken: randomId(40, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
    region: 'us-east-1',
    stage: 'prod',
    email: '',
    provider: 'bedrock',
    org: '',
    version: FALLBACK_VERSION,
    url: '',
    launchedAt: null,
    attempt: 1,
    appSlug: '',
    domainChoice: 'aws',
    setup: 'private',
    coderhelmName: '',
    githubChoice: 'own',
    sharing: false,
    hostname: '',
    domainSkipped: false,
    emailFrom: '',
    signupDomain: '',
    autoUpdate: false,
    updateWindow: DEFAULT_WINDOW,
    updateTimezone: 'UTC',
    domainDoc: null,
    ...over,
  };
}

/** What someone typed as a domain, as a bare lowercase hostname. */
export function cleanHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
}

/** Problems with what the person typed, as one plain sentence each. */
export function validate(s: Pick<InstallState, 'email' | 'stage' | 'region'> & Partial<InstallState>): Record<string, string> {
  const p: Record<string, string> = {};
  if (!EMAIL_RE.test(s.email.trim())) p.email = 'Enter the email you will sign in with.';
  if (!STAGE_RE.test(s.stage)) p.stage = 'Use 1 to 20 lowercase letters, digits or hyphens, starting with a letter.';
  if (!REGIONS.some((r) => r.id === s.region)) p.region = 'Pick a region from the list.';
  if (s.domainChoice === 'coderhelm') {
    const np = nameProblem(s.coderhelmName ?? '');
    if (np) p.coderhelmName = np;
  }
  if (s.domainChoice === 'own') {
    const h = cleanHostname(s.hostname ?? '');
    if (!HOST_RE.test(h)) p.hostname = 'Enter a hostname such as coderhelm.example.com.';
    else if (/\.(cloudfront\.net|amazonaws\.com)$/.test(h)) p.hostname = 'Enter a domain you own, not an AWS address.';
  }
  if (s.emailFrom && !EMAIL_RE.test(s.emailFrom.trim())) p.emailFrom = 'Enter an email address, or leave it empty to use yours.';
  if (s.signupDomain && !HOST_RE.test(s.signupDomain.trim().toLowerCase().replace(/^@/, ''))) p.signupDomain = 'Enter an email domain such as example.com, or leave it empty.';
  if (s.autoUpdate && s.updateWindow && !WINDOW_RE.test(s.updateWindow)) p.updateWindow = 'Pick a day and an hour.';
  if (s.autoUpdate && s.updateTimezone && !TIMEZONE_RE.test(s.updateTimezone)) p.updateTimezone = 'Enter a time zone such as Europe/Berlin, or UTC.';
  return p;
}

/** The release's template in S3 (CloudFormation only opens templates stored in S3). */
export function templateUrl(version: string): string {
  if (!TAG_RE.test(version)) throw new Error(`not a release tag: ${version}`);
  return `https://${PUBLIC_BUCKET}.s3.amazonaws.com/launch/${version}/coderhelm-launch.yaml`;
}

/** The newest release from launch/latest.json, or the fallback. */
export function pickVersion(latest: unknown): string {
  const v = (latest as { version?: unknown } | null)?.version;
  if (typeof v !== 'string' || !TAG_RE.test(v)) return FALLBACK_VERSION;
  return v;
}

/** The stack's name: coderhelm-<stage>, then -2, -3 for later attempts (a failed stack keeps its name). */
export function stackName(s: Pick<InstallState, 'stage' | 'attempt'>): string {
  return s.attempt > 1 ? `coderhelm-${s.stage}-${s.attempt}` : `coderhelm-${s.stage}`;
}

/**
 * The CloudFormation quick-create link: the console opens on the review
 * page with every value filled in. Capabilities can't be pre-ticked, so
 * the person ticks one box and presses Create stack.
 */
export function quickCreateUrl(s: InstallState): string {
  const params: [string, string][] = [
    ['templateURL', templateUrl(s.version)],
    ['stackName', stackName(s)],
    ['param_AdminEmail', s.email.trim().toLowerCase()],
    ['param_Stage', s.stage],
    ['param_ModelProvider', s.provider],
    ['param_Version', s.version],
    ['param_StatusId', s.statusId],
    ['param_SetupToken', s.setupToken],
  ];
  // The optional ones only when set, so the link stays short and older templates still open.
  if (s.domainChoice === 'own' && s.hostname) params.push(['param_Hostname', cleanHostname(s.hostname)]);
  if (s.emailFrom?.trim()) params.push(['param_EmailFrom', s.emailFrom.trim().toLowerCase()]);
  if (s.signupDomain?.trim()) params.push(['param_SignupDomain', s.signupDomain.trim().toLowerCase().replace(/^@/, '')]);
  if (s.autoUpdate) {
    params.push(['param_AutoUpdate', 'on']);
    if (s.updateWindow && s.updateWindow !== DEFAULT_WINDOW) params.push(['param_UpdateWindow', s.updateWindow]);
    if (s.updateTimezone && s.updateTimezone !== 'UTC') params.push(['param_UpdateTimezone', s.updateTimezone]);
  }
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://${s.region}.console.aws.amazon.com/cloudformation/home?region=${s.region}#/stacks/create/review?${q}`;
}

/** The progress file the installer keeps in the person's own bucket. */
export function statusFileUrl(s: Pick<InstallState, 'statusId' | 'region'>): string {
  return `https://coderhelm-setup-${s.statusId}.s3.${s.region}.amazonaws.com/status.json`;
}

export function stacksConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks`;
}

/** An install URL from what someone pasted: https only, origin only. */
export function normalizeUrl(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Accepts the {"install":"<url>"} the stack's CoderHelm output shows, too. */
export function urlFromPaste(raw: string): string | null {
  const m = raw.match(/"install"\s*:\s*"([^"]+)"/);
  return normalizeUrl(m ? m[1] : raw);
}

// ── GitHub App manifest ──────────────────────────────────────────────────

/** Exactly what CoderHelm uses (same as installer/lib/github-app.mjs in coderhelm-platform). */
export const GITHUB_PERMISSIONS: Record<string, 'read' | 'write'> = {
  contents: 'write',
  pull_requests: 'write',
  issues: 'write',
  checks: 'read',
  actions: 'read',
  statuses: 'read',
  workflows: 'write',
  metadata: 'read',
  email_addresses: 'read',
};

/** Why each permission, in plain words (shown under Details). */
export const PERMISSION_REASONS: Record<string, string> = {
  contents: 'Read code and push branches with its changes',
  pull_requests: 'Open and update pull requests, post reviews',
  issues: 'Read issues it is assigned and comment progress',
  checks: 'Read check results to fix failing CI',
  actions: 'Read workflow runs and their logs',
  statuses: 'Read commit statuses from CI that reports them',
  workflows: 'Change workflow files when a task asks for it',
  metadata: 'List repositories and their basic details',
  email_addresses: 'The email of the person who connects their GitHub account',
};

export const GITHUB_EVENTS = [
  'issues',
  'issue_comment',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'pull_request_review_thread',
  'push',
  'check_run',
  'check_suite',
  'workflow_run',
  'repository',
];

/** The manifest GitHub registers the app from; GitHub sends the code to the install itself. */
export function githubManifest(s: Pick<InstallState, 'url' | 'stage' | 'statusId'>) {
  const url = s.url.replace(/\/+$/, '');
  return {
    // App names are unique across GitHub: the progress ID keeps this one unique.
    name: `CoderHelm ${s.stage} ${s.statusId.slice(0, 4)}`,
    url,
    hook_attributes: { url: `${url}/webhooks/github`, active: true },
    redirect_url: `${url}/api/setup/github/callback`,
    callback_urls: [`${url}/auth/github/callback`],
    setup_url: `${url}/settings/github/`,
    setup_on_update: true,
    description: 'CoderHelm in your own AWS account: turns issues into pull requests and reviews them.',
    public: false,
    default_permissions: GITHUB_PERMISSIONS,
    default_events: GITHUB_EVENTS,
  };
}

/** Where the manifest form posts: a personal account or an organization. */
export function newAppUrl(org: string, state: string): string {
  const o = org.trim();
  const base = o ? `https://github.com/organizations/${encodeURIComponent(o)}/settings/apps/new` : 'https://github.com/settings/apps/new';
  return `${base}?state=${encodeURIComponent(state)}`;
}

export function cliGithubCommand(s: Pick<InstallState, 'stage' | 'region'>): string {
  return `npx -y github:${REPO} pull --stage ${s.stage} --region ${s.region} && npx -y github:${REPO} github-app`;
}

// ── Progress and checks ──────────────────────────────────────────────────

export type Phase = 'starting' | 'preparing' | 'deploying' | 'finishing' | 'done' | 'failed';

/** One DNS record to add, as the installer lists it in the progress file. */
export interface DnsRecord {
  purpose: 'certificate' | 'address';
  name: string;
  type: string;
  value: string;
}

/** The domain part of the progress file: how it is set up and the records to add. */
export interface DomainDoc {
  hostname: string;
  mode: 'route53' | 'external';
  state: string;
  records: DnsRecord[];
}

export interface StatusDoc {
  schema: number;
  phase: Phase;
  domain?: DomainDoc | null;
  message?: string;
  step?: number | null;
  steps?: number | null;
  url?: string | null;
  fix?: string | null;
  logUrl?: string | null;
  updatedAt?: string;
}

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'wait' | 'skip';

export interface Check {
  id: string;
  label?: string;
  status: CheckStatus;
  code: string;
  required?: boolean;
  detail?: Record<string, unknown>;
}

export interface SetupStatus {
  schema: number;
  ready: boolean;
  version?: string | null;
  github_manifest_ready?: boolean;
  checks: Check[];
}

/** A status file we can use, or null. */
export function parseStatusDoc(v: unknown): StatusDoc | null {
  const d = v as StatusDoc | null;
  if (!d || typeof d !== 'object' || d.schema !== 1) return null;
  if (!['starting', 'preparing', 'deploying', 'finishing', 'done', 'failed'].includes(d.phase)) return null;
  const dom = d.domain as DomainDoc | null | undefined;
  const okDomain = !!dom && typeof dom === 'object' && typeof dom.hostname === 'string' && HOST_RE.test(dom.hostname);
  const records = okDomain && Array.isArray(dom.records)
    ? dom.records.filter((r) => r && typeof r.name === 'string' && typeof r.value === 'string' && HOST_RE.test(r.name.replace(/^_/, 'x')) && /^[a-z0-9._-]+$/i.test(r.value))
    : [];
  return { ...d, domain: okDomain ? { hostname: dom.hostname, mode: dom.mode === 'route53' ? 'route53' : 'external', state: String(dom.state ?? ''), records } : null };
}

export function findCheck(s: SetupStatus | null, id: string): Check | undefined {
  return s?.checks.find((c) => c.id === id);
}

export type RowStatus = 'pass' | 'fail' | 'active' | 'pending';

/**
 * The install progress rows, from the progress file and whether the install
 * answers. "active" is the row being worked on; "pending" hasn't started.
 */
export function progressRows(doc: StatusDoc | null, answering: boolean, launched: boolean) {
  const order: Phase[] = ['starting', 'preparing', 'deploying', 'finishing', 'done'];
  // A failed install stopped while deploying when it had reached a part, else before.
  const failedAt = doc?.step ? 2 : 0;
  const at = answering ? order.length - 1 : !doc ? -1 : doc.phase === 'failed' ? failedAt : order.indexOf(doc.phase);
  const rows: { id: string; label: string; status: RowStatus }[] = [
    { id: 'stack', label: 'Stack created in your AWS account', status: at >= 0 ? 'pass' : launched ? 'active' : 'pending' },
    { id: 'release', label: 'Release downloaded and its signature checked', status: at >= 2 ? 'pass' : at >= 0 ? 'active' : 'pending' },
    { id: 'deploy', label: 'CoderHelm deployed', status: at >= 4 ? 'pass' : at >= 2 ? 'active' : 'pending' },
    { id: 'answering', label: 'CoderHelm is answering', status: answering ? 'pass' : at >= 4 ? 'active' : 'pending' },
  ];
  if (doc?.phase === 'failed' && !answering) {
    // The failure belongs to the first row that isn't done.
    const i = rows.findIndex((r) => r.status !== 'pass');
    rows.forEach((r, j) => {
      if (j === i) r.status = 'fail';
      else if (j > i) r.status = 'pending';
    });
  }
  return rows;
}

/** Which screen to show, from what is known. The install's own answers win over memory. */
export function deriveStep(s: Pick<InstallState, 'launchedAt' | 'url'> & Partial<Pick<InstallState, 'domainChoice' | 'domainSkipped' | 'githubChoice'>>, setup: SetupStatus | null): StepId {
  if (!s.launchedAt && !s.url) return 'start';
  if (!setup) return 'aws';
  // Their own domain first, so the GitHub App gets the domain's URLs. An
  // install too old to report the domain doesn't hold anyone up.
  const domain = findCheck(setup, 'domain');
  if (s.domainChoice === 'own' && !s.domainSkipped && domain && domain.status !== 'pass' && domain.code !== 'none') return 'domain';
  // A CoderHelm address: registered, claimed and live, all by itself.
  if (s.domainChoice === 'coderhelm' && !s.domainSkipped) {
    const reg = findCheck(setup, 'hybrid_registered');
    const name = findCheck(setup, 'hybrid_name');
    if (!reg || reg.status !== 'pass' || !name || name.status !== 'pass') return 'address';
  }
  const app = findCheck(setup, 'github_app');
  const installed = findCheck(setup, 'github_installed');
  if (app?.status !== 'pass' || (installed && installed.status !== 'pass')) return 'github';
  const models = findCheck(setup, 'models');
  // A failure, or a warning that is still in the way (the subscription being set up).
  if (models && (models.status === 'fail' || (models.status === 'warn' && models.code !== 'ok'))) return 'models';
  return 'ready';
}

/** One plain sentence and the fix for each code the install can send. */
export const CHECK_TEXT: Record<string, Record<string, { title: string; fix?: string }>> = {
  github_app: {
    ok: { title: 'GitHub App created' },
    missing: { title: 'No GitHub App yet', fix: 'Create it on GitHub: one click, then press Create GitHub App.' },
    missing_no_setup_key: { title: 'No GitHub App yet', fix: 'This browser no longer has the setup key. Create the app from a terminal with the command below.' },
    secret_unreadable: { title: 'CoderHelm cannot read its own keys', fix: 'Open the installer log in AWS, then press Check again.' },
    hosted_app: { title: 'Using CoderHelm\u2019s GitHub App' },
  },
  github_installed: {
    ok: { title: 'Installed on your repositories' },
    needs_app: { title: 'Install it on your repositories', fix: 'Create the GitHub App first.' },
    not_installed: { title: 'Not installed on any repository yet', fix: 'Install the app and pick the repositories CoderHelm may work on.' },
    app_rejected: { title: 'GitHub does not accept the app’s key', fix: 'The app may have been deleted on GitHub. Create a new one with the terminal command below.' },
    bad_key: { title: 'The stored app key is damaged', fix: 'Create a new GitHub App with the terminal command below.' },
    github_unreachable: { title: 'GitHub did not answer', fix: 'This usually passes on its own. Press Check again in a minute.' },
    not_linked: { title: 'Install CoderHelm\u2019s GitHub App on your repositories', fix: 'Press Install on GitHub, pick the repositories, and sign in to GitHub when it asks.' },
  },
  models: {
    ok: { title: 'Claude on Amazon Bedrock works' },
    anthropic_keys_per_team: { title: 'Anthropic API keys are added per team', fix: 'After you sign in, add your Anthropic key in Settings, AI models.' },
    use_case_required: { title: 'AWS needs a one-time form before Claude can run', fix: 'Open the Anthropic page in Bedrock, fill in the short use case form and submit it. A GitHub profile works as the website.' },
    access_denied: { title: 'This account does not have access to Claude yet', fix: 'Open the Anthropic page in Bedrock and request access. Then press Check again.' },
    subscription_pending: { title: 'AWS is finishing the model subscription', fix: 'This takes up to 15 minutes. This page checks again by itself.' },
    marketplace_failed: { title: 'AWS could not complete the model subscription', fix: 'This is usually a missing or expired payment method. Fix it in AWS Billing, then press Check again.' },
    iam_denied: { title: 'CoderHelm is not allowed to call Bedrock', fix: 'Your account has a policy that blocks Bedrock (often an organization rule). Ask your AWS admin to allow bedrock:InvokeModel.' },
    not_available: { title: 'These models are not offered in this region', fix: 'Install in a region that has Claude, such as US East (N. Virginia), or switch to Anthropic API keys.' },
    no_models: { title: 'No models are configured', fix: 'Open Settings, AI models in CoderHelm after you sign in.' },
    no_client: { title: 'Bedrock is not set up in this install', fix: 'Open the installer log in AWS, then press Check again.' },
    unknown: { title: 'Bedrock refused the test call', fix: 'Press Check again. If it keeps failing, open the Anthropic page in Bedrock and check access.' },
  },
  email: {
    ok: { title: 'Email is ready' },
    identity_unverified: { title: 'Confirm the sender address', fix: 'AWS emailed a link to the sender address. Click it to let CoderHelm send email.' },
    sandbox: { title: 'Email only reaches confirmed addresses for now', fix: 'New AWS accounts start in the SES sandbox. Request production access when your team joins.' },
    unknown: { title: 'Email could not be checked', fix: 'You can check it later in Settings.' },
  },
  domain: {
    ok: { title: 'CoderHelm answers on your domain' },
    none: { title: 'CoderHelm uses its AWS address', fix: 'Add your own domain any time in CoderHelm: Settings, System, Domain.' },
    validating: { title: 'Waiting for the certificate record', fix: 'Add the records below where your domain’s DNS is hosted. New records can take up to an hour to show up; this page checks by itself.' },
    zone_not_delegated: { title: 'Your domain doesn’t use its Route 53 zone yet', fix: 'At the company you bought the domain from, set the name servers to the four in your Route 53 zone (Route 53, Hosted zones, your zone, the NS record). It can take up to a day.' },
    validation_wrong_value: { title: 'The certificate record has a different value', fix: 'Edit the record and paste the value below exactly, then save.' },
    caa_blocked: { title: 'Your domain doesn’t allow Amazon certificates', fix: 'Add a CAA record with the value 0 issue "amazon.com" next to your existing ones, then press Try again in CoderHelm: Settings, System, Domain.' },
    certificate_failed: { title: 'AWS could not issue the certificate', fix: 'Check the records below, then press Try again in CoderHelm: Settings, System, Domain.' },
    attaching: { title: 'Moving CoderHelm to your domain', fix: 'The certificate is issued. This takes about 10 minutes; this page follows along.' },
    attach_failed: { title: 'Moving to your domain failed', fix: 'Usually the hostname is still on another CloudFront distribution: remove it there, then press Try again in CoderHelm: Settings, System, Domain.' },
    dns_missing: { title: 'Waiting for the address record', fix: 'Add the address record below. New records can take up to an hour to show up; this page checks by itself.' },
    dns_wrong_value: { title: 'Your domain points somewhere else', fix: 'Edit the address record so its value is the CloudFront address below, then save.' },
    cname_at_apex: { title: 'The root of a domain can’t have a CNAME record', fix: 'Use a subdomain such as coderhelm.yourdomain.com instead, or an ALIAS or ANAME record if your DNS provider has one.' },
    https_failed: { title: 'Something else answers on your domain', fix: 'Point the record at the CloudFront address only, with no proxy in front. With Cloudflare, set the record to DNS only.' },
    api_unreachable: { title: 'The page loads but CoderHelm’s API doesn’t answer there', fix: 'Wait a few minutes and press Check again. If it stays, run the doctor command from Check your install.' },
    removing: { title: 'Moving back to the AWS address', fix: 'This takes about 10 minutes; this page follows along.' },
    unknown: { title: 'The domain could not be checked', fix: 'This usually passes on its own. Press Check again in a minute.' },
  },
  hybrid_registered: {
    ok: { title: 'Registered with CoderHelm' },
    not_registered: { title: 'Registering with CoderHelm', fix: 'This page does it by itself as soon as your CoderHelm answers.' },
    proof_failed: { title: 'CoderHelm can\u2019t reach your install yet', fix: 'It restarts after registering. This page tries again by itself; if it stays, check that your CloudFront address opens.' },
  },
  hybrid_name: {
    ok: { title: 'Your CoderHelm address is live' },
    requested: { title: 'Requesting the certificate', fix: 'Your install asks AWS for a certificate in your account. This page follows along.' },
    cert_pending: { title: 'Waiting for AWS to issue the certificate', fix: 'CoderHelm added the records. AWS usually issues it within 30 minutes; nothing to do.' },
    attaching: { title: 'Moving CoderHelm to the address', fix: 'About 10 minutes. It keeps working on its AWS address meanwhile.' },
    taken: { title: 'That name is taken', fix: 'Pick another name below; this page claims it for you.' },
    reserved: { title: 'That name is reserved', fix: 'Pick another name below; this page claims it for you.' },
    unknown: { title: 'The address isn\u2019t working yet', fix: 'Open Settings, System, Domain in CoderHelm for the reason and press Try again.' },
  },
  hybrid_github: {
    ok: { title: 'CoderHelm\u2019s GitHub App is linked' },
    no_link: { title: 'Install CoderHelm\u2019s GitHub App', fix: 'Press Install on GitHub, pick the repositories, and sign in to GitHub when it asks.' },
  },
  hybrid_access: {
    broker_revoked: { title: 'CoderHelm turned off this install\u2019s access', fix: 'Contact support, or switch to your own GitHub App and domain.' },
  },
  hybrid_relay: {
    signature_mismatch: { title: 'Your install refused CoderHelm\u2019s signature', fix: 'The relay keys differ: register again in CoderHelm, Settings, System, Hybrid.' },
    signature_stale: { title: 'Forwarded events arrived late', fix: 'Usually a slow retry; check your install\u2019s clock if it keeps happening.' },
  },
  google_sign_in: {
    ok: { title: 'Sign in with Google is on' },
    off: { title: 'Sign in with Google', fix: 'Optional, and it needs your own domain: create a Google OAuth client and add its keys to your install.' },
    missing_keys: { title: 'Sign in with Google is missing its keys', fix: 'Add google_client_id and google_client_secret to your install’s secret, then deploy again.' },
  },
  updates: {
    ok: { title: 'Automatic updates are on' },
    auto_off: { title: 'Automatic updates', fix: 'Optional: turn them on in CoderHelm, Settings, System, and pick a maintenance window.' },
    unknown: { title: 'Updates could not be checked', fix: 'Open Settings, System in CoderHelm after you sign in.' },
  },
  admin: {
    ok: { title: 'You are signed up' },
    not_signed_up: { title: 'Sign up as the first admin', fix: 'Open CoderHelm and sign up with the email you entered.' },
    unconfirmed: { title: 'Confirm your email', fix: 'Enter the code CoderHelm emailed you to finish signing up.' },
    no_admin_configured: { title: 'No admin email is set', fix: 'Sign up at your CoderHelm. The first person to sign up becomes an admin.' },
    unknown: { title: 'Sign up as the first admin', fix: 'Open CoderHelm and sign up with the email you entered.' },
  },
};

export function checkText(c: Pick<Check, 'id' | 'code' | 'status'> & { label?: string }): { title: string; fix?: string } {
  return CHECK_TEXT[c.id]?.[c.code] ?? { title: c.label || `${c.id.replace(/_/g, ' ')}: ${c.status}` };
}

/** What came back from the GitHub manifest flow (?github=), as one sentence and what to do. */
export const GITHUB_OUTCOMES: Record<string, { ok: boolean; title: string; fix?: string }> = {
  created: { ok: true, title: 'GitHub App created. Its keys went straight to your CoderHelm.' },
  created_restart_needed: { ok: true, title: 'GitHub App created.', fix: 'CoderHelm stored the keys but could not restart itself. In CoderHelm, open Settings, System and press Update to apply them.' },
  exists: { ok: true, title: 'Your CoderHelm already has a GitHub App.' },
  bad_state: { ok: false, title: 'Your CoderHelm did not recognize this request.', fix: 'The setup key in this browser does not match your install. Create the app from a terminal with the command below.' },
  bad_code: { ok: false, title: 'GitHub sent back something unexpected.', fix: 'Press Create GitHub App again.' },
  github_refused: { ok: false, title: 'GitHub did not hand over the app’s keys.', fix: 'The link from GitHub works once, for one hour. Press Create GitHub App again. GitHub may show the first app: delete it in GitHub settings, Developer settings.' },
  github_unreachable: { ok: false, title: 'Your CoderHelm could not reach GitHub.', fix: 'Press Create GitHub App again in a minute.' },
  store_failed: { ok: false, title: 'Your CoderHelm could not save the app’s keys.', fix: 'Open the installer log in AWS, then create the app from a terminal with the command below.' },
};

/** What came back from linking CoderHelm's GitHub App (?hybrid_github=). */
export const HYBRID_GITHUB_OUTCOMES: Record<string, { ok: boolean; title: string; fix?: string }> = {
  linked: { ok: true, title: 'CoderHelm\u2019s GitHub App is linked to your install.' },
  not_yours: { ok: false, title: 'GitHub says that installation isn\u2019t yours.', fix: 'Sign in to GitHub as an owner of the organization you installed the app on, then press Install on GitHub again.' },
  linked_elsewhere: { ok: false, title: 'That installation is already linked to another CoderHelm.', fix: 'Uninstall it there first, or install the app on another organization.' },
  used_by_hosted_team: { ok: false, title: 'That installation belongs to a team on coderhelm.com.', fix: 'Install the app on another organization, or use your own GitHub App.' },
  signin_failed: { ok: false, title: 'GitHub didn\u2019t finish signing you in.', fix: 'Press Install on GitHub again and allow the sign-in.' },
  github_unreachable: { ok: false, title: 'CoderHelm couldn\u2019t reach GitHub.', fix: 'Press Install on GitHub again in a minute.' },
  store_failed: { ok: false, title: 'CoderHelm couldn\u2019t save the link.', fix: 'Press Install on GitHub again in a minute.' },
};

/** What the install said when a hybrid call was refused, as one sentence and the fix. */
export const HYBRID_ERRORS: Record<string, { title: string; fix: string }> = {
  taken: { title: 'That name is taken.', fix: 'Pick another name.' },
  reserved: { title: 'That name is reserved.', fix: 'Pick another name.' },
  proof_failed: { title: 'CoderHelm can\u2019t reach your install yet.', fix: 'It restarts after registering: this page tries again in a few seconds.' },
  hosted_unreachable: { title: 'Your install can\u2019t reach CoderHelm.', fix: 'Check that it can open api.coderhelm.com (a firewall or VPC rule), then press Try again.' },
  broker_unreachable: { title: 'Your install can\u2019t reach CoderHelm.', fix: 'Check that it can open api.coderhelm.com, then press Try again.' },
  broker_refused: { title: 'CoderHelm refused the request.', fix: 'Press Try again; if it stays, open Settings, System, Hybrid in CoderHelm.' },
  broker_revoked: { title: 'CoderHelm turned off this install\u2019s access.', fix: 'Contact support, or switch to the fully private setup.' },
  signature_mismatch: { title: 'The keys on the two sides differ.', fix: 'Register again in CoderHelm: Settings, System, Hybrid.' },
  bad_setup_key: { title: 'This browser\u2019s setup key doesn\u2019t match your install.', fix: 'Finish in CoderHelm: Settings, System, Hybrid.' },
  setup_closed: { title: 'Setup is finished.', fix: 'Continue in CoderHelm: Settings, System, Hybrid.' },
  no_cloudfront: { title: 'Your install\u2019s address isn\u2019t known yet.', fix: 'This page tries again by itself.' },
  rate_limited: { title: 'Too many tries.', fix: 'Wait a minute and press Try again.' },
};
export function hybridError(code: string | undefined, fallback: string): { title: string; fix: string } {
  return (code && HYBRID_ERRORS[code]) || { title: fallback, fix: 'Press Try again.' };
}

// ── Remembering (localStorage + URL) ─────────────────────────────────────

export const STORAGE_PREFIX = 'coderhelm-install:';
export const STORAGE_LAST = `${STORAGE_PREFIX}last`;

/** The non-secret part of the state, for the address bar (bookmarkable, shareable with yourself). */
export function stateToQuery(s: InstallState): string {
  const q = new URLSearchParams();
  if (s.launchedAt || s.url) {
    q.set('id', s.statusId);
    q.set('region', s.region);
    q.set('stage', s.stage);
  }
  if (s.url) q.set('url', s.url);
  return q.toString();
}

/** What the address bar says (also the stack's InstallGuide output). */
export function queryToPartial(search: string): Partial<InstallState> & { github?: string; app?: string; hybridGithub?: string } {
  const q = new URLSearchParams(search);
  const out: Partial<InstallState> & { github?: string; app?: string; hybridGithub?: string } = {};
  const hg = q.get('hybrid_github');
  if (hg && /^[a-z_]{2,40}$/.test(hg)) out.hybridGithub = hg;
  const id = q.get('id');
  if (id && STATUS_ID_RE.test(id)) out.statusId = id;
  const region = q.get('region');
  if (region && REGIONS.some((r) => r.id === region)) out.region = region;
  const stage = q.get('stage');
  if (stage && STAGE_RE.test(stage)) out.stage = stage;
  const url = q.get('url');
  if (url) {
    const n = normalizeUrl(url);
    if (n) out.url = n;
  }
  const github = q.get('github');
  if (github && /^[a-z_]{2,40}$/.test(github)) out.github = github;
  const app = q.get('app');
  if (app && /^[A-Za-z0-9-]{1,80}$/.test(app)) out.app = app;
  return out;
}

/** A stored state, if it parses. */
export function parseStored(raw: string | null): InstallState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !STATUS_ID_RE.test(v.statusId)) return null;
    return { ...newState(), ...v };
  } catch {
    return null;
  }
}

/** How long the install has been running, as words. */
export function elapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'less than a minute';
  return m === 1 ? '1 minute' : `${m} minutes`;
}

export function bedrockConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/bedrock/home?region=${region}#/providers?provider=anthropic`;
}

export function sesConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/ses/home?region=${region}#/account`;
}

/** The Bedrock inference profile prefix the Launch Stack picks for a region ("auto"). */
export function bedrockPrefixFor(region: string): string {
  if (/^us-gov-/.test(region)) return 'us-gov.';
  if (/^(us|ca)-/.test(region)) return 'us.';
  if (/^eu-/.test(region)) return 'eu.';
  if (/^ap-/.test(region)) return 'apac.';
  return 'global.';
}

/** The models a new install calls (the release's defaults: primary and light), as Bedrock ids. */
export const DEFAULT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
export function defaultBedrockModels(region: string): string[] {
  const p = bedrockPrefixFor(region);
  return DEFAULT_MODELS.map((m) => `${p}anthropic.${m}`);
}

/**
 * The install's public GET /api/setup/status (shared with the CLI's doctor
 * and the dashboard's checklist; contract in docs/self-host/check-your-install.md).
 * It publishes no ids or URLs, so the guide adds its own links here: the
 * Bedrock and SES consoles for the region it launched in, and the models a
 * new install calls.
 */
export function parseSetupStatus(v: unknown, region: string): SetupStatus | null {
  const d = v as { schema?: number; setup_open?: boolean; version?: string; github_manifest_ready?: boolean; checks?: Check[] } | null;
  if (!d || typeof d !== 'object' || d.schema !== 1 || !Array.isArray(d.checks)) return null;
  if (d.setup_open === false) {
    // Someone has signed up: the setup window is closed and the install is ready.
    const checks: Check[] = ['api', 'github_app', 'github_installed', 'models', 'admin'].map((id) => ({ id, status: 'pass', code: 'ok' }));
    return { schema: 1, ready: true, version: d.version ?? null, github_manifest_ready: false, checks };
  }
  const checks = d.checks
    .filter((c) => c && typeof c.id === 'string' && typeof c.status === 'string')
    .map((c): Check => {
      if (c.id === 'models') {
        const models = c.status === 'pass' || c.status === 'skip' ? [] : defaultBedrockModels(region).map((id) => ({ id, status: 'fail' }));
        return { ...c, detail: { console_url: bedrockConsoleUrl(region), models } };
      }
      if (c.id === 'email') return { ...c, detail: { console_url: sesConsoleUrl(region) } };
      return { ...c };
    });
  return { schema: 1, ready: !!(d as { ready?: boolean }).ready, version: d.version ?? null, github_manifest_ready: d.github_manifest_ready, checks };
}

// ── Your own domain ──────────────────────────────────────────────────────

/** Domains with a two-part public suffix people commonly use (co.uk and the like). */
const TWO_PART_SUFFIXES = ['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'co.za', 'com.mx', 'com.sg'];

/** The registrable domain of a hostname (example.com for coderhelm.example.com), best effort. */
export function baseDomain(hostname: string): string {
  const labels = hostname.split('.');
  const two = labels.slice(-2).join('.');
  const n = TWO_PART_SUFFIXES.includes(two) ? 3 : 2;
  return labels.slice(-n).join('.');
}

/** What to type in a provider's Name box when it adds the domain itself ("@" for the root). */
export function relativeName(name: string, hostname: string): string {
  const base = baseDomain(hostname);
  if (name === base) return '@';
  return name.endsWith(`.${base}`) ? name.slice(0, -(base.length + 1)) : name;
}

/** Where people add DNS records, for the providers most people use. */
export const DNS_PROVIDERS: { id: string; name: string; where: string; url?: string }[] = [
  { id: 'cloudflare', name: 'Cloudflare', where: 'DNS, Records, Add record. Set Proxy status to DNS only (the grey cloud).', url: 'https://dash.cloudflare.com/' },
  { id: 'godaddy', name: 'GoDaddy', where: 'My Products, your domain, DNS, Add New Record. Type only the short name.', url: 'https://dcc.godaddy.com/control/portfolio' },
  { id: 'namecheap', name: 'Namecheap', where: 'Domain List, Manage, Advanced DNS, Add New Record. The Host is the short name.', url: 'https://ap.www.namecheap.com/domains/list/' },
  { id: 'squarespace', name: 'Squarespace (formerly Google Domains)', where: 'Domains, your domain, DNS, Custom records.', url: 'https://account.squarespace.com/domains' },
  { id: 'porkbun', name: 'Porkbun', where: 'Domain Management, your domain, DNS. The Host is the short name.', url: 'https://porkbun.com/account/domainsSpeedy' },
  { id: 'route53', name: 'Route 53 in another AWS account', where: 'Hosted zones, your zone, Create record. Record type CNAME.', url: 'https://console.aws.amazon.com/route53/v2/hostedzones' },
  { id: 'azure', name: 'Azure DNS', where: 'DNS zones, your zone, Record set. Type CNAME.', url: 'https://portal.azure.com/#browse/Microsoft.Network%2FdnsZones' },
  { id: 'other', name: 'Somewhere else', where: 'Open the DNS or zone settings where you bought the domain (or wherever its name servers are run) and add a CNAME record for each line.' },
];

export type DomainRow = { id: string; label: string; status: RowStatus };

/** The domain step's progress, from the install's domain code. */
export function domainRows(code: string | undefined, mode: 'route53' | 'external'): DomainRow[] {
  const at = (() => {
    switch (code) {
      case 'validating': case 'zone_not_delegated': case 'validation_wrong_value': case 'caa_blocked': case 'certificate_failed': return 0;
      case 'attaching': case 'attach_failed': return 1;
      case 'dns_missing': case 'dns_wrong_value': case 'cname_at_apex': return 2;
      case 'https_failed': case 'api_unreachable': return 3;
      case 'ok': return 4;
      default: return -1;
    }
  })();
  const failed = ['zone_not_delegated', 'validation_wrong_value', 'caa_blocked', 'certificate_failed', 'attach_failed', 'dns_wrong_value', 'cname_at_apex', 'https_failed', 'api_unreachable'].includes(code ?? '');
  const row = (i: number): RowStatus => (at > i ? 'pass' : at === i ? (failed ? 'fail' : 'active') : 'pending');
  const rows: DomainRow[] = [
    { id: 'certificate', label: mode === 'route53' ? 'Certificate checked through your Route 53 zone' : 'Certificate record found, certificate issued', status: row(0) },
    { id: 'move', label: 'CoderHelm moved to your domain', status: row(1) },
    { id: 'address', label: mode === 'route53' ? 'Address records made in your zone' : 'Address record found', status: row(2) },
    { id: 'https', label: 'CoderHelm answers on your domain over HTTPS', status: row(3) },
  ];
  return rows;
}

/** The Address step's progress, from the hybrid checks (and a claim the install refused). */
export function hybridRows(setup: SetupStatus | null, name: string, claimRefused: boolean): DomainRow[] {
  const reg = findCheck(setup, 'hybrid_registered');
  const nm = findCheck(setup, 'hybrid_name');
  const host = `${name || 'yourname'}.${NAME_ZONE}`;
  const r0: RowStatus = reg?.status === 'pass' ? 'pass' : reg?.status === 'fail' && reg.code !== 'not_registered' ? 'fail' : 'active';
  const at = (() => {
    if (!nm) return claimRefused ? -1 : 0;
    switch (nm.code) {
      case 'requested': case 'cert_pending': return 2;
      case 'attaching': return 3;
      case 'ok': return 4;
      default: return nm.status === 'fail' ? 3 : 2;
    }
  })();
  const failed = nm?.status === 'fail';
  const row = (i: number): RowStatus => (r0 !== 'pass' ? 'pending' : at > i ? 'pass' : at === i ? (failed ? 'fail' : 'active') : 'pending');
  return [
    { id: 'registered', label: 'Registered with CoderHelm and verified', status: r0 },
    { id: 'claimed', label: claimRefused ? 'Pick another name' : `${host} reserved for you`, status: r0 !== 'pass' ? 'pending' : claimRefused ? 'fail' : at >= 1 || nm ? 'pass' : 'active' },
    { id: 'certificate', label: 'Certificate issued in your AWS account', status: row(2) },
    { id: 'live', label: `CoderHelm answers on ${host}`, status: row(3) },
  ];
}

/** Once the domain answers, the guide follows the install there (the GitHub App then gets its URLs). */
export function domainUrl(s: Pick<InstallState, 'domainChoice' | 'hostname' | 'url'>, setup: SetupStatus | null): string | null {
  if (s.domainChoice !== 'own' || !s.hostname) return null;
  if (findCheck(setup, 'domain')?.status !== 'pass') return null;
  const want = `https://${cleanHostname(s.hostname)}`;
  return s.url === want ? null : want;
}

// ── Optional setup (after Ready) ─────────────────────────────────────────

export interface OptionalItem {
  id: string;
  title: string;
  why: string;
  /** done: the install says so; todo: it says not yet; auto: the install did it; unknown: no check before sign-in. */
  state: 'done' | 'todo' | 'auto' | 'unknown';
  /** One primary link, pre-filled where it can be. */
  action?: { label: string; href: string };
  fix?: string;
  doc: string;
}

/** Everything else a person can set up, each with its check (when the install reports one) and one action. */
export function optionalSetup(s: Pick<InstallState, 'url' | 'region' | 'provider' | 'domainChoice'>, setup: SetupStatus | null): OptionalItem[] {
  const url = s.url.replace(/\/+$/, '');
  const at = (path: string) => (url ? `${url}${path}` : path);
  const check = (id: string) => findCheck(setup, id);
  const state = (id: string): OptionalItem['state'] => {
    const c = check(id);
    if (!c) return 'unknown';
    return c.status === 'pass' ? 'done' : 'todo';
  };
  const email = check('email');
  const items: OptionalItem[] = [];
  const domain = check('domain');
  if (s.domainChoice !== 'coderhelm' && !(s.domainChoice === 'own' && domain?.status === 'pass')) {
    items.push({
      id: 'domain', title: 'Use your own domain', why: 'An address that’s easy to share, and Google sign-in needs one.',
      state: domain ? (domain.status === 'pass' ? 'done' : 'todo') : 'unknown',
      action: { label: 'Open Settings, System', href: at('/settings/system/#domain') },
      fix: domain && domain.code !== 'none' ? checkText(domain).fix : undefined,
      doc: '/self-host/domains/',
    });
  }
  items.push({
    id: 'email', title: 'Email reaches your whole team', why: 'So invites and run results reach everyone on your team, not only confirmed addresses.',
    state: email ? (email.status === 'pass' ? 'done' : 'todo') : 'unknown',
    action: email?.code === 'identity_unverified'
      ? { label: 'Open SES identities', href: `https://${s.region}.console.aws.amazon.com/ses/home?region=${s.region}#/identities` }
      : { label: 'Request production access', href: sesConsoleUrl(s.region) },
    fix: email && email.status !== 'pass' ? checkText(email).fix : undefined,
    doc: '/self-host/email/',
  });
  items.push({
    id: 'invite', title: 'Invite your team', why: 'Only you can sign in until you invite people or allow an email domain.',
    state: 'unknown', action: { label: 'Open Settings, People', href: at('/settings/people/') }, doc: '/self-host/',
  });
  if (s.provider === 'anthropic') {
    items.push({
      id: 'anthropic', title: 'Add your Anthropic API key', why: 'Each team calls Claude with its own key.',
      state: 'unknown', action: { label: 'Open Settings, AI models', href: at('/settings/models/') }, doc: '/self-host/model-providers/',
    });
  }
  items.push({
    id: 'chat', title: 'Slack or Teams notices', why: 'Pull requests, reviews and alerts in the channel your team already reads.',
    state: 'unknown', action: { label: 'Open Settings, Alerts', href: at('/settings/alerts/') }, doc: '/self-host/integrations/',
  });
  items.push({
    id: 'jira', title: 'Start work from Jira tickets', why: 'Assign a ticket to CoderHelm instead of a GitHub issue.',
    state: 'unknown', action: { label: 'Open Settings, Integrations', href: at('/settings/integrations/jira/') }, doc: '/self-host/integrations/',
  });
  const google = check('google_sign_in');
  items.push({
    id: 'google_sign_in', title: 'Sign in with Google', why: 'Your team signs in with the Google account they already have. Needs your own domain.',
    state: state('google_sign_in'), fix: google && google.status === 'fail' ? checkText(google).fix : undefined,
    action: { label: 'Open Google Cloud credentials', href: 'https://console.cloud.google.com/apis/credentials' },
    doc: '/self-host/integrations/',
  });
  const updates = check('updates');
  items.push({
    id: 'updates', title: 'Automatic updates', why: 'New releases install by themselves in your maintenance window, health checked and rolled back if unhealthy.',
    state: updates ? (updates.status === 'pass' ? 'done' : 'todo') : 'unknown',
    action: { label: 'Open Settings, System', href: at('/settings/system/') }, doc: '/self-host/updates/',
  });
  items.push({
    id: 'hybrid_apps', title: 'Integrations through CoderHelm\u2019s apps, or your own',
    why: 'Jira, Notion, Confluence and Google Drive with one click through CoderHelm\u2019s apps, or your own apps to keep everything private.',
    state: 'unknown', action: { label: 'Open Settings, System, Hybrid', href: at('/settings/system/#hybrid') }, doc: '/self-host/hybrid/',
  });
  items.push({
    id: 'deliveries', title: 'See every event in and out',
    why: 'Deliveries lists each webhook, forward, notification and email with what happened and the fix for any failure.',
    state: 'auto', action: { label: 'Open Settings, Deliveries', href: at('/settings/deliveries/') }, doc: '/self-host/deliveries/',
  });
  items.push({
    id: 'backups', title: 'Backups', why: 'Point-in-time recovery (35 days) on every table and a versioned bucket, from the install itself.',
    state: 'auto', doc: '/self-host/backups/',
  });
  return items;
}

/** What the progress file says about the domain, merged into what this browser remembers. */
export function withDomainDoc(s: InstallState, doc: StatusDoc | null): InstallState | null {
  const d = doc?.domain;
  if (!d) return null;
  if (s.domainDoc && JSON.stringify(s.domainDoc) === JSON.stringify(d) && s.domainChoice === 'own' && s.hostname === d.hostname) return null;
  return { ...s, domainChoice: 'own', hostname: d.hostname, domainDoc: d };
}
