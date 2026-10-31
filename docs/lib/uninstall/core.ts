// The uninstall page's decisions (components/uninstall/guide.tsx): a native
// install is one CloudFormation stack, coderhelm-<name>, so uninstalling is
// Delete stack. KeepDataOnDelete (a stack parameter, true by default) decides
// whether the tables, data buckets, keys, user pool and secret stay; it is
// changed with Update stack before the delete. Afterwards a read-only check
// lists anything still named or tagged for the install.

export const STAGE_RE = /^[a-z][a-z0-9-]{0,19}$/;
export const STATUS_ID_RE = /^[a-z0-9]{16}$/;
export const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
export const INSTALL_STORAGE_PREFIX = 'coderhelm-install:';
/** AWS's shortest wait before a KMS key is deleted. */
export const KEY_DAYS = 7;

export type Mode = 'keep' | 'everything';
export type StepId = 'choose' | 'data' | 'delete' | 'check';
export const STEPS: { id: StepId; label: string; time: string }[] = [
  { id: 'choose', label: 'Your install', time: 'Under a minute' },
  { id: 'data', label: 'Keep the data or not', time: 'A minute' },
  { id: 'delete', label: 'Delete the stack', time: '15 to 30 minutes' },
  { id: 'check', label: 'Check nothing is left', time: 'A minute' },
];

export interface UninstallState {
  stage: string;
  region: string;
  mode: Mode | null;
}

export function newState(over: Partial<UninstallState> = {}): UninstallState {
  return { stage: '', region: '', mode: null, ...over };
}

/** The address bar fills in the install, never the choice to delete data. */
export function queryToPartial(search: string): Partial<UninstallState> {
  const q = new URLSearchParams(search);
  const out: Partial<UninstallState> = {};
  const stage = q.get('stage') ?? '';
  const region = q.get('region') ?? '';
  if (STAGE_RE.test(stage)) out.stage = stage;
  if (REGION_RE.test(region)) out.region = region;
  return out;
}

export function stateToQuery(s: UninstallState): string {
  const q = new URLSearchParams();
  if (STAGE_RE.test(s.stage)) q.set('stage', s.stage);
  if (REGION_RE.test(s.region)) q.set('region', s.region);
  return q.toString();
}

/** The install the install guide set up in this browser. */
export function fromInstallGuide(raw: string | null): Partial<UninstallState> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { stage?: unknown; region?: unknown };
    if (!STAGE_RE.test(String(v.stage)) || !REGION_RE.test(String(v.region))) return null;
    return { stage: String(v.stage), region: String(v.region) };
  } catch {
    return null;
  }
}

export function validate(s: Pick<UninstallState, 'stage' | 'region'>): Partial<Record<'stage' | 'region', string>> {
  const p: Partial<Record<'stage' | 'region', string>> = {};
  if (!STAGE_RE.test(s.stage)) p.stage = 'Enter the install name: 1 to 20 lowercase letters, digits or hyphens, starting with a letter. Its stack is coderhelm-<name>.';
  if (!REGION_RE.test(s.region)) p.region = 'Pick the region the install is in.';
  return p;
}

export function stackName(s: Pick<UninstallState, 'stage'>): string {
  return `coderhelm-${s.stage}`;
}

/** The stack in the CloudFormation console (Update and Delete are its buttons). */
export function stackConsoleUrl(s: Pick<UninstallState, 'stage' | 'region'>): string {
  return `https://${s.region}.console.aws.amazon.com/cloudformation/home?region=${s.region}#/stacks/stackinfo?stackId=${encodeURIComponent(stackName(s))}`;
}

export function stacksConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks`;
}

/** Where a release's parent template is; the stack's Version output says which one it runs. */
export function releaseTemplateUrl(version: string): string {
  return `https://coderhelm-public.s3.amazonaws.com/launch/${version}/coderhelm.json`;
}

/**
 * The CLI form of Update stack that only changes KeepDataOnDelete (every other
 * value kept), then waits and prints the stack's KeepDataOnDelete output.
 * It gives the stack its own release's template again, never "use the
 * previous template": CloudFormation keeps a v0.8.4 or v0.8.5 template
 * with every parameter already filled in, so that update reports
 * UPDATE_COMPLETE and changes nothing.
 */
export function keepDataCommand(s: Pick<UninstallState, 'stage' | 'region'>, keep: boolean): string {
  const others = ['Stage', 'AdminEmail', 'ModelProvider', 'BedrockInferencePrefix', 'EmailTransport', 'EmailFrom', 'Hostname', 'SignupDomain', 'RequireTwoFactor', 'AutoUpdate', 'UpdateDay', 'UpdateHour', 'UpdateTimezone', 'SetupToken', 'StatusId', 'DomainCertificateArn', 'DomainZoneId'];
  const at = `--region ${s.region} --stack-name ${stackName(s)}`;
  return [
    `V=$(aws cloudformation describe-stacks ${at} --query "Stacks[0].Outputs[?OutputKey=='Version'].OutputValue" --output text)`,
    [
      `aws cloudformation update-stack ${at}`,
      `--template-url "${releaseTemplateUrl('$V')}"`,
      '--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND',
      `--parameters ParameterKey=KeepDataOnDelete,ParameterValue=${keep ? 'true' : 'false'} ${others.map((k) => `ParameterKey=${k},UsePreviousValue=true`).join(' ')}`,
    ].join(' \\\n  '),
    `aws cloudformation wait stack-update-complete ${at}`,
    keepDataCheckCommand(s),
  ].join('\n');
}

/** Prints the stack's KeepDataOnDelete output: it must say what was chosen before the stack is deleted. */
export function keepDataCheckCommand(s: Pick<UninstallState, 'stage' | 'region'>): string {
  return `aws cloudformation describe-stacks --region ${s.region} --stack-name ${stackName(s)} --query "Stacks[0].Outputs[?OutputKey=='KeepDataOnDelete'].OutputValue" --output text`;
}

export function deleteCommand(s: Pick<UninstallState, 'stage' | 'region'>): string {
  return `aws cloudformation delete-stack --region ${s.region} --stack-name ${stackName(s)}`;
}

/** The read-only check afterwards; with --delete it removes what it lists. */
export function leftoversCommand(s: Pick<UninstallState, 'stage' | 'region'>, remove = false): string {
  return `npx -y github:CoderHelm/coderhelm-platform leftovers --stage ${s.stage} --region ${s.region}${remove ? ' --delete' : ''}`;
}

/** What stays and what goes, for each choice (the stack's own policies, infra/lib/native). */
export function consequences(mode: Mode): { goes: string[]; stays: string[] } {
  const always = ['the functions, API, queues, CloudFront distribution and dashboard', 'the roles and the permissions boundary', 'the release files and the log groups of the functions', 'a certificate CoderHelm requested for your domain'];
  const data = ['the tables', 'the data bucket', 'the KMS keys', 'the user pool (everyone\'s sign-in)', 'the secret (GitHub App keys)'];
  if (mode === 'keep') return { goes: always, stays: data };
  return { goes: [...always, ...data.map((d) => (d === 'the KMS keys' ? `the KMS keys, after AWS's ${KEY_DAYS}-day wait` : d))], stays: [] };
}
