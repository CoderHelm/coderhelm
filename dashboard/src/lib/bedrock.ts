// Using the team's knowledge from Amazon Bedrock: knowledge keys that sign
// AgentCore Gateway (or any program) in to the MCP server, and copying chosen
// knowledge bases into a Bedrock knowledge base in the team's own AWS
// account. The gateway keeps the rules (services/gateway/src/knowledge_keys.rs,
// routes/knowledge_bedrock.rs, common/src/knowledge/bedrock_sync.rs).

import { request } from "./api";

export interface ConnectInfo {
  mcp_url: string;
  scope: string;
  token_endpoint: string;
  authorization_endpoint: string;
  issuer: string;
  discovery_url: string;
}

export interface KnowledgeKey {
  id: string;
  name: string;
  hint: string;
  /** The OAuth client id (client credentials). */
  client_id: string;
  bases: string[];
  created_at: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  status: "active" | "expired" | "revoked";
}

export interface KeyList {
  keys: KnowledgeKey[];
  /** The bases a new key may read (yours in Chat, not read with each person's own sign-in). */
  bases: { id: string; name: string; named_readers: boolean }[];
  connect: ConnectInfo;
  limits: { max_keys: number; max_expiry_days: number };
}

export type SyncTarget =
  | { kind: "none" }
  | {
      kind: "s3";
      bucket: string;
      prefix: string;
      region: string;
      knowledge_base_arn: string;
      data_source_id: string;
    }
  | { kind: "custom"; knowledge_base_arn: string; data_source_id: string };

export interface SyncStatus {
  state: "never" | "ok" | "partial" | "failed";
  last_sync_at: string;
  last_success_at: string;
  documents: number;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
  ingestion_job_id: string;
  needs_ingestion: boolean;
  syncing: boolean;
}

export interface SyncConfig {
  enabled: boolean;
  target: SyncTarget;
  bases: string[];
  acknowledged_at: string;
  acknowledged_by: string;
  updated_at: string;
  updated_by: string;
  status: SyncStatus;
}

/** Where a "Set up in AWS" stack is (gateway: bedrock_setup.rs). */
export type SetupState =
  | "waiting"
  | "started"
  | "bucket"
  | "ready"
  | "failed"
  | "replaced"
  | "expired";

export interface SetupView {
  state: SetupState;
  /** What went wrong, in plain words, when failed. */
  message: string;
  stack_name: string;
  region: string;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  creates_knowledge_base: boolean;
  updated_at: string;
}

export interface SyncPage {
  sync: SyncConfig;
  bases: {
    id: string;
    name: string;
    can_copy: boolean;
    named_readers: boolean;
    read_role: string;
  }[];
  self_hosted: boolean;
  warning: string;
  role_update: { url: string; stack_name: string; account: string } | null;
  /** The team's latest one-click setup (absent from an older gateway). */
  setup?: SetupView | null;
  /** Whether this install can open the export stack with one button, and where. */
  one_click?:
    | { available: true; region: string; account: string }
    | { available: false; reason: string };
}

/** A knowledge base in the install's own account, for "Use an existing knowledge base". */
export interface AccountKnowledgeBase {
  id: string;
  name: string;
  arn?: string;
  status?: string;
  description?: string;
}

export interface AccountKnowledgeBases {
  install: boolean;
  install_account: string;
  region: string;
  bases: AccountKnowledgeBase[] | null;
  list_error: { message: string; fix: string; code: string } | null;
}

