// Knowledge: knowledge bases, the apps they stay in sync with, and the
// words the pages use for where each one is. Uploads reuse the signed-upload
// helpers in ./brain.

import { ApiError, request } from "./api";
import type { BaseInput, KnowledgeFile, KnowledgeLimits, SignedUpload } from "./brain";
import { suggestBaseName } from "./kb-name";

export { fileSize, uploadProblem, uploadToSignedUrl } from "./brain";
export type { BaseInput, KnowledgeLimits, SignedUpload } from "./brain";

/** The apps a knowledge base can hold pages from, and imports (an S3 bucket, an archive). */
export type SourceKind = "notion" | "confluence" | "sanity" | "google_drive" | "github" | "web" | "s3" | "archive";
/**
 * What the add flow starts from: an app, an import, uploads, a Bedrock
 * knowledge base or a search tool (MCP) connected in place, or importing
 * what a Bedrock knowledge base was built from.
 */
export type AddKind = SourceKind | "upload" | "bedrock_kb" | "mcp" | "bedrock_import";

/** Sources that are imports: their own limit, and "connect in place" when they are bigger. */
export const IMPORT_KINDS: readonly string[] = ["s3", "archive"];

/** Where a base's passages are: kept here, or connected in place and searched live where it lives. */
export type Backend =
  | { kind: "local" }
  | {
      kind: "remote";
      provider: "bedrock_kb";
      /** "Bedrock knowledge base". */
      label: string;
      /** The knowledge base's ARN. */
      target: string;
      region: string;
      account: string;
      /** `install`: this install's own role; `account`: the team's role in that account. */
      access: "install" | "account";
      /** Bedrock's hybrid search is used (the vector store supports it). */
      hybrid: boolean;
    }
  | {
      kind: "remote";
      provider: "mcp";
      /** "Search tool (MCP)". */
      label: string;
      /** The Connected apps server's id. */
      target: string;
      server_name: string;
      /** `team`: the team's connection; `per_person`: each person's own sign-in. */
      access: "team" | "per_person";
      per_person: boolean;
      search_tool: string;
      fetch_tool: string | null;
    };

/** A remote MCP server on Connected apps that can be searched in place. */
export interface SearchToolServer {
  id: string;
  name: string;
  url: string;
  sharing: "shared" | "personal";
  /** The team's connection works (shared), or yours does (personal). */
  connected: boolean;
  /** Coderhelm's best guess at the tool that searches. */
  search_tool: string | null;
  fetch_tool: string | null;
  tools: { name: string; description: string }[];
}

/** One data source of a Bedrock knowledge base, for importing what it was built from. */
export interface BedrockDataSource {
  id: string;
  name: string;
  /** `S3`, `CONFLUENCE`, `SHAREPOINT`, `WEB`, `SALESFORCE`, `CUSTOM`, ... */
  type: string;
  status: string;
  bucket: string;
  prefixes: string[];
  /** The account the bucket is in. */
  bucket_account: string;
  importable: boolean;
  /** A Coderhelm connector that reads the originals instead. */
  use_instead: "confluence" | "web" | "";
  note: string;
}

export interface BedrockImport {
  name: string;
  account: string;
  region: string;
  data_sources: BedrockDataSource[];
}

