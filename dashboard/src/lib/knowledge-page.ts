// The knowledge base page: the light poll while sources sync, items paged
// and filtered by the gateway (or here, from an older gateway's full list),
// how each source connects, and the words for each of those.

import { ApiError, request } from "./api";
import { KIND_LABEL, type Base, type Item, type KnowledgeLimits, type Source, type SourceKind } from "./knowledge";

/** How a source reaches its app. Empty until its first sync says. */
export type ViaKey = "oauth" | "sign_in" | "saved_key" | "github_app" | "public" | "aws_role" | "upload" | "";

/** A source with how it connects (newer gateways send these). */
export interface PageSource extends Source {
  via?: ViaKey;
  /** The account it reaches: a Confluence site, a Sanity project, a repository, an AWS account. */
  account?: string;
  /** When a sync last used that connection. */
  connected_used_at?: string;
  use_saved_key?: boolean;
  /** The last change event the app sent. */
  webhook_seen_at?: string;
  /** Minutes between scheduled checks. */
  interval_mins?: number;
}

/** The state an item shows: one word the filters use. */
export type ItemState = "searchable" | "working" | "failed" | "skipped" | "cut_short";

export interface ItemsQuery {
  q?: string;
  status?: ItemState | "";
  source?: string;
  /** `<source>|<top of the breadcrumb>`. */
  group?: string;
  updated?: "7d" | "30d" | "90d" | "older" | "";
  cursor?: string;
  limit?: number;
}

/** One group of the content tree: a source and the first step of the breadcrumb (a space, a folder). */
export interface ItemGroup {
  key: string;
  source: string;
  top: string;
  items: number;
  failed: number;
  newest: string;
}

export interface ItemsPage {
  items: PageItem[];
  /** Items matching every filter. */
  total: number;
  next: string | null;
  /** How many items are in each state, ignoring the state filter. */
  states: Partial<Record<ItemState, number>>;
  groups: ItemGroup[];
  /** Items in the base. */
  all: number;
}

export interface PageItem extends Item {
  /** Why it was left out (`empty`, `unsupported`, `too_large`), when it was. */
  skipped?: string;
  /** When its text was last indexed. */
  indexed_at?: string;
}

/** How a source connects, for the people who manage it. Never a secret. */
export interface ConnectionDetail {
  via: ViaKey;
  /** `team` or `member`. */
  owner: "team" | "member" | "";
  by: string;
  account: string;
  connected_at: string;
  used_at: string;
  token: { status: "working" | "stopped"; status_reason: string; expires_at: string | null; scopes: string[] } | null;
  if_they_leave: string;
  team: { connected: boolean; via: string; connected_by: string; reconnect_reason: string; can_sign_in: boolean; has_saved_key: boolean };
  switch: { oauth: boolean; saved_key: boolean; my_sign_in: boolean };
}

/** A base with the counts newer gateways add. */
export interface PageBase extends Base {
  /** Passages searchable now. */
  passages?: number;
  /** Items left out (no text, a file it doesn't read, too large). */
  skipped?: number;
}

export interface BaseLoad {
  base: PageBase;
  /** Left out by newer gateways; an older one sends every item. */
  files?: PageItem[] | null;
  sources: PageSource[];
  can_manage: boolean;
  limits: KnowledgeLimits;
  visibility_note: string;
}

const e = encodeURIComponent;

function qs(q: ItemsQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The route isn't on this gateway yet (an older deploy): the page falls back. */
export function missingRoute(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405) && !/knowledge base/i.test(err.message);
}

