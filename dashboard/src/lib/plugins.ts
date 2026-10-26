// Plugins: packages a team installs (instructions, agents, tools, triggers
// and outputs), their runs, the drafts they write and the approvals that
// stand between a draft and anything going out. Off unless the team's
// `plugins` flag is on.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

export type Risk = "read" | "write" | "consequential";
export type TrackKind = "branch" | "tag" | "sha";

export interface Track {
  kind: TrackKind;
  value: string;
}

export interface PluginTool {
  name: string;
  kind: "mcp" | "http" | "builtin";
  ref?: string;
  allow?: string[];
  risk: Risk;
}

export interface PluginTrigger {
  on: "manual" | "schedule" | "github.release";
  cron?: string;
  /** Field name → kind: "text" is a box to write in, "list" picks from `channels`. */
  form?: Record<string, "text" | "list">;
  channels?: string[];
}

export interface PluginOutput {
  type: "draft" | "publish";
  kinds?: string[];
  via?: string;
  approval?: { role?: string; min: number };
}

export interface PluginSetting {
  key: string;
  type: "string" | "connection" | "secret";
  provider?: string;
  scopes?: string[];
  sensitive: boolean;
  /** Never sent for a sensitive setting. */
  value?: string;
  set: boolean;
}

export interface PluginVersion {
  hash: string;
  sha: string;
  version: string;
  created_at: string;
  approved_by: string[];
}

export interface PendingChange {
  kind: "install" | "update";
  hash: string;
  sha: string;
  version: string;
  requested_by: string;
  requested_at: string;
  /** Plain lines, e.g. "adds tool publish_post (consequential)". */
  widened: string[];
  diff: { added: string[]; removed: string[]; changed: string[] };
}

export interface NamedItem {
  path: string;
  name: string;
  description: string;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  source_id: string;
  path: string;
  status: "pending_install" | "active" | "disabled";
  version: string;
  hash: string;
  sha: string;
  previous?: { version: string; hash: string; sha: string } | null;
  auto_update: boolean;
  track: Track;
  pending?: PendingChange | null;
  /** Whether you may approve the pending change, and if not, why (a refusal code). */
  can_approve_pending?: boolean;
  why_not?: string;
  tools: PluginTool[];
  triggers: PluginTrigger[];
  outputs: PluginOutput[];
  settings: PluginSetting[];
  skills: NamedItem[];
  agents: NamedItem[];
  monthly_tokens: number;
  used_tokens: number;
  approvers: { members: string[]; min: number };
  notify?: { channel: "" | "teams" | "slack" | "both" };
  installed_by: string;
  installed_at: string;
  updated_at: string;
}

export interface PluginSource {
  id: string;
  url: string;
  repo: string;
  access: "public" | "installation";
  path: string;
  track: Track;
  sha: string;
  checked_at: string;
  error: string;
  added_by: string;
  added_at: string;
  plugins: { path: string; name: string; version: string; description: string }[];
}

