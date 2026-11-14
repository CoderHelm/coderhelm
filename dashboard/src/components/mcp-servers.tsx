"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type McpCall, type McpDetected, type McpServer, type McpStatus, type McpTool, type SignInStart } from "@/lib/api";
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
import { DangerRow, PanelDetails, PanelSection, SignInControl } from "./integration-panel";

// Remote MCP servers: added by address, signed in to with OAuth, a key or
// nothing, their tools allowed one by one. Used on Settings → Integrations,
// for servers added by address and for catalog servers connected through
// their vendor's own remote server.

const ACCESS: Record<McpTool["access"], { label: string; cls: string; hint: string }> = {
  read: { label: "Reads", cls: "border-emerald-500/30 text-emerald-300", hint: "The server says this tool only reads." },
  write: { label: "Writes", cls: "border-amber-500/30 text-amber-300", hint: "The server says this tool can change data." },
  unknown: { label: "Not said", cls: "border-zinc-700 text-zinc-400", hint: "The server doesn't say whether this tool changes data." },
};

/** Starts a catalog server's sign-in through its vendor's remote server (setting it up first if needed). */
export async function beginCatalogSignIn(catalogId: string): Promise<SignInStart> {
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
  const r = await api.connectMcpServer(id);
  return { ...r, server_id: r.server_id ?? id };
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
export function viewerStatus(s: McpServer): { status: McpStatus; reason: string } {
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
      // A server that signs in opens on its row, where Connect is the one
      // thing to do next.
      onAdded(r.server);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Couldn't add the server."));
    } finally {
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
              {busy ? (detected.auth === "header" ? "Checking the key…" : "Adding…") : "Add server"}
            </button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── One server ──────────────────────────────────────────────────────

/** Who signs in to a server, or what it takes instead. */
function signsIn(s: McpServer): string {
  if (s.auth === "oauth") return s.sharing === "personal" ? "Each person, with their own account" : "One account for the team";
  return s.auth === "header" ? `A key, sent in the ${s.header_name} header` : "Nobody: it needs no sign-in";
}

/**
 * A server added by address, opened on Integrations: connecting it, then
 * its tools, instructions and calls, and disconnecting or removing it last.
 */
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
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState("");
  const view = viewerStatus(s);
  const personal = s.auth === "oauth" && s.sharing === "personal";
  const { can } = useCan();
  // A shared server is connected by whoever may change integrations; a
  // personal one by anyone who may connect their own account.
  const mayConnect = s.auth === "oauth" && (personal ? can("mcp_connect") : canEdit);
  const connected = view.status === "connected";
  const noClient = s.needs_client && !s.has_client;

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

  const signIn = mayConnect && (
    <SignInControl
      name={s.name}
      ids={[s.id]}
      label={view.status === "needs_reconnect" || view.status === "failed" ? "Reconnect" : personal ? "Connect your account" : "Connect"}
      begin={async () => ({ ...(await api.connectMcpServer(s.id)), server_id: s.id })}
      onConnected={onChanged}
      onReturn={onChanged}
      disabled={noClient}
      testId="mcp-sign-in"
    />
  );
  const details = (
    <PanelDetails
      rows={[
        { label: "Server address", value: <Code className="text-xs">{s.url}</Code> },
        { label: "Signs in", value: signsIn(s) },
        { label: "Sign-in server", value: s.issuer ? hostOf(s.issuer) : "" },
        { label: "Permissions asked for", value: s.scopes.length ? s.scopes.join(", ") : "" },
        { label: "Added", value: s.added_at ? `${timeAgo(s.added_at)}${s.added_by ? ` by ${s.added_by}` : ""}` : "" },
      ]}
    />
  );

  return (
    <div className="mt-3 flex flex-col gap-4" data-testid={`mcp-server-${s.id}`} data-status={view.status}>
      {/* Needs attention: the reason and the one action. */}
      {(view.status === "needs_reconnect" || view.status === "failed") && (
        <Callout variant={view.status === "failed" ? "error" : "warning"} title={view.status === "failed" ? "Not working" : "Needs reconnecting"} live={false} testId="mcp-attention">
          <p data-testid="mcp-status-reason">{view.reason || "The sign-in has to be renewed."}</p>
          <div className="pt-2">{s.auth === "oauth" ? signIn : canEdit && <CheckAgain server={s} onSaved={setS} onChanged={onChanged} />}</div>
        </Callout>
      )}

      {/* Not connected: what happens, one action, what comes next. */}
      {view.status === "not_connected" && (
        <>
          <p className="text-sm text-zinc-300" data-testid="mcp-status-reason">
            {personal
              ? `Each person signs in to ${s.name} with their own account. Agents use it for that person's work, with only the tools an admin allowed.`
              : `You sign in at ${hostOf(s.url)}, then pick which of its tools agents may use. Agents get none until you do.`}
          </p>
          {noClient && canEdit && <ClientForm server={s} onSaved={setS} />}
          {signIn}
        </>
      )}

      {/* Connected: its tools, instructions and calls. Nothing before that. */}
      {connected && view.reason && (
        <p className="text-sm text-zinc-400" data-testid="mcp-status-reason">
          {view.reason}
        </p>
      )}
      {connected && <McpManage server={s} canEdit={canEdit} onSaved={setS} onChanged={onChanged} />}
      {details}

      {canEdit && (connected || s.auth !== "oauth") && mayConnect && (
        <DangerRow title={personal ? `Disconnect your ${s.name} account` : `Disconnect ${s.name}`} label="Disconnect" onClick={disconnect} busy={!!busy} testId="mcp-disconnect">
          {personal ? "Agents stop using your account. The server and its allowed tools stay." : "Agents stop using it until someone signs in again. The server and its allowed tools stay."}
        </DangerRow>
      )}
      {!canEdit && connected && mayConnect && (
        <p>
          <button type="button" onClick={disconnect} disabled={!!busy} className={secondaryButton}>
            Disconnect your account
          </button>
        </p>
      )}
      {canEdit && (
        <DangerRow title={`Remove ${s.name}`} label="Remove server" onClick={remove} busy={!!busy} testId="mcp-remove">
          Every connection to it is revoked and forgotten, and agents lose its tools at once.
        </DangerRow>
      )}
    </div>
  );
}

/** Lists the server's tools again with the saved connection. */
function CheckAgain({ server, onSaved, onChanged }: { server: McpServer; onSaved: (s: McpServer) => void; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <button
      type="button"
      disabled={busy}
      className={secondaryButton}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api.checkMcpServer(server.id);
          onSaved(r.server);
          toast(r.error ? r.error : `${r.server.tools.length} tools listed`, r.error ? "error" : "success");
          await onChanged();
        } catch (e) {
          toast(errorMessage(e, "The check failed."), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Checking…" : "Check again"}
    </button>
  );
}

/**
 * What an admin manages on a connected server: which tools agents get, the
 * instructions agents follow with it, its key (when it uses one) and its
 * recent calls. Each part shows only when there is something in it.
 */
export function McpManage({
  server,
  canEdit,
  onSaved,
  onChanged,
}: {
  server: McpServer;
  canEdit: boolean;
  onSaved: (s: McpServer) => void;
  onChanged: () => Promise<void> | void;
}) {
  const me = useMyEmail();
  return (
    <PanelSection title={canEdit ? "Manage" : "What agents use"} testId="mcp-manage">
      <ToolPicker
        server={server}
        canEdit={canEdit}
        me={me}
        onSaved={(n) => {
          onSaved(n);
          void onChanged();
        }}
      />
      {canEdit && <PromptForm server={server} onSaved={onSaved} />}
      {server.auth === "header" && canEdit && <KeyForm server={server} onSaved={onSaved} />}
      {canEdit && <Activity server={server} />}
      {canEdit && (
        <div>
          <CheckAgain server={server} onSaved={onSaved} onChanged={onChanged} />
        </div>
      )}
    </PanelSection>
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
    // Nothing to pick: said only once the server was asked and listed none.
    if (!server.tools_listed_at) return null;
    return (
      <p className="text-sm text-zinc-400" data-testid="mcp-no-tools">
        The server lists no tools.
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
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();
  // No instructions yet: one link to add some, never an empty box.
  if (!server.custom_prompt && !adding) {
    return (
      <p>
        <button type="button" onClick={() => setAdding(true)} className={`${linkButton} text-left`} data-testid="mcp-add-instructions">
          Add instructions agents follow with this server
        </button>
      </p>
    );
  }
  return (
    <Disclosure summary="Instructions agents follow with this server" defaultOpen={adding}>
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

/** The last tool calls, from the audit trail. Nothing until there is one. */
function Activity({ server }: { server: McpServer }) {
  const [calls, setCalls] = useState<McpCall[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .getMcpActivity(server.id)
      .then((r) => live && setCalls(r.calls))
      .catch(() => live && setCalls([]));
    return () => {
      live = false;
    };
  }, [server.id]);
  if (!calls || calls.length === 0) return null;
  return (
    <Disclosure summary={`Recent tool calls (${calls.length})`}>
      <ul className="flex flex-col gap-1" data-testid="mcp-activity">
        {calls.map((c, i) => (
          <li key={i} className="min-w-0">
            <span className={c.ok ? "text-zinc-300" : "text-red-300"}>{c.ok ? "OK" : "Failed"}</span> <Code className="text-xs">{c.tool}</Code> · {c.actor} ·{" "}
            {timeAgo(c.at)}
            {c.detail && <span className="block text-xs text-zinc-400">{c.detail}</span>}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