/** A Bedrock knowledge base found in a self-hosted install's own account. */
export interface BedrockListed {
  arn: string;
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

/** What connecting a Bedrock knowledge base starts from. */
export interface BedrockStart {
  /** A self-hosted install, which lists its own account's knowledge bases. */
  install: boolean;
  install_account: string;
  region: string;
  /** Null when not listed (hosted, or the list failed: see list_error). */
  bases: BedrockListed[] | null;
  list_error: { message: string; fix: string; code: string } | null;
  /** The team's connected AWS accounts. */
  accounts: { account: string; region: string }[];
  /** ARNs already connected by this team. */
  connected: string[];
}

/** What connecting a search tool starts from. */
export interface SearchToolsStart {
  servers: SearchToolServer[];
  /** Server ids already connected as a knowledge base. */
  connected: string[];
}

/** Why connecting failed, with what to do and (when the role only lacks the permission) the update that grants it. */
export interface ConnectProblem {
  message: string;
  fix: string;
  code: string;
  grant: { url: string; stack_name: string; account: string } | null;
}

/** A failed connect, read from the gateway's answer. */
export function connectProblem(e: unknown, fallback: string): ConnectProblem {
  const body = e instanceof ApiError ? e.body : undefined;
  const grant = body?.grant as ConnectProblem["grant"] | undefined;
  return {
    message: e instanceof Error && e.message ? e.message : fallback,
    fix: typeof body?.fix === "string" ? body.fix : "",
    code: typeof body?.code === "string" ? body.code : "",
    grant: grant && typeof grant.url === "string" && grant.url.startsWith("https://console.aws.amazon.com/") ? grant : null,
  };
}

/** A Bedrock knowledge base ARN, as the gateway accepts it. */
export const KB_ARN = /^arn:aws:bedrock:[a-z0-9-]+:\d{12}:knowledge-base\/[A-Z0-9]{10}$/;

export type SourceStatus = "queued" | "syncing" | "ready" | "error";

export interface Selected {
  id: string;
  title: string;
  kind: string;
  path: string[];
  include_children: boolean;
}

export interface SourceError {
  message: string;
  fix: string;
  /** `reconnect`, `sign_in`, `edit`, `retry`, or empty. */
  action: string;
  at: string;
}

/** How a source reads its app: `sign_in` (a member's own sign-in) or the team's connection (empty). */
export type SourceConnection = "sign_in" | "";

/** Whose sign-in a source syncs with. */
export interface SourceSignIn {
  name: string;
  email: string;
  /** The account in the app ("Connected as"), when the app says. */
  account: string;
}

export interface Source {
  id: string;
  kind: SourceKind;
  label: string;
  name: string;
  selection: Selected[];
  options: Record<string, unknown>;
  paused: boolean;
  status: SourceStatus;
  error: SourceError | null;
  progress: { phase: string; done: number; total: number } | null;
  items: number;
  failed_items: number;
  truncated: boolean;
  last_sync_at: string;
  last_success_at: string;
  next_sync_at: string;
  live_updates: boolean;
  created_at: string;
  created_by: string;
  connection?: SourceConnection;
  signin?: SourceSignIn | null;
}

export interface SourceSummary {
  id: string;
  kind: SourceKind;
  name: string;
  status: SourceStatus;
  paused: boolean;
  items: number;
  last_success_at: string;
}

export interface Base {
  id: string;
  name: string;
  description: string;
  read_role: "viewer" | "member" | "admin";
  attach_team: boolean;
  agents: string[];
  authoritative: boolean;
  created_at: string;
  updated_at: string;
  files: number;
  ready: number;
  processing: number;
  failed: number;
  uploads: number;
  synced: number;
  kinds: AddKind[];
  sources: SourceSummary[];
  /** Absent from an older gateway: kept here. */
  backend?: Backend;
  /** Only these people (`user:<email>`) or roles (`role:<key>`) read it; empty: the read role decides. */
  readers?: string[];
  /** Said when agents search it: who gets its results through them. */
  agent_access_note?: string;
}

/** The base is connected in place (searched live where it lives, nothing copied). */
export function connectedInPlace(b: Pick<Base, "backend"> | null | undefined): b is Base & { backend: Extract<Backend, { kind: "remote" }> } {
  return b?.backend?.kind === "remote";
}

export interface Item extends KnowledgeFile {
  source_id?: string;
  url?: string | null;
  path?: string;
}

export interface Connector {
  kind: SourceKind;
  label: string;
  blurb: string;
  connected: boolean;
  via: "oauth" | "sign_in" | "saved_key" | "github_app" | "public" | "";
  can_sign_in: boolean;
  reconnect_reason: string;
  connected_by: string;
  hint: string;
  live_updates: boolean;
  picker: "tree" | "address" | "s3" | "archive";
  /** You can sign in with your own account for this app, nothing to set up. */
  member_sign_in?: boolean;
  /** You have such a sign-in now. */
  signed_in?: boolean;
  /** The account you're signed in as (or your email when the app doesn't say). */
  signed_in_as?: string;
  /** The team also has an API token saved for it. */
  has_saved_key?: boolean;
  /** It can also connect with a token pasted in the add flow (Notion, Confluence). */
  token_path?: boolean;
}

/** What the add flow sends to connect with a token. Confluence needs all three. */
export interface TokenInput {
  token: string;
  site?: string;
  email?: string;
}

/** How a new source connects: your own sign-in, or the team's saved token or sign-in. */
export type Via = "sign_in" | "team";

export interface PickerNode {
  id: string;
  title: string;
  kind: string;
  has_children: boolean;
  selectable: boolean;
  url: string;
  updated_at: string;
  detail: string;
  /** The provider's icon: an emoji, or an https image address. Absent when it has none. */
  icon?: string;
  /** Entries directly inside it, when the provider says. */
  child_count?: number;
  /** Items picking it brings in (itself and everything inside), when known. */
  item_count?: number;
  /** A file's size in bytes, when the provider reports one. */
  bytes?: number;
  /** Titles above it, top first: given for search results. */
  path?: string[];
}

export interface SourceInput {
  kind: SourceKind;
  name?: string;
  selection: Selected[];
  options?: Record<string, unknown>;
  /** `sign_in`: sync through your own sign-in (Sanity). */
  via?: "sign_in";
}

export interface WebhookSetup {
  url: string;
  secret: string;
  dataset: string;
}

/** What the browser does with an archive: PUT it to `upload`, then say it arrived. */
export interface ArchiveStart {
  source: Source;
  upload: SignedUpload;
  note: string;
}

/** Where an S3 import reads from. */
export interface S3Place {
  account: string;
  bucket: string;
  region: string;
}

/** What a base is connected to in place, as the create call sends it. */
export type ConnectInput =
  | { provider: "bedrock_kb"; target: string }
  | { provider: "mcp"; target: string; search_tool?: string; fetch_tool?: string };

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });
const e = encodeURIComponent;

