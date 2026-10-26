// Chat (answers from the team's own sources) and knowledge
// bases: types, API calls, the answer stream and browser uploads. The API
// keeps its original `/api/brain/*` paths; only the product name changed.

import { request, ApiError } from "./api";
import { streamBase } from "./runtime-config";

// ── Knowledge bases ───────────────────────────────────────────────

export type FileStatus = "uploading" | "processing" | "ready" | "failed";

export interface KnowledgeBase {
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
}

export interface KnowledgeFile {
  id: string;
  name: string;
  kind: string;
  size: number;
  status: FileStatus;
  error: string;
  version: number;
  /** A version is searchable now (a failed re-upload keeps the last one). */
  searchable: boolean;
  as_of: string;
  uploaded_at: string;
  uploaded_by: string;
  chunks: number;
  truncated: boolean;
}

export interface KnowledgeLimits {
  max_file_bytes: number;
  max_files: number;
  extensions: string[];
  agents: { key: string; label: string }[];
  read_roles: string[];
}

export interface BaseInput {
  name: string;
  description: string;
  read_role: string;
  attach_team: boolean;
  agents: string[];
  authoritative: boolean;
}

/** A signed upload: PUT the file's bytes to `url` with `headers`. */
export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const knowledgeApi = {
  list: () => request<{ bases: KnowledgeBase[]; can_manage: boolean; limits: KnowledgeLimits }>("/api/knowledge"),
  get: (id: string) =>
    request<{ base: KnowledgeBase; files: KnowledgeFile[]; can_manage: boolean; limits: KnowledgeLimits }>(
      `/api/knowledge/${encodeURIComponent(id)}`,
    ),
  create: (input: BaseInput) => request<{ base: KnowledgeBase }>("/api/knowledge", json(input)),
  update: (id: string, input: BaseInput) =>
    request<{ base: KnowledgeBase }>(`/api/knowledge/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" }),
  startUpload: (id: string, file: { name: string; size: number; replace?: string }) =>
    request<{ file: KnowledgeFile; upload: SignedUpload }>(`/api/knowledge/${encodeURIComponent(id)}/files`, json(file)),
  finishUpload: (id: string, fileId: string) =>
    request<{ file: KnowledgeFile }>(
      `/api/knowledge/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/uploaded`,
      { method: "POST" },
    ),
  removeFile: (id: string, fileId: string) =>
    request<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    }),
};

/** Sends `file` to a signed URL, reporting progress (0 to 1). */
export function uploadToSignedUrl(upload: SignedUpload, file: File, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method || "PUT", upload.url);
    for (const [k, v] of Object.entries(upload.headers ?? {})) {
      // The browser sets these itself.
      if (/^(host|content-length)$/i.test(k)) continue;
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError("The upload didn't go through. Try again.", xhr.status)));
    xhr.onerror = () => reject(new ApiError("The upload didn't go through. Check your connection and try again.", 0));
    xhr.send(file);
  });
}

/** "1.2 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a file can't be uploaded, before it is sent. */
export function uploadProblem(file: { name: string; size: number }, limits: { max_file_bytes: number; extensions: string[] }): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!limits.extensions.includes(ext)) return `${file.name}: this kind of file isn't supported. Upload ${limits.extensions.join(", ")}.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > limits.max_file_bytes) return `${file.name} is larger than ${Math.round(limits.max_file_bytes / (1024 * 1024))} MB.`;
  return null;
}

// ── Chat ──────────────────────────────────────────────────────────

/** A place in a repository at one commit. */
export interface CodeRef {
  repo: string;
  path: string;
  commit: string;
  /** 1-based; 0 when the source is a whole file or a folder. */
  start_line?: number;
  end_line?: number;
}

export interface Citation {
  id: string;
  kind: "knowledge" | "upload" | "connection" | "data_source" | "code" | "memory" | "skill" | string;
  title: string;
  loc: string;
  as_of: string;
  passage: string;
  /** A page in the dashboard. */
  href?: string;
  /** The original outside Coderhelm (the file on GitHub at its commit, a synced page). */
  url?: string;
  authoritative: boolean;
  base?: string;
  source_kind?: string;
  code?: CodeRef;
}

export interface Picks {
  knowledge: string[];
  connections: boolean;
  code: boolean;
  memories: boolean;
  data_sources: boolean;
  skills: boolean;
  repo?: string | null;
  repos?: string[];
  /** Chat chose (everything the asker can see). */
  auto?: boolean;
}

/** Something the asker pointed a question at with @. */
export interface Mention {
  kind: "repo" | "knowledge";
  /** owner/name, or the knowledge base id. */
  id: string;
}

export interface BrainThread {
  id: string;
  title: string;
  shared: boolean;
  mine: boolean;
  owner_email: string;
  created_at: string;
  updated_at: string;
  messages: number;
}

/** One step an answer took (a file read, a search). */
export interface UsedStep {
  kind: string;
  label: string;
  name?: string;
  repo?: string;
  summary?: string;
}

export interface BrainMessage {
  seq: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  grounded: boolean;
  sources?: Picks;
  mentions?: Mention[];
  attachments: string[];
  used: UsedStep[];
  at: string;
  /** The asker's rating of an answer. */
  feedback?: Rating | null;
}

export type Rating = "up" | "down";

/** A question the empty chat offers, built from the team's own data. */
export interface Starter {
  question: string;
  /** Where it comes from: "From the web code". */
  why: string;
  sources?: Picks;
}

export interface BrainRepo {
  name: string;
  short: string;
  role?: string | null;
}

export interface BrainSources {
  knowledge: { id: string; name: string; ready: number; authoritative: boolean }[];
  connections: { id: string }[];
  repos: string[];
  repositories?: BrainRepo[];
  can_ask: boolean;
}

export const brainApi = {
  threads: () => request<{ threads: BrainThread[]; can_ask: boolean }>("/api/brain/threads"),
  thread: (id: string) =>
    request<{ thread: BrainThread; messages: BrainMessage[]; can_ask: boolean }>(`/api/brain/threads/${encodeURIComponent(id)}`),
  updateThread: (id: string, patch: { title?: string; shared?: boolean }) =>
    request<{ thread: BrainThread }>(`/api/brain/threads/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteThread: (id: string) => request<{ ok: boolean }>(`/api/brain/threads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sources: () => request<BrainSources>("/api/brain/sources"),
  starters: () => request<{ starters: Starter[] }>("/api/brain/starters"),
  rate: (threadId: string, seq: number, rating: Rating | null) =>
    request<{ ok: boolean; feedback: Rating | null }>(
      `/api/brain/threads/${encodeURIComponent(threadId)}/messages/${seq}/feedback`,
      { method: "PUT", body: JSON.stringify({ rating }) },
    ),
  attach: (file: { name: string; size: number }) =>
    request<{ id: string; name: string; upload: SignedUpload }>("/api/brain/attachments", json(file)),
};

export type BrainEvent =
  | { type: "thread"; id: string; title: string }
  | { type: "retrieved"; sources: Citation[] }
  | { type: "tool_start"; id: string; name: string; kind: string }
  | { type: "tool_result"; id: string; name: string; label: string; kind?: string; repo?: string; status: "success" | "error"; summary: string; sources?: Citation[] }
  | { type: "step"; id: string; label: string; status: "success" | "error" }
  | { type: "text_delta"; text: string }
  | { type: "text_reset" }
  | { type: "answer"; text: string; citations: Citation[]; grounded: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AskBody {
  thread_id?: string;
  question: string;
  /** Left out, Chat reads everything the asker can see. */
  sources?: Picks;
  /** What the asker pointed the question at with @. */
  mentions: Mention[];
  attachments: { id: string; name: string }[];
}

/** Parses server-sent events out of a growing buffer; returns what's left. */
export function parseSse(buffer: string, onEvent: (e: BrainEvent) => void): string {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let type = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) type = line.slice(7).trim();
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (!type || !data) continue;
    try {
      onEvent({ type, ...JSON.parse(data) } as BrainEvent);
    } catch {
      // A malformed event is skipped.
    }
  }
  return rest;
}

/** A five-minute token for the answer stream (needs the brain_ask capability). */
let cachedToken: { token: string; until: number } | null = null;
async function brainToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.token;
  const { token } = await request<{ token: string }>("/api/brain/token", { method: "POST" });
  cachedToken = { token, until: Date.now() + 4 * 60 * 1000 };
  return token;
}

