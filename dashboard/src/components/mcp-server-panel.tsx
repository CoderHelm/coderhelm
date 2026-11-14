"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, type Integration, type KnowledgeSignIn, type McpServer, type OwnAppState, type PluginDef, type SignInStart } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { useCan } from "@/hooks/use-can";
import { Field, SecretInput } from "./field";
import { Disclosure } from "./disclosure";
import { MarkdownEditor } from "./markdown-editor";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "./ui";
import { McpManage, beginCatalogSignIn, viewerStatus } from "./mcp-servers";
import { CopyButton } from "./copy-button";
import { Code } from "./settings/code";
import { HybridAppChoice } from "./hybrid-app-choice";
import { KnowledgeDisconnect, KnowledgeSignInControl } from "./knowledge-connection";
import { Attention, ConnectionFacts, DangerRow, OtherWays, PanelDetails, PanelLink, PanelSection, SignInControl, UsesList, Way, type Fact } from "./integration-panel";

// A catalog product (Figma, Sentry, Linear, Notion, Sanity…), opened in
// place on Integrations. One pattern whatever it connects with:
//
// - Not connected: what Coderhelm will be able to do, the one default way
//   to connect (Coderhelm's app, else the vendor's own sign-in, else the
//   team's own app, else a key), and every other way under "Other ways to
//   connect".
// - Connected: who connected it and when, what it is used for, then Manage
//   (tools, instructions, recent calls: each only when there is something),
//   and Disconnect last.
// - Needs attention: the reason and one action.
//
// The card's status comes from the API, worked out from every record the
// team has for the product, so a sign-in made for Knowledge shows here too.

type WayId = "ours" | "remote" | "own" | "key";

interface Unused {
  id: string;
  name: string;
  kind: string;
  note: string;
}

