"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type McpCall, type McpDetected, type McpServer, type McpStatus, type McpTool } from "@/lib/api";
import { errorMessage, timeAgo } from "@/lib/data-sources";
import { Callout } from "./callout";
import { Code } from "./settings/code";
import { CopyButton } from "./copy-button";
import { Disclosure } from "./disclosure";
import { Field, SecretInput } from "./field";
import { Modal, ModalFooter } from "./modal";
import { Segmented } from "./segmented";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { useCan } from "@/hooks/use-can";
import { inputClass, linkButton, monoInputClass, primaryButton, secondaryButton, smallSecondaryButton } from "./ui";

// Remote MCP servers: added by address, signed in to with OAuth, a key or
// nothing, their tools allowed one by one. Used on Settings → Integrations,
// for servers added by address and for catalog servers connected through
// their vendor's own remote server.

const STATUS: Record<McpStatus, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "text-emerald-300" },
  needs_reconnect: { label: "Needs reconnect", tone: "text-amber-300" },
  failed: { label: "Not working", tone: "text-red-300" },
  not_connected: { label: "Not connected", tone: "text-zinc-400" },
};

const ACCESS: Record<McpTool["access"], { label: string; cls: string; hint: string }> = {
  read: { label: "Reads", cls: "border-emerald-500/30 text-emerald-300", hint: "The server says this tool only reads." },
  write: { label: "Writes", cls: "border-amber-500/30 text-amber-300", hint: "The server says this tool can change data." },
  unknown: { label: "Not said", cls: "border-zinc-700 text-zinc-400", hint: "The server doesn't say whether this tool changes data." },
};

/** Sends the browser to the server's sign-in page. */
export async function startMcpSignIn(id: string) {
  const r = await api.connectMcpServer(id);
  window.location.assign(r.authorize_url);
}

/** Connects a catalog server through its vendor's remote server (setting it up first if needed). */
export async function connectCatalogServer(catalogId: string) {
  let id = catalogId;
  try {
    id = (await api.addMcpServer({ catalog_id: catalogId })).server.id;
  } catch (e) {
    // Already set up (an earlier sign-in that wasn't finished): connect it.
    const list = await api.listMcpServers().catch(() => null);
    const found = list?.servers.find((s) => s.catalog_id === catalogId);
    if (!found) throw e;
    id = found.id;
  }
  await startMcpSignIn(id);
}