/** Asks a question; events arrive through `onEvent` until `done`. */
export async function askBrain(body: AskBody, onEvent: (e: BrainEvent) => void, signal?: AbortSignal): Promise<void> {
  const token = await brainToken();
  const res = await fetch(`${streamBase()}/api/brain/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = "Couldn't get an answer right now. Try again.";
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {}
    onEvent({ type: "error", message });
    onEvent({ type: "done" });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = parseSse(buffer + decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n"), onEvent);
  }
  if (buffer.trim()) parseSse(buffer + "\n\n", onEvent);
}

/** One source an answer leans on: every citation of the same file or page, as one. */
export interface SourceDoc {
  /** Its number in the answer (1, 2, ...). */
  n: number;
  key: string;
  /** The citations it gathers (several line ranges of one file). */
  parts: Citation[];
}

/** What makes two citations the same source: a file in a repository, or a page. */
export function sourceKey(c: Citation): string {
  if (c.code?.path) return `code:${c.code.repo}:${c.code.path}`;
  if (c.code) return `code:${c.code.repo}:${c.title}`;
  return `${c.kind}:${c.base ?? ""}:${c.title}`;
}

/** The answer's sources, each once, numbered in the order the answer first cites them. */
export function groupSources(citations: Citation[]): { docs: SourceDoc[]; numberOf: Map<string, number> } {
  const docs: SourceDoc[] = [];
  const byKey = new Map<string, SourceDoc>();
  const numberOf = new Map<string, number>();
  for (const c of citations) {
    const key = sourceKey(c);
    let d = byKey.get(key);
    if (!d) {
      d = { n: docs.length + 1, key, parts: [] };
      byKey.set(key, d);
      docs.push(d);
    }
    d.parts.push(c);
    numberOf.set(c.id, d.n);
  }
  return { docs, numberOf };
}

const MARKERS = /\s?(?:\[(?:S\d+(?:\s*[,;]\s*S\d+)*)\])+/g;

/**
 * `[S1, S3][S4]` markers as links the markdown renders as citation markers:
 * one per source (two citations of one file are one marker), unknown ids
 * dropped, and a marker placed after the sentence's period.
 */
export function linkCitations(text: string, numberOf: Map<string, number>): string {
  const linked = text.replace(MARKERS, (whole: string) => {
    const ns: number[] = [];
    for (const id of whole.match(/S\d+/g) ?? []) {
      const n = numberOf.get(id);
      if (n !== undefined && !ns.includes(n)) ns.push(n);
    }
    return ns.length ? ` ${ns.map((n) => `[${n}](#cite-${n})`).join("")}` : "";
  });
  // "paid [1]." reads "paid.[1]": the marker follows the sentence it backs.
  return linked.replace(/ ((?:\[\d+\]\(#cite-\d+\))+)([.,;:!?])/g, "$2$1");
}

/** The words for what an answer did, from its steps: "Read 4 files in web, searched the code". */
export function activitySummary(steps: { name?: string; label: string; repo?: string; status?: string }[]): string {
  const done = steps.filter((s) => s.status !== "running");
  if (!done.length) return "";
  const count = (pred: (n: string) => boolean) => done.filter((s) => pred(s.name ?? "")).length;
  const reposOf = (pred: (n: string) => boolean) => [...new Set(done.filter((s) => pred(s.name ?? "") && s.repo).map((s) => s.repo!))];
  const isRead = (n: string) => n === "github__read_file";
  const isOverview = (n: string) => n === "github__repo_overview";
  const isSearch = (n: string) => n === "github__search_code" || n === "github__list_files" || n.startsWith("graph_");
  const parts: string[] = [];
  const overviews = reposOf(isOverview);
  if (overviews.length) parts.push(`looked over ${overviews.join(" and ")}`);
  const reads = count(isRead);
  if (reads) {
    const where = reposOf(isRead);
    parts.push(`read ${reads} ${reads === 1 ? "file" : "files"}${where.length === 1 ? ` in ${where[0]}` : ""}`);
  }
  if (count(isSearch)) parts.push("searched the code");
  if (count((n) => n === "search_knowledge")) parts.push("searched knowledge");
  if (count((n) => n === "search_memories")) parts.push("checked past work");
  const known = (n: string) => isRead(n) || isOverview(n) || isSearch(n) || n === "search_knowledge" || n === "search_memories" || n === "github__list_repos";
  const other = done.filter((s) => !known(s.name ?? "") && !s.label.startsWith("Looked further"));
  if (other.length === 1) parts.push(other[0].label.charAt(0).toLowerCase() + other[0].label.slice(1));
  else if (other.length > 1) parts.push(`${other.length} other lookups`);
  if (!parts.length) return done.length === 1 ? done[0].label : `${done.length} steps`;
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** An answer's text without its `[S1]` markers, for copying. */
export function withoutCitations(text: string): string {
  return text
    .replace(MARKERS, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** What a citation's kind is called, in plain words. */
export const CITATION_KIND: Record<string, string> = {
  knowledge: "Knowledge",
  upload: "Your file",
  connection: "Connected app",
  data_source: "Logs and data",
  code: "Code",
  memory: "Past work",
  skill: "Team know-how",
};

/** A source's short name for a chip: "Leave policy" for "Leave policy.pdf", "leave.ts" for a path. */
export function citationName(c: Pick<Citation, "title">): string {
  const base = c.title.split("/").pop() || c.title;
  return /\.(pdf|docx?|md|markdown|txt|text|csv|xlsx?|html?)$/i.test(base) ? base.replace(/\.[^.]+$/, "") : base;
}

/** "Updated May 1, 2026" for a document's date; "Checked Oct 24" for something read live. */
export function citationWhen(asOf: string): string {
  if (!asOf) return "";
  const live = asOf.includes("UTC");
  const d = new Date(live ? asOf.replace(" UTC", "Z").replace(" ", "T") : `${asOf.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear && live ? {} : { year: "numeric" }), timeZone: "UTC" });
  return live ? `Checked ${day}` : `Updated ${day}`;
}