interface Detail {
  plugin: PluginDef;
  enabled: boolean;
  has_credentials: boolean;
  custom_prompt: string;
  remote?: McpServer | null;
  own_app?: OwnAppState | null;
  own_app_redirect_uri?: string | null;
  coderhelm_app?: boolean;
  knowledge?: KnowledgeSignIn | null;
  unused?: Unused[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** What Coderhelm will be able to do, in a sentence, for the way a card connects by default. */
function accessOf(p: PluginDef, way: WayId): string {
  if (way === "ours" || way === "own") {
    return p.own_app?.reads ?? `Coderhelm reads ${p.name} with this sign-in. It can't change anything in ${p.name}.`;
  }
  if (way === "remote") {
    return `You sign in at ${p.name}, then pick which of its tools agents may use. Agents get none until you do, and tools that only read are marked.`;
  }
  const least = p.recommended_permissions ? ` Give it the least access that works: ${p.recommended_permissions.toLowerCase()}.` : "";
  return `Agents use ${p.name} with a key you paste here. It is sealed when saved and never shown again.${least}`;
}

export function CatalogPanel({
  item,
  canEdit,
  onChanged,
  onClose,
}: {
  item: Integration;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const d = item.detail as unknown as Detail;
  const p = d.plugin;
  const [remote, setRemote] = useState<McpServer | null>(d.remote ?? null);
  useEffect(() => setRemote(d.remote ?? null), [d.remote]);
  const { can } = useCan();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState("");

  const own = d.own_app ?? null;
  const ours = own && own.source === "coderhelm" ? own : null;
  const mine = own && (own.source ?? "own") === "own" ? own : null;
  const personalRemote = remote?.auth === "oauth" && remote.sharing === "personal";
  const mayConnectRemote = personalRemote ? can("mcp_connect") : canEdit;
  const rv = remote ? viewerStatus(remote) : null;
  const k = d.knowledge ?? null;

  // The ways this product can connect, the default first.
  const ways: WayId[] = [];
  if (p.own_app && d.coderhelm_app) ways.push("ours");
  if (p.remote_url || remote?.auth === "oauth") ways.push("remote");
  if (p.own_app) ways.push("own");
  // A key for a vendor's own server sets that server up, so it is offered until the server is.
  if (p.credential_fields.length > 0 && !p.key_unavailable && !(p.remote_key && remote)) ways.push("key");
  // The way it is connected now, if it is.
  const current: WayId | null =
    own?.status === "connected" ? (ours ? "ours" : "own") : rv?.status === "connected" ? "remote" : d.enabled && d.has_credentials ? "key" : null;
  const uses = item.uses ?? [];
  const runs = uses.find((u) => u.id === "runs");
  // Whether agents have it: the API's word when it says, else the records'.
  const runsOn = runs ? runs.state === "on" : current !== null;
  // An admin takes the default way; a member only ever signs in their own account.
  const primary: WayId | undefined = canEdit ? ways[0] : ways.includes("remote") && mayConnectRemote ? "remote" : undefined;
  const ids = [p.id, `app-${p.id}`, `app:${p.id}`];

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

  const beginOurs = async (): Promise<SignInStart> => {
    const r = await api.connectCoderhelmApp(p.id);
    return { ...r, server_id: r.server_id ?? r.own_app.id };
  };
  const beginRemote = async (): Promise<SignInStart> => (remote ? { ...(await api.connectMcpServer(remote.id)), server_id: remote.id } : beginCatalogSignIn(p.id));

  const signIn = (way: "ours" | "remote", label: string, variant: "primary" | "secondary" = "primary") => (
    <SignInControl
      name={p.name}
      ids={ids}
      label={label}
      begin={way === "ours" ? beginOurs : beginRemote}
      onConnected={onChanged}
      onReturn={onChanged}
      variant={variant}
      disabled={way === "remote" && !!remote?.needs_client && !remote.has_client}
      testId={way === "ours" ? "coderhelm-app-sign-in" : "oauth-sign-in"}
    />
  );

  // A form is the main action only where it is the default way; among the other ways it is quiet.
  const ownForm = (quiet: boolean) => <OwnAppForm plugin={p} state={mine} redirectUri={d.own_app_redirect_uri ?? ""} ids={ids} quiet={quiet} onChanged={onChanged} />;
  const keyForm = (quiet: boolean) =>
    p.remote_key && ways.includes("remote") && !d.enabled ? <RemoteKeyForm plugin={p} onChanged={onChanged} /> : <KeyFields item={item} quiet={quiet} onChanged={onChanged} />;

  // ── Needs attention: which part is broken, and its one action ──────
  const fix = (): ReactNode => {
    if (item.action === "reconnect") {
      if (own && own.status !== "connected" && own.status !== "not_connected") {
        return ours ? signIn("ours", "Sign in again") : <SignInControl name={p.name} ids={ids} label="Sign in again" begin={async () => ({ ...(await api.connectMcpServer(own.id)), server_id: own.id })} onConnected={onChanged} onReturn={onChanged} testId="own-app-sign-in" />;
      }
      if (rv && (rv.status === "needs_reconnect" || rv.status === "failed")) return mayConnectRemote ? signIn("remote", "Reconnect") : null;
      if (k && k.status !== "connected") return <KnowledgeSignInControl k={k} onChanged={onChanged} />;
      return null;
    }
    if (item.action === "check_again" && canEdit) {
      return (
        <button
          type="button"
          disabled={!!busy}
          className={secondaryButton}
          onClick={() =>
            act("check", async () => {
              if (remote && rv?.status !== "not_connected") {
                const r = await api.checkMcpServer(remote.id);
                toast(r.error ? r.error : `${p.name} works`, r.error ? "error" : "success");
              } else {
                const r = await api.testPluginConnection(p.id);
                toast(r.status === "ok" ? `${p.name} works` : r.message || "The test failed", r.status === "ok" ? "success" : "error");
              }
              await onChanged();
            })
          }
        >
          {busy === "check" ? "Checking…" : "Check again"}
        </button>
      );
    }
    return null;
  };

  // ── Other ways to connect ──────────────────────────────────────────
  const others = (skip: WayId | null) => {
    const parts: ReactNode[] = [];
    if (!canEdit) return null;
    for (const w of ways) {
      if (w === skip) continue;
      if (w === "ours") {
        parts.push(
          <Way key="ours" title={`Sign in with ${p.name}`} when={`Coderhelm's own app with ${p.name}: nothing to create or paste.`} testId="way-ours">
            {signIn("ours", `Sign in with ${p.name}`, "secondary")}
          </Way>,
        );
      } else if (w === "remote" && mayConnectRemote) {
        parts.push(
          <Way key="remote" title={`Sign in at ${p.name}'s own server`} when="You pick which of its tools agents may use." testId="way-remote">
            {signIn("remote", `Sign in with ${p.name}`, "secondary")}
          </Way>,
        );
      } else if (w === "own") {
        parts.push(
          <Way key="own" title={`Use your own ${p.name} app`} when={`For a team that wants its own app with ${p.name}: the sign-in never passes through Coderhelm's app.`} testId="way-own">
            {ownForm(true)}
          </Way>,
        );
      } else if (w === "key") {
        parts.push(
          <Way key="key" title="Use a key" when={`Paste a key from ${p.name} instead of signing in.`} testId="way-key">
            {keyForm(true)}
          </Way>,
        );
      }
    }
    // Why no key works, when none does: with the other ways when there are
    // some, else as a plain line (never a disclosure holding one sentence).
    const noKey = p.key_unavailable ? (
      <p key="no-key" className="text-sm text-zinc-400" data-testid="key-unavailable">
        {p.key_unavailable}
      </p>
    ) : null;
    for (const u of d.unused ?? []) {
      parts.push(
        <Way key={`unused-${u.id}`} title="An unfinished sign-in" when={u.note} testId="unused-record">
          <div>
            <button
              type="button"
              disabled={!!busy}
              className={secondaryButton}
              onClick={() =>
                act("unused", async () => {
                  const ok = await confirm({
                    title: `Remove the unfinished ${u.name} sign-in?`,
                    message: "Nothing uses it. Removing it changes nothing agents can do.",
                    confirmLabel: "Remove",
                    destructive: true,
                  });
                  if (!ok) return;
                  await api.removeMcpServer(u.id);
                  await onChanged();
                })
              }
            >
              Remove it
            </button>
          </div>
        </Way>,
      );
    }
    if (parts.length === 0) return noKey;
    return (
      <OtherWays open={item.action === "add_credentials" && skip !== "key"}>
        {parts}
        {noKey}
      </OtherWays>
    );
  };

  // ── Details: the technical side ────────────────────────────────────
  const detailRows = (way: WayId | null): Fact[] => {
    const app = p.own_app;
    const viaApp = way === "ours" || way === "own";
    const address = way === "remote" ? (remote?.url ?? p.remote_url ?? "") : "";
    const scopes = viaApp ? (app?.scopes ?? []) : way === "remote" ? (remote?.scopes ?? []) : [];
    return [
      { label: "Signs in at", value: viaApp && app ? hostOf(app.authorize) : way === "remote" && (remote?.issuer || address) ? hostOf(remote?.issuer || address) : "" },
      { label: "Server address", value: address ? <Code className="text-xs">{address}</Code> : "" },
      { label: "Permissions asked for", value: scopes.length ? <span data-testid="scopes">{scopes.join(", ")}</span> : "" },
      { label: "Who signs in", value: viaApp ? "One account for the team" : way === "remote" ? (personalRemote ? "Each person, with their own account" : "One account for the team") : "" },
    ];
  };

  // ── Disconnect ─────────────────────────────────────────────────────
  const disconnect = () =>
    act("disconnect", async () => {
      if (current === "key") {
        const ok = await confirm({ title: `Turn off ${p.name}?`, message: "Agents stop using it and its saved key is deleted.", confirmLabel: "Turn off", destructive: true });
        if (!ok) return;
        await api.disablePlugin(p.id);
        onClose();
      } else {
        const id = current === "remote" ? remote!.id : own!.id;
        const ok = await confirm({
          title: personalRemote && current === "remote" ? `Disconnect your ${p.name} account?` : `Disconnect ${p.name}?`,
          message: `Coderhelm revokes the sign-in where ${p.name} allows it and forgets it. Agents stop using it until someone signs in again.`,
          confirmLabel: "Disconnect",
          destructive: true,
        });
        if (!ok) return;
        const r = await api.disconnectMcpServer(id);
        toast(r.revoked ? "Disconnected and revoked" : "Disconnected");
      }
      await onChanged();
    });
  const attention = item.status !== "connected" && item.status !== "not_connected";
  const connectedSomehow = uses.some((u) => u.state === "on") || current !== null;
  const facts: Fact[] = uses.length < 2 && current ? [{ label: "Used for", value: "Runs and reviews" }] : [];
  // The way agents would use that is set up and broken: its fix is the card's one action.
  const stopped = (st: string | undefined) => !!st && st !== "connected" && st !== "not_connected";
  const brokenWay: WayId | null =
    !attention || runsOn || (runs && runs.state !== "attention")
      ? null
      : stopped(own?.status)
        ? ours
          ? "ours"
          : "own"
        : stopped(rv?.status)
          ? "remote"
          : // Switched on with no key saved, where a sign-in exists: nothing is
            // broken, it was never connected. The default way is offered, with
            // the key among the other ways.
            d.enabled && (d.has_credentials || ways[0] === "key" || ways.length === 0)
            ? "key"
            : null;

  return (
    <div className="mt-3 flex min-w-0 flex-col gap-5" data-testid={`catalog-${p.id}`} data-way={current ?? ""}>
      {attention && <Attention item={item}>{fix()}</Attention>}
      {/* A note the facts below don't already say ("No tools are allowed yet, so agents don't get it."). */}
      {item.status === "connected" && item.reason && uses.length < 2 && current !== "ours" && current !== "own" && (
        <p className="text-sm text-zinc-400" data-testid="integration-reason">
          {item.reason}
        </p>
      )}
      {connectedSomehow && <ConnectionFacts item={item} extra={facts} />}
      {connectedSomehow && uses.length > 1 && <UsesList uses={uses} canEdit={canEdit} />}

      {/* Not connected for runs: what it will do, one action, what happens next. */}
      {!runsOn && primary && !brokenWay && (
        <ConnectSection title={connectedSomehow ? "Use it in runs and reviews" : ""}>
          {p.own_app && canEdit && <HybridAppChoice id={p.id} name={p.name} onChanged={() => void onChanged()} />}
          <p className="text-sm text-zinc-300" data-testid="access">
            {accessOf(p, primary)}
          </p>
          {primary === "ours" && signIn("ours", `Sign in with ${p.name}`)}
          {primary === "remote" && signIn("remote", personalRemote ? "Connect your account" : `Sign in with ${p.name}`)}
          {primary === "own" && ownForm(false)}
          {primary === "key" && keyForm(false)}
          <PanelDetails rows={detailRows(primary)} />
          {others(primary)}
        </ConnectSection>
      )}
      {!runsOn && !primary && p.key_unavailable && (
        <p className="text-sm text-zinc-400" data-testid="key-unavailable">
          {p.key_unavailable}
        </p>
      )}
      {brokenWay === "key" && canEdit && (
        <PanelSection title={d.has_credentials ? "Replace the key" : "Add the key"} testId="add-credentials">
          <KeyFields item={item} onChanged={onChanged} />
        </PanelSection>
      )}
      {brokenWay && others(brokenWay)}

      {/* Connected: Manage, each part only when there is something in it. */}
      {current === "remote" && remote && <McpManage server={remote} canEdit={canEdit} onSaved={setRemote} onChanged={onChanged} />}
      {current && current !== "remote" && canEdit && (
        <PanelSection title="Manage" testId="catalog-manage">
          {d.enabled && <PackageInstructions item={item} />}
          {current === "key" && (
            <Disclosure summary="Replace the key">
              <KeyFields item={item} onChanged={onChanged} />
            </Disclosure>
          )}
          {current === "ours" && signIn("ours", "Sign in again", "secondary")}
          {current === "own" && ownForm(true)}
        </PanelSection>
      )}
      {runsOn && <PanelDetails rows={detailRows(current)} />}
      {runsOn && others(current)}
      {k && canEdit && !k.personal && (
        <p className="text-sm text-zinc-400">
          <PanelLink href="/knowledge/">Manage {k.label} sources in Knowledge</PanelLink>
        </p>
      )}

      {/* Disconnect: last, and worded as what it is. */}
      {current && (current === "remote" ? mayConnectRemote : canEdit) && (
        <DangerRow
          title={current === "key" ? `Turn off ${p.name}` : personalRemote && current === "remote" ? `Disconnect your ${p.name} account` : `Disconnect ${p.name}`}
          label={current === "key" ? "Turn off" : "Disconnect"}
          onClick={disconnect}
          busy={!!busy}
        >
          {current === "key" ? "Agents stop using it and the saved key is deleted." : `Agents stop using ${p.name} until someone signs in again.${current === "remote" ? " The tools you allowed stay picked." : ""}`}
        </DangerRow>
      )}
      {k && canEdit && !k.personal && <KnowledgeDisconnect k={k} beside={current !== null} onChanged={onChanged} />}
    </div>
  );
}

function ConnectSection({ title, children }: { title: string; children: ReactNode }) {
  if (title) {
    return (
      <PanelSection title={title} testId="connect">
        {children}
      </PanelSection>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="connect">
      {children}
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
        <button type="submit" disabled={saving || !key.trim()} className={secondaryButton}>
          {saving ? "Connecting…" : "Connect with this key"}
        </button>
      </div>
    </form>
  );
}

/** The team's own OAuth app with the vendor: where to create it, its client id and secret, and signing in with it. */
function OwnAppForm({
  plugin,
  state,
  redirectUri,
  ids,
  quiet,
  onChanged,
}: {
  plugin: PluginDef;
  state: OwnAppState | null;
  redirectUri: string;
  ids: string[];
  /** Among the other ways, or already signed in: not the card's main action. */
  quiet: boolean;
  onChanged: () => Promise<void>;
}) {
  const app = plugin.own_app!;
  const [clientId, setClientId] = useState(state?.client_id ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  // The API names this install's callback; the page's own address is the same one.
  const redirect = redirectUri || state?.redirect_uri || `${window.location.origin}/settings/integrations/mcp-callback/`;
  const sameApp = !!state && clientId.trim() === state.client_id;
  const canSave = !!clientId.trim() && (!!secret.trim() || (sameApp && state!.has_secret));
  const unchanged = sameApp && !secret.trim();

  // Saves what was typed (when it changed), then asks where the sign-in page is.
  const begin = async (): Promise<SignInStart> => {
    let id = state?.id ?? "";
    if (!unchanged) {
      const r = await api.saveOwnApp(plugin.id, clientId.trim(), secret.trim());
      setSecret("");
      id = r.own_app.id;
    }
    return { ...(await api.connectMcpServer(id)), server_id: id };
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
    setBusy(true);
    try {
      await api.removeMcpServer(state.id);
      setClientId("");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove it."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="own-app">
      {state?.status === "connected" ? (
        <p className="text-sm text-zinc-300" data-testid="own-app-status">
          Signed in{state.connected_by ? ` by ${state.connected_by}` : ""} with your own app. Agents use {plugin.name} with this sign-in.
        </p>
      ) : state?.status_reason ? (
        <p className="text-sm text-amber-300" data-testid="own-app-status">
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
      <SignInControl
        name={plugin.name}
        ids={ids}
        label={unchanged ? (state!.status === "connected" ? "Sign in again" : `Sign in with ${plugin.name}`) : `Save and sign in with ${plugin.name}`}
        begin={begin}
        onConnected={onChanged}
        onReturn={onChanged}
        disabled={!canSave}
        variant={quiet || state?.status === "connected" ? "secondary" : "primary"}
        testId="own-app-sign-in"
      />
      {state && (
        <p>
          <button type="button" disabled={busy} className={linkButton} onClick={() => void remove()}>
            {busy ? "Removing…" : `Remove your ${plugin.name} app`}
          </button>
        </p>
      )}
    </div>
  );
}

/** The key for a vendor's package: entered here, never shown again, and tested when saved. */
function KeyFields({ item, quiet = false, onChanged }: { item: Integration; quiet?: boolean; onChanged: () => Promise<void> }) {
  const d = item.detail as unknown as Detail;
  const p = d.plugin;
  const [creds, setCreds] = useState<Record<string, string>>(() => Object.fromEntries(p.credential_fields.map((f) => [f.key, ""])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const save = async () => {
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

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="key-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
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
        <button type="submit" disabled={saving || p.credential_fields.some((f) => !(creds[f.key] ?? "").trim())} className={quiet ? secondaryButton : primaryButton}>
          {saving ? "Saving and testing…" : "Save and test"}
        </button>
      </div>
    </form>
  );
}

/** The instructions agents follow with a vendor's package. One link to add some when there are none. */
function PackageInstructions({ item }: { item: Integration }) {
  const d = item.detail as unknown as Detail;
  const p = d.plugin;
  const [prompt, setPrompt] = useState(d.custom_prompt || p.default_prompt);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();
  const has = !!(d.custom_prompt || p.default_prompt);
  if (!has && !adding) {
    return (
      <p>
        <button type="button" onClick={() => setAdding(true)} className={`${linkButton} text-left`}>
          Add instructions agents follow with this server
        </button>
      </p>
    );
  }
  return (
    <Disclosure summary="Instructions agents follow with this server" defaultOpen={adding}>
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
        <button
          type="button"
          className={secondaryButton}
          onClick={async () => {
            try {
              await api.updatePluginPrompt(p.id, prompt);
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
