"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Page,
  PageHeader,
  Section,
  SectionHeading,
  cardClass,
} from "@/components/page";
import { Callout } from "@/components/callout";
import { CopyButton } from "@/components/copy-button";
import { CodeBlock } from "@/components/code-block";
import { Disclosure } from "@/components/disclosure";
import { Modal, modalActions } from "@/components/modal";
import { useConfirm } from "@/components/confirm-dialog";
import { ListError } from "@/components/list";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import { StepDot } from "@/components/stepper";
import { Code } from "@/components/settings/code";
import { LogoStack } from "@/components/knowledge/logos";
import { useCan } from "@/hooks/use-can";
import {
  focusRing,
  inputClass,
  monoInputClass,
  primaryButton,
  secondaryButton,
  smallDangerButton,
  smallSecondaryButton,
} from "@/components/ui";
import { relativeTime, shortDate } from "@/lib/team";
import { apiBase } from "@/lib/runtime-config";
import {
  knowledge,
  sourceKindLabel,
  type Base as KnowledgeBase,
} from "@/lib/knowledge";
import {
  bedrockApi,
  gatewayConfig,
  testConnection,
  type AccountKnowledgeBases,
  type ConnectInfo,
  type KeyList,
  type KnowledgeKey,
  type SetupView,
  type SyncPage,
  type SyncTarget,
  type TestResult,
} from "@/lib/bedrock";

// Use in Bedrock: two ways for Amazon Bedrock to use the team's knowledge,
// laid out by what the admin wants, not how it works.
// - Live: an AgentCore Gateway signs in to Coderhelm's MCP server with a
//   connection (a client ID and secret made here; the gateway calls them a
//   credential provider) and searches what the connection's maker can read.
// - Copied: chosen knowledge bases are kept in a Bedrock knowledge base in
//   the team's own AWS account. On a self-hosted install one button opens the
//   export stack with everything filled in, and the stack reports back.

export default function BedrockPage() {
  const { ready, can } = useCan();
  const details = useBaseDetails();
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  if (ready && !can("knowledge_manage")) {
    return (
      <Page narrow testId="bedrock-page">
        <PageHeader title="Use in Bedrock" />
        <p className="mt-6 text-sm text-zinc-400">
          Only people who manage knowledge bases set this up. Ask an admin.
        </p>
      </Page>
    );
  }
  return (
    <Page testId="bedrock-page">
      <PageHeader
        title="Use in Bedrock"
        lead="Two ways for Amazon Bedrock to use your team's knowledge. Pick the one that fits what you're building; you can use both."
        actions={
          <Link href="/knowledge/" className={secondaryButton}>
            Back to Knowledge
          </Link>
        }
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2" data-testid="goal-cards">
        <GoalCard
          href="#live"
          title="Let Bedrock agents search your knowledge live"
          body="Your AgentCore Gateway calls Coderhelm's knowledge_search tool. Nothing is copied, so agents always read the latest version, and only what the connection's maker can read in Chat."
          best="Agents built on AgentCore."
          status={
            liveCount === null
              ? null
              : liveCount === 0
                ? "Not connected yet"
                : `${liveCount} active connection${liveCount === 1 ? "" : "s"}`
          }
          cta="Connect a gateway"
          testId="goal-live"
        />
        <GoalCard
          href="#copy"
          title="Copy into a Bedrock knowledge base"
          body="Chosen knowledge bases are kept in a Bedrock knowledge base in your own AWS account, and follow every change. Everyone with Bedrock access to it reads all of it."
          best="Bedrock's Retrieve, RetrieveAndGenerate and apps that only use Bedrock."
          status={copyState}
          cta="Set up copying"
          testId="goal-copy"
        />
      </div>
      <LiveSection details={details} onCount={setLiveCount} />
      <CopySection details={details} onState={setCopyState} />
    </Page>
  );
}

function GoalCard({
  href,
  title,
  body,
  best,
  status,
  cta,
  testId,
}: {
  href: string;
  title: string;
  body: string;
  best: string;
  status: string | null;
  cta: string;
  testId: string;
}) {
  return (
    <a
      href={href}
      className={`${cardClass} group flex flex-col gap-2 transition-colors hover:border-zinc-600 ${focusRing}`}
      data-testid={testId}
    >
      <span className="text-base font-semibold text-zinc-100">{title}</span>
      <span className="text-sm text-zinc-400">{body}</span>
      <span className="text-sm text-zinc-400">
        <span className="text-zinc-300">Best for:</span> {best}
      </span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
        <span
          className="text-xs text-zinc-400"
          data-testid={`${testId}-status`}
        >
          {status ?? ""}
        </span>
        <span className="text-sm font-medium text-zinc-100 group-hover:underline">
          {cta}
        </span>
      </span>
    </a>
  );
}

// ── What each knowledge base is: its sources' icons and its pages ───

interface BaseDetail {
  kinds: string[];
  files: number;
  sources: string[];
}

function useBaseDetails(): Record<string, BaseDetail> {
  const [map, setMap] = useState<Record<string, BaseDetail>>({});
  useEffect(() => {
    knowledge
      .list()
      .then((r) => {
        const out: Record<string, BaseDetail> = {};
        for (const b of (r.bases ?? []) as KnowledgeBase[]) {
          out[b.id] = {
            kinds: b.kinds ?? [],
            files: b.files ?? 0,
            sources: (b.sources ?? []).map((s) => s.name).filter(Boolean),
          };
        }
        setMap(out);
      })
      .catch(() => setMap({}));
  }, []);
  return map;
}

function baseLine(d: BaseDetail | undefined): string {
  if (!d) return "";
  const pages = `${d.files.toLocaleString()} page${d.files === 1 ? "" : "s"}`;
  const from = d.sources.length
    ? d.sources.join(", ")
    : d.kinds.map(sourceKindLabel).filter(Boolean).join(", ");
  return from ? `${pages} from ${from}` : pages;
}