export interface CatalogPlugin {
  source_id: string;
  path: string;
  name: string;
  version: string;
  description: string;
  installed: boolean;
  tools: PluginTool[];
  triggers: PluginTrigger[];
  outputs: PluginOutput[];
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "refused";

export interface PluginRun {
  run_id: string;
  plugin_id: string;
  plugin_name?: string;
  plugin_version: string;
  hash: string;
  trigger: "manual" | "schedule" | "release";
  status: RunStatus;
  reason?: string;
  code?: string;
  requested_by: string;
  inputs: Record<string, string | string[]>;
  repo?: string;
  created_at: string;
  finished_at?: string;
  tokens: number;
  artifacts: string[];
}

export type DraftStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "rejected"
  | "stopped"
  | "cancelled"
  | "failed";

export interface DraftVersion {
  version: number;
  content: string;
  title: string;
  content_hash: string;
  author: string;
  created_at: string;
}

export interface Approval {
  id: string;
  version: number;
  content_hash: string;
  status: "pending" | "approved" | "rejected" | "stopped" | "cancelled";
  requested_by: string;
  decided_by?: string;
  decided_at?: string;
  via?: "dashboard" | "email" | "chat";
  publish_at?: string;
}

export interface Draft {
  id: string;
  plugin_id: string;
  plugin_name: string;
  run_id: string;
  kind: "blog" | "social" | "email" | "image" | "action";
  title: string;
  status: DraftStatus;
  version: number;
  requested_by: string;
  publish_at?: string;
  published_at?: string;
  result_url?: string;
  error?: string;
  target?: string;
  versions: DraftVersion[];
  approval?: Approval | null;
  can_approve: boolean;
  why_not?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  actor_kind: "person" | "agent" | "schedule" | "system";
  action: string;
  plugin_id?: string;
  plugin_version?: string;
  run_id?: string;
  artifact_id?: string;
  approval_id?: string;
  tool?: string;
  risk?: Risk;
  result: string;
  detail?: string;
}

/** The team's plugin settings, and how briefs and approvals arrive from chat. */
export interface TeamPluginSettings {
  autonomy_cap: "read" | "write";
  admins: number;
  /** The Slack workspace whose signed requests are accepted. */
  slack_team_id?: string;
  slack_signing_secret_set?: boolean;
  teams_webhook_set?: boolean;
  /** Where a Teams outgoing webhook posts, once its secret is saved. */
  teams_webhook_path?: string;
}

export interface TeamPluginSettingsUpdate {
  autonomy_cap?: "read" | "write";
  slack_team_id?: string;
  slack_signing_secret?: string;
  teams_secret?: string;
}

/** A refused request: the server's sentence, its refusal code and the status. */
export class PluginError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const code =
      typeof body.code === "string"
        ? body.code
        : ({ 403: "forbidden", 404: "not_found", 400: "invalid", 429: "limit_reached" } as Record<number, string>)[res.status] ?? "";
    const msg = typeof body.error === "string" && body.error ? body.error : refusalText(code) || `The request failed (error ${res.status}).`;
    throw new PluginError(msg, code, res.status);
  }
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const id = (s: string) => encodeURIComponent(s);
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const pluginsApi = {
  flag: () => call<{ enabled: boolean; can_toggle?: boolean }>("/api/plugins/flag"),
  setTeamFlag: (teamId: string, plugins: boolean) =>
    call<{ team_id: string; flags: { plugins: boolean } }>(`/api/admin/teams/${id(teamId)}/flags`, send("PUT", { plugins })),

  settings: () => call<TeamPluginSettings>("/api/plugins/settings"),
  saveSettings: (s: TeamPluginSettingsUpdate) => call<{ autonomy_cap: "read" | "write"; teams_webhook_path?: string }>("/api/plugins/settings", send("PUT", s)),

  sources: () => call<{ sources: PluginSource[] }>("/api/plugins/sources"),
  addSource: (url: string, track?: Track) => call<{ source: PluginSource }>("/api/plugins/sources", send("POST", { url, track })),
  syncSource: (sourceId: string) => call<{ source: PluginSource }>(`/api/plugins/sources/${id(sourceId)}/sync`, send("POST")),
  removeSource: (sourceId: string) => call<{ ok: true }>(`/api/plugins/sources/${id(sourceId)}`, send("DELETE")),
  available: () => call<{ plugins: CatalogPlugin[] }>("/api/plugins/available"),

  installed: () => call<{ plugins: InstalledPlugin[] }>("/api/plugins/installed"),
  get: (pluginId: string) => call<{ plugin: InstalledPlugin; versions: PluginVersion[] }>(`/api/plugins/installed/${id(pluginId)}`),
  install: (source_id: string, path: string) => call<{ plugin: InstalledPlugin }>("/api/plugins/install", send("POST", { source_id, path })),
  approve: (pluginId: string, hash: string) => call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/approve`, send("POST", { hash })),
  decline: (pluginId: string, hash: string) => call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/decline`, send("POST", { hash })),
  setOptions: (pluginId: string, o: { auto_update?: boolean; track?: Track }) =>
    call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/options`, send("PUT", o)),
  rollback: (pluginId: string) => call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/rollback`, send("POST")),
  sync: (pluginId: string) => call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/sync`, send("POST")),
  saveValues: (pluginId: string, values: Record<string, string>) =>
    call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/settings`, send("PUT", { values })),
  setLimit: (pluginId: string, monthly_tokens: number) =>
    call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/limit`, send("PUT", { monthly_tokens })),
  setApprovers: (pluginId: string, members: string[], min: number) =>
    call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/approvers`, send("PUT", { members, min })),
  setEnabled: (pluginId: string, enabled: boolean) =>
    call<{ plugin: InstalledPlugin }>(`/api/plugins/installed/${id(pluginId)}/enabled`, send("PUT", { enabled })),
  uninstall: (pluginId: string) => call<{ ok: true }>(`/api/plugins/installed/${id(pluginId)}`, send("DELETE")),

  startRun: (pluginId: string, inputs: Record<string, string | string[]>, repo?: string) =>
    call<{ run: PluginRun }>(`/api/plugins/installed/${id(pluginId)}/runs`, send("POST", { inputs, repo: repo || undefined })),
  runs: (pluginId?: string) => call<{ runs: PluginRun[] }>(`/api/plugins/runs${qs({ plugin: pluginId })}`),
  run: (runId: string) => call<{ run: PluginRun; artifacts: Draft[]; audit: AuditEvent[] }>(`/api/plugins/runs/${id(runId)}`),

  drafts: (status: "in_review" | "all" = "in_review", pluginId?: string) =>
    call<{ drafts: Draft[] }>(`/api/plugins/drafts${qs({ status, plugin: pluginId })}`),
  draft: (draftId: string) => call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}`),
  editDraft: (draftId: string, content: string, title?: string) =>
    call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}`, send("PUT", { content, title })),
  submit: (draftId: string) => call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}/submit`, send("POST")),
  approveDraft: (draftId: string, version: number, publish_at?: string) =>
    call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}/approve`, send("POST", { version, publish_at })),
  reject: (draftId: string, version: number, reason?: string) =>
    call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}/reject`, send("POST", { version, reason })),
  stop: (draftId: string, reason?: string) => call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}/stop`, send("POST", { reason })),
  cancel: (draftId: string) => call<{ draft: Draft }>(`/api/plugins/drafts/${id(draftId)}/cancel`, send("POST")),

  audit: (f: { plugin?: string; action?: string; cursor?: string } = {}) =>
    call<{ events: AuditEvent[]; next: string | null }>(`/api/audit${qs(f)}`),
};

