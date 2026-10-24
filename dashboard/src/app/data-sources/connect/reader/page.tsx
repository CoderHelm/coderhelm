"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { READER_CHECKS, errorMessage, runningChecks, toCheckItems } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { CheckList, type CheckItem } from "@/components/check-list";
import { Field, SecretInput } from "@/components/field";
import { MarkdownEditor } from "@/components/markdown-editor";
import { FlowShell } from "@/components/data-source-flow-shell";
import { inputClass, primaryButton } from "@/components/ui";

export default function ConnectReaderPageGuarded() {
  return (
    <RoleGuard need="data_sources">
      <Suspense fallback={null}>
        <ConnectReaderPage />
      </Suspense>
    </RoleGuard>
  );
}

const HUB = "/data-sources";
const STEPS = [{ id: "connect", label: "Connect and check" }];

/** Split a typed list ("a, b" or one per line) into its entries. */
const entries = (s: string) =>
  s
    .split(/[,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * A REST API or OpenSearch cluster: where it is, the key, what agents may
 * read and a guide for them. Connecting checks one real read first; nothing
 * is saved if it fails.
 */
function ConnectReaderPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const kind = params.get("kind") === "search" ? "search" : "rest";
  const rest = kind === "rest";
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headerName, setHeaderName] = useState("X-Api-Key");
  const [paths, setPaths] = useState("");
  const [user, setUser] = useState("");
  const [indexes, setIndexes] = useState("");
  const [key, setKey] = useState("");
  const [guide, setGuide] = useState("");
  const [useNow, setUseNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<CheckItem[] | null>(null);

  const missing = !name.trim() || !url.trim() || !key.trim() || (rest ? entries(paths).length === 0 : !user.trim());

  const connect = async () => {
    setSaving(true);
    setError("");
    setChecks(runningChecks(READER_CHECKS));
    try {
      const res = await api.createDataSourceReader(kind, {
        name: name.trim(),
        url: url.trim(),
        key: key.trim(),
        instructions: guide,
        ...(rest ? { header_name: headerName.trim(), paths: entries(paths) } : { user: user.trim(), indexes: entries(indexes) }),
        ...(useNow ? { enabled: true } : {}),
      } as Parameters<typeof api.createDataSourceReader>[1]);
      if (res.ok) {
        setKey("");
        toast(`${res.source.name} connected${res.source.enabled ? " and on" : ". Turn it on when you're ready"}`);
        router.push(HUB);
        return;
      }
      setChecks(res.checks ? toCheckItems(res.checks, READER_CHECKS) : null);
      setError(`${res.error} Nothing was saved.`);
    } catch (e) {
      setChecks(null);
      setError(`We couldn't connect it (${errorMessage(e, "the request failed")}). Nothing was saved.`);
    } finally {
      setSaving(false);
    }
  };

  const text = (id: string, label: string, value: string, set: (v: string) => void, helper?: string, placeholder?: string, mono = false) => (
    <Field id={id} label={label} helper={helper}>
      {(p) => (
        <input
          {...p}
          className={`${inputClass}${mono ? " font-mono" : ""}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => set(e.target.value)}
          autoComplete="off"
        />
      )}
    </Field>
  );

  return (
    <FlowShell
      step="connect"
      steps={STEPS}
      title={rest ? "Connect a REST API" : "Connect an OpenSearch cluster"}
      back={{ href: HUB, label: "Data sources" }}
    >
      <p className="text-sm text-zinc-400">
        {rest
          ? "Coderhelm only sends GET requests, and only under the paths you list. What comes back has emails, phone numbers, addresses and keys hidden."
          : "Coderhelm only lists, searches and counts; scripts are refused. Use a user with read-only access to the indexes agents may search."}
      </p>
      <form
        className="flex max-w-2xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !saving) connect();
        }}
      >
        {text("reader-name", "Name", name, setName, "How agents and your team refer to it, like Bookings.", rest ? "Bookings" : "Search")}
        {text("reader-url", rest ? "API address" : "Cluster address", url, setUrl, undefined, rest ? "https://api.example.com" : "https://search.example.com")}
        {rest ? (
          <>
            {text("reader-header", "Key header", headerName, setHeaderName, "The header the API expects the key in, like X-Api-Key or Authorization.")}
            {text("reader-paths", "Paths agents may read", paths, setPaths, "One or more path prefixes, like /v1/orders. Agents can GET these and anything under them, nothing else. The first one is used for the check.", "/v1/orders, /v1/customers", true)}
          </>
        ) : (
          <>
            {text("reader-user", "User", user, setUser, "A user with read-only access. Coderhelm sees what it can see.")}
            {text("reader-indexes", "Indexes", indexes, setIndexes, "Index names or patterns agents may read, like orders or logs-*. Leave empty for every index the user sees.", "orders, logs-*", true)}
          </>
        )}
        <Field id="reader-key" label={rest ? "API key" : "Password"} helper="Encrypted for your team. It can be replaced but never shown.">
          {(p) => <SecretInput {...p} className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}
        </Field>
        <Field
          id="reader-guide"
          label="Guide for agents"
          helper="What agents should know when they use it: what the system is, what its fields mean, where else its data lives. Optional; you can add it later."
        >
          {(p) => (
            <MarkdownEditor
              {...p}
              variant="instructions"
              minRows={5}
              maxLength={4000}
              value={guide}
              onChange={setGuide}
              previewNote="Agents get this text as written with the source."
              placeholder={rest ? "quantity on a product is sessions per week on weekly packs, but the session count on season packs." : "schedule_class holds one document per class; facility_id is the class's own."}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={useNow} onChange={(e) => setUseNow(e.target.checked)} />
          Let agents use it once the check passes
        </label>
        {checks && <CheckList items={checks} label="Checks" />}
        {error && (
          <Callout variant="error" title="It didn't connect">
            <p>{error}</p>
          </Callout>
        )}
        <div>
          <button type="submit" disabled={missing || saving} className={primaryButton}>
            {saving ? "Checking…" : "Check and connect"}
          </button>
        </div>
      </form>
    </FlowShell>
  );
}
