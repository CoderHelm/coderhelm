"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { CopyButton } from "@/components/copy-button";
import { Modal, modalActions } from "@/components/modal";
import { useConfirm } from "@/components/confirm-dialog";
import { ListError } from "@/components/list";
import { Select } from "@/components/select";
import { Code } from "@/components/settings/code";
import { useCan } from "@/hooks/use-can";
import { focusRing, inputClass, monoInputClass, primaryButton, secondaryButton, smallDangerButton, smallSecondaryButton } from "@/components/ui";
import { relativeTime } from "@/lib/team";
import { apiBase } from "@/lib/runtime-config";
import { bedrockApi, type ConnectInfo, type KeyList, type SyncPage, type SyncTarget } from "@/lib/bedrock";

// Use in Bedrock: two ways for Amazon Bedrock to use the team's knowledge.
// Live, an AgentCore Gateway (or any MCP client) searches it through
// Coderhelm's MCP server with a knowledge key, and sees only what the key's
// maker can read in Chat. Copied, chosen knowledge bases are kept in a Bedrock
// knowledge base in the team's own AWS account, where everyone with Bedrock
// access reads them, so an admin picks which ones and confirms that first.

export default function BedrockPage() {
  const { ready, can } = useCan();
  if (ready && !can("knowledge_manage")) {
    return (
      <Page narrow testId="bedrock-page">
        <PageHeader title="Use in Bedrock" />
        <p className="mt-6 text-sm text-zinc-400">Only people who manage knowledge bases set this up. Ask an admin.</p>
      </Page>
    );
  }
  return (
    <Page testId="bedrock-page">
      <PageHeader
        title="Use in Bedrock"
        lead="Let Amazon Bedrock agents and knowledge bases use your team's knowledge: search it live, or keep chosen knowledge bases copied into your own AWS account."
        actions={
          <Link href="/knowledge/" className={secondaryButton}>
            Back to Knowledge
          </Link>
        }
      />
      <LiveSection />
      <CopySection />
    </Page>
  );
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-44 shrink-0 text-sm text-zinc-400">{label}</span>
      <span className="min-w-0 flex-1 text-xs" data-testid={testId}>
        <Code>{value}</Code>
      </span>
      <CopyButton text={value} />
    </div>
  );
}

// ── Live search over MCP ────────────────────────────────────────────

