"use client";

import { useState } from "react";
import { api, type Integration, type McpServer, type PluginDef } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Field, SecretInput } from "./field";
import { Disclosure } from "./disclosure";
import { MarkdownEditor } from "./markdown-editor";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "./ui";
import { connectCatalogServer } from "./mcp-servers";

// A catalog MCP server (Sentry, Linear, Notion…), opened in place on
// Integrations and on Connections: signing in through the vendor's remote
// server when it has one, or a key, its instructions and turning it off.

/** An MCP server: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
export function PluginPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
  const d = item.detail as { plugin: PluginDef; enabled: boolean; has_credentials: boolean; custom_prompt: string; remote?: McpServer | null };
  const p = d.plugin;
  const keyForm = <PluginKeyPanel item={item} onChanged={onChanged} onClose={onClose} />;
  if (!p.remote_url) return keyForm;
  const hasKeys = p.credential_fields.length > 0;
  return (
    <div className="mt-4 flex flex-col gap-4">
      {!d.remote && <OAuthOffer plugin={p} />}
      {hasKeys && (
        <Disclosure summary={d.remote ? "Or use a key instead" : "Use a key instead"} defaultOpen={d.has_credentials && !d.remote}>
          {keyForm}
        </Disclosure>
      )}
    </div>
  );
}

/** Signing in through the vendor's own remote server: no key to paste, and tools allowed one by one. */
function OAuthOffer({ plugin }: { plugin: PluginDef }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="oauth-offer">
      <p className="text-sm text-zinc-300">
        Sign in with {plugin.name}: nobody pastes a key, Coderhelm renews the sign-in on its own, and you pick which of its tools agents may use.
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
          {busy ? "Opening sign-in…" : `Connect with ${plugin.name}`}
        </button>
      </div>
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