let meEmail: Promise<string> | null = null;
function useMyEmail(): string {
  const [email, setEmail] = useState("");
  useEffect(() => {
    meEmail ??= api.me().then((u) => (u.email || "").toLowerCase()).catch(() => "");
    let live = true;
    meEmail.then((e) => live && setEmail(e));
    return () => {
      live = false;
    };
  }, []);
  return email;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The connection this person sees: their own on a personal server, the team's otherwise. */
function viewerStatus(s: McpServer): { status: McpStatus; reason: string } {
  if (s.auth === "oauth" && s.sharing === "personal") {
    return s.my_connection
      ? { status: s.my_connection.status, reason: s.my_connection.status_reason }
      : { status: "not_connected", reason: "Each person connects their own account. You haven't yet." };
  }
  return { status: s.status, reason: s.status_reason };
}

// ── Adding a server ──────────────────────────────────────────────────

const PRIVATE_HINT = "The MCP endpoint over HTTPS, often ending in /mcp. Addresses inside a private network are refused.";

export function AddMcpServerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (server: McpServer) => void;
}) {
  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState<McpDetected | null>(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState<"shared" | "personal">("shared");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) return;
    setUrl("");
    setDetected(null);
    setName("");
    setSharing("shared");
    setHeaderName("Authorization");
    setHeaderValue("");
    setClientId("");
    setClientSecret("");
    setError("");
  }, [open]);

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.detectMcpServer(url.trim());
      setDetected(r.detected);
      setRedirectUri(r.redirect_uri);
      setName((n) => n || hostOf(r.url));
    } catch (e) {
      setError(errorMessage(e, "Coderhelm couldn't reach that address."));
    } finally {
      setBusy(false);
    }
  };

  const manual = detected?.auth === "oauth" && detected.registration === "manual";
  const ready =
    !!detected &&
    name.trim() !== "" &&
    (detected.auth !== "header" || headerValue.trim() !== "") &&
    (!manual || clientId.trim() !== "");

  const add = async () => {
    if (!detected) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.addMcpServer({
        url: url.trim(),
        name: name.trim(),
        sharing: detected.auth === "oauth" ? sharing : undefined,
        header_name: detected.auth === "header" ? headerName.trim() : undefined,
        header_value: detected.auth === "header" ? headerValue.trim() : undefined,
        client_id: manual ? clientId.trim() : undefined,
        client_secret: manual && clientSecret.trim() ? clientSecret.trim() : undefined,
      });
      if (r.server.auth === "oauth") {
        // Straight on to the sign-in page; the callback brings the person back.
        await startMcpSignIn(r.server.id);
        return;
      }
      onAdded(r.server);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Couldn't add the server."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      testId="add-mcp-server"
      title="Add an MCP server"
      description="Coderhelm asks the server how it signs in. Agents get none of its tools until you allow them."
    >
      <form
        id="add-mcp-server-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!detected) check();
          else if (ready) add();
        }}
      >
        <Field id="mcp-url" label="Server address" helper={detected ? undefined : PRIVATE_HINT}>
          {(props) => (
            <input
              {...props}
              className={monoInputClass}
              placeholder="https://mcp.example.com/mcp"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setDetected(null);
              }}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              readOnly={!!detected}
            />
          )}
        </Field>

        {detected && (
          <div data-testid="mcp-detected" data-auth={detected.auth} className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-sm text-zinc-300">
              {detected.auth === "oauth" && (
                <>
                  <span className="font-medium text-zinc-100">Signs in with OAuth</span> through {hostOf(detected.issuer ?? "")}. You approve access on its page, and
                  Coderhelm keeps the sign-in sealed, renews it and never shows it to a model.
                </>
              )}
              {detected.auth === "header" && (
                <>
                  <span className="font-medium text-zinc-100">Uses a key</span> sent in a request header. It is sealed when saved and never shown again.
                </>
              )}
              {detected.auth === "none" && (
                <>
                  <span className="font-medium text-zinc-100">Needs no sign-in.</span> It lists {detected.tool_count ?? 0} tool
                  {detected.tool_count === 1 ? "" : "s"}.
                </>
              )}
            </p>
            <Field id="mcp-name" label="Name">
              {(props) => <input {...props} className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
            </Field>
            {detected.auth === "oauth" && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-zinc-100">Who signs in</span>
                <Segmented
                  label="Who signs in"
                  value={sharing}
                  onChange={setSharing}
                  options={[
                    { value: "shared", label: "One account for the team" },
                    { value: "personal", label: "Each person" },
                  ]}
                />
                <p className="text-sm text-zinc-400">
                  {sharing === "shared"
                    ? "An admin signs in once and every agent uses that account."
                    : "Each person connects their own account. Agents use it for that person's work; reviews and scheduled runs don't get it."}
                </p>
              </div>
            )}
            {manual && (
              <div className="flex flex-col gap-3" data-testid="mcp-manual-client">
                <p className="text-sm text-amber-300">
                  This sign-in server can&apos;t register Coderhelm on its own. Register an OAuth app with the vendor using this redirect address, then paste its client id.
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Code className="min-w-0 text-xs">{redirectUri}</Code>
                  <CopyButton text={redirectUri} label="Copy address" />
                </div>
                <Field id="mcp-client-id" label="Client id">
                  {(props) => <input {...props} className={monoInputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />}
                </Field>
                <Field id="mcp-client-secret" label="Client secret (if the app has one)">
                  {(props) => <SecretInput {...props} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />}
                </Field>
              </div>
            )}
            {detected.auth === "header" && (
              <>
                <Field id="mcp-header-name" label="Header" helper="Usually Authorization (with a value like Bearer abc123) or X-API-Key.">
                  {(props) => <input {...props} className={monoInputClass} value={headerName} onChange={(e) => setHeaderName(e.target.value)} autoComplete="off" spellCheck={false} />}
                </Field>
                <Field id="mcp-header-value" label="Value">
                  {(props) => <SecretInput {...props} value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} />}
                </Field>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400" data-testid="mcp-add-error">
            {error}
          </p>
        )}
        {detected && (
          <p>
            <button type="button" onClick={() => setDetected(null)} className={linkButton}>
              Use another address
            </button>
          </p>
        )}
        <ModalFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
            Cancel
          </button>
          {!detected ? (
            <button type="submit" form="add-mcp-server-form" disabled={busy || !url.trim()} className={primaryButton}>
              {busy ? "Checking…" : "Check address"}
            </button>
          ) : (
            <button type="submit" form="add-mcp-server-form" disabled={busy || !ready} className={primaryButton}>
              {busy ? (detected.auth === "header" ? "Checking the key…" : "Adding…") : detected.auth === "oauth" ? "Add and connect" : "Add server"}
            </button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── One server ──────────────────────────────────────────────────────

export function McpServerPanel({
  server,
  canEdit,
  onChanged,
  onRemoved,
}: {
  server: McpServer;
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
  onRemoved?: () => void;
}) {
  const [s, setS] = useState(server);
  useEffect(() => setS(server), [server]);
  const me = useMyEmail();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState("");
  const view = viewerStatus(s);
  const personal = s.auth === "oauth" && s.sharing === "personal";
  const { can } = useCan();
  // A shared server is connected by whoever may change integrations; a
  // personal one by anyone who may connect their own account.
  const mayConnect = s.auth === "oauth" && (personal ? can("mcp_connect") : canEdit);
  const st = STATUS[view.status];

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e, "That didn't work."), "error");
    } finally {
      setBusy("");
    }
  };

  const connect = () => act("connect", () => startMcpSignIn(s.id));
  const disconnect = () =>
    act("disconnect", async () => {
      const ok = await confirm({
        title: personal ? `Disconnect your ${s.name} account?` : `Disconnect ${s.name}?`,
        message: personal
          ? "Coderhelm revokes your sign-in with the server and forgets it. Agents stop using your account."
          : "Coderhelm revokes the team's sign-in with the server and forgets it. Agents stop using it until someone connects again.",
        confirmLabel: "Disconnect",
        destructive: true,
      });
      if (!ok) return;
      const r = await api.disconnectMcpServer(s.id);
      setS(r.server);
      toast(r.revoked ? "Disconnected and revoked" : "Disconnected");
      await onChanged();
    });
  const remove = () =>
    act("remove", async () => {
      const ok = await confirm({
        title: `Remove ${s.name}?`,
        message: "Every connection to it is revoked and forgotten, and agents stop using its tools right away.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
      await api.removeMcpServer(s.id);
      toast(`${s.name} removed`);
      onRemoved?.();
      await onChanged();
    });
  const check = () =>
    act("check", async () => {
      const r = await api.checkMcpServer(s.id);
      setS(r.server);
      toast(r.error ? r.error : `${r.server.tools.length} tools listed`, r.error ? "error" : "success");
      await onChanged();
    });

  return (
    <div className="mt-3 flex flex-col gap-4" data-testid={`mcp-server-${s.id}`} data-status={view.status}>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-400">
          <Code className="text-xs">{s.url}</Code>
        </p>
        <p className="text-sm" data-testid="mcp-status">
          <span className={st.tone}>{st.label}</span>
          <span className="text-zinc-500">
            {" · "}
            {s.auth === "oauth" ? (personal ? "OAuth, each person signs in" : "OAuth, one account for the team") : s.auth === "header" ? `Key in ${s.header_name}` : "No sign-in"}
          </span>
        </p>
        {view.reason && (
          <p className={`text-sm ${view.status === "needs_reconnect" ? "text-amber-300" : view.status === "failed" ? "text-red-300" : "text-zinc-400"}`} data-testid="mcp-status-reason">
            {view.reason}
          </p>
        )}
      </div>

      {s.needs_client && !s.has_client && canEdit && <ClientForm server={s} onSaved={setS} />}

      {(mayConnect || (s.auth === "header" && canEdit) || canEdit) && (
        <div className="flex flex-wrap items-center gap-3">
          {mayConnect && view.status !== "connected" && (
            <button type="button" onClick={connect} disabled={!!busy || (s.needs_client && !s.has_client)} className={primaryButton}>
              {busy === "connect" ? "Opening sign-in…" : view.status === "needs_reconnect" ? "Reconnect" : personal ? "Connect your account" : "Connect"}
            </button>
          )}
          {mayConnect && view.status === "connected" && (
            <button type="button" onClick={disconnect} disabled={!!busy} className={secondaryButton}>
              {personal ? "Disconnect your account" : "Disconnect"}
            </button>
          )}
          {canEdit && (view.status === "connected" || s.auth !== "oauth") && (
            <button type="button" onClick={check} disabled={!!busy} className={secondaryButton}>
              {busy === "check" ? "Checking…" : "Check again"}
            </button>
          )}
        </div>
      )}

      {s.auth === "header" && canEdit && <KeyForm server={s} onSaved={setS} />}

      <ToolPicker server={s} canEdit={canEdit} me={me} onSaved={(n) => { setS(n); void onChanged(); }} />

      {canEdit && <PromptForm server={s} onSaved={setS} />}
      {canEdit && <Activity server={s} />}

      {canEdit && (
        <p>
          <button type="button" onClick={remove} disabled={!!busy} className={linkButton}>
            {s.catalog_id ? `Stop using ${s.name}'s sign-in` : `Remove ${s.name}`}
          </button>
        </p>
      )}
    </div>
  );
}

function ClientForm({ server, onSaved }: { server: McpServer; onSaved: (s: McpServer) => void }) {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [redirect, setRedirect] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    api.listMcpServers().then((r) => setRedirect(r.redirect_uri)).catch(() => {});
  }, []);
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          onSaved((await api.setMcpClient(server.id, id.trim(), secret.trim())).server);
          toast("Client saved");
        } catch (err) {
          setError(errorMessage(err, "Couldn't save the client."));
        }
      }}
    >
      <p className="text-sm text-amber-200">
        This sign-in server can&apos;t register Coderhelm on its own. Register an OAuth app with the vendor using this redirect address, then paste its client id.
      </p>
      {redirect && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Code className="min-w-0 text-xs">{redirect}</Code>
          <CopyButton text={redirect} label="Copy address" />
        </div>
      )}
      <Field id={`${server.id}-client-id`} label="Client id">
        {(props) => <input {...props} className={monoInputClass} value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" spellCheck={false} />}
      </Field>
      <Field id={`${server.id}-client-secret`} label="Client secret (if the app has one)">
        {(props) => <SecretInput {...props} value={secret} onChange={(e) => setSecret(e.target.value)} />}
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={!id.trim()} className={secondaryButton}>
          Save client
        </button>
      </div>
    </form>
  );
}

