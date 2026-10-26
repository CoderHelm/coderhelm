// Knowledge: knowledge bases, the apps they stay in sync with, and the
// words the pages use for where each one is. Uploads reuse the signed-upload
// helpers in ./brain.

import { request } from "./api";
import type { BaseInput, KnowledgeFile, KnowledgeLimits, SignedUpload } from "./brain";

export { fileSize, uploadProblem, uploadToSignedUrl } from "./brain";
export type { BaseInput, KnowledgeLimits, SignedUpload } from "./brain";

/** The apps a knowledge base can hold pages from, plus uploads. */
export type SourceKind = "notion" | "confluence" | "sanity" | "google_drive" | "github" | "web";
export type AddKind = SourceKind | "upload";

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
  picker: "tree" | "address";
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

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });
const e = encodeURIComponent;

export const knowledge = {
  list: () => request<{ bases: Base[]; can_manage: boolean; limits: KnowledgeLimits }>("/api/knowledge"),
  get: (id: string) =>
    request<{ base: Base; files: Item[]; sources: Source[]; can_manage: boolean; limits: KnowledgeLimits; visibility_note: string }>(
      `/api/knowledge/${e(id)}`,
    ),
  create: (input: BaseInput & { source?: SourceInput }) =>
    request<{ base: Base; source: Source | null; setup: WebhookSetup | null }>("/api/knowledge", post(input)),
  update: (id: string, input: BaseInput) => request<{ base: Base }>(`/api/knowledge/${e(id)}`, put(input)),
  remove: (id: string) => request<{ ok: boolean }>(`/api/knowledge/${e(id)}`, { method: "DELETE" }),
  startUpload: (id: string, file: { name: string; size: number; replace?: string }) =>
    request<{ file: Item; upload: SignedUpload }>(`/api/knowledge/${e(id)}/files`, post(file)),
  finishUpload: (id: string, fileId: string) =>
    request<{ file: Item }>(`/api/knowledge/${e(id)}/files/${e(fileId)}/uploaded`, { method: "POST" }),
  removeFile: (id: string, fileId: string) => request<{ ok: boolean }>(`/api/knowledge/${e(id)}/files/${e(fileId)}`, { method: "DELETE" }),

  connectors: () => request<{ connectors: Connector[]; visibility_note: string }>("/api/knowledge/connectors"),
  connect: (kind: SourceKind) => request<{ authorize_url: string }>(`/api/knowledge/connectors/${e(kind)}/connect`, { method: "POST" }),
  /** Your own sign-in for an app (Sanity): already signed in, or where to send the sign-in window. */
  signIn: (kind: SourceKind) =>
    request<{ signed_in: boolean; authorize_url?: string }>(`/api/knowledge/connectors/${e(kind)}/signin`, { method: "POST" }),
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
  upload: "Files",
};

/** What one item of a kind is called: "page", "document", "file". */
export function itemWord(kind: AddKind | string, n: number): string {
  const one = kind === "sanity" ? "document" : kind === "upload" || kind === "google_drive" || kind === "github" ? "file" : "page";
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
      return "Choose pages again";
    case "retry":
      return "Try again";
    default:
      return null;
  }
}

/** A name for a knowledge base from what was picked. */
export function suggestName(kind: AddKind, picked: { title: string }[], files: { name: string }[] = []): string {
  if (kind === "upload") {
    if (files.length === 1) return files[0].name.replace(/\.[^.]+$/, "");
    return files.length ? "Team documents" : "Team documents";
  }
  if (picked.length === 1) return picked[0].title.slice(0, 80);
  if (picked.length > 1) return `${picked[0].title.slice(0, 60)} and ${picked.length - 1} more`;
  return KIND_LABEL[kind];
}

// ── Coming back from a sign-in ───────────────────────────────────────

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
