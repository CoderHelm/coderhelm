// The one OAuth callback page (/settings/integrations/mcp-callback/) serves
// every sign-in that returns to the dashboard: MCP servers, catalog apps,
// knowledge sources, and a self-hosted install's sign-ins through
// Coderhelm's app. Each provider app has one registered redirect, so the
// kind of sign-in travels in the `state` ("<tag>.<random>") and comes back
// from the API with where to go next. These helpers decide the words and
// the destination; the page only shows them.

import { ApiError } from "./api";
import { returnAddress, type FlowReturn } from "./knowledge";

/** The kinds of sign-in (the tags the API puts in a `state`). */
export type OAuthFlow = "mcp" | "app" | "ks" | "hyb";

const FLOWS: OAuthFlow[] = ["mcp", "app", "ks", "hyb"];

/** The kind a `state` says it is; null for one from before kinds (a bare random value). */
export function flowOfState(state: string): OAuthFlow | null {
  const tag = state.split(".", 1)[0];
  return state.includes(".") && (FLOWS as string[]).includes(tag) ? (tag as OAuthFlow) : null;
}

/** Everything the provider put on the callback address. */
export interface CallbackParams {
  state: string;
  code?: string;
  error?: string;
  error_description?: string;
  iss?: string;
}

export function readCallback(search: string): CallbackParams {
  const q = new URLSearchParams(search);
  const v = (k: string) => {
    const s = (q.get(k) ?? "").trim();
    return s ? s : undefined;
  };
  return { state: q.get("state") ?? "", code: v("code"), error: v("error"), error_description: v("error_description"), iss: v("iss") };
}

/** The flow of a finished (or failed) sign-in: the API's word, else the server's catalog id, else the `state`. */
export function resolveFlow(apiFlow: unknown, catalogId: string | undefined, state: string): OAuthFlow {
  if (typeof apiFlow === "string" && (FLOWS as string[]).includes(apiFlow)) return apiFlow as OAuthFlow;
  if (catalogId?.startsWith("source:")) return "ks";
  return flowOfState(state) ?? "mcp";
}

/** A path on this dashboard (never another site); anything else is null. */
export function safePath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const s = p.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\u0000-\u001f\\]/.test(s)) return null;
  return s;
}

/** Where a finished sign-in goes. */
export function destination(
  flow: OAuthFlow,
  server: { id: string; catalog_id?: string },
  returnTo: unknown,
  remembered: FlowReturn | null,
): string {
  if (flow === "ks") {
    const kind = (server.catalog_id ?? "").replace(/^source:/, "");
    const back = safePath(returnTo);
    if (back && back.startsWith("/knowledge")) {
      return returnAddress({ path: back, kind: (remembered?.kind ?? kind) as FlowReturn["kind"], kbId: remembered?.kbId }, kind);
    }
    return returnAddress(remembered, kind);
  }
  const back = safePath(returnTo);
  if (back) return back;
  const row = server.catalog_id ? server.catalog_id : `mcp:${server.id}`;
  return `/settings/integrations/#integration-${row}`;
}

/** What a failed sign-in page shows: a title, the words, and the way back. */
export interface FailureView {
  title: string;
  message: string;
  code: string;
  back: { href: string; label: string };
}

const KNOWLEDGE_LABELS: Record<string, string> = {
  notion: "Notion",
  confluence: "Confluence",
  google_drive: "Google Drive",
  sanity: "Sanity",
};

function nameFor(serverName: string, catalogId: string): string {
  const n = serverName.replace(/ \(knowledge\)$/, "").trim();
  if (n) return n;
  return KNOWLEDGE_LABELS[catalogId.replace(/^source:/, "")] ?? "";
}

/**
 * The words a provider's own `error` gets when the API couldn't be asked
 * (no `state` came back): its code and its description, never a guess.
 */
export function providerWords(error: string, description?: string): string {
  const d = description ? ` It said: "${description.slice(0, 300)}".` : "";
  if (error === "access_denied") {
    return `The sign-in page answered access_denied: access wasn't granted.${d || " Either Cancel was chosen, or the provider doesn't let this account use the app."}`;
  }
  return `The sign-in page returned an error (${error.slice(0, 80)}).${d}`;
}

/** The failure page for an error from the API (or the provider, when no `state` came back). */
export function failureView(e: unknown, state: string, fallback: string): FailureView {
  const body = (e instanceof ApiError ? e.body : undefined) ?? {};
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const catalogId = str("catalog_id");
  const flow = resolveFlow(body.flow, catalogId, state);
  const message = (e instanceof Error && e.message) || fallback;
  const name = nameFor(str("server_name"), catalogId);
  const ret = safePath(body.return_to);
  if (flow === "ks") {
    return {
      title: name ? `${name} isn't connected` : "The source isn't connected",
      message: `${message} Go back to Knowledge and connect it again.`,
      code: str("code"),
      back: { href: ret && ret.startsWith("/knowledge") ? ret : "/knowledge/", label: "Back to Knowledge" },
    };
  }
  return {
    title: name ? `${name} isn't connected` : "The server isn't connected",
    message: `${message} Go back to Integrations and connect it again.`,
    code: str("code"),
    back: { href: ret ?? "/settings/integrations/#mcp-servers", label: "Back to Integrations" },
  };
}
