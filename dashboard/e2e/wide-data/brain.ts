import type { Handler } from "./index";
import { EMAIL, FILE, iso, LONG_URL, MARKDOWN, REPO, REPO_2, SENTENCE, TITLE, TOKEN } from "./long";

// Chat and knowledge bases: threads, an answer with citations,
// sources to pick, and a knowledge base whose files are in every state.

export const KB_ID = "kb_wide";
const THREAD_ID = "th_wide";

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
  files: 4,
  ready: 1,
  processing: 2,
  failed: 1,
};

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

const file = (over: Record<string, unknown>) => ({
  id: "f_wide_1",
  name: `${FILE.replace(/\//g, "_")}.pdf`,
  kind: "pdf",
  size: 4_200_000,
  status: "ready",
  error: "",
  version: 3,
  searchable: true,
  as_of: "2026-05-01",
  uploaded_at: iso(120),
  uploaded_by: EMAIL,
  chunks: 412,
  truncated: true,
  ...over,
});

const CITATIONS = [
  {
    id: "S1",
    kind: "knowledge",
    title: `${FILE.replace(/\//g, "_")}.pdf`,
    loc: `Page 12 > ${TITLE}`,
    as_of: "2026-05-01",
    passage: `${SENTENCE} ${TOKEN} ${LONG_URL}`,
    href: `/brain/knowledge/base?id=${KB_ID}`,
    authoritative: true,
    base: BASE.name,
  },
  { id: "S2", kind: "code", title: FILE, loc: REPO, as_of: "2026-10-24 12:00 UTC", passage: TOKEN, authoritative: false },
];

export const brainData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/brain/threads") {
    return {
      threads: [
        { id: THREAD_ID, title: TITLE, shared: true, mine: true, owner_email: EMAIL, created_at: iso(300), updated_at: iso(5), messages: 2 },
        { id: "th_wide_2", title: TOKEN, shared: true, mine: false, owner_email: EMAIL, created_at: iso(9000), updated_at: iso(9000), messages: 4 },
      ],
      can_ask: true,
    };
  }
  if (path.startsWith("/api/brain/threads/")) {
    return {
      thread: { id: THREAD_ID, title: TITLE, shared: true, mine: true, owner_email: EMAIL, created_at: iso(300), updated_at: iso(5), messages: 2 },
      messages: [
        { seq: 0, role: "user", content: `${TITLE} ${TOKEN}`, citations: [], grounded: true, attachments: [`${TOKEN}.pdf`], used: [], at: iso(6) },
        { seq: 1, role: "assistant", content: `${MARKDOWN}\n\nIt is sixteen weeks [S1] and the code agrees [S2].`, citations: CITATIONS, grounded: true, attachments: [], used: [{ kind: "knowledge", label: `Searched knowledge for "${TOKEN}"` }], at: iso(5), feedback: "up" },
      ],
      can_ask: true,
    };
  }
  if (path === "/api/brain/sources") {
    return {
      kinds: [
        { key: "knowledge", label: "Files and pages", about: "Documents and pages your team added to Knowledge" },
        { key: "connections", label: "Connected apps", about: "Apps such as Notion, Linear or Sentry, read as you ask" },
        { key: "code", label: "Code", about: "Your team's code and how it fits together" },
        { key: "memories", label: "Past work", about: "What Coderhelm learned from earlier work" },
        { key: "data_sources", label: "Logs and data", about: "Logs, databases and metrics you connected, only read" },
        { key: "skills", label: "Team know-how", about: "Your team's written skills and helpers" },
        { key: "plugins", label: "Plugins", about: "Installed plugins answer from their own skills" },
      ],
      knowledge: [{ id: KB_ID, name: BASE.name, ready: 1, authoritative: true }],
      connections: [{ id: "notion" }],
      repos: [REPO, REPO_2],
      plugins: [{ id: "plugin_wide", name: `${TITLE} ${TOKEN}`, description: `${SENTENCE} ${TOKEN}` }],
      can_ask: true,
    };
  }
  if (path === "/api/brain/starters") {
    return {
      starters: [
        { question: `What should I know from ${BASE.name}?`, why: `From ${BASE.name}`, sources: { knowledge: [KB_ID], connections: false, code: false, memories: false, data_sources: false, skills: false } },
        { question: `What's the latest on “${TITLE}”?`, why: `From recent work in ${REPO}`, sources: { knowledge: [], connections: false, code: true, memories: false, data_sources: false, skills: false, repo: REPO } },
        { question: `What should a new teammate know about ${TOKEN}?`, why: `From past work in ${REPO_2}`, sources: { knowledge: [], connections: false, code: false, memories: true, data_sources: false, skills: false, repo: REPO_2 } },
      ],
    };
  }
  if (path === "/api/knowledge") return { bases: [BASE], can_manage: true, limits: LIMITS };
  if (path.startsWith("/api/knowledge/")) {
    return {
      base: BASE,
      files: [
        file({}),
        file({ id: "f_wide_2", status: "processing", chunks: 0, truncated: false, name: `${TOKEN}.docx` }),
        file({ id: "f_wide_3", status: "uploading", chunks: 0, truncated: false }),
        file({ id: "f_wide_4", status: "failed", error: `No text found in this PDF. ${SENTENCE}`, searchable: true }),
      ],
      can_manage: true,
      limits: LIMITS,
    };
  }
  return undefined;
};