/** What each refusal means, in the words a person reads on the page. */
export const REFUSALS: Record<string, string> = {
  flag_off: "Plugins are not turned on for this team.",
  forbidden: "Your role can't do this. Ask an admin on your team.",
  same_person: "You asked for this draft, so someone else has to approve it.",
  not_in_group: "You are not one of this plugin's approvers.",
  stale_version: "The draft changed since. Read the new version and approve that one.",
  stopped: "This draft was stopped. A stop is permanent: nothing from it can go out.",
  limit_reached: "The monthly token limit is reached, so nothing more runs this month.",
  needs_second_admin: "Another admin has to approve this. The admin who asked for it can't.",
  not_granted: "That tool isn't in the plugin's manifest, so it can't be used.",
  pinned: "This plugin is pinned to one commit, so updates are off.",
  not_found: "That isn't there any more. It may have been removed.",
  invalid: "That wasn't accepted. Check the values and try again.",
};

export function refusalText(code: string | undefined | null): string {
  return (code && REFUSALS[code]) || "";
}

export const RISK_LABEL: Record<Risk, string> = {
  read: "Reads",
  write: "Writes",
  consequential: "Needs approval",
};

export const RISK_ABOUT: Record<Risk, string> = {
  read: "Only reads. Runs without asking anyone.",
  write: "Changes something, such as saving a draft. Runs within the team's limit on what may happen without a person.",
  consequential: "Publishes, sends or posts. Runs only after a person approves the exact version.",
};

export const DRAFT_STATUS: Record<DraftStatus, { label: string; tone: "waiting" | "success" | "danger" | "neutral" | "muted" | "live" }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "Waiting for review", tone: "waiting" },
  approved: { label: "Approved", tone: "success" },
  scheduled: { label: "Scheduled", tone: "live" },
  publishing: { label: "Publishing", tone: "live" },
  published: { label: "Published", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  stopped: { label: "Stopped", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: "live" | "queued" | "success" | "danger" | "waiting" }> = {
  queued: { label: "Queued", tone: "queued" },
  running: { label: "Running", tone: "live" },
  completed: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refused: { label: "Refused", tone: "waiting" },
};

export const TRIGGER_LABEL: Record<string, string> = {
  manual: "A brief someone writes",
  schedule: "A schedule",
  "github.release": "A new release",
  release: "A new release",
};

export function trackText(t: Track): string {
  if (t.kind === "sha") return `pinned to ${t.value.slice(0, 12)}`;
  return `${t.kind === "tag" ? "tag" : "branch"} ${t.value}`;
}

/** The manual trigger of a plugin, if it has one. */
export function manualTrigger(p: { triggers: PluginTrigger[] }): PluginTrigger | undefined {
  return p.triggers.find((t) => t.on === "manual");
}

export const pluginHref = (pluginId: string) => `/plugins/plugin?id=${encodeURIComponent(pluginId)}`;
export const draftHref = (draftId: string) => `/plugins/draft?id=${encodeURIComponent(draftId)}`;
export const runHref = (runId: string) => `/plugins/runs?id=${encodeURIComponent(runId)}`;