export interface SetupInput {
  bases: string[];
  acknowledged: boolean;
  create_knowledge_base: boolean;
  knowledge_base_id?: string;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// A reply missing the parts the page reads (an older server, a proxy's error
// page) is an error the page can show, never a crash.
const SHAPE_ERROR =
  "Coderhelm's server answered in a form this page can't read. Update the install, then reload.";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
export function checkKeyList(r: unknown): KeyList {
  if (
    !isObj(r) ||
    !Array.isArray(r.keys) ||
    !Array.isArray(r.bases) ||
    !isObj(r.connect) ||
    typeof r.connect.mcp_url !== "string"
  ) {
    throw new Error(SHAPE_ERROR);
  }
  return r as unknown as KeyList;
}
export function checkSyncPage(r: unknown): SyncPage {
  if (
    !isObj(r) ||
    !isObj(r.sync) ||
    !Array.isArray(r.bases) ||
    !Array.isArray(r.sync.bases) ||
    !isObj(r.sync.target) ||
    !isObj(r.sync.status)
  ) {
    throw new Error(SHAPE_ERROR);
  }
  return r as unknown as SyncPage;
}

export const bedrockApi = {
  keys: () => request<unknown>("/api/knowledge/keys").then(checkKeyList),
  createKey: (body: {
    name: string;
    bases: string[];
    expires_in_days: number | null;
  }) =>
    request<{ key: KnowledgeKey; token: string; connect: ConnectInfo }>(
      "/api/knowledge/keys",
      json("POST", body),
    ),
  revokeKey: (id: string) =>
    request<{ status: string; id: string }>(
      `/api/knowledge/keys/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),
  sync: () =>
    request<unknown>("/api/knowledge/bedrock-sync").then(checkSyncPage),
  saveSync: (body: {
    enabled: boolean;
    target: SyncTarget;
    bases: string[];
    acknowledged: boolean;
  }) =>
    request<{
      sync: SyncConfig;
      check: string | null;
      role_update: SyncPage["role_update"];
    }>("/api/knowledge/bedrock-sync", json("PUT", body)),
  runSync: () =>
    request<{ status: string }>(
      "/api/knowledge/bedrock-sync/run",
      json("POST"),
    ),
  startSetup: (body: SetupInput) =>
    request<{ setup: SetupView; launch_url: string }>(
      "/api/knowledge/bedrock-sync/setup",
      json("POST", body),
    ),
  cancelSetup: () =>
    request<{ status: string }>(
      "/api/knowledge/bedrock-sync/setup",
      json("DELETE"),
    ),
  accountBases: () => request<AccountKnowledgeBases>("/api/knowledge/bedrock"),
  templatePath: "/api/knowledge/bedrock-sync/template",
};

// ── Testing a connection the way AgentCore Gateway uses it ──────────

export interface TestResult {
  ok: boolean;
  /** What happened, in plain words. */
  message: string;
  passages: { title: string; base: string }[];
}

/**
 * Signs in with the connection's client ID and secret at the token address
 * (OAuth client credentials, as Gateway's credential provider does), then
 * calls knowledge_search on the MCP server with the access token. Both
 * addresses answer browsers from any origin, without cookies.
 */
export async function testConnection(
  connect: ConnectInfo,
  clientId: string,
  secret: string,
  query: string,
  f: typeof fetch = fetch,
): Promise<TestResult> {
  const fail = (message: string): TestResult => ({
    ok: false,
    message,
    passages: [],
  });
  let token: string;
  try {
    const r = await f(connect.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: secret,
        scope: connect.scope,
      }).toString(),
    });
    const body = (await r.json().catch(() => ({}))) as {
      access_token?: string;
      error_description?: string;
    };
    if (!r.ok || !body.access_token)
      return fail(
        `Signing in with the client ID and secret failed: ${body.error_description ?? `the token address answered ${r.status}`}.`,
      );
    token = body.access_token;
  } catch {
    return fail("The token address couldn't be reached from this browser.");
  }
  try {
    const r = await f(connect.mcp_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "knowledge_search", arguments: { query, limit: 3 } },
      }),
    });
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      result?: {
        isError?: boolean;
        content?: { type: string; text?: string }[];
        structuredContent?: unknown;
      };
    };
    if (!r.ok)
      return fail(`Signed in, but the MCP server answered ${r.status}.`);
    if (body.error)
      return fail(
        `Signed in, but the search failed: ${body.error.message ?? "no reason given"}.`,
      );
    const text =
      body.result?.content?.find((c) => c.type === "text")?.text ?? "";
    if (body.result?.isError)
      return fail(
        `Signed in, but the search failed: ${text || "no reason given"}.`,
      );
    let found: { passages?: { title?: string; base?: string }[] } = {};
    try {
      found =
        (body.result?.structuredContent as typeof found) ?? JSON.parse(text);
    } catch {
      found = {};
    }
    const passages = (found.passages ?? []).map((p) => ({
      title: p.title ?? "Untitled",
      base: p.base ?? "",
    }));
    return {
      ok: true,
      message: passages.length
        ? `It works: knowledge_search found ${passages.length} passage${passages.length === 1 ? "" : "s"}.`
        : "It works, but knowledge_search found nothing for that. Try other words.",
      passages,
    };
  } catch {
    return fail(
      "Signed in, but the MCP server couldn't be reached from this browser.",
    );
  }
}

/** The AgentCore Gateway setup for a connection, as AWS CLI commands and as JSON. */
export function gatewayConfig(
  connect: ConnectInfo,
  clientId: string,
  secret: string,
) {
  const provider = {
    customOauth2ProviderConfig: {
      oauthDiscovery: { discoveryUrl: connect.discovery_url },
      clientId,
      clientSecret: secret,
    },
  };
  const target = { mcp: { mcpServer: { endpoint: connect.mcp_url } } };
  const credentials = [
    {
      credentialProviderType: "OAUTH",
      credentialProvider: {
        oauthCredentialProvider: {
          providerArn: "<the providerArn from the first command>",
          grantType: "CLIENT_CREDENTIALS",
          scopes: [connect.scope],
        },
      },
    },
  ];
  const cli = [
    "aws bedrock-agentcore-control create-oauth2-credential-provider \\",
    "  --name coderhelm-knowledge \\",
    "  --credential-provider-vendor CustomOauth2 \\",
    `  --oauth2-provider-config-input '${JSON.stringify(provider)}'`,
    "",
    "aws bedrock-agentcore-control create-gateway-target \\",
    "  --gateway-identifier <your gateway ID> \\",
    "  --name coderhelm-knowledge \\",
    `  --target-configuration '${JSON.stringify(target)}' \\`,
    `  --credential-provider-configurations '${JSON.stringify(credentials)}'`,
  ].join("\n");
  const json = JSON.stringify(
    {
      oauth2ProviderConfigInput: provider,
      targetConfiguration: target,
      credentialProviderConfigurations: credentials,
    },
    null,
    2,
  );
  return { cli, json };
}