export const kbPage = {
  /** The base and its sources, without its items. */
  base: (id: string) => request<BaseLoad>(`/api/knowledge/${e(id)}?items=none`),
  /** What the page polls while anything syncs. */
  poll: (id: string) => request<{ base: PageBase; sources: PageSource[]; uploads_working: boolean }>(`/api/knowledge/${e(id)}/sources`),
  items: (id: string, q: ItemsQuery) => request<ItemsPage>(`/api/knowledge/${e(id)}/items${qs(q)}`),
  connection: (kbId: string, sourceId: string) => request<ConnectionDetail>(`/api/knowledge/${e(kbId)}/sources/${e(sourceId)}/connection`),
  switchConnection: (kbId: string, sourceId: string, via: "oauth" | "saved_key") =>
    request<{ source: PageSource }>(`/api/knowledge/${e(kbId)}/sources/${e(sourceId)}`, { method: "PUT", body: JSON.stringify({ via }) }),
};

// ── Items, worked out here from an older gateway's full list ────────────────

export function itemState(f: PageItem): ItemState {
  if (f.skipped) return "skipped";
  if (f.status === "failed") return "failed";
  if (f.status === "processing" || f.status === "uploading") return "working";
  return f.truncated ? "cut_short" : "searchable";
}

export function itemGroup(f: PageItem): { source: string; top: string } {
  return { source: f.source_id || "upload", top: (f.path ?? "").split(" / ")[0]?.trim() ?? "" };
}

function daysOld(asOf: string, now: number): number {
  const t = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? Infinity : Math.floor((now - t) / 86_400_000);
}

/** The gateway's `/items`, worked out from every item (the same rules). */
export function itemsPage(files: PageItem[], q: ItemsQuery, now = Date.now()): ItemsPage {
  const term = (q.q ?? "").trim().toLowerCase();
  const words = term ? term.split(/\s+/) : [];
  const [wantSource, wantTop] = q.group ? [q.group.slice(0, q.group.indexOf("|")), q.group.slice(q.group.indexOf("|") + 1)] : ["", ""];
  const states: Partial<Record<ItemState, number>> = {};
  const groups = new Map<string, ItemGroup>();
  const matching: PageItem[] = [];
  for (const f of files) {
    const g = itemGroup(f);
    if (q.source && q.source !== g.source) continue;
    if (q.updated) {
      const d = daysOld(f.as_of ?? "", now);
      const ok = q.updated === "7d" ? d <= 7 : q.updated === "30d" ? d <= 30 : q.updated === "90d" ? d <= 90 : d > 90;
      if (!ok) continue;
    }
    const hay = `${f.name} ${f.path ?? ""}`.toLowerCase();
    if (words.length && !words.every((w) => hay.includes(w))) continue;
    const s = itemState(f);
    states[s] = (states[s] ?? 0) + 1;
    if (q.status && s !== q.status) continue;
    const key = `${g.source}|${g.top}`;
    const grp = groups.get(key) ?? { key, source: g.source, top: g.top, items: 0, failed: 0, newest: "" };
    grp.items += 1;
    if (s === "failed") grp.failed += 1;
    if ((f.as_of ?? "") > grp.newest) grp.newest = f.as_of ?? "";
    groups.set(key, grp);
    if (q.group && (g.source !== wantSource || g.top !== wantTop)) continue;
    matching.push(f);
  }
  const k = (f: PageItem) => `${(f.path ?? "").toLowerCase()}\u0000${f.name.toLowerCase()}`;
  matching.sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 200);
  const start = Math.min(Number(q.cursor ?? 0) || 0, matching.length);
  const page = matching.slice(start, start + limit);
  const end = start + page.length;
  return {
    items: page,
    total: matching.length,
    next: end < matching.length ? String(end) : null,
    states,
    groups: [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    all: files.length,
  };
}

// ── Words ───────────────────────────────────────────────────────────────────

/** How a source connects, in one line anyone may read. */
export function viaWords(s: Pick<PageSource, "via" | "kind" | "signin" | "account" | "options">): string {
  const label = KIND_LABEL[s.kind] ?? "the app";
  switch (s.via) {
    case "oauth":
      return `The team's ${label} sign-in`;
    case "sign_in":
      return s.signin?.name ? `${s.signin.name}'s own ${label} sign-in` : `A member's own ${label} sign-in`;
    case "saved_key":
      return `An API token saved for the team`;
    case "github_app":
      return "The Coderhelm GitHub App";
    case "aws_role":
      return s.account ? `The team's read-only AWS role in ${s.account}` : "The team's read-only AWS role";
    case "public":
      return "Public pages, no sign-in";
    case "upload":
      return "An uploaded export";
    default:
      return "Shown after its next sync";
  }
}