function KeyForm({ server, onSaved }: { server: McpServer; onSaved: (s: McpServer) => void }) {
  const [header, setHeader] = useState(server.header_name || "Authorization");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  return (
    <Disclosure summary="Replace the key">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            onSaved((await api.setMcpKey(server.id, header.trim(), value.trim())).server);
            setValue("");
            toast("Key saved and checked");
          } catch (err) {
            setError(errorMessage(err, "Couldn't save the key."));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id={`${server.id}-header`} label="Header">
          {(props) => <input {...props} className={monoInputClass} value={header} onChange={(e) => setHeader(e.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>
        <Field id={`${server.id}-key`} label="New value">
          {(props) => <SecretInput {...props} value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <button type="submit" disabled={busy || !value.trim()} className={secondaryButton}>
            {busy ? "Checking…" : "Save and check"}
          </button>
        </div>
      </form>
    </Disclosure>
  );
}

/** Which tools agents get. Read or write comes from the server's own hints. */
function ToolPicker({ server, canEdit, me, onSaved }: { server: McpServer; canEdit: boolean; me: string; onSaved: (s: McpServer) => void }) {
  const saved = useMemo(() => new Set(server.tools.filter((t) => t.allowed).map((t) => t.name)), [server]);
  const [pick, setPick] = useState<Set<string>>(saved);
  useEffect(() => setPick(saved), [saved]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const dirty = pick.size !== saved.size || [...pick].some((n) => !saved.has(n));
  const waiting = server.awaiting_approval;
  const mineToApprove = canEdit && waiting.length > 0 && me !== "" && server.changed_by.toLowerCase() !== me;

  if (server.tools.length === 0) {
    return (
      <p className="text-sm text-zinc-400" data-testid="mcp-no-tools">
        {server.tools_listed_at ? "The server lists no tools." : "Its tools are listed once it's connected."}
      </p>
    );
  }

  const shown = canEdit ? server.tools : server.tools.filter((t) => t.allowed && t.approved);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.setMcpTools(server.id, [...pick]);
      onSaved(r.server);
      toast(r.server.awaiting_approval.length > 0 ? "Saved. Another admin has to approve the new tools." : "Tools saved");
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the tools."));
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    try {
      onSaved((await api.approveMcpTools(server.id)).server);
      toast("Tools approved");
    } catch (e) {
      setError(errorMessage(e, "Couldn't approve them."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="min-w-0" data-testid="mcp-tool-picker">
      <legend className="text-sm font-semibold text-zinc-100">{canEdit ? "Tools agents may use" : "Tools agents use"}</legend>
      <p className="mt-1 text-sm text-zinc-400">
        {canEdit ? "Only checked tools exist for agents. Prefer tools that read; allow writes only where an agent should change things." : "An admin picks these."}
      </p>
      {waiting.length > 0 && (
        <div className="mt-3">
          <Callout variant="warning" title={`${waiting.length} tool${waiting.length === 1 ? "" : "s"} waiting for approval`}>
            <p>
              {waiting.join(", ")}. {mineToApprove ? "Agents get them once you approve." : "Another admin has to approve them before agents get them."}
            </p>
            {mineToApprove && (
              <p className="mt-2">
                <button type="button" onClick={approve} disabled={busy} className={smallSecondaryButton}>
                  Approve
                </button>
              </p>
            )}
          </Callout>
        </div>
      )}
      <ul className="mt-3 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {shown.map((t) => {
          const a = ACCESS[t.access];
          const id = `${server.id}-tool-${t.name}`;
          return (
            <li key={t.name} className="flex min-w-0 items-start gap-3 px-3 py-2" data-testid="mcp-tool" data-tool={t.name}>
              {canEdit && (
                <input
                  id={id}
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-zinc-100"
                  checked={pick.has(t.name)}
                  disabled={!t.offerable}
                  onChange={(e) =>
                    setPick((p) => {
                      const n = new Set(p);
                      if (e.target.checked) n.add(t.name);
                      else n.delete(t.name);
                      return n;
                    })
                  }
                />
              )}
              <label htmlFor={canEdit ? id : undefined} className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Code className="min-w-0 text-xs">{t.name}</Code>
                  <span title={a.hint} className={`rounded-full border px-2 py-0.5 text-xs ${a.cls}`} data-testid="mcp-tool-access">
                    {a.label}
                  </span>
                  {t.allowed && !t.approved && <span className="text-xs text-amber-300">Waiting for approval</span>}
                  {!t.offerable && <span className="text-xs text-zinc-400">Name too long for agents</span>}
                </span>
                {t.description && <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-400">{t.description}</span>}
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">None yet.</li>}
      </ul>
      {server.skipped.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          Not offered: {server.skipped.map((x) => `${x.name} (${x.reason})`).join("; ")}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !dirty} className={secondaryButton}>
            {busy ? "Saving…" : "Save tools"}
          </button>
          <button type="button" onClick={() => setPick(new Set(server.tools.filter((t) => t.access === "read" && t.offerable).map((t) => t.name)))} className={linkButton}>
            Only tools that read
          </button>
        </div>
      )}
    </fieldset>
  );
}

function PromptForm({ server, onSaved }: { server: McpServer; onSaved: (s: McpServer) => void }) {
  const [text, setText] = useState(server.custom_prompt);
  const { toast } = useToast();
  return (
    <Disclosure summary="Instructions agents follow with this server">
      <Field id={`${server.id}-prompt`} label="Instructions">
        {(props) => <textarea {...props} rows={3} maxLength={4000} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <p>
        <button
          type="button"
          className={secondaryButton}
          onClick={async () => {
            try {
              onSaved((await api.setMcpPrompt(server.id, text)).server);
              toast("Instructions saved");
            } catch (e) {
              toast(errorMessage(e, "Couldn't save the instructions."), "error");
            }
          }}
        >
          Save instructions
        </button>
      </p>
    </Disclosure>
  );
}

/** The last tool calls, from the audit trail. */
function Activity({ server }: { server: McpServer }) {
  const [calls, setCalls] = useState<McpCall[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api
      .getMcpActivity(server.id)
      .then((r) => setCalls(r.calls))
      .catch((e) => setError(errorMessage(e, "Couldn't load the calls.")));
  }, [server.id]);
  return (
    <details className="group rounded-lg border border-zinc-800 text-sm text-zinc-400" onToggle={(e) => (e.currentTarget.open && !calls ? load() : undefined)}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2 text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
        Recent tool calls
      </summary>
      <div className="px-4 pb-4">
        {error && <p className="text-red-400">{error}</p>}
        {!calls && !error && <p>Loading…</p>}
        {calls && calls.length === 0 && <p>No calls yet.</p>}
        {calls && calls.length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="mcp-activity">
            {calls.map((c, i) => (
              <li key={i} className="min-w-0">
                <span className={c.ok ? "text-zinc-300" : "text-red-300"}>{c.ok ? "OK" : "Failed"}</span> <Code className="text-xs">{c.tool}</Code> · {c.actor} ·{" "}
                {timeAgo(c.at)}
                {c.detail && <span className="block text-xs text-zinc-400">{c.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