function LiveSection() {
  const [data, setData] = useState<KeyList | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<{ token: string; client_id: string; connect: ConnectInfo } | null>(null);
  const { confirm } = useConfirm();

  const load = useCallback(() => {
    setError("");
    bedrockApi
      .keys()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the keys."));
  }, []);
  useEffect(load, [load]);

  const revoke = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Revoke ${name}?`,
      message: "It stops working at once, along with any access token it already got. Anything that uses it can no longer search your knowledge.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    try {
      await bedrockApi.revokeKey(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The key wasn't revoked.");
    }
  };

  const live = (data?.keys ?? []).filter((k) => k.status === "active");
  const names = (ids: string[]) => ids.map((id) => data?.bases.find((b) => b.id === id)?.name ?? id).join(", ");

  return (
    <Section
      id="live"
      title="Search live from an agent"
      description="Coderhelm's MCP server has two knowledge tools, knowledge_search and knowledge_list. Add it as a target of an Amazon Bedrock AgentCore Gateway with a knowledge key, and your agents search the knowledge bases the key reads, live."
      actions={
        <button type="button" className={primaryButton} onClick={() => setCreating(true)} disabled={!data} data-testid="new-key">
          New knowledge key
        </button>
      }
    >
      {error && (
        <ListError title="Couldn't load the keys" onRetry={load}>
          {error}
        </ListError>
      )}
      {data && (
        <div className="space-y-4">
          <div className={`${cardClass} space-y-3`} data-testid="connect-info">
            <Row label="MCP server address" value={data.connect.mcp_url} testId="mcp-url" />
            <Row label="Token address (OAuth)" value={data.connect.token_endpoint} />
            <Row label="Discovery address" value={data.connect.discovery_url} />
            <Row label="Scope" value={data.connect.scope} />
            <p className="text-xs text-zinc-400">
              A key works two ways: as an API key sent in the Authorization header with the prefix Bearer, or as OAuth client credentials (its
              client ID and the key as the client secret). A key reads only the knowledge bases you give it, and only while you can still read
              them in Chat.
            </p>
          </div>
          {data.keys.length === 0 ? (
            <p className="text-sm text-zinc-400" data-testid="no-keys">
              No knowledge keys yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800" aria-label="Knowledge keys">
              {data.keys.map((k) => (
                <li key={k.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="key-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
                      {k.name} <Code>{k.hint}</Code>
                    </p>
                    <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                      Reads {names(k.bases)}. Client ID <Code>{k.client_id}</Code>.{" "}
                      {k.last_used_at ? `Used ${relativeTime(k.last_used_at)}.` : "Not used yet."}
                    </p>
                  </div>
                  {k.status === "active" ? (
                    <button type="button" className={smallDangerButton} onClick={() => revoke(k.id, k.name)}>
                      Revoke
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400" data-testid="key-status">
                      {k.status === "revoked" ? "Revoked" : "Expired"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {live.length >= data.limits.max_keys && <p className="text-xs text-zinc-400">A team can have {data.limits.max_keys} keys.</p>}
        </div>
      )}
      {data && (
        <NewKey
          open={creating}
          onOpenChange={setCreating}
          bases={data.bases}
          maxDays={data.limits.max_expiry_days}
          onMade={(m) => {
            setMade(m);
            load();
          }}
        />
      )}
      {made && (
        <Modal open onOpenChange={(o) => !o && setMade(null)} title="Copy your key now" description="Coderhelm keeps only a hash of it, so this is the one time you can see it." testId="key-made"
          footer={<div className={modalActions}><button type="button" className={primaryButton} onClick={() => setMade(null)}>Done</button></div>}>
          <div className="space-y-3">
            <Row label="Key" value={made.token} testId="key-token" />
            <Row label="Client ID" value={made.client_id} />
            <Row label="MCP server address" value={made.connect.mcp_url} />
            <p className="text-xs text-zinc-400">
              In AgentCore Identity, save it as an API key credential provider (header Authorization, prefix Bearer), or as an OAuth client with
              this client ID and the key as its secret. The guide has the commands.
            </p>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function NewKey({
  open,
  onOpenChange,
  bases,
  maxDays,
  onMade,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bases: KeyList["bases"];
  maxDays: number;
  onMade: (m: { token: string; client_id: string; connect: ConnectInfo }) => void;
}) {
  const [name, setName] = useState("Bedrock agents");
  const [picked, setPicked] = useState<string[]>([]);
  const [days, setDays] = useState("90");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const daysId = useId();

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await bedrockApi.createKey({ name, bases: picked, expires_in_days: days === "0" ? null : Number(days) });
      onOpenChange(false);
      setPicked([]);
      onMade({ token: r.token, client_id: r.key.client_id, connect: r.connect });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The key wasn't made.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New knowledge key"
      description="For a program that searches your knowledge, such as an AgentCore Gateway. It can only search and list knowledge."
      wide="md"
      testId="new-key-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <div className={modalActions}>
          <button type="button" className={secondaryButton} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={saving || picked.length === 0 || !name.trim()}>
            {saving ? "Making the key…" : "Make the key"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={nameId} className="mb-1 block text-sm text-zinc-200">
            Name
          </label>
          <input id={nameId} className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm text-zinc-200">Knowledge bases it reads</legend>
          {bases.length === 0 ? (
            <p className="text-sm text-zinc-400">There are no knowledge bases you can give a key yet.</p>
          ) : (
            <ul className="space-y-2">
              {bases.map((b) => (
                <li key={b.id} className="flex items-start gap-2">
                  <input
                    id={`kb-${b.id}`}
                    type="checkbox"
                    className={`mt-0.5 h-4 w-4 accent-blue-500 ${focusRing}`}
                    checked={picked.includes(b.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))}
                  />
                  <label htmlFor={`kb-${b.id}`} className="text-sm text-zinc-200">
                    {b.name}
                    {b.named_readers && <span className="block text-xs text-amber-300">Only named people read it in Coderhelm. Anyone who can use this key will read it.</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div>
          <label htmlFor={daysId} className="mb-1 block text-sm text-zinc-200">
            Expires
          </label>
          <Select
            id={daysId}
            className="w-full"
            value={days}
            onChange={setDays}
            options={[
              { value: "30", label: "In 30 days" },
              { value: "90", label: "In 90 days" },
              { value: String(maxDays), label: `In ${maxDays} days` },
              { value: "0", label: "Never" },
            ]}
          />
        </div>
        <p className="text-xs text-zinc-400">
          Whoever holds the key reads these knowledge bases as you would in Chat. It stops working if you leave the team, and you can revoke it
          here at any time. Every call is written to the team&apos;s log.
        </p>
        {error && <Callout variant="error">{error}</Callout>}
      </div>
    </Modal>
  );
}

// ── Copy into a Bedrock knowledge base ──────────────────────────────

const EMPTY_S3: SyncTarget = { kind: "s3", bucket: "", prefix: "coderhelm/", region: "", knowledge_base_arn: "", data_source_id: "" };
const EMPTY_CUSTOM: SyncTarget = { kind: "custom", knowledge_base_arn: "", data_source_id: "" };

function stateWords(s: SyncPage["sync"]["status"]): string {
  if (s.syncing) return "Syncing now";
  switch (s.state) {
    case "ok":
      return "Up to date";
    case "partial":
      return "Synced, with problems";
    case "failed":
      return "The last sync failed";
    default:
      return "Not synced yet";
  }
}

function CopySection() {
  const [data, setData] = useState<SyncPage | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<SyncTarget>(EMPTY_CUSTOM);
  const [bases, setBases] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);
  const ackId = useId();

  const load = useCallback(() => {
    setError("");
    bedrockApi
      .sync()
      .then((r) => {
        setData(r);
        setBases(r.sync.bases);
        setTarget(r.sync.target.kind === "none" ? (r.self_hosted ? EMPTY_S3 : EMPTY_CUSTOM) : r.sync.target);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the sync."));
  }, []);
  useEffect(load, [load]);

  const syncing = !!data?.sync.status.syncing;
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [syncing, load]);

  const save = async (enabled: boolean) => {
    setSaving(true);
    setNote(null);
    try {
      const r = await bedrockApi.saveSync({ enabled, target, bases: enabled ? bases : [], acknowledged: enabled && ack });
      setData((d) => (d ? { ...d, sync: r.sync, role_update: r.role_update } : d));
      setNote(
        r.check
          ? { tone: "warning", text: `Saved, but the check of the knowledge base didn't pass: ${r.check}` }
          : { tone: "success", text: enabled ? "Saved. The first sync has started." : "Copying is off. Coderhelm is removing its copies from Bedrock." },
      );
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : "It wasn't saved." });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      await bedrockApi.runSync();
      setNote({ tone: "success", text: "A sync has started." });
      setTimeout(load, 1500);
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : "The sync didn't start." });
    }
  };

  const set = (k: string, v: string) => setTarget((t) => ({ ...t, [k]: v }) as SyncTarget);
  const s = data?.sync;

  return (
    <Section
      id="copy"
      title="Copy into a Bedrock knowledge base"
      description="Keep chosen knowledge bases copied into an Amazon Bedrock knowledge base in your own AWS account, so anything built on Bedrock can retrieve from them. Added, changed and deleted documents follow on each sync."
    >
      {error && (
        <ListError title="Couldn't load the sync" onRetry={load}>
          {error}
        </ListError>
      )}
      {data && s && (
        <div className="space-y-4">
          {s.enabled && (
            <div className={`${cardClass} space-y-2`} data-testid="sync-status">
              <p className="text-sm font-medium text-zinc-100" data-testid="sync-state">
                {stateWords(s.status)}
              </p>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-zinc-400">Last sync</dt>
                <dd className="text-zinc-200">{s.status.last_sync_at ? relativeTime(s.status.last_sync_at) : "Not yet"}</dd>
                <dt className="text-zinc-400">Documents in Bedrock</dt>
                <dd className="text-zinc-200" data-testid="sync-documents">
                  {s.status.documents}
                </dd>
                {s.status.last_sync_at && (
                  <>
                    <dt className="text-zinc-400">Last sync changed</dt>
                    <dd className="text-zinc-200">
                      {s.status.added} added, {s.status.updated} updated, {s.status.removed} removed
                    </dd>
                  </>
                )}
              </dl>
              {s.status.errors.length > 0 && (
                <Callout variant="warning" title="Problems in the last sync" testId="sync-errors">
                  <ul className="list-disc space-y-1 pl-4">
                    {s.status.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <button type="button" className={smallSecondaryButton} onClick={runNow} disabled={syncing} data-testid="sync-now">
                Sync now
              </button>
            </div>
          )}

          <fieldset className={`${cardClass} space-y-3`}>
            <legend className="px-1 text-sm font-medium text-zinc-100">Where to copy</legend>
            <div className="flex flex-wrap gap-4">
              {data.self_hosted && (
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input type="radio" name="target" className={`accent-blue-500 ${focusRing}`} checked={target.kind === "s3"} onChange={() => setTarget(EMPTY_S3)} />
                  An S3 folder in this install&apos;s account
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input type="radio" name="target" className={`accent-blue-500 ${focusRing}`} checked={target.kind === "custom"} onChange={() => setTarget(EMPTY_CUSTOM)} />
                A custom data source, pushed directly
              </label>
            </div>
            {target.kind === "s3" && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">
                  An AWS admin deploys the{" "}
                  <a href={`${apiBase()}${bedrockApi.templatePath}`} className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100" data-testid="template-link">
                    export stack
                  </a>{" "}
                  in this install&apos;s account. It makes the bucket only this install can write, and can add the S3 data source and sync it every
                  15 minutes. Paste what it outputs here.
                </p>
                <TextField label="Bucket" value={target.bucket} onChange={(v) => set("bucket", v)} mono testId="s3-bucket" />
                <TextField label="Folder" value={target.prefix} onChange={(v) => set("prefix", v)} mono />
                <TextField label="Region" value={target.region} onChange={(v) => set("region", v)} mono help="Only without a knowledge base below: it is read from the knowledge base otherwise." />
                <TextField label="Knowledge base ARN (optional)" value={target.knowledge_base_arn} onChange={(v) => set("knowledge_base_arn", v)} mono />
                <TextField label="Data source ID (optional)" value={target.data_source_id} onChange={(v) => set("data_source_id", v)} mono />
              </div>
            )}
            {target.kind === "custom" && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Add a data source of type Custom to the knowledge base in the Bedrock console, then paste both here. Coderhelm adds and removes
                  documents in it directly{data.self_hosted ? "" : " with your account's CoderHelmLogReader role"}, so changes show in minutes.
                </p>
                <TextField label="Knowledge base ARN" value={target.knowledge_base_arn} onChange={(v) => set("knowledge_base_arn", v)} mono testId="custom-kb" />
                <TextField label="Data source ID" value={target.data_source_id} onChange={(v) => set("data_source_id", v)} mono testId="custom-ds" />
              </div>
            )}
          </fieldset>

          <fieldset className={`${cardClass} space-y-2`}>
            <legend className="px-1 text-sm font-medium text-zinc-100">Knowledge bases to copy</legend>
            <ul className="space-y-2">
              {data.bases.map((b) => (
                <li key={b.id} className="flex items-start gap-2">
                  <input
                    id={`copy-${b.id}`}
                    type="checkbox"
                    className={`mt-0.5 h-4 w-4 accent-blue-500 ${focusRing}`}
                    disabled={!b.can_copy}
                    checked={bases.includes(b.id)}
                    onChange={(e) => setBases((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))}
                  />
                  <label htmlFor={`copy-${b.id}`} className={`text-sm ${b.can_copy ? "text-zinc-200" : "text-zinc-400"}`}>
                    {b.name}
                    {!b.can_copy && <span className="block text-xs text-zinc-400">Connected in place, so it isn&apos;t copied.</span>}
                    {b.can_copy && b.named_readers && <span className="block text-xs text-amber-300">Only named people read it in Coderhelm.</span>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <Callout variant="warning" title="Everyone with Bedrock access reads what is copied" live={false} testId="sync-warning">
            <p>{data.warning}</p>
            <label htmlFor={ackId} className="mt-3 flex items-start gap-2">
              <input id={ackId} type="checkbox" className={`mt-0.5 h-4 w-4 accent-blue-500 ${focusRing}`} checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="sync-ack" />
              <span>I understand, and the people with access to that knowledge base may read these knowledge bases.</span>
            </label>
          </Callout>

          {data.role_update && (
            <Callout variant="info" title="Update the role in your AWS account" live={false} testId="role-update">
              <p>Coderhelm writes to this knowledge base with your account&apos;s CoderHelmLogReader role. Its stack needs the knowledge base in SyncKnowledgeBases once.</p>
              <a href={data.role_update.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-zinc-200 underline underline-offset-2">
                Open the update in the AWS console
              </a>
            </Callout>
          )}

          {note && (
            <Callout variant={note.tone} testId="sync-note">
              {note.text}
            </Callout>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {s.enabled && (
              <button type="button" className={secondaryButton} disabled={saving} onClick={() => save(false)} data-testid="sync-off">
                Turn copying off
              </button>
            )}
            <button type="button" className={primaryButton} disabled={saving || !ack || bases.length === 0} onClick={() => save(true)} data-testid="sync-save">
              {saving ? "Saving…" : s.enabled ? "Save" : "Start copying"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function TextField({ label, value, onChange, mono, help, testId }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; help?: string; testId?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-zinc-200">
        {label}
      </label>
      <input id={id} className={mono ? monoInputClass : inputClass} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} data-testid={testId} />
      {help && <p className="mt-1 text-xs text-zinc-400">{help}</p>}
    </div>
  );
}
