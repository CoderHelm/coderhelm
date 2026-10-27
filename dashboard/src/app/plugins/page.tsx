"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  pluginHref,
  pluginsApi,
  PluginError,
  trackText,
  type CatalogPlugin,
  type InstalledPlugin,
  type PluginSource,
  type TeamPluginSettings,
  type TrackKind,
} from "@/lib/plugins";
import { useCan } from "@/hooks/use-can";
import { PluginsGate, Refusal, RiskChip } from "@/components/plugins";
import { Page, PageHeader } from "@/components/page";
import { Chip, List, ListEmpty, ListError, ListRow, ListSection, ListSkeleton, type Tone } from "@/components/list";
import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { inputClass, linkButton, monoInputClass, primaryButton, secondaryButton } from "@/components/ui";
import { SecretInput } from "@/components/field";
import { Code } from "@/components/settings/code";
import { apiOrigin } from "@/lib/runtime-config";

// Plugins: what the team installed, what its sources offer, and where the
// plugins come from. A plugin is text plus approved tools: nothing a plugin
// brings runs code, and nothing goes out without a person's approval.

export default function PluginsPageGated() {
  return (
    <PluginsGate title="Plugins">
      <PluginsPage />
    </PluginsGate>
  );
}

function statusOf(p: InstalledPlugin): { label: string; tone: Tone } {
  if (p.status === "pending_install") return { label: "Waiting for a second admin", tone: "waiting" };
  if (p.status === "disabled") return { label: "Off", tone: "muted" };
  return { label: "On", tone: "success" };
}

function errorOf(e: unknown): { code: string; message: string } {
  if (e instanceof PluginError) return { code: e.code, message: e.message };
  return { code: "", message: e instanceof Error ? e.message : "The request failed." };
}

