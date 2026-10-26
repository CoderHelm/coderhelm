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
export type StepId = 'start' | 'aws' | 'github' | 'models' | 'ready';
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'aws', label: 'AWS' },
  { id: 'github', label: 'GitHub' },
  { id: 'models', label: 'Models' },
  { id: 'ready', label: 'Ready' },
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
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STAGE_RE = /^[a-z][a-z0-9-]{0,19}$/;
export const STATUS_ID_RE = /^[a-z0-9]{16}$/;
export const TAG_RE = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

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
    ...over,
  };
}

/** Problems with what the person typed, as one plain sentence each. */
export function validate(s: Pick<InstallState, 'email' | 'stage' | 'region'>): Record<string, string> {
  const p: Record<string, string> = {};
  if (!EMAIL_RE.test(s.email.trim())) p.email = 'Enter the email you will sign in with.';
  if (!STAGE_RE.test(s.stage)) p.stage = 'Use lowercase letters, digits and hyphens, starting with a letter.';
  if (!REGIONS.some((r) => r.id === s.region)) p.region = 'Pick a region from the list.';
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

export interface StatusDoc {
  schema: number;
  phase: Phase;
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
  return d;
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
export function deriveStep(s: Pick<InstallState, 'launchedAt' | 'url'>, setup: SetupStatus | null): StepId {
  if (!s.launchedAt && !s.url) return 'start';
  if (!setup) return 'aws';
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
  },
  github_installed: {
    ok: { title: 'Installed on your repositories' },
    needs_app: { title: 'Install it on your repositories', fix: 'Create the GitHub App first.' },
    not_installed: { title: 'Not installed on any repository yet', fix: 'Install the app and pick the repositories CoderHelm may work on.' },
    app_rejected: { title: 'GitHub does not accept the app’s key', fix: 'The app may have been deleted on GitHub. Create a new one with the terminal command below.' },
    bad_key: { title: 'The stored app key is damaged', fix: 'Create a new GitHub App with the terminal command below.' },
    github_unreachable: { title: 'GitHub did not answer', fix: 'This usually passes on its own. Press Check again in a minute.' },
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
export function queryToPartial(search: string): Partial<InstallState> & { github?: string; app?: string } {
  const q = new URLSearchParams(search);
  const out: Partial<InstallState> & { github?: string; app?: string } = {};
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