export const knowledge = {
  list: () => request<{ bases: Base[]; can_manage: boolean; limits: KnowledgeLimits }>("/api/knowledge"),
  get: (id: string) =>
    request<{ base: Base; files: Item[]; sources: Source[]; can_manage: boolean; limits: KnowledgeLimits; visibility_note: string }>(
      `/api/knowledge/${e(id)}`,
    ),
  create: (input: BaseInput & { source?: SourceInput; connect?: ConnectInput }) =>
    request<{ base: Base; source: Source | null; setup: WebhookSetup | null }>("/api/knowledge", post(input)),
  update: (id: string, input: BaseInput) => request<{ base: Base }>(`/api/knowledge/${e(id)}`, put(input)),
  remove: (id: string) => request<{ ok: boolean }>(`/api/knowledge/${e(id)}`, { method: "DELETE" }),
  startUpload: (id: string, file: { name: string; size: number; replace?: string }) =>
    request<{ file: Item; upload: SignedUpload }>(`/api/knowledge/${e(id)}/files`, post(file)),
  finishUpload: (id: string, fileId: string) =>
    request<{ file: Item }>(`/api/knowledge/${e(id)}/files/${e(fileId)}/uploaded`, { method: "POST" }),
  removeFile: (id: string, fileId: string) => request<{ ok: boolean }>(`/api/knowledge/${e(id)}/files/${e(fileId)}`, { method: "DELETE" }),

  /** One test search of a base connected in place, now. */
  check: (id: string) => request<{ ok: boolean; hybrid: boolean; checked_at: string }>(`/api/knowledge/${e(id)}/check`, { method: "POST" }),
  /** Connecting a Bedrock knowledge base: the install's own list (self-hosted) and the team's AWS accounts. */
  bedrock: () => request<BedrockStart>("/api/knowledge/bedrock"),
  /** What a Bedrock knowledge base was built from, to import it here. */
  bedrockImport: (arn: string) => request<BedrockImport>(`/api/knowledge/bedrock/import?arn=${e(arn)}`),
  /** The team's Connected apps servers that can be searched in place. */
  searchTools: () => request<SearchToolsStart>("/api/knowledge/search-tools"),
  /** One level of an S3 bucket (the top without `parent`). */
  browseS3: (place: S3Place, parent: string | null, q = "") => {
    const qs = new URLSearchParams({ account: place.account, bucket: place.bucket, region: place.region });
    if (parent) qs.set("parent", parent);
    if (q) qs.set("q", q);
    return request<{ nodes: PickerNode[] }>(`/api/knowledge/connectors/s3/browse?${qs.toString()}`);
  },
  /** Starts an archive import (or a newer export of one): the source and where to upload the .zip. */
  startArchive: (kbId: string, file: { name: string; size: number; replace?: string }) =>
    request<ArchiveStart>(`/api/knowledge/${e(kbId)}/archives`, post(file)),
  /** The archive is uploaded: the import starts. */
  finishArchive: (kbId: string, sourceId: string) =>
    request<{ source: Source }>(`/api/knowledge/${e(kbId)}/archives/${e(sourceId)}/uploaded`, { method: "POST" }),
  connectors: () => request<{ connectors: Connector[]; visibility_note: string }>("/api/knowledge/connectors"),
  /** Starts the team's sign-in; the API keeps this page as where the callback returns to. */
  connect: (kind: SourceKind) =>
    request<{ authorize_url: string }>(`/api/knowledge/connectors/${e(kind)}/connect`, { method: "POST", body: JSON.stringify({ return_to: herePath() }) }),
  /** Your own sign-in for an app (Sanity): already signed in, or where to send the sign-in window. */
  signIn: (kind: SourceKind) =>
    request<{ signed_in: boolean; authorize_url?: string }>(`/api/knowledge/connectors/${e(kind)}/signin`, { method: "POST", body: JSON.stringify({ return_to: herePath() }) }),
  /** Checks a pasted token with the app and saves it the way Integrations does (admins and owners). */
  saveToken: (kind: SourceKind, input: TokenInput) =>
    request<{ connected: boolean; shared: number | null; warning: string }>(`/api/knowledge/connectors/${e(kind)}/token`, post(input)),
  disconnect: (kind: SourceKind) => request<{ ok: boolean }>(`/api/knowledge/connectors/${e(kind)}`, { method: "DELETE" }),
  browse: (kind: SourceKind, parent: string | null, q: string, via: Via = "team") => {
    const qs = new URLSearchParams();
    if (parent) qs.set("parent", parent);
    if (q) qs.set("q", q);
    if (via === "sign_in") qs.set("via", "sign_in");
    const s = qs.toString();
    return request<{ nodes: PickerNode[]; options: Record<string, unknown> }>(`/api/knowledge/connectors/${e(kind)}/browse${s ? `?${s}` : ""}`);
  },

  addSource: (kbId: string, input: SourceInput) =>
    request<{ source: Source; setup: WebhookSetup | null; visibility_note: string }>(`/api/knowledge/${e(kbId)}/sources`, post(input)),
  updateSource: (kbId: string, id: string, patch: { name?: string; selection?: Selected[]; options?: Record<string, unknown>; paused?: boolean }) =>
    request<{ source: Source }>(`/api/knowledge/${e(kbId)}/sources/${e(id)}`, put(patch)),
  syncSource: (kbId: string, id: string) => request<{ source: Source }>(`/api/knowledge/${e(kbId)}/sources/${e(id)}/sync`, { method: "POST" }),
  /** "Sign in again": switches the source to your sign-in, or answers where to send the sign-in window first. */
  signInSource: (kbId: string, id: string) =>
    request<{ source?: Source; authorize_url?: string }>(`/api/knowledge/${e(kbId)}/sources/${e(id)}/signin`, { method: "POST" }),
  removeSource: (kbId: string, id: string) => request<{ ok: boolean; removed: number }>(`/api/knowledge/${e(kbId)}/sources/${e(id)}`, { method: "DELETE" }),
};

