"use client";

import { useState } from "react";
import { api, type Integration, type McpServer, type OwnAppState, type PluginDef } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Field, SecretInput } from "./field";
import { Disclosure } from "./disclosure";
import { MarkdownEditor } from "./markdown-editor";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "./ui";
import { connectCatalogServer, startMcpSignIn } from "./mcp-servers";
import { CopyButton } from "./copy-button";

// A catalog MCP server (Sentry, Linear, Notion…), opened in place on
// Integrations and on Connections: signing in through the vendor's remote
// server when it has one, or a key, its instructions and turning it off.

/** An MCP server: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
export function PluginPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
  const d = item.detail as { plugin: PluginDef; enabled: boolean; has_credentials: boolean; custom_prompt: string; remote?: McpServer | null; own_app?: OwnAppState | null; own_app_redirect_uri?: string | null };
  const p = d.plugin;
  const keyForm = <PluginKeyPanel item={item} onChanged={onChanged} onClose={onClose} />;
  // The vendor's MCP server takes only apps it approved, but its API takes
  // the team's own app: sign in with that, or use a key.
  if (p.own_app) {
    const signedIn = d.own_app?.status === "connected";
    return (
      <div className="mt-4 flex flex-col gap-4">
        <OwnAppPanel plugin={p} state={d.own_app ?? null} redirectUri={d.own_app_redirect_uri ?? ""} onChanged={onChanged} />
        <Disclosure summary="Use a key instead" defaultOpen={!signedIn && d.has_credentials}>
          {keyForm}
        </Disclosure>
      </div>
    );
  }
  const noKey = p.key_unavailable ? (
    <p className="text-sm text-zinc-400" data-testid="key-unavailable">
      {p.key_unavailable}
    </p>
  ) : null;
  if (!p.remote_url) return <div className="mt-4">{noKey ?? keyForm}</div>;
  const hasKeys = p.credential_fields.length > 0;
  return (
    <div className="mt-4 flex flex-col gap-4">
      {!d.remote && <OAuthOffer plugin={p} />}
      {noKey}
      {!noKey && hasKeys && !d.remote && (
        <Disclosure summary="Use a key instead">
          {p.remote_key ? <RemoteKeyForm plugin={p} onChanged={onChanged} /> : keyForm}
        </Disclosure>
      )}
      {!noKey && hasKeys && d.remote && !p.remote_key && (
        <Disclosure summary="Or use a key instead" defaultOpen={false}>
          {keyForm}
        </Disclosure>
      )}
    </div>
  );
}

/** A key for a vendor whose own remote server takes one: it connects to that server, as a sign-in would. */
function RemoteKeyForm({ plugin, onChanged }: { plugin: PluginDef; onChanged: () => Promise<void> }) {
  const field = plugin.credential_fields[0];
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="remote-key-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
          await api.addMcpServer({ catalog_id: plugin.id, key: key.trim() });
          toast(`${plugin.name} is connected`);
          await onChanged();
        } catch (err) {
          setError(errorMessage(err, `${plugin.name} didn't accept that key.`));
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-sm text-zinc-400">
        {plugin.recommended_permissions && <>Use the least access that works: {plugin.recommended_permissions.toLowerCase()}. </>}
        <a href={plugin.docs_url} target="_blank" rel="noreferrer" className={linkButton}>
          Where to get one
        </a>
      </p>
      <Field id={`${plugin.id}-remote-key`} label={field?.label ?? "API key"}>
        {(props) => (
          <SecretInput {...props} className={inputClass} placeholder={field?.placeholder} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        )}
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={saving || !key.trim()} className={primaryButton}>
          {saving ? "Connecting…" : "Connect with this key"}
        </button>
      </div>
    </form>
  );
}