function PluginsPage() {
  const { can } = useCan();
  // Sources, installs and the team setting: `plugins.install`.
  const isAdmin = can("plugins.install");
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [installed, setInstalled] = useState<InstalledPlugin[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [sources, setSources] = useState<PluginSource[]>([]);
  const [settings, setSettings] = useState<TeamPluginSettings | null>(null);
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [i, c, s, t] = await Promise.all([pluginsApi.installed(), pluginsApi.available(), pluginsApi.sources(), pluginsApi.settings()]);
      setInstalled(i.plugins);
      setCatalog(c.plugins);
      setSources(s.sources);
      setSettings(t);
      setError("");
    } catch (e) {
      setError(errorOf(e).message);
      setInstalled((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setRefusal(null);
    try {
      await fn();
      toast(done);
      await load();
    } catch (e) {
      const r = errorOf(e);
      setRefusal(r);
      toast(r.message, "error");
    } finally {
      setBusy("");
    }
  };

  const install = (c: CatalogPlugin) =>
    act(`install:${c.source_id}:${c.path}`, () => pluginsApi.install(c.source_id, c.path), `${c.name} installed. Connect what it needs on its page.`);

  const removeSource = async (s: PluginSource) => {
    const ok = await confirm({
      title: `Remove ${s.repo}?`,
      message: "Its plugins stop showing in the catalog. Plugins already installed from it keep their current version.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) await act(`src:${s.id}`, () => pluginsApi.removeSource(s.id), "Source removed");
  };

  const all = installed ?? [];
  const pending = all.filter((p) => p.pending);

  return (
    <Page>
      <PageHeader
        title="Plugins"
        lead={
          <>
            Packages your team installs, such as a marketing or support helper. Each one brings written instructions, agents and the
            tools it may use. Installing one never connects anything by itself, and nothing it writes goes out until a person approves
            that exact version.
          </>
        }
        actions={
          <Link href="/plugins/review" className={secondaryButton}>
            Review drafts
          </Link>
        }
      />

      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load your plugins" onRetry={load}>
            {error}
          </ListError>
        </div>
      )}
      {refusal && (
        <div className="mt-6">
          <Refusal code={refusal.code} message={refusal.message} />
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-8">
          <ListSection id="waiting" title="Waiting for approval" count={pending.length} tone="waiting">
            <List label="Plugins waiting for approval">
              {pending.map((p) => (
                <ListRow
                  key={p.id}
                  testId="pending-plugin"
                  status={{ tone: "waiting" }}
                  title={p.name}
                  href={pluginHref(p.id)}
                  meta={[
                    p.pending?.kind === "install" ? "New install" : `Update to ${p.pending?.version}`,
                    p.pending?.requested_by ? `asked by ${p.pending.requested_by}` : null,
                  ]}
                  summary={p.pending?.kind === "update" ? "Update waiting for approval" : "Install waiting for a second admin"}
                  summaryTone="waiting"
                  actions={
                    <Link href={pluginHref(p.id)} className={secondaryButton}>
                      Review
                    </Link>
                  }
                />
              ))}
            </List>
          </ListSection>
        </div>
      )}

      <div className="mt-8">
        <ListSection id="installed" title="Installed" count={all.length || undefined}>
          {installed === null ? (
            <ListSkeleton rows={3} label="Loading your plugins" />
          ) : all.length === 0 ? (
            <ListEmpty title="No plugins yet">Add a source below, then install a plugin from its catalog.</ListEmpty>
          ) : (
            <List label="Installed plugins">
              {all.map((p) => {
                const st = statusOf(p);
                return (
                  <ListRow
                    key={p.id}
                    testId="installed-plugin"
                    data={{ status: p.status }}
                    status={{ tone: st.tone }}
                    title={p.name}
                    href={pluginHref(p.id)}
                    meta={[`version ${p.version}`, trackText(p.track), p.auto_update ? "updates on" : "updates off"]}
                    summary={p.description}
                    chips={
                      <>
                        <Chip tone={st.tone}>{st.label}</Chip>
                        {p.pending?.kind === "update" && (
                          <span data-testid="update-waiting">
                            <Chip tone="waiting">Update waiting for approval</Chip>
                          </span>
                        )}
                      </>
                    }
                  />
                );
              })}
            </List>
          )}
        </ListSection>
      </div>

      <div className="mt-8">
        <ListSection id="catalog" title="Catalog" count={catalog.length || undefined} description="Plugins your sources offer.">
          {catalog.length === 0 ? (
            <ListEmpty title="Nothing to install yet">{isAdmin ? "Add a source below." : "An admin adds sources of plugins."}</ListEmpty>
          ) : (
            <List label="Plugins you can install">
              {catalog.map((c) => {
                const key = `install:${c.source_id}:${c.path}`;
                const worst = c.tools.some((t) => t.risk === "consequential") ? "consequential" : c.tools.some((t) => t.risk === "write") ? "write" : "read";
                return (
                  <ListRow
                    key={`${c.source_id}:${c.path}`}
                    testId="catalog-plugin"
                    title={c.name}
                    meta={[`version ${c.version}`, `${c.tools.length} tool${c.tools.length === 1 ? "" : "s"}`, c.path || null]}
                    summary={c.description}
                    chips={<RiskChip risk={worst} />}
                    actions={
                      c.installed ? (
                        <Chip tone="success">Installed</Chip>
                      ) : isAdmin ? (
                        <button type="button" className={primaryButton} disabled={busy === key} onClick={() => install(c)}>
                          {busy === key ? "Installing…" : "Install"}
                        </button>
                      ) : null
                    }
                  />
                );
              })}
            </List>
          )}
        </ListSection>
      </div>

      <div className="mt-8">
        <ListSection id="sources" title="Sources" count={sources.length || undefined} description="Git repositories your plugins come from. Each is read at a pinned commit.">
          {sources.length > 0 && (
            <List label="Plugin sources" className="mb-4">
              {sources.map((s) => (
                <ListRow
                  key={s.id}
                  testId="plugin-source"
                  status={{ tone: s.error ? "danger" : "success" }}
                  title={s.repo}
                  externalHref={s.url}
                  meta={[
                    s.access === "public" ? "public repository" : "through your GitHub App",
                    trackText(s.track),
                    s.sha ? `at ${s.sha.slice(0, 12)}` : null,
                    `${s.plugins.length} plugin${s.plugins.length === 1 ? "" : "s"}`,
                  ]}
                  summary={s.error || undefined}
                  summaryTone={s.error ? "danger" : undefined}
                  time={s.checked_at}
                  actions={
                    isAdmin ? (
                      <>
                        <button type="button" className={secondaryButton} disabled={busy === `sync:${s.id}`} onClick={() => act(`sync:${s.id}`, () => pluginsApi.syncSource(s.id), "Checked for changes")}>
                          Check now
                        </button>
                        <button type="button" className={linkButton} onClick={() => removeSource(s)}>
                          Remove
                        </button>
                      </>
                    ) : null
                  }
                />
              ))}
            </List>
          )}
          {isAdmin ? <AddSource onAdded={load} /> : sources.length === 0 && <ListEmpty title="No sources yet">An admin adds them.</ListEmpty>}
        </ListSection>
      </div>

      {isAdmin && settings && (
        <div className="mt-8">
          <TeamSettings settings={settings} onSaved={load} />
        </div>
      )}
    </Page>
  );
}

function AddSource({ onAdded }: { onAdded: () => Promise<void> }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<TrackKind>("branch");
  const [value, setValue] = useState("main");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await pluginsApi.addSource(url.trim(), { kind, value: value.trim() });
      toast("Source added");
      setUrl("");
      await onAdded();
    } catch (e) {
      setError(errorOf(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      data-testid="add-source"
      className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        id="source-url"
        label="Repository"
        helper="A public GitHub address, or owner/name of a repository your GitHub App can read (private repositories stay private to your team)."
        error={error || undefined}
      >
        {(props) => (
          <input {...props} className={monoInputClass} placeholder="https://github.com/owner/plugins" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        )}
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-zinc-100">Follow</p>
          <Segmented
            label="Follow a branch, a tag or one commit"
            value={kind}
            options={[
              { value: "branch", label: "Branch" },
              { value: "tag", label: "Tag" },
              { value: "sha", label: "One commit" },
            ]}
            onChange={(v) => {
              setKind(v);
              setValue(v === "branch" ? "main" : "");
            }}
          />
        </div>
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <Field id="source-ref" label={kind === "sha" ? "Commit" : kind === "tag" ? "Tag" : "Branch"}>
            {(props) => <input {...props} className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </div>
      <div>
        <button type="submit" className={primaryButton} disabled={saving || !url.trim() || !value.trim()}>
          {saving ? "Adding…" : "Add source"}
        </button>
      </div>
    </form>
  );
}

/** What plugins may do without a person, and where briefs and approvals come in from Slack and Teams. */
function TeamSettings({ settings, onSaved }: { settings: TeamPluginSettings; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [cap, setCap] = useState(settings.autonomy_cap);
  const [slackTeam, setSlackTeam] = useState(settings.slack_team_id ?? "");
  const [slackSecret, setSlackSecret] = useState("");
  const [teamsSecret, setTeamsSecret] = useState("");
  const [path, setPath] = useState(settings.teams_webhook_path ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const saveCap = async (v: "read" | "write") => {
    setCap(v);
    try {
      await pluginsApi.saveSettings({ autonomy_cap: v });
      toast(v === "read" ? "Plugins only read without a person" : "Plugins may save drafts without a person");
    } catch (e) {
      setError(errorOf(e));
    }
  };
  const chatDirty = slackTeam.trim() !== (settings.slack_team_id ?? "") || !!slackSecret.trim() || !!teamsSecret.trim();
  const saveChat = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (slackTeam.trim() !== (settings.slack_team_id ?? "")) body.slack_team_id = slackTeam.trim();
      if (slackSecret.trim()) body.slack_signing_secret = slackSecret.trim();
      if (teamsSecret.trim()) body.teams_secret = teamsSecret.trim();
      const r = await pluginsApi.saveSettings(body);
      if (r.teams_webhook_path) setPath(r.teams_webhook_path);
      setSlackSecret("");
      setTeamsSecret("");
      toast("Chat settings saved");
      await onSaved();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ListSection id="team-settings" title="What may happen without a person" description="The most a plugin may do on its own. Publishing, sending and posting always wait for an approval.">
        <Segmented
          label="What plugins may do without a person"
          value={cap}
          options={[
            { value: "read", label: "Only read" },
            { value: "write", label: "Read and save drafts" },
          ]}
          onChange={saveCap}
        />
      </ListSection>
      <div className="mt-8">
        <ListSection
          id="chat"
          title="Briefs and approvals from chat"
          description="Cards for new drafts post to your team's Slack or Teams channel. To also take briefs from chat, let Coderhelm check that requests really come from your workspace."
        >
          <form
            data-testid="chat-settings"
            className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveChat();
            }}
          >
            <Field id="slack-team" label="Slack workspace id" helper="Starts with T. Requests from any other workspace are refused.">
              {(props) => <input {...props} className={monoInputClass} value={slackTeam} onChange={(e) => setSlackTeam(e.target.value)} placeholder="T0123ABCD" autoComplete="off" />}
            </Field>
            <Field
              id="slack-secret"
              label="Slack signing secret"
              helper={settings.slack_signing_secret_set ? "Saved. Enter a new one to replace it." : "From your Slack app's Basic Information page."}
            >
              {(props) => (
                <SecretInput {...props} className={inputClass} value={slackSecret} onChange={(e) => setSlackSecret(e.target.value)} placeholder={settings.slack_signing_secret_set ? "Saved" : ""} autoComplete="off" />
              )}
            </Field>
            <Field
              id="teams-secret"
              label="Teams outgoing webhook secret"
              helper={settings.teams_webhook_set ? "Saved. Enter a new one to replace it." : "Teams shows it once, when you create the outgoing webhook."}
            >
              {(props) => (
                <SecretInput {...props} className={inputClass} value={teamsSecret} onChange={(e) => setTeamsSecret(e.target.value)} placeholder={settings.teams_webhook_set ? "Saved" : ""} autoComplete="off" />
              )}
            </Field>
            <p className="text-sm text-zinc-400" data-testid="slack-command-url">
              In your Slack app, set the slash command&apos;s Request URL to <Code>{`${apiOrigin()}/webhooks/slack/plugins`}</Code>
            </p>
            {path && (
              <p className="text-sm text-zinc-400" data-testid="teams-webhook-path">
                In Teams, paste this as the outgoing webhook&apos;s address: <Code>{path.startsWith("http") ? path : `${apiOrigin()}${path}`}</Code>
              </p>
            )}
            {error && <Refusal code={error.code} message={error.message} title="Not saved" />}
            <div>
              <button type="submit" className={primaryButton} disabled={saving || !chatDirty}>
                {saving ? "Saving…" : "Save chat settings"}
              </button>
            </div>
          </form>
        </ListSection>
      </div>
    </>
  );
}