/** A list of knowledge bases to tick, with "Select all". */
function BasePicker({
  legend,
  bases,
  details,
  picked,
  onChange,
  note,
  idPrefix,
}: {
  legend: string;
  bases: {
    id: string;
    name: string;
    disabled?: boolean;
    disabledWhy?: string;
    warn?: string;
  }[];
  details: Record<string, BaseDetail>;
  picked: string[];
  onChange: (ids: string[]) => void;
  note?: string;
  idPrefix: string;
}) {
  const open = bases.filter((b) => !b.disabled).map((b) => b.id);
  const all = open.length > 0 && open.every((id) => picked.includes(id));
  return (
    <fieldset className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-medium text-zinc-100">{legend}</legend>
        {open.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              className={`h-4 w-4 accent-blue-500 ${focusRing}`}
              checked={all}
              onChange={(e) => onChange(e.target.checked ? open : [])}
              data-testid={`${idPrefix}-all`}
            />
            Select all
          </label>
        )}
      </div>
      {bases.length === 0 ? (
        <p className="text-sm text-zinc-400">
          {note ?? "There are no knowledge bases to choose yet."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {bases.map((b) => {
            const d = details[b.id];
            return (
              <li key={b.id}>
                <label
                  htmlFor={`${idPrefix}-${b.id}`}
                  className={`flex min-w-0 items-start gap-3 p-3 ${b.disabled ? "" : "cursor-pointer hover:bg-zinc-900"}`}
                >
                  <input
                    id={`${idPrefix}-${b.id}`}
                    type="checkbox"
                    className={`mt-1 h-4 w-4 shrink-0 accent-blue-500 ${focusRing}`}
                    disabled={b.disabled}
                    checked={picked.includes(b.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...picked, b.id]
                          : picked.filter((x) => x !== b.id),
                      )
                    }
                  />
                  <span className="shrink-0">
                    {d && d.kinds.length > 0 ? (
                      <LogoStack kinds={d.kinds} size="sm" max={3} />
                    ) : (
                      <span
                        className="block h-6 w-6 rounded-md border border-zinc-700"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-medium [overflow-wrap:anywhere] ${b.disabled ? "text-zinc-400" : "text-zinc-100"}`}
                    >
                      {b.name}
                    </span>
                    {d && (
                      <span className="block text-xs text-zinc-400 [overflow-wrap:anywhere]">
                        {baseLine(d)}
                      </span>
                    )}
                    {b.disabledWhy && (
                      <span className="block text-xs text-zinc-400">
                        {b.disabledWhy}
                      </span>
                    )}
                    {b.warn && (
                      <span className="block text-xs text-amber-300">
                        {b.warn}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function Row({
  label,
  value,
  testId,
  secret,
}: {
  label: string;
  value: string;
  testId?: string;
  secret?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-40 shrink-0 text-sm text-zinc-400">{label}</span>
      <span
        className={`min-w-0 flex-1 text-xs [overflow-wrap:anywhere] ${secret ? "font-semibold" : ""}`}
        data-testid={testId}
      >
        <Code>{value}</Code>
      </span>
      <CopyButton text={value} />
    </div>
  );
}

function expiryWords(
  k: Pick<KnowledgeKey, "expires_at">,
  now = Date.now(),
): string {
  if (!k.expires_at) return "Never expires";
  const d = shortDate(k.expires_at) ?? k.expires_at.slice(0, 10);
  return Date.parse(k.expires_at) <= now ? `Expired ${d}` : `Expires ${d}`;
}

// ── Live search through AgentCore Gateway ───────────────────────────

const WHY_CREDENTIAL =
  "AgentCore Gateway signs in to Coderhelm as a program, with a client ID and secret it keeps, so it needs a connection made here; signing in as yourself is for apps like Claude and Cursor, which open a browser for you.";

function LiveSection({
  details,
  onCount,
}: {
  details: Record<string, BaseDetail>;
  onCount: (n: number) => void;
}) {
  const [data, setData] = useState<KeyList | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<{
    token: string;
    client_id: string;
    connect: ConnectInfo;
    name: string;
  } | null>(null);
  const { confirm } = useConfirm();

  const load = useCallback(() => {
    setError("");
    bedrockApi
      .keys()
      .then((d) => {
        setData(d);
        onCount(d.keys.filter((k) => k.status === "active").length);
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Couldn't load the connections.",
        ),
      );
  }, [onCount]);
  useEffect(load, [load]);

  const revoke = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Revoke ${name}?`,
      message:
        "It stops working at once, along with any access token it already got. The gateway that uses it can no longer search your knowledge.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    try {
      await bedrockApi.revokeKey(id);
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The connection wasn't revoked.",
      );
    }
  };

  const live = (data?.keys ?? []).filter((k) => k.status === "active");
  const names = (ids: string[]) =>
    ids
      .map(
        (id) =>
          data?.bases.find((b) => b.id === id)?.name ??
          "a deleted knowledge base",
      )
      .join(", ");
  const atLimit = !!data && live.length >= data.limits.max_keys;

  return (
    <Section
      id="live"
      title="Let Bedrock agents search your knowledge live"
      description={
        <>
          Add Coderhelm to your Amazon Bedrock AgentCore Gateway as an MCP
          server target. Your agents get two tools, knowledge_search and
          knowledge_list, and read the knowledge bases you pick, live.
        </>
      }
    >
      {error && (
        <ListError title="Couldn't load the connections" onRetry={load}>
          {error}
        </ListError>
      )}
      {data && (
        <div className="space-y-6">
          <ol
            className={`${cardClass} space-y-5`}
            aria-label="Connect a gateway"
            data-testid="live-steps"
          >
            <li className="flex gap-3">
              <StepDot
                state={live.length > 0 ? "done" : "current"}
                number={1}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-zinc-100">
                  Create a connection for the gateway
                </p>
                <p
                  className="text-sm text-zinc-400"
                  data-testid="why-credential"
                >
                  {WHY_CREDENTIAL}
                </p>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => setCreating(true)}
                  disabled={atLimit}
                  data-testid="new-key"
                >
                  New connection
                </button>
                {atLimit && (
                  <p className="text-xs text-zinc-400">
                    A team can have {data.limits.max_keys} connections. Revoke
                    one to make another.
                  </p>
                )}
              </div>
            </li>
            <li className="flex gap-3">
              <StepDot
                state={live.length > 0 ? "current" : "upcoming"}
                number={2}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-zinc-100">
                  Add it to your gateway
                </p>
                <p className="text-sm text-zinc-400">
                  The setup is filled in for you when you create a connection.
                  Here it is with blanks for the client ID and secret.
                </p>
                <GatewaySetup connect={data.connect} />
              </div>
            </li>
            <li className="flex gap-3">
              <StepDot state="upcoming" number={3} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-zinc-100">Test it</p>
                <p className="text-sm text-zinc-400">
                  Right after you create a connection, Test the connection signs
                  in and searches the same way the gateway does.
                </p>
              </div>
            </li>
          </ol>

          <Disclosure summary="Coderhelm's addresses, for other MCP clients">
            <div className="space-y-3 pt-1" data-testid="connect-info">
              <Row
                label="MCP server address"
                value={data.connect.mcp_url}
                testId="mcp-url"
              />
              <Row
                label="Discovery address"
                value={data.connect.discovery_url}
              />
              <Row label="Token address" value={data.connect.token_endpoint} />
              <Row label="Scope" value={data.connect.scope} />
              <p className="text-xs text-zinc-400">
                A program can also send a connection&apos;s secret as an API
                key: header Authorization, value Bearer and the secret. Gateway
                can sign in as each person (OAuth authorization code) only with
                a client secret registered ahead of time, and the agent&apos;s
                own app then has to sign every person in; Coderhelm&apos;s
                sign-in for apps registers them without a secret, so a
                connection is the way for Gateway today.
              </p>
            </div>
          </Disclosure>

          <div>
            <SectionHeading level={3} count={data.keys.length}>
              Connections
            </SectionHeading>
            {data.keys.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400" data-testid="no-keys">
                No connections yet.
              </p>
            ) : (
              <ul
                className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800"
                aria-label="Connections"
              >
                {data.keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                    data-testid="key-row"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
                        {k.name}
                        <StatusChip status={k.status} />
                      </p>
                      <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">
                        Reads {names(k.bases)}
                      </p>
                      <p className="text-xs text-zinc-400 [overflow-wrap:anywhere]">
                        Made by {k.created_by} {relativeTime(k.created_at)} ·{" "}
                        {k.last_used_at
                          ? `Last used ${relativeTime(k.last_used_at)}`
                          : "Not used yet"}{" "}
                        · <span data-testid="key-expiry">{expiryWords(k)}</span>
                      </p>
                      <p className="text-xs text-zinc-400 [overflow-wrap:anywhere]">
                        Client ID <Code>{k.client_id}</Code> · Secret{" "}
                        <Code>{k.hint}</Code>
                      </p>
                    </div>
                    {k.status === "active" ? (
                      <button
                        type="button"
                        className={`${smallDangerButton} self-start`}
                        onClick={() => revoke(k.id, k.name)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="sr-only" data-testid="key-status">
                        {k.status === "revoked" ? "Revoked" : "Expired"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {data && (
        <NewConnection
          open={creating}
          onOpenChange={setCreating}
          bases={data.bases}
          details={details}
          maxDays={data.limits.max_expiry_days}
          onMade={(m) => {
            setMade(m);
            load();
          }}
        />
      )}
      {made && <ConnectionMade made={made} onClose={() => setMade(null)} />}
    </Section>
  );
}

function StatusChip({ status }: { status: KnowledgeKey["status"] }) {
  const style =
    status === "active"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "expired"
        ? "border-amber-500/40 text-amber-300"
        : "border-zinc-700 text-zinc-400";
  const words =
    status === "active"
      ? "Active"
      : status === "expired"
        ? "Expired"
        : "Revoked";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-normal ${style}`}
    >
      {words}
    </span>
  );
}

type SetupTab = "console" | "cli" | "json";

/** How to add Coderhelm to a gateway: console steps, AWS CLI, or JSON. */
function GatewaySetup({
  connect,
  clientId,
  secret,
}: {
  connect: ConnectInfo;
  clientId?: string;
  secret?: string;
}) {
  const [tab, setTab] = useState<SetupTab>("console");
  const id = clientId ?? "<client ID>";
  const sec = secret ?? "<client secret>";
  const cfg = useMemo(
    () => gatewayConfig(connect, id, sec),
    [connect, id, sec],
  );
  return (
    <div className="min-w-0 space-y-3" data-testid="gateway-setup">
      <Segmented
        label="How to set up the gateway"
        value={tab}
        onChange={setTab}
        options={[
          { value: "console", label: "Console steps" },
          { value: "cli", label: "AWS CLI" },
          { value: "json", label: "JSON" },
        ]}
      />
      {tab === "console" && (
        <ol
          className="list-decimal space-y-2 pl-5 text-sm text-zinc-300"
          data-testid="gateway-console"
        >
          <li>
            In the Amazon Bedrock AgentCore console, open <b>Identity</b> and
            add an <b>OAuth client</b> with a custom provider. Discovery URL:{" "}
            <Code>{connect.discovery_url}</Code>. Client ID: <Code>{id}</Code>.
            Client secret: <Code>{sec}</Code>.
          </li>
          <li>
            Open your gateway, choose <b>Add target</b>, and pick{" "}
            <b>MCP server</b>. Endpoint: <Code>{connect.mcp_url}</Code>.
          </li>
          <li>
            For outbound auth, choose <b>OAuth client</b>, the provider from
            step 1, grant type client credentials, and scope{" "}
            <Code>{connect.scope}</Code>.
          </li>
        </ol>
      )}
      {tab === "cli" && (
        <CodeBlock
          code={cfg.cli}
          lang="bash"
          title="AWS CLI"
          testId="gateway-cli"
        />
      )}
      {tab === "json" && (
        <CodeBlock
          code={cfg.json}
          lang="json"
          title="Credential provider and target"
          testId="gateway-json"
        />
      )}
    </div>
  );
}

function NewConnection({
  open,
  onOpenChange,
  bases,
  details,
  maxDays,
  onMade,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bases: KeyList["bases"];
  details: Record<string, BaseDetail>;
  maxDays: number;
  onMade: (m: {
    token: string;
    client_id: string;
    connect: ConnectInfo;
    name: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [days, setDays] = useState("90");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const daysId = useId();

  // Until the admin types a name, it says what the connection is for.
  const suggested = useMemo(() => {
    const chosen = bases
      .filter((b) => picked.includes(b.id))
      .map((b) => b.name);
    if (chosen.length === 0) return "AgentCore Gateway";
    const list =
      chosen.length <= 2
        ? chosen.join(" and ")
        : `${chosen[0]} and ${chosen.length - 1} more`;
    return `AgentCore Gateway: ${list}`.slice(0, 60);
  }, [bases, picked]);
  const shownName = named ? name : suggested;

  const until =
    days === "0" ? null : new Date(Date.now() + Number(days) * 86_400_000);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await bedrockApi.createKey({
        name: shownName.trim(),
        bases: picked,
        expires_in_days: days === "0" ? null : Number(days),
      });
      onOpenChange(false);
      setPicked([]);
      setNamed(false);
      onMade({
        token: r.token,
        client_id: r.key.client_id,
        connect: r.connect,
        name: r.key.name,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The connection wasn't created.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New connection"
      description="A client ID and secret for an AgentCore Gateway (or any program) to search your knowledge. It can only search and list knowledge, never change anything."
      wide="md"
      testId="new-key-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <div className={modalActions}>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={primaryButton}
            disabled={saving || picked.length === 0 || !shownName.trim()}
          >
            {saving ? "Creating…" : "Create connection"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <BasePicker
          legend="Knowledge bases it reads"
          idPrefix="kb"
          details={details}
          picked={picked}
          onChange={setPicked}
          note="There are no knowledge bases you can give a connection yet. Ones read with each person's own sign-in can't be: there is no person to sign in as."
          bases={bases.map((b) => ({
            id: b.id,
            name: b.name,
            warn: b.named_readers
              ? "Only named people read it in Coderhelm. The gateway's agents will read it too."
              : undefined,
          }))}
        />
        <div>
          <label htmlFor={nameId} className="mb-1 block text-sm text-zinc-200">
            Name
          </label>
          <input
            id={nameId}
            className={inputClass}
            value={shownName}
            maxLength={60}
            onChange={(e) => {
              setNamed(true);
              setName(e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-zinc-400">
            Shown in the list and in the team&apos;s log next to every search it
            makes.
          </p>
        </div>
        <div>
          <label htmlFor={daysId} className="mb-1 block text-sm text-zinc-200">
            Stops working
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
          <p className="mt-1 text-xs text-zinc-400" data-testid="expiry-help">
            {until
              ? `On ${until.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} the gateway's searches start failing, and you create a new connection and paste its secret into the gateway. Shorter is safer if the secret leaks.`
              : "It keeps working until you revoke it. Use this only where you can rotate the secret yourself."}
          </p>
        </div>
        <p className="text-xs text-zinc-400">
          The gateway reads these knowledge bases as you would in Chat, and
          stops when you leave the team or lose access. You can revoke it here
          at any time.
        </p>
        {error && <Callout variant="error">{error}</Callout>}
      </div>
    </Modal>
  );
}

function ConnectionMade({
  made,
  onClose,
}: {
  made: {
    token: string;
    client_id: string;
    connect: ConnectInfo;
    name: string;
  };
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Copy the secret now"
      description="Coderhelm keeps only a hash of it, so this is the one time you can see it."
      wide
      testId="key-made"
      footer={
        <div className={modalActions}>
          <button type="button" className={primaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <Row
            label="Client ID"
            value={made.client_id}
            testId="key-client-id"
          />
          <Row
            label="Client secret"
            value={made.token}
            testId="key-token"
            secret
          />
          <Row label="Token address" value={made.connect.token_endpoint} />
          <Row label="MCP server address" value={made.connect.mcp_url} />
        </div>
        <div className="space-y-2">
          <SectionHeading level={3}>Add it to your gateway</SectionHeading>
          <GatewaySetup
            connect={made.connect}
            clientId={made.client_id}
            secret={made.token}
          />
        </div>
        <TestPanel
          connect={made.connect}
          clientId={made.client_id}
          secret={made.token}
        />
      </div>
    </Modal>
  );
}

function TestPanel({
  connect,
  clientId,
  secret,
}: {
  connect: ConnectInfo;
  clientId: string;
  secret: string;
}) {
  const [query, setQuery] = useState("how do we deploy");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const qid = useId();
  const run = async () => {
    setBusy(true);
    setResult(null);
    setResult(
      await testConnection(
        connect,
        clientId,
        secret,
        query.trim() || "overview",
      ),
    );
    setBusy(false);
  };
  return (
    <div className="space-y-2" data-testid="test-panel">
      <SectionHeading level={3}>Test the connection</SectionHeading>
      <p className="text-sm text-zinc-400">
        Signs in with the client ID and secret and calls knowledge_search, the
        same way the gateway will.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={qid} className="sr-only">
          Search for
        </label>
        <input
          id={qid}
          className={`${inputClass} sm:flex-1`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={secondaryButton}
          onClick={run}
          disabled={busy}
          data-testid="test-connection"
        >
          {busy ? "Testing…" : "Test the connection"}
        </button>
      </div>
      {result && (
        <Callout variant={result.ok ? "success" : "error"} testId="test-result">
          <p>{result.message}</p>
          {result.passages.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {result.passages.map((p, i) => (
                <li key={i}>
                  {p.title}
                  {p.base && <span className="text-zinc-400"> · {p.base}</span>}
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}
    </div>
  );
}

// ── Copy into a Bedrock knowledge base ──────────────────────────────

const EMPTY_S3: Extract<SyncTarget, { kind: "s3" }> = {
  kind: "s3",
  bucket: "",
  prefix: "coderhelm/",
  region: "",
  knowledge_base_arn: "",
  data_source_id: "",
};
const EMPTY_CUSTOM: Extract<SyncTarget, { kind: "custom" }> = {
  kind: "custom",
  knowledge_base_arn: "",
  data_source_id: "",
};

type Mode = "new" | "existing" | "custom" | "manual";

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

const IN_PROGRESS = ["waiting", "started", "bucket"];

/** The setup card is shown while the stack runs, after it fails, and for a while after it is ready. */
function showSetup(
  s: SetupView | null | undefined,
  now = Date.now(),
): s is SetupView {
  if (!s || s.state === "replaced") return false;
  if (s.state === "ready")
    return now - Date.parse(s.updated_at || s.created_at) < 60 * 60_000;
  return true;
}

function CopySection({
  details,
  onState,
}: {
  details: Record<string, BaseDetail>;
  onState: (s: string | null) => void;
}) {
  const [data, setData] = useState<SyncPage | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("custom");
  const [s3, setS3] = useState(EMPTY_S3);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [existing, setExisting] = useState("");
  const [bases, setBases] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launchUrl, setLaunchUrl] = useState("");
  const [note, setNote] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const ackId = useId();
  const first = useRef(true);

  const load = useCallback(() => {
    setError("");
    bedrockApi
      .sync()
      .then((r) => {
        setData(r);
        if (first.current) {
          first.current = false;
          setBases(r.sync.bases);
          const t = r.sync.target;
          if (t.kind === "s3") {
            setS3(t);
            setMode("manual");
          } else if (t.kind === "custom") {
            setCustom(t);
            setMode("custom");
          } else {
            setMode(
              r.self_hosted
                ? r.one_click?.available
                  ? "new"
                  : "manual"
                : "custom",
            );
          }
        }
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't load copying."),
      );
  }, []);
  useEffect(load, [load]);

  const setup = data?.setup ?? null;
  const running = !!setup && IN_PROGRESS.includes(setup.state);
  const syncing = !!data?.sync.status.syncing;
  useEffect(() => {
    if (!running && !syncing) return;
    const t = setInterval(load, running ? 4000 : 5000);
    return () => clearInterval(t);
  }, [running, syncing, load]);

  useEffect(() => {
    if (!data) return onState(null);
    if (running) return onState("Setting up in AWS");
    onState(
      data.sync.enabled ? stateWords(data.sync.status) : "Not set up yet",
    );
  }, [data, running, onState]);

  const oneClick = data?.one_click?.available ? data.one_click : null;

  const startSetup = async () => {
    setSaving(true);
    setNote(null);
    // Opened now, while the click still counts, so a popup blocker lets it through.
    const win =
      typeof window !== "undefined"
        ? window.open("about:blank", "_blank")
        : null;
    try {
      const r = await bedrockApi.startSetup({
        bases,
        acknowledged: ack,
        create_knowledge_base: mode === "new",
        ...(mode === "existing" ? { knowledge_base_id: existing } : {}),
      });
      setLaunchUrl(r.launch_url);
      setData((d) => (d ? { ...d, setup: r.setup } : d));
      if (win) {
        win.opener = null;
        win.location.href = r.launch_url;
      }
    } catch (e) {
      win?.close();
      setNote({
        tone: "error",
        text: e instanceof Error ? e.message : "The setup link wasn't made.",
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelSetup = async () => {
    try {
      await bedrockApi.cancelSetup();
      setLaunchUrl("");
      load();
    } catch (e) {
      setNote({
        tone: "error",
        text: e instanceof Error ? e.message : "It wasn't cancelled.",
      });
    }
  };

  const save = async (enabled: boolean) => {
    setSaving(true);
    setNote(null);
    const target: SyncTarget = mode === "custom" ? custom : s3;
    try {
      const r = await bedrockApi.saveSync({
        enabled,
        target,
        bases: enabled ? bases : [],
        acknowledged: enabled && ack,
      });
      setData((d) =>
        d ? { ...d, sync: r.sync, role_update: r.role_update } : d,
      );
      setNote(
        r.check
          ? {
              tone: "warning",
              text: `Saved, but the check of the knowledge base didn't pass: ${r.check}`,
            }
          : {
              tone: "success",
              text: enabled
                ? "Saved. The first sync has started."
                : "Copying is off. Coderhelm is removing its copies from Bedrock.",
            },
      );
    } catch (e) {
      setNote({
        tone: "error",
        text: e instanceof Error ? e.message : "It wasn't saved.",
      });
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
      setNote({
        tone: "error",
        text: e instanceof Error ? e.message : "The sync didn't start.",
      });
    }
  };

  const s = data?.sync;
  const viaStack = mode === "new" || mode === "existing";
  const ready = ack && bases.length > 0 && (mode !== "existing" || !!existing);

  return (
    <Section
      id="copy"
      title="Copy into a Bedrock knowledge base"
      description="Keep chosen knowledge bases copied into an Amazon Bedrock knowledge base in your own AWS account, so anything built on Bedrock can retrieve from them. Added, changed and deleted documents follow on each sync."
    >
      {error && (
        <ListError title="Couldn't load copying" onRetry={load}>
          {error}
        </ListError>
      )}
      {data && s && (
        <div className="space-y-6">
          {s.enabled && (
            <div className={`${cardClass} space-y-2`} data-testid="sync-status">
              <p
                className="text-sm font-medium text-zinc-100"
                data-testid="sync-state"
              >
                {stateWords(s.status)}
              </p>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-zinc-400">Copying into</dt>
                <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
                  {targetWords(s.target)}
                </dd>
                <dt className="text-zinc-400">Last sync</dt>
                <dd className="text-zinc-200">
                  {s.status.last_sync_at
                    ? relativeTime(s.status.last_sync_at)
                    : "Not yet"}
                </dd>
                <dt className="text-zinc-400">Documents in Bedrock</dt>
                <dd className="text-zinc-200" data-testid="sync-documents">
                  {s.status.documents}
                </dd>
                {s.status.last_sync_at && (
                  <>
                    <dt className="text-zinc-400">Last sync changed</dt>
                    <dd className="text-zinc-200">
                      {s.status.added} added, {s.status.updated} updated,{" "}
                      {s.status.removed} removed
                    </dd>
                  </>
                )}
              </dl>
              {s.status.errors.length > 0 && (
                <Callout
                  variant="warning"
                  title="Problems in the last sync"
                  testId="sync-errors"
                >
                  <ul className="list-disc space-y-1 pl-4">
                    {s.status.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={smallSecondaryButton}
                  onClick={runNow}
                  disabled={syncing}
                  data-testid="sync-now"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  className={smallSecondaryButton}
                  disabled={saving}
                  onClick={() => save(false)}
                  data-testid="sync-off"
                >
                  Turn copying off
                </button>
              </div>
            </div>
          )}

          {showSetup(setup) && (
            <SetupProgress
              setup={setup}
              launchUrl={launchUrl}
              syncStarted={
                s.enabled &&
                (syncing ||
                  !!s.status.last_sync_at ||
                  s.status.state !== "never")
              }
              onCancel={cancelSetup}
              onRetry={startSetup}
              onManual={() => setMode("manual")}
              busy={saving}
            />
          )}

          {note && (
            <Callout variant={note.tone} testId="sync-note">
              {note.text}
            </Callout>
          )}

          <ChangeWrap collapsed={s.enabled}>
            <div className={`${cardClass} space-y-6`}>
              <div className="space-y-2">
                <StepTitle n={1}>Choose the knowledge bases to copy</StepTitle>
                <BasePicker
                  legend="Knowledge bases"
                  idPrefix="copy"
                  details={details}
                  picked={bases}
                  onChange={setBases}
                  bases={data.bases.map((b) => ({
                    id: b.id,
                    name: b.name,
                    disabled: !b.can_copy,
                    disabledWhy: b.can_copy
                      ? undefined
                      : "Connected in place, so it isn't copied.",
                    warn:
                      b.can_copy && b.named_readers
                        ? "Only named people read it in Coderhelm."
                        : undefined,
                  }))}
                />
              </div>

              <div className="space-y-2">
                <StepTitle n={2}>Confirm who can read the copies</StepTitle>
                <Callout
                  variant="warning"
                  title="Everyone with Bedrock access reads what is copied"
                  live={false}
                  testId="sync-warning"
                >
                  <p>{data.warning}</p>
                  <label
                    htmlFor={ackId}
                    className="mt-3 flex items-start gap-2"
                  >
                    <input
                      id={ackId}
                      type="checkbox"
                      className={`mt-0.5 h-4 w-4 accent-blue-500 ${focusRing}`}
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      data-testid="sync-ack"
                    />
                    <span>
                      I understand, and the people with access to that knowledge
                      base may read these knowledge bases.
                    </span>
                  </label>
                </Callout>
              </div>

              <div className="space-y-3">
                <StepTitle n={3}>
                  {viaStack ? "Set it up in AWS" : "Start copying"}
                </StepTitle>
                {data.self_hosted && (
                  <Segmented<Mode>
                    label="Where to copy"
                    value={mode}
                    onChange={(m) => setMode(m)}
                    options={[
                      ...(oneClick
                        ? [
                            {
                              value: "new" as Mode,
                              label: "A new knowledge base",
                            },
                            {
                              value: "existing" as Mode,
                              label: "An existing one",
                            },
                          ]
                        : []),
                      { value: "custom", label: "A custom data source" },
                      { value: "manual", label: "Enter it yourself" },
                    ]}
                  />
                )}
                {data.self_hosted &&
                  !oneClick &&
                  data.one_click &&
                  !data.one_click.available && (
                    <p
                      className="text-sm text-zinc-400"
                      data-testid="one-click-unavailable"
                    >
                      {data.one_click.reason} Deploy the export stack yourself
                      and enter its outputs.
                    </p>
                  )}

                {mode === "new" && oneClick && (
                  <div
                    className="space-y-2 text-sm text-zinc-400"
                    data-testid="new-kb-summary"
                  >
                    <p>
                      One stack in account <Code>{oneClick.account}</Code>,
                      region <Code>{oneClick.region}</Code> makes the bucket
                      only this install can write, a Bedrock knowledge base that
                      reads it, and a schedule that syncs it every 15 minutes.
                      It tells Coderhelm when it is ready: nothing to copy by
                      hand.
                    </p>
                    <p>
                      <span className="text-zinc-300">Storage:</span> Amazon S3
                      Vectors, the cheapest store Bedrock offers: you pay for
                      what is stored and searched, nothing while idle.{" "}
                      <span className="text-zinc-300">Embeddings:</span> Amazon
                      Titan Text Embeddings V2.{" "}
                      <span className="text-zinc-300">Cost:</span> usually under
                      $1 a month for a few thousand documents ($0.02 per million
                      tokens embedded, $0.06 per GB a month stored, $2.50 per
                      million searches).
                    </p>
                  </div>
                )}
                {mode === "existing" && (
                  <ExistingPicker
                    value={existing}
                    onChange={setExisting}
                    onManual={() => setMode("manual")}
                  />
                )}
                {mode === "custom" && (
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-400">
                      Add a data source of type Custom to the knowledge base in
                      the Bedrock console, then paste both here. Coderhelm adds
                      and removes documents in it directly
                      {data.self_hosted
                        ? ""
                        : " with your account's CoderHelmLogReader role"}
                      , so changes show in minutes.
                    </p>
                    <TextField
                      label="Knowledge base ARN"
                      value={custom.knowledge_base_arn}
                      onChange={(v) =>
                        setCustom((t) => ({ ...t, knowledge_base_arn: v }))
                      }
                      mono
                      testId="custom-kb"
                    />
                    <TextField
                      label="Data source ID"
                      value={custom.data_source_id}
                      onChange={(v) =>
                        setCustom((t) => ({ ...t, data_source_id: v }))
                      }
                      mono
                      testId="custom-ds"
                    />
                  </div>
                )}
                {mode === "manual" && (
                  <div className="space-y-3" data-testid="manual-fields">
                    <p className="text-sm text-zinc-400">
                      An AWS admin deploys the{" "}
                      <a
                        href={`${apiBase()}${bedrockApi.templatePath}`}
                        className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100"
                        data-testid="template-link"
                      >
                        export stack
                      </a>{" "}
                      in this install&apos;s account and enters what it outputs
                      here.
                    </p>
                    <TextField
                      label="Bucket"
                      value={s3.bucket}
                      onChange={(v) => setS3((t) => ({ ...t, bucket: v }))}
                      mono
                      testId="s3-bucket"
                    />
                    <TextField
                      label="Folder"
                      value={s3.prefix}
                      onChange={(v) => setS3((t) => ({ ...t, prefix: v }))}
                      mono
                    />
                    <TextField
                      label="Region"
                      value={s3.region}
                      onChange={(v) => setS3((t) => ({ ...t, region: v }))}
                      mono
                      help="Only without a knowledge base below: it is read from the knowledge base otherwise."
                    />
                    <TextField
                      label="Knowledge base ARN (optional)"
                      value={s3.knowledge_base_arn}
                      onChange={(v) =>
                        setS3((t) => ({ ...t, knowledge_base_arn: v }))
                      }
                      mono
                    />
                    <TextField
                      label="Data source ID (optional)"
                      value={s3.data_source_id}
                      onChange={(v) =>
                        setS3((t) => ({ ...t, data_source_id: v }))
                      }
                      mono
                    />
                  </div>
                )}

                {data.role_update && mode === "custom" && (
                  <Callout
                    variant="info"
                    title="Update the role in your AWS account"
                    live={false}
                    testId="role-update"
                  >
                    <p>
                      Coderhelm writes to this knowledge base with your
                      account&apos;s CoderHelmLogReader role. Its stack needs
                      the knowledge base in SyncKnowledgeBases once.
                    </p>
                    <a
                      href={data.role_update.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-zinc-200 underline underline-offset-2"
                    >
                      Open the update in the AWS console
                    </a>
                  </Callout>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {viaStack ? (
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={saving || !ready || running}
                      onClick={startSetup}
                      data-testid="setup-aws"
                    >
                      {saving ? "Opening AWS…" : "Set up in AWS"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={saving || !ready}
                      onClick={() => save(true)}
                      data-testid="sync-save"
                    >
                      {saving
                        ? "Saving…"
                        : s.enabled
                          ? "Save"
                          : "Start copying"}
                    </button>
                  )}
                  {!ready && (
                    <span
                      className="text-xs text-zinc-400"
                      data-testid="setup-needs"
                    >
                      {bases.length === 0
                        ? "Choose at least one knowledge base."
                        : !ack
                          ? "Confirm the warning first."
                          : "Pick a knowledge base from the list."}
                    </span>
                  )}
                  {viaStack && ready && (
                    <span className="text-xs text-zinc-400">
                      Opens the AWS console in a new tab. An AWS admin chooses
                      Create stack.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </ChangeWrap>
        </div>
      )}
    </Section>
  );
}

/** Once copying is on, what is copied and where folds away under one line. */
function ChangeWrap({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <Disclosure summary="Change what is copied, or where">
      {children}
    </Disclosure>
  );
}

function StepTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-300"
        aria-hidden="true"
      >
        {n}
      </span>
      {children}
    </h3>
  );
}

function targetWords(t: SyncTarget): string {
  if (t.kind === "s3")
    return t.knowledge_base_arn
      ? `${t.knowledge_base_arn.split("/").pop()} through s3://${t.bucket}/${t.prefix}`
      : `s3://${t.bucket}/${t.prefix}`;
  if (t.kind === "custom")
    return `${t.knowledge_base_arn.split("/").pop()}, data source ${t.data_source_id}`;
  return "Nowhere yet";
}

const SETUP_STEPS = [
  { id: "waiting", label: "Waiting for the stack" },
  { id: "started", label: "Creating the bucket" },
  { id: "bucket", label: "Knowledge base ready" },
  { id: "ready", label: "First sync started" },
] as const;

function SetupProgress({
  setup,
  launchUrl,
  syncStarted,
  onCancel,
  onRetry,
  onManual,
  busy,
}: {
  setup: SetupView;
  launchUrl: string;
  syncStarted: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onManual: () => void;
  busy: boolean;
}) {
  const order = ["waiting", "started", "bucket", "ready"];
  // Where it is: the step being worked on. Failed and expired setups stop
  // at the last step reached; a ready one is done.
  const at =
    setup.state === "ready" ? 4 : Math.max(0, order.indexOf(setup.state));
  const sub = (i: number): string => {
    if (i === 0)
      return at > 0
        ? "The stack checked the account and the link."
        : `An AWS admin chooses Create stack in ${setup.region}.`;
    if (i === 1)
      return at > 1 ? "Private, encrypted, written only by this install." : "";
    if (i === 2)
      return at > 2
        ? setup.creates_knowledge_base
          ? "S3 Vectors storage and the sync schedule are in place."
          : "The data source and its sync schedule are in place."
        : at === 2
          ? "Bedrock is creating it; this takes a few minutes."
          : "";
    return at > 3
      ? syncStarted
        ? "Coderhelm is copying the documents. Bedrock reads them on its next sync, within 15 minutes."
        : "Coderhelm queued the first copy."
      : "";
  };
  const failed = setup.state === "failed" || setup.state === "expired";
  return (
    <div
      className={`${cardClass} space-y-4`}
      data-testid="setup-progress"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-100">
            {setup.state === "ready"
              ? "Set up in AWS"
              : failed
                ? "The setup stopped"
                : "Setting up in AWS"}
          </p>
          <p className="text-xs text-zinc-400">
            Stack <Code>{setup.stack_name}</Code> in {setup.region}, started by{" "}
            {setup.created_by} {relativeTime(setup.created_at)}.
          </p>
        </div>
        {IN_PROGRESS.includes(setup.state) && (
          <div className="flex flex-wrap gap-2">
            {launchUrl && (
              <a
                href={launchUrl}
                target="_blank"
                rel="noreferrer"
                className={smallSecondaryButton}
                data-testid="setup-open"
              >
                Open the stack in AWS
              </a>
            )}
            <button
              type="button"
              className={smallSecondaryButton}
              onClick={onCancel}
              data-testid="setup-cancel"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <ol className="space-y-3" aria-label="Setup progress">
        {SETUP_STEPS.map((step, i) => {
          const state =
            i < at ? "done" : i === at && !failed ? "current" : "upcoming";
          const label =
            i === 2 && !setup.creates_knowledge_base
              ? "Data source ready"
              : step.label;
          return (
            <li
              key={step.id}
              className="flex gap-3"
              data-testid={`setup-step-${i}`}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <StepDot state={state} number={i + 1} />
              <div className="min-w-0">
                <p
                  className={`text-sm ${state === "upcoming" ? "text-zinc-400" : "font-medium text-zinc-100"}`}
                >
                  {label}
                  {state === "current" && (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      In progress
                    </span>
                  )}
                </p>
                {sub(i) && <p className="text-xs text-zinc-400">{sub(i)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {failed && (
        <Callout
          variant="error"
          title={
            setup.state === "expired"
              ? "The setup link expired"
              : "The stack failed"
          }
          testId="setup-error"
          actions={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={smallSecondaryButton}
                onClick={onRetry}
                disabled={busy}
                data-testid="setup-retry"
              >
                Try again
              </button>
              <button
                type="button"
                className={smallSecondaryButton}
                onClick={onManual}
              >
                Enter it yourself
              </button>
            </div>
          }
        >
          {setup.state === "expired"
            ? "The stack didn't report within two hours of the link being made. Start again; delete the old stack first if it was created."
            : setup.message ||
              "The stack failed and rolled back. Its events in the CloudFormation console say why."}
        </Callout>
      )}
    </div>
  );
}

function ExistingPicker({
  value,
  onChange,
  onManual,
}: {
  value: string;
  onChange: (id: string) => void;
  onManual: () => void;
}) {
  const [data, setData] = useState<AccountKnowledgeBases | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    bedrockApi
      .accountBases()
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Couldn't list the knowledge bases.",
        ),
      );
  }, []);
  if (error || data?.list_error) {
    return (
      <Callout
        variant="warning"
        title="The knowledge bases couldn't be listed"
        testId="existing-error"
        actions={
          <button
            type="button"
            className={smallSecondaryButton}
            onClick={onManual}
          >
            Enter it yourself
          </button>
        }
      >
        {error || `${data?.list_error?.message} ${data?.list_error?.fix}`}
      </Callout>
    );
  }
  if (!data)
    return (
      <p className="text-sm text-zinc-400">
        Listing the knowledge bases in this account…
      </p>
    );
  const bases = data.bases ?? [];
  if (bases.length === 0)
    return (
      <p className="text-sm text-zinc-400" data-testid="existing-none">
        There are no knowledge bases in account {data.install_account}, region{" "}
        {data.region}. Choose A new knowledge base.
      </p>
    );
  return (
    <fieldset className="space-y-2" data-testid="existing-picker">
      <legend className="mb-1 text-sm text-zinc-400">
        Knowledge bases in account {data.install_account}, region {data.region}.
        The stack adds an S3 data source, lets the knowledge base&apos;s role
        read the folder, and syncs it every 15 minutes.
      </legend>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {bases.map((b) => (
          <li key={b.id}>
            <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-zinc-900">
              <input
                type="radio"
                name="existing-kb"
                className={`mt-1 accent-blue-500 ${focusRing}`}
                checked={value === b.id}
                onChange={() => onChange(b.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
                  {b.name}
                </span>
                <span className="block text-xs text-zinc-400">
                  {b.id}
                  {b.status && b.status !== "ACTIVE"
                    ? ` · ${b.status.toLowerCase()}`
                    : ""}
                  {b.description ? ` · ${b.description}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  mono,
  help,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  help?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-zinc-200">
        {label}
      </label>
      <input
        id={id}
        className={mono ? monoInputClass : inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        data-testid={testId}
      />
      {help && <p className="mt-1 text-xs text-zinc-400">{help}</p>}
    </div>
  );
}
