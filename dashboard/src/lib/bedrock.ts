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
  | { kind: "s3"; bucket: string; prefix: string; region: string; knowledge_base_arn: string; data_source_id: string }
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

export interface SyncPage {
  sync: SyncConfig;
  bases: { id: string; name: string; can_copy: boolean; named_readers: boolean; read_role: string }[];
  self_hosted: boolean;
  warning: string;
  role_update: { url: string; stack_name: string; account: string } | null;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const bedrockApi = {
  keys: () => request<KeyList>("/api/knowledge/keys"),
  createKey: (body: { name: string; bases: string[]; expires_in_days: number | null }) =>
    request<{ key: KnowledgeKey; token: string; connect: ConnectInfo }>("/api/knowledge/keys", json("POST", body)),
  revokeKey: (id: string) => request<{ status: string; id: string }>(`/api/knowledge/keys/${encodeURIComponent(id)}`, json("DELETE")),
  sync: () => request<SyncPage>("/api/knowledge/bedrock-sync"),
  saveSync: (body: { enabled: boolean; target: SyncTarget; bases: string[]; acknowledged: boolean }) =>
    request<{ sync: SyncConfig; check: string | null; role_update: SyncPage["role_update"] }>("/api/knowledge/bedrock-sync", json("PUT", body)),
  runSync: () => request<{ status: string }>("/api/knowledge/bedrock-sync/run", json("POST")),
  templatePath: "/api/knowledge/bedrock-sync/template",
};
