import type { Handler } from "./index";
import { EMAIL, iso, LONG_URL, MARKDOWN, REPO, SENTENCE, SHA, TITLE, TOKEN } from "./long";
import { DRAFT_ID, PLUGIN_ID, PLUGIN_RUN_ID } from "./ids";

// Plugins, their sources, runs, drafts and the audit log, every field as
// long as it will get. The team's plugins flag is on, so each page is drawn
// in full rather than as its "not turned on" state.

const LONG_NAME = "release-announcement-writer-for-every-channel-with-brand-voice-checks";
const TOOL_NAME = "publish_post_to_the_company_page_and_the_newsletter_at_the_same_time";

const tools = [
  { name: "get_release_notes_with_every_merged_pull_request_and_its_labels", kind: "builtin", risk: "read" },
  { name: "create_draft", kind: "mcp", ref: "mcp:content-management-system-with-a-long-server-name", allow: ["get_*", "create_draft"], risk: "write" },
  { name: TOOL_NAME, kind: "http", risk: "consequential" },
];
const triggers = [
  { on: "github.release" },
  { on: "schedule", cron: "0 14 * * MON" },
  { on: "manual", form: { brief: "text", channels: "list" }, channels: ["linkedin", "blog", "email", "a-very-long-channel-name-that-keeps-going"] },
];
const outputs = [
  { type: "draft", kinds: ["blog", "social", "email", "image"] },
  { type: "publish", via: TOOL_NAME, approval: { role: "marketing_editor", min: 1 } },
];

const installed = {
  id: PLUGIN_ID,
  name: LONG_NAME,
  description: `${SENTENCE} ${TOKEN}`,
  source_id: "src-wide-1",
  path: "plugins/marketing-and-launch-communications/announcements",
  status: "active",
  version: "1.2.0-rc.12345+build.67890",
  hash: SHA,
  sha: SHA,
  previous: { version: "1.1.9", hash: `${SHA}0`, sha: SHA },
  auto_update: true,
  track: { kind: "branch", value: "release/marketing-plugins-with-a-very-long-branch-name-for-testing" },
  pending: {
    kind: "update",
    hash: `${SHA}1`,
    sha: SHA,
    version: "1.3.0-rc.99999",
    requested_by: EMAIL,
    requested_at: iso(30),
    widened: [`adds tool ${TOOL_NAME} (consequential)`, `widens mcp:content-management-system-with-a-long-server-name to ${TOKEN}`],
    diff: { added: [`tool ${TOOL_NAME}`, `scope w_member_social_${TOKEN}`], removed: [`trigger schedule ${TOKEN}`], changed: [`agents/launch-writer-for-every-channel.md ${TOKEN}`] },
  },
  can_approve_pending: false,
  why_not: "needs_second_admin",
  tools,
  triggers,
  outputs,
  settings: [
    { key: "brand_voice_document_location_for_every_channel", type: "string", sensitive: false, value: LONG_URL, set: true },
    { key: "linkedin", type: "connection", provider: "oauth2", scopes: ["w_member_social", TOKEN], sensitive: true, set: true },
  ],
  skills: [{ path: "skills/brand-voice-and-banned-claims-for-every-product-line/SKILL.md", name: "brand-voice-and-banned-claims", description: SENTENCE }],
  agents: [{ path: "agents/launch-writer-for-every-channel-and-format.md", name: "launch-writer", description: `${SENTENCE} ${TOKEN}` }],
  monthly_tokens: 2_000_000,
  used_tokens: 1_850_000,
  approvers: { members: [EMAIL, "second.approver.with.a.long.name@engineering-platform.example.com"], min: 1 },
  notify: { channel: "both" },
  installed_by: EMAIL,
  installed_at: iso(60 * 24 * 10),
  updated_at: iso(60),
};

const versions = [
  { hash: SHA, sha: SHA, version: installed.version, created_at: iso(60), approved_by: [EMAIL] },
  { hash: `${SHA}0`, sha: SHA, version: "1.1.9", created_at: iso(60 * 24 * 5), approved_by: [EMAIL, "second.approver.with.a.long.name@engineering-platform.example.com"] },
];