// ── Words ────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<AddKind, string> = {
  notion: "Notion",
  confluence: "Confluence",
  sanity: "Sanity",
  google_drive: "Google Drive",
  github: "GitHub",
  web: "Website",
  s3: "Amazon S3",
  archive: "Archive upload",
  upload: "Files",
  bedrock_kb: "Bedrock knowledge base",
  mcp: "Search tool (MCP)",
  bedrock_import: "Import a Bedrock knowledge base",
};

/** Where a cited passage came from (a hit's `source_kind`), in words. */
export function sourceKindLabel(key: string | undefined | null): string {
  if (!key) return "Uploaded file";
  return (KIND_LABEL as Record<string, string>)[key] ?? key;
}

/** The truncation line for a source: imports have their own limit and a way past it. */
export function truncatedLine(kind: string, limits: Pick<KnowledgeLimits, "max_items_per_import"> | null | undefined): string {
  if (IMPORT_KINDS.includes(kind)) {
    const n = (limits?.max_items_per_import ?? 0).toLocaleString();
    return `This import has more than ${n} documents; only the first ones are searchable. Connect the knowledge base in place instead to search all of it.`;
  }
  return "Only the first 1,000 are kept. Choose fewer pages to keep everything.";
}

/** A reader entry from what a person typed: an email is a person, anything else a role. */
export function readerEntry(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^(user|role):/.test(t)) return t.length > 3 ? t : null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `user:${t.toLowerCase()}`;
  if (/^[a-z0-9_-]{1,64}$/i.test(t)) return `role:${t.toLowerCase()}`;
  return null;
}

