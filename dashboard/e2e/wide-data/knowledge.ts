import type { Handler } from "./index";
import { EMAIL, FILE, iso, LONG_URL, SENTENCE, TITLE, TOKEN } from "./long";

// Knowledge: a knowledge base with a source in every state (up to date,
// bringing pages in, needing a reconnect, paused), long names and paths,
// synced pages with links to their app, and uploaded files.

const KB_ID = "kb_wide";

const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  extensions: ["pdf", "docx", "md", "markdown", "txt", "text", "csv", "xlsx", "html", "htm"],
  agents: [
    { key: "planner", label: "Planner" },
    { key: "coder", label: "Coder" },
    { key: "reviewer", label: "Reviewer" },
    { key: "plan_chat", label: "Plan chat" },
  ],
  read_roles: ["viewer", "member", "admin"],
};

const sel = (title: string) => ({ id: `page:${title.length}`, title, kind: "page", path: [TITLE], include_children: true });

const source = (over: Record<string, unknown>) => ({
  id: "src_ok",
  kind: "notion",
  label: "Notion",
  name: `${TITLE} wiki`,
  selection: [sel(TITLE)],
  options: {},
  paused: false,
  status: "ready",
  error: null,
  progress: null,
  items: 1284,
  failed_items: 3,
  truncated: true,
  last_sync_at: iso(4),
  last_success_at: iso(4),
  next_sync_at: iso(-56),
  live_updates: true,
  created_at: iso(9000),
  created_by: EMAIL,
  ...over,
});

const SOURCES = [
  source({}),
  source({ id: "src_sync", kind: "confluence", label: "Confluence", name: TOKEN, status: "syncing", progress: { phase: "fetching", done: 12, total: 40 }, items: 12 }),
  source({
    id: "src_err",
    kind: "google_drive",
    label: "Google Drive",
    status: "error",
    error: { message: `Google Drive didn't accept the saved sign-in. ${TOKEN}`, fix: `Reconnect Google Drive to sign in again. ${SENTENCE}`, action: "reconnect", at: iso(30) },
  }),
  source({ id: "src_paused", kind: "sanity", label: "Sanity", paused: true, name: `${TITLE} documents` }),
];

const BASE = {
  id: KB_ID,
  name: `${TITLE} handbook`,
  description: `${SENTENCE} ${TOKEN}`,
  read_role: "member",
  attach_team: false,
  agents: ["planner", "reviewer", "plan_chat"],
  authoritative: true,
  created_at: iso(9000),
  updated_at: iso(60),
  files: 6,
  ready: 4,
  processing: 1,
  failed: 1,
  uploads: 2,
  synced: 4,
  kinds: ["upload", "notion", "confluence", "google_drive", "sanity"],
  sources: SOURCES.map((s) => ({ id: s.id, kind: s.kind, name: s.name, status: s.status, paused: s.paused, items: s.items, last_success_at: s.last_success_at })),
};

const item = (over: Record<string, unknown>) => ({
  id: "i_1",
  name: `${TITLE} ${TOKEN}`,
  kind: "notion",
  size: 4_200,
  status: "ready",
  error: "",
  version: 2,
  searchable: true,
  as_of: "2026-10-01",
  uploaded_at: iso(120),
  uploaded_by: "Notion sync",
  chunks: 12,
  truncated: false,
  source_id: "src_ok",
  url: LONG_URL,
  path: `${TITLE} / ${TOKEN}`,
  ...over,
});

const ITEMS = [
  item({}),
  item({ id: "i_2", source_id: "src_sync", kind: "confluence", name: TOKEN }),
  item({ id: "i_3", source_id: "src_err", kind: "google_drive", status: "failed", error: `This page has no text to index. ${TOKEN}` }),
  item({ id: "i_4", source_id: "src_paused", kind: "sanity", url: null }),
  item({ id: "i_5", source_id: undefined, url: null, path: undefined, kind: "pdf", name: `${FILE.replace(/\//g, "_")}.pdf`, uploaded_by: EMAIL, size: 4_200_000 }),
  item({ id: "i_6", source_id: undefined, url: null, path: undefined, kind: "docx", status: "processing", name: `${TOKEN}.docx` }),
];

const CONNECTORS = [
  { kind: "notion", label: "Notion", blurb: "Pages and databases, with the pages under them", connected: true, via: "oauth", can_sign_in: true, reconnect_reason: "", connected_by: EMAIL, hint: "", live_updates: true, picker: "tree" },
  { kind: "confluence", label: "Confluence", blurb: "Spaces or page trees", connected: true, via: "saved_key", can_sign_in: false, reconnect_reason: "", connected_by: "", hint: "", live_updates: false, picker: "tree" },
  { kind: "sanity", label: "Sanity", blurb: "Documents of the types you pick", connected: false, via: "", can_sign_in: false, reconnect_reason: "", connected_by: "", hint: `Add a Sanity API token (Viewer is enough) and the project id. ${TOKEN}`, live_updates: true, picker: "tree" },
  { kind: "google_drive", label: "Google Drive", blurb: "Folders, Docs, Sheets, Slides and PDFs", connected: false, via: "", can_sign_in: true, reconnect_reason: SENTENCE, connected_by: EMAIL, hint: "", live_updates: false, picker: "tree" },
  { kind: "github", label: "GitHub", blurb: "Docs folders and Markdown in your repositories", connected: true, via: "github_app", can_sign_in: false, reconnect_reason: "", connected_by: "", hint: "", live_updates: true, picker: "tree" },
  { kind: "web", label: "Website", blurb: "Public pages or a whole sitemap", connected: true, via: "public", can_sign_in: false, reconnect_reason: "", connected_by: "", hint: "", live_updates: false, picker: "address" },
];

export const knowledgeData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/knowledge") return { bases: [BASE, { ...BASE, id: "kb_wide_2", name: TOKEN, sources: [], kinds: ["upload"], synced: 0, uploads: 1, description: "" }], can_manage: true, limits: LIMITS };
  if (path === "/api/knowledge/connectors") return { connectors: CONNECTORS, visibility_note: `Everyone who can read this knowledge base can read what you add. ${SENTENCE}` };
  if (path.startsWith("/api/knowledge/connectors/")) {
    return {
      nodes: [
        { id: "page:1", title: TITLE, kind: "page", has_children: true, selectable: true, url: LONG_URL, updated_at: iso(5), detail: TOKEN },
        { id: "database:2", title: TOKEN, kind: "database", has_children: true, selectable: true, url: "", updated_at: iso(5), detail: "Database" },
      ],
      options: {},
    };
  }
  if (path.startsWith("/api/knowledge/")) {
    return { base: BASE, files: ITEMS, sources: SOURCES, can_manage: true, limits: LIMITS, visibility_note: SENTENCE };
  }
  return undefined;
};