const source = {
  id: "src-wide-1",
  url: `https://github.com/${REPO}`,
  repo: REPO,
  access: "installation",
  path: "",
  track: { kind: "tag", value: "marketing-plugins-v1.2.0-rc.12345-with-a-long-tag" },
  sha: SHA,
  checked_at: iso(10),
  error: `Couldn't read plugins/broken/plugin.yaml: ${TOKEN}`,
  added_by: EMAIL,
  added_at: iso(60 * 24 * 20),
  plugins: [{ path: installed.path, name: LONG_NAME, version: installed.version, description: SENTENCE }],
};

const catalog = [
  { source_id: source.id, path: installed.path, name: LONG_NAME, version: installed.version, description: `${SENTENCE} ${TOKEN}`, installed: true, tools, triggers, outputs },
  { source_id: source.id, path: "plugins/support-and-customer-success/weekly-digest", name: `support-${LONG_NAME}`, version: "0.1.0", description: SENTENCE, installed: false, tools: tools.slice(0, 1), triggers, outputs },
];

const run = {
  run_id: PLUGIN_RUN_ID,
  plugin_id: PLUGIN_ID,
  plugin_name: LONG_NAME,
  plugin_version: installed.version,
  hash: SHA,
  trigger: "manual",
  status: "refused",
  reason: `The plugin's monthly limit is reached. ${TOKEN}`,
  code: "limit_reached",
  requested_by: EMAIL,
  inputs: { brief: `${TITLE} ${TOKEN}`, channels: ["linkedin", "blog", "a-very-long-channel-name-that-keeps-going"] },
  repo: REPO,
  created_at: iso(20),
  finished_at: iso(19),
  tokens: 123_456,
  artifacts: [DRAFT_ID],
};

const draft = {
  id: DRAFT_ID,
  plugin_id: PLUGIN_ID,
  plugin_name: LONG_NAME,
  run_id: PLUGIN_RUN_ID,
  kind: "social",
  title: TITLE,
  status: "in_review",
  version: 2,
  requested_by: EMAIL,
  publish_at: iso(-60),
  target: TOOL_NAME,
  versions: [
    { version: 1, content: MARKDOWN, title: TITLE, content_hash: SHA, author: "launch-writer", created_at: iso(20) },
    { version: 2, content: `${MARKDOWN}\n${TOKEN}`, title: TITLE, content_hash: `${SHA}2`, author: EMAIL, created_at: iso(10) },
  ],
  approval: { id: "appr-wide-1", version: 2, content_hash: `${SHA}2`, status: "pending", requested_by: EMAIL },
  can_approve: false,
  why_not: "same_person",
};

const audit = [
  { id: "aud-1", at: iso(5), actor: EMAIL, actor_kind: "person", action: "draft.approved", plugin_id: PLUGIN_ID, plugin_version: installed.version, run_id: PLUGIN_RUN_ID, artifact_id: DRAFT_ID, approval_id: "appr-wide-1", result: "ok", detail: `${SENTENCE} ${TOKEN}` },
  { id: "aud-2", at: iso(10), actor: "launch-writer", actor_kind: "agent", action: "tool.called", plugin_id: PLUGIN_ID, plugin_version: installed.version, run_id: PLUGIN_RUN_ID, tool: TOOL_NAME, risk: "consequential", result: "refused: not approved", detail: LONG_URL },
];

export const pluginsData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/plugins/flag") return { enabled: true };
  // The MCP servers a team switched on (the Connections page).
  if (path === "/api/plugins") return { plugins: [{ plugin_id: "linear", enabled: true, has_credentials: false, enabled_at: iso(60), custom_prompt: SENTENCE }] };
  if (path === "/api/plugins/settings") return { autonomy_cap: "write", admins: 2 };
  if (path === "/api/plugins/sources") return { sources: [source] };
  if (path === "/api/plugins/available") return { plugins: catalog };
  if (path === "/api/plugins/installed") return { plugins: [installed] };
  if (path.startsWith("/api/plugins/installed/")) return { plugin: installed, versions };
  if (path === "/api/plugins/runs") return { runs: [run, { ...run, run_id: "plugin-run-wide-2", status: "completed", code: undefined, reason: undefined }] };
  if (path.startsWith("/api/plugins/runs/")) return { run, artifacts: [draft], audit };
  if (path === "/api/plugins/drafts") return { drafts: [draft, { ...draft, id: "draft-wide-2", status: "scheduled" }] };
  if (path.startsWith("/api/plugins/drafts/")) return { draft };
  if (path === "/api/audit") return { events: audit, next: "cursor-wide-next" };
  return undefined;
};