/** The short word for a connection, for chips and phone rows. */
export const VIA_SHORT: Record<string, string> = {
  oauth: "Team sign-in",
  sign_in: "Member sign-in",
  saved_key: "Saved API token",
  github_app: "GitHub App",
  aws_role: "AWS role",
  public: "Public",
  upload: "Upload",
  "": "Not known yet",
};

/** When something happened, in plain words ("4 min ago", "in 20 min"). */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((t - now) / 60_000);
  const abs = Math.abs(mins);
  const span = abs < 1 ? "" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  if (!span) return mins >= 0 ? "in a moment" : "just now";
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

/** A date for people: "Nov 3, 2026". */
export function dayWords(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A clock time for people: "14:20". */
export function clockWords(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Live updates, in one sentence: on (and the last change event) or off (and when it is checked next). */
export function liveWords(s: Pick<PageSource, "live_updates" | "webhook_seen_at" | "next_sync_at" | "interval_mins" | "paused" | "kind">, now = Date.now()): string {
  const label = KIND_LABEL[s.kind] ?? "The app";
  const every = s.interval_mins ? (s.interval_mins >= 60 ? `${Math.round(s.interval_mins / 60)} h` : `${s.interval_mins} min`) : "";
  const next = s.paused ? "paused" : s.next_sync_at ? `next ${relTime(s.next_sync_at, now)}` : "";
  if (s.live_updates) {
    const seen = s.webhook_seen_at ? `last change event ${relTime(s.webhook_seen_at, now)}` : "no change event yet";
    return `On: changes arrive within a minute (${seen}). Full check every ${every || "6 h"}${next ? `, ${next}` : ""}.`;
  }
  return `Off: ${label} doesn't send change events here, so it's checked every ${every || "hour"}${next ? `, ${next}` : ""}.`;
}

/** What was picked, in one line. */
export function pickedWords(s: Pick<PageSource, "selection" | "kind" | "options">): string {
  const sel = s.selection ?? [];
  if (s.kind === "s3" && typeof s.options?.bucket === "string") return `s3://${s.options.bucket}`;
  if (s.kind === "archive" && typeof s.options?.file_name === "string") return String(s.options.file_name);
  if (!sel.length) return "Nothing picked yet";
  const names = sel.slice(0, 2).map((x) => x.title || x.id);
  const more = sel.length > 2 ? ` +${sel.length - 2}` : "";
  const kids = sel.some((x) => x.include_children) ? " · includes new pages inside" : "";
  return `${names.join(", ")}${more}${kids}`;
}

/** Where a source points: the Confluence site, the repository, the bucket. */
export function placeWords(s: Pick<PageSource, "kind" | "options" | "account">): string {
  const o = s.options ?? {};
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  switch (s.kind) {
    case "confluence":
      return str("site").replace(/^https?:\/\//, "") || s.account || "";
    case "github":
      return [str("repo"), str("branch")].filter(Boolean).join("@");
    case "s3":
      return str("bucket");
    case "sanity":
      return [str("project_id"), str("dataset")].filter(Boolean).join(" · ");
    default:
      return s.account ?? "";
  }
}

/** What each item state is called (always words, never a color alone). */
export const STATE_WORDS: Record<ItemState, string> = {
  searchable: "Searchable",
  working: "Reading",
  failed: "Couldn't read",
  skipped: "Skipped",
  cut_short: "Cut short",
};

export const SKIP_WORDS: Record<string, string> = {
  empty: "It has no text to read",
  unsupported: "This kind of file isn't read",
  too_large: "It's too large to read",
};

export function isKind(k: string): k is SourceKind {
  return k in KIND_LABEL;
}