/** Signing in through the vendor's own remote server: no key to paste, and tools allowed one by one. */
function OAuthOffer({ plugin }: { plugin: PluginDef }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="oauth-offer">
      <p className="text-sm text-zinc-300">
        You sign in at {plugin.name} and choose which of its tools agents may use. No key to paste.
      </p>
      <div>
        <button
          type="button"
          disabled={busy}
          className={primaryButton}
          onClick={async () => {
            setBusy(true);
            try {
              await connectCatalogServer(plugin.id);
            } catch (e) {
              toast(errorMessage(e, "Couldn't start the sign-in."), "error");
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening sign-in…" : `Sign in with ${plugin.name}`}
        </button>
      </div>
    </div>
  );
}

/** The team's own OAuth app with the vendor: where to create it, its client id and secret, and signing in with it. */
function OwnAppPanel({ plugin, state, redirectUri, onChanged }: { plugin: PluginDef; state: OwnAppState | null; redirectUri: string; onChanged: () => Promise<void> }) {
  const app = plugin.own_app!;
  const [clientId, setClientId] = useState(state?.client_id ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "connect" | "remove">("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { confirm } = useConfirm();
  // The API names this install's callback; the page's own address is the same one.
  const redirect = redirectUri || state?.redirect_uri || `${window.location.origin}/settings/integrations/mcp-callback/`;
  const sameApp = !!state && clientId.trim() === state.client_id;
  const canSave = !!clientId.trim() && (!!secret.trim() || (sameApp && state!.has_secret));

  const connect = async (id: string) => {
    setBusy("connect");
    try {
      await startMcpSignIn(id);
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the sign-in."));
      setBusy("");
    }
  };
  const save = async (thenConnect: boolean) => {
    setBusy("save");
    setError("");
    try {
      const r = await api.saveOwnApp(plugin.id, clientId.trim(), secret.trim());
      setSecret("");
      if (thenConnect) {
        await connect(r.own_app.id);
        return;
      }
      toast(`Your ${plugin.name} app is saved`);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the app."));
    } finally {
      setBusy((b) => (b === "save" ? "" : b));
    }
  };
  const remove = async () => {
    if (!state) return;
    const ok = await confirm({
      title: `Remove your ${plugin.name} app?`,
      message: `Agents stop using its sign-in (and use the saved key, if there is one). The app itself stays in ${plugin.name}.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await api.removeMcpServer(state.id);
      setClientId("");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove it."), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="own-app">
      <p className="text-sm font-medium text-zinc-200">Use my own {plugin.name} app</p>
      {state?.status === "connected" ? (
        <p className="text-sm text-emerald-400" data-testid="own-app-status">
          Signed in{state.connected_by ? ` by ${state.connected_by}` : ""}. Agents use {plugin.name} with this sign-in.
        </p>
      ) : state?.status_reason ? (
        <p role="alert" className="text-sm text-amber-400" data-testid="own-app-status">
          {state.status_reason}
        </p>
      ) : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-400">
        <li>
          Create an app at{" "}
          <a href={app.console} target="_blank" rel="noreferrer" className={linkButton}>
            {app.console.replace(/^https:\/\//, "")}
          </a>{" "}
          under your {plugin.name} team or organization.
        </li>
        <li>
          Add this redirect URL:{" "}
          <code className="wrap-anywhere rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-200" data-testid="own-app-redirect">
            {redirect}
          </code>{" "}
          <CopyButton text={redirect} variant="link" />
        </li>
        <li>
          Give it exactly these scopes: <span className="text-zinc-200">{app.scopes.join(", ")}</span>.
        </li>
        <li>Publish it as a private app (no review needed), then paste its client id and secret here.</li>
      </ol>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <Field id={`${plugin.id}-own-client-id`} label="Client ID">
          {(props) => <input {...props} className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />}
        </Field>
        <Field id={`${plugin.id}-own-client-secret`} label="Client secret">
          {(props) => (
            <SecretInput
              {...props}
              className={inputClass}
              placeholder={sameApp && state?.has_secret ? "Saved. Paste a new one to replace it." : ""}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {sameApp && !secret.trim() ? (
            <button type="button" disabled={!!busy} className={primaryButton} onClick={() => void connect(state!.id)}>
              {busy === "connect" ? "Opening sign-in…" : state!.status === "connected" ? "Sign in again" : `Connect with ${plugin.name}`}
            </button>
          ) : (
            <button type="submit" disabled={!!busy || !canSave} className={primaryButton}>
              {busy ? "Saving…" : `Save and connect with ${plugin.name}`}
            </button>
          )}
          {state && (
            <button type="button" disabled={!!busy} className={secondaryButton} onClick={() => void remove()}>
              {busy === "remove" ? "Removing…" : "Remove my app"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** An MCP server run with a key: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
function PluginKeyPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
  const d = item.detail as { plugin: PluginDef; enabled: boolean; has_credentials: boolean; custom_prompt: string };
  const p = d.plugin;
  const [creds, setCreds] = useState<Record<string, string>>(() => Object.fromEntries(p.credential_fields.map((f) => [f.key, ""])));
  const [prompt, setPrompt] = useState(d.custom_prompt || p.default_prompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const saveCreds = async () => {
    setSaving(true);
    setError("");
    try {
      // Connecting a server that is off: switch it on only once there are credentials to save.
      if (!d.enabled) await api.enablePlugin(p.id);
      const r = await api.updatePluginCredentials(p.id, creds);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast("Credentials saved");
      const t = await api.testPluginConnection(p.id).catch(() => null);
      if (t && t.status !== "ok") toast(t.message || "The test failed", "error");
      await onChanged();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the credentials."));
    } finally {
      setSaving(false);
    }
  };
  const savePrompt = async () => {
    try {
      await api.updatePluginPrompt(p.id, prompt);
      toast("Instructions saved");
    } catch (e) {
      toast(errorMessage(e, "Couldn't save the instructions."), "error");
    }
  };
  const turnOff = async () => {
    const ok = await confirm({
      title: `Turn off ${p.name}?`,
      message: "Agents stop using it and its saved credentials are deleted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.disablePlugin(p.id);
      onClose();
      await onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't turn it off."), "error");
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveCreds();
        }}
      >
        <p className="text-sm text-zinc-400">
          {d.has_credentials ? "Credentials are saved. Enter new ones to replace them." : "Agents get this server once its credentials are saved."}{" "}
          {p.recommended_permissions && <>Use the least access that works: {p.recommended_permissions.toLowerCase()}.</>}{" "}
          <a href={p.docs_url} target="_blank" rel="noreferrer" className={linkButton}>
            Where to get them
          </a>
        </p>
        {p.credential_fields.map((f) => (
          <Field key={f.key} id={`${p.id}-${f.key}`} label={f.label}>
            {(props) =>
              f.secret ? (
                <SecretInput
                  {...props}
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              ) : (
                <input
                  {...props}
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              )
            }
          </Field>
        ))}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <button type="submit" disabled={saving || p.credential_fields.some((f) => !(creds[f.key] ?? "").trim())} className={primaryButton}>
            {saving ? "Saving and testing…" : "Save and test"}
          </button>
        </div>
      </form>
      {d.enabled && (
      <Disclosure summary="Instructions agents follow with this server">
        <Field id={`${p.id}-prompt`} label="Instructions">
          {(props) => (
            <MarkdownEditor
              {...props}
              variant="instructions"
              minRows={4}
              maxLength={4000}
              value={prompt}
              onChange={setPrompt}
              previewNote="Agents get this text as written with the server's tools."
            />
          )}
        </Field>
        <p className="mt-2">
          <button type="button" onClick={savePrompt} className={secondaryButton}>
            Save instructions
          </button>
        </p>
      </Disclosure>
      )}
      {d.enabled && (
        <p>
          <button type="button" onClick={turnOff} className={linkButton}>
            Turn off {p.name}
          </button>
        </p>
      )}
    </div>
  );
}