/** A reader entry as the page shows it. */
export function readerWords(entry: string): string {
  if (entry.startsWith("user:")) return entry.slice(5);
  if (entry.startsWith("role:")) return `Role: ${entry.slice(5)}`;
  return entry;
}

/** At most this many reader entries on one base. */
export const MAX_READERS = 50;

/** What one item of a kind is called: "page", "document", "file". */
export function itemWord(kind: AddKind | string, n: number): string {
  const one = kind === "sanity" || kind === "s3" ? "document" : kind === "upload" || kind === "google_drive" || kind === "github" ? "file" : "page";
  return `${n.toLocaleString()} ${one}${n === 1 ? "" : "s"}`;
}

/** Who can read a base, as one plain sentence. */
export const READ_SENTENCE: Record<string, string> = {
  viewer: "Everyone on your team can read this.",
  member: "Members, admins and owners can read this.",
  admin: "Only admins and owners can read this.",
};

/** The short form for lists. */
export const READ_SHORT: Record<string, string> = {
  viewer: "Whole team",
  member: "Members",
  admin: "Admins",
};

export type Health = { tone: "live" | "queued" | "success" | "attention" | "muted"; words: string };

function ago(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Where a source is, in one plain line. */
export function sourceHealth(s: Pick<Source, "status" | "paused" | "progress" | "last_success_at" | "error" | "kind">, now = Date.now()): Health {
  const label = KIND_LABEL[s.kind] ?? "the app";
  if (s.status === "error") return { tone: "attention", words: s.error?.fix || `Reconnect ${label} to keep it up to date.` };
  if (s.status === "syncing") {
    const p = s.progress;
    if (p && p.phase === "fetching" && p.total > 0) return { tone: "live", words: `Bringing in ${Math.min(p.done, p.total)} of ${p.total}` };
    if (p && p.phase === "removing") return { tone: "live", words: "Removing pages that were deleted" };
    return { tone: "live", words: s.last_success_at ? "Checking for changes" : "Getting started" };
  }
  if (s.paused) return { tone: "muted", words: `Paused. Changes in ${label} aren't brought in.` };
  if (s.status === "queued") return { tone: "queued", words: "Starting in a moment" };
  const when = ago(s.last_success_at, now);
  return { tone: "success", words: when ? `Up to date, checked ${when}` : "Up to date" };
}

/** A base's overall health, from its sources. */
export function baseHealth(b: Pick<Base, "sources" | "processing" | "failed">, now = Date.now()): Health | null {
  const srcs = b.sources ?? [];
  const broken = srcs.find((s) => s.status === "error");
  if (broken) return { tone: "attention", words: `${KIND_LABEL[broken.kind]} needs attention` };
  if (srcs.some((s) => s.status === "syncing" || s.status === "queued") || b.processing > 0) return { tone: "live", words: "Bringing in new pages" };
  if (!srcs.length) return null;
  const last = srcs
    .map((s) => s.last_success_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  const when = last ? ago(last, now) : "";
  return { tone: "success", words: when ? `Up to date, checked ${when}` : "Up to date" };
}

/** The button that fixes a source's error. */
export function fixLabel(s: Pick<Source, "error" | "kind">): string | null {
  const label = KIND_LABEL[s.kind];
  switch (s.error?.action) {
    case "reconnect":
      return `Reconnect ${label}`;
    case "sign_in":
      return "Sign in again";
    case "edit":
      return s.kind === "archive" ? "Upload a newer export" : "Choose pages again";
    case "retry":
      return "Try again";
    default:
      return null;
  }
}

/** A name for a knowledge base from what was picked (see lib/kb-name.ts for the alternatives). */
export function suggestName(
  kind: AddKind,
  picked: { title: string; kind?: string; path?: string[] }[],
  files: { name: string }[] = [],
  taken: string[] = [],
): string {
  return suggestBaseName({ kind, label: KIND_LABEL[kind], picked, files, taken });
}

// ── Coming back from a sign-in ───────────────────────────────────────

/** This page's path and query, which a sign-in started here returns to. */
export function herePath(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

const RETURN_KEY = "knowledge-return";

export interface FlowReturn {
  /** The page to come back to (with its query). */
  path: string;
  kind: SourceKind;
  /** Adding to a base, or creating one. */
  kbId?: string;
}

/** Remembers where the add flow was before a sign-in leaves the page. */
export function rememberReturn(r: FlowReturn) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(r));
  } catch {
    // Private windows: the person lands on Knowledge and picks again.
  }
}

