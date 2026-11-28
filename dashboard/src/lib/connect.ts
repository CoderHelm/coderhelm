// The "Connect your AI tools" page (app/connect): the setup each AI tool
// needs to reach the team's MCP address, and what each scope lets a tool
// read. The setup steps follow each vendor's own docs; the links are kept
// next to each tool below, so a change on their side is one place to fix.

import { apiBase } from "./runtime-config";

/** The name a tool lists the server under. */
export const SERVER_NAME = "coderhelm";

// ── Scopes ──────────────────────────────────────────────────────────

export interface ScopeInfo {
  key: string;
  /** What a tool can reach with it, as a short name. */
  title: string;
  /** One line on what it covers. */
  covers: string;
  /** Questions people can ask with it. */
  examples: string[];
  /** It lets a tool change things, not just read. */
  acts?: boolean;
}

/**
 * The scopes this page knows how to describe, in the order it lists them.
 * The server decides which exist: anything it doesn't publish shows as not
 * offered, and a scope it publishes that isn't here shows with its own label.
 */
export const KNOWN_SCOPES: ScopeInfo[] = [
  {
    key: "knowledge:read",
    title: "Team knowledge",
    covers: "The knowledge bases you can read in Chat: uploaded files and synced pages from Notion, Confluence, Google Drive and the rest.",
    examples: ["What does our runbook say about rolling back a deploy?", "Where is the onboarding guide for new engineers?"],
  },
  {
    key: "code:read",
    title: "Code and docs",
    covers: "The repositories your team turned on in CoderHelm: files, search, and who calls what.",
    examples: ["How does the refunds flow work, and which files should I read first?", "Who calls the function that sends invoice emails?"],
  },
  {
    key: "work:read",
    title: "Work",
    covers: "Tickets, pull requests and runs.",
    examples: ["What's the status of WEB-42, and is there a pull request for it?", "Which pull requests merged this week touched billing?"],
  },
  {
    key: "security:read",
    title: "Security",
    covers: "Security and infrastructure findings, and the fix for each.",
    examples: ["Which open security findings affect the payments service?", "Is anything we deploy affected by the newest OpenSSL advisory?"],
  },
  {
    key: "runs:read",
    title: "Runs and reviews",
    covers: "CoderHelm's runs and code reviews: their status, findings and verdicts.",
    examples: ["Which of my runs are waiting on me?", "What did the reviewer find on my last pull request?"],
  },
  {
    key: "runs:write",
    title: "Start runs and reviews",
    covers: "Start and retry runs, and ask for reviews. Only if your role can, and only if you tick it when you connect.",
    examples: ["Start a run for WEB-57.", "Ask CoderHelm to review pull request 318."],
    acts: true,
  },
];

export interface ScopeRow extends ScopeInfo {
  /** The server offers it to connected tools. */
  offered: boolean;
  /** One of your connected tools holds it. */
  yours: boolean;
}

/**
 * Every scope to list: the known ones in order, then any other the server
 * publishes. `published` is what the server offers; `labels` names scopes the
 * page doesn't know; `held` is what your connected tools hold.
 */
export function scopeRows(published: string[], labels: Record<string, string>, held: Set<string>): ScopeRow[] {
  const offered = new Set(published);
  const known = new Set(KNOWN_SCOPES.map((s) => s.key));
  const rows: ScopeRow[] = KNOWN_SCOPES.map((s) => ({ ...s, offered: offered.has(s.key), yours: held.has(s.key) }));
  for (const key of published) {
    if (known.has(key)) continue;
    rows.push({ key, title: labels[key] || key, covers: labels[key] || "", examples: [], offered: true, yours: held.has(key) });
  }
  return rows;
}

/** The short name of a scope, for a chip on a connection. */
export function scopeTitle(key: string, labels: Record<string, string>): string {
  return KNOWN_SCOPES.find((s) => s.key === key)?.title ?? (labels[key] || key);
}

/**
 * The scopes the MCP server publishes in its protected resource metadata
 * (RFC 9728), the document every AI tool reads before it signs in. `null`
 * when it can't be read; the page then uses the list the dashboard API gives.
 */
export async function publishedScopes(): Promise<string[] | null> {
  try {
    const res = await fetch(`${apiBase()}/.well-known/oauth-protected-resource/mcp`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { scopes_supported?: unknown };
    const list = body.scopes_supported;
    if (!Array.isArray(list)) return null;
    return list.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 64);
  } catch {
    return null;
  }
}

// ── Tools ───────────────────────────────────────────────────────────

export type ToolKey = "claude" | "claude-code" | "chatgpt" | "cursor" | "vscode" | "windsurf" | "other";

export const TOOLS: { key: ToolKey; label: string }[] = [
  { key: "claude", label: "Claude" },
  { key: "claude-code", label: "Claude Code" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "cursor", label: "Cursor" },
  { key: "vscode", label: "VS Code" },
  { key: "windsurf", label: "Windsurf" },
  { key: "other", label: "Other apps" },
];

/** Where each tool documents adding a remote MCP server. */
export const TOOL_DOCS: Record<Exclude<ToolKey, "other">, string> = {
  claude: "https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp",
  "claude-code": "https://code.claude.com/docs/en/mcp",
  chatgpt: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
  cursor: "https://cursor.com/docs/context/mcp/install-links",
  vscode: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
  windsurf: "https://docs.devin.ai/windsurf/plugins/cascade/mcp",
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Base64 of a UTF-8 string, in the browser and in Node. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Claude Code: one command, then /mcp to sign in. */
export function claudeCodeCommand(url: string): string {
  return `claude mcp add --transport http ${SERVER_NAME} ${url}`;
}

/** Claude Code: a `.mcp.json` to commit, so everyone on a repository has it. */
export function claudeCodeProjectFile(url: string): string {
  return pretty({ mcpServers: { [SERVER_NAME]: { type: "http", url } } });
}

/**
 * Cursor's install link: `cursor://anysphere.cursor-deeplink/mcp/install`
 * with the server's name and its `mcp.json` entry, JSON then base64.
 */
export function cursorInstallLink(url: string): string {
  const config = base64(JSON.stringify({ url }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(SERVER_NAME)}&config=${encodeURIComponent(config)}`;
}

/** Cursor: `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a repository. */
export function cursorFile(url: string): string {
  return pretty({ mcpServers: { [SERVER_NAME]: { url } } });
}

/** The server as VS Code's install link and `code --add-mcp` take it: a name plus its entry. */
function vscodeEntry(url: string) {
  return { name: SERVER_NAME, type: "http", url };
}

/**
 * VS Code's install link, `vscode:mcp/install?<url-encoded JSON>`. It opens
 * the server's details in VS Code to review before installing.
 */
export function vscodeInstallLink(url: string): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeEntry(url)))}`;
}

/** VS Code: the same, from a terminal. */
export function vscodeCommand(url: string): string {
  return `code --add-mcp '${JSON.stringify(vscodeEntry(url))}'`;
}

/** VS Code and GitHub Copilot: `~/.copilot/mcp-config.json`, or `.mcp.json` in a workspace. */
export function vscodeFile(url: string): string {
  return pretty({ mcpServers: { [SERVER_NAME]: { type: "http", url } } });
}

/** Windsurf (Cascade): `mcp_config.json`, where a remote server takes `serverUrl`. */
export function windsurfFile(url: string): string {
  return pretty({ mcpServers: { [SERVER_NAME]: { serverUrl: url } } });
}