/** Where to go after a knowledge sign-in finishes (and forget it). */
export function takeReturn(): FlowReturn | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return raw ? (JSON.parse(raw) as FlowReturn) : null;
  } catch {
    return null;
  }
}

/** The address a finished sign-in returns to, reopening the flow at the picker. */
export function returnAddress(r: FlowReturn | null, kind: string): string {
  const base = r?.path && r.path.startsWith("/knowledge") ? r.path : "/knowledge/";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connected=${encodeURIComponent(r?.kind ?? kind)}`;
}

// ── Signing in without leaving the page ──────────────────────────────

/** What the sign-in callback page posts to the window that opened it. */
export const SIGNED_IN_MESSAGE = "coderhelm:mcp-connected";

/**
 * Opens an app's sign-in in a small window and waits for it: resolves true
 * once the callback page says it finished, false when the window is closed
 * first. `start` gets the sign-in address; it runs after the window opens,
 * inside the click, so popup blockers allow it.
 */
export function signInWindow(start: () => Promise<string | null>): Promise<boolean> {
  const w = window.open("about:blank", "coderhelm-sign-in", "width=520,height=720");
  return new Promise<boolean>((resolve, reject) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearInterval(poll);
      resolve(ok);
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string } | null;
      if (d?.type === SIGNED_IN_MESSAGE) finish(true);
    };
    window.addEventListener("message", onMessage);
    const poll = setInterval(() => {
      if (w && w.closed) finish(false);
    }, 500);
    start()
      .then((url) => {
        if (!url) {
          w?.close();
          finish(true);
          return;
        }
        if (w) w.location.href = url;
        else {
          // No window (blocked): sign in in this tab and come back.
          window.location.assign(url);
        }
      })
      .catch((e) => {
        w?.close();
        done = true;
        window.removeEventListener("message", onMessage);
        clearInterval(poll);
        reject(e);
      });
  });
}
