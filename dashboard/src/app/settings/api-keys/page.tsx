"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader, SectionHeading, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Chip, List, ListRow, StatusText, formatDate } from "@/components/list";
import { ChevronRightIcon, KeyIcon } from "@/components/icons";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { Code } from "@/components/settings/code";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { relativeTime } from "@/lib/team";
import { apiOrigin } from "@/lib/runtime-config";
import {
  API_DOCS_URL,
  apiKeysApi,
  curlExample,
  reviewText,
  type ApiKey,
  type ApiKeyList,
} from "@/lib/api-keys";
import {
  buttonClass,
  focusRing,
  fullWidthOnPhone,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
  smallDangerButton,
} from "@/components/ui";
import { Select } from "@/components/select";

export default function ApiKeysPageGuarded() {
  return (
    <RoleGuard need="api_keys">
      <ApiKeysPage />
    </RoleGuard>
  );
}

const EXPIRY_CHOICES: { value: string; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

function ApiKeysPage() {
  const { can } = useCan();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<ApiKeyList | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<{ key: ApiKey; token: string } | null>(null);
  const canManage = can("api_keys");

  const load = useCallback(() => {
    apiKeysApi
      .list()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The request failed."));
  }, []);
  useEffect(load, [load]);

  const revoke = async (key: ApiKey) => {
    const ok = await confirm({
      title: `Revoke "${key.name}"?`,
      message: "Programs using this key stop working at once. This can't be undone; make a new key if you need one again.",
      confirmLabel: "Revoke key",
      destructive: true,
    });
    if (ok !== "primary") return;
    try {
      await apiKeysApi.revoke(key.id);
      toast(`Revoked "${key.name}".`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not revoke the key.", "error");
    }
  };

  const live = data?.keys.filter((k) => k.status === "active") ?? [];
  // Live keys made before two-factor sign-in was required.
  const reviewed = live.filter((k) => k.two_factor_review);
  // Scopes as people read them ("Runs"), not their keys ("runs").
  const scopeLabels = Object.fromEntries((data?.scopes ?? []).map((sc) => [sc.key, sc.label]));
  const past = data?.keys.filter((k) => k.status !== "active") ?? [];

  return (
    <Page>
      <PageHeader
        title="API keys"
        lead={
          <>
            <p>
              Only needed if someone on your team connects their own scripts to Coderhelm. Keys let those programs call the
              Coderhelm API: list runs, retry or cancel them, make and run plans, read reviews and check usage. A key can do
              only what its scopes allow, and never more than the person who made it.
            </p>
            <p className="mt-2">
              <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className={linkButton}>
                Read the API reference
              </a>
            </p>
          </>
        }
        actions={
          canManage && data ? (
            <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
              Create key
            </button>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-6">
        {error && (
          <Problem title="Couldn't load the keys" onRetry={load} details={error}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        )}

        {!data && !error && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading keys">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}

        {data && (
          <section aria-labelledby="keys-live">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <SectionHeading id="keys-live" count={live.length}>
                Active keys
              </SectionHeading>
              {canManage && live.length > 0 && (
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setCreating(true)}>
                  Create key
                </button>
              )}
            </div>
            {reviewed.length > 0 && (
              <div className="mb-3">
                <Callout variant="warning" title="Keys made before two-factor sign-in was required" testId="keys-before-2fa">
                  {reviewed.length === 1 ? "One key was" : `${reviewed.length} keys were`} made before your organization
                  required two-factor sign-in. A key never signs in, so the rule doesn&apos;t hold it back, and it may have
                  been made from a session without a second factor. Check {reviewed.length === 1 ? "it" : "them"} and revoke
                  any you don&apos;t recognize.
                </Callout>
              </div>
            )}
            {live.length === 0 ? (
              <EmptyState
                icon={<KeyIcon />}
                title="No active keys."
                action={
                  canManage ? (
                    <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
                      Create key
                    </button>
                  ) : undefined
                }
              >
                Create one for each program that calls the API, so you can revoke one without touching the others.
              </EmptyState>
            ) : (
              <List label="Active keys">
                {live.map((k) => (
                  <KeyRow key={k.id} apiKey={k} scopeLabels={scopeLabels} onRevoke={canManage ? () => revoke(k) : undefined} />
                ))}
              </List>
            )}
          </section>
        )}

        {past.length > 0 && (
          <details className="group" data-testid="past-keys">
            <summary className={`inline-flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}>
              <span aria-hidden="true" className="text-zinc-400 transition-transform group-open:rotate-90 motion-reduce:transition-none">
                <ChevronRightIcon />
              </span>
              Revoked and expired <span className="font-normal tabular-nums text-zinc-400">{past.length}</span>
            </summary>
            <ul className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800" aria-label="Revoked and expired keys">
              {past.map((k) => (
                <li key={k.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-testid="api-key">
                  <span className="min-w-0 text-zinc-300 [overflow-wrap:anywhere]">{k.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <StatusText look={{ label: k.status === "revoked" ? "Revoked" : "Expired", tone: k.status === "revoked" ? "danger" : "waiting" }} />
                    <span>
                      {k.status === "revoked"
                        ? relativeTime(k.revoked_at) ?? ""
                        : k.expires_at
                          ? formatDate(k.expires_at)
                          : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {data && (
          <section aria-labelledby="keys-how" className={cardClass}>
            <h2 id="keys-how" className="mb-2 text-sm font-semibold text-zinc-100">
              How keys work
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>
                Send the key as <Code>Authorization: Bearer chk_...</Code> to <Code>{apiOrigin()}</Code>.
              </li>
              <li>The key is shown once, when you create it. Coderhelm keeps only a fingerprint of it.</li>
              <li>
                A key acts within the access of the person who made it. If their role changes, the key follows; if they
                leave the team, it stops working.
              </li>
              <li>Each key has its own limit of requests per minute.</li>
              <li>Creating, revoking and using keys is written to the team&apos;s log of access changes.</li>
            </ul>
          </section>
        )}
      </div>

      {data && (
        <CreateKeyModal
          open={creating}
          list={data}
          onOpenChange={(o) => {
            setCreating(o);
            if (!o) setMade(null);
          }}
          made={made}
          onMade={(m) => {
            setMade(m);
            load();
          }}
        />
      )}
    </Page>
  );
}

function KeyRow({ apiKey: k, scopeLabels, onRevoke }: { apiKey: ApiKey; scopeLabels: Record<string, string>; onRevoke?: () => void }) {
  const used = relativeTime(k.last_used_at);
  const made = relativeTime(k.created_at);
  return (
    <ListRow
      testId="api-key"
      status={{ tone: k.two_factor_review ? "waiting" : "success" }}
      title={k.name}
      titleText={k.name}
      meta={[
        <Code key="hint">{k.hint}</Code>,
        `${k.rate_limit_per_minute.toLocaleString()} requests a minute`,
        used ? `Last used ${used}` : "Never used",
        k.expires_at ? `Expires ${formatDate(k.expires_at)}` : "Never expires",
        <span key="made" title={k.created_by}>
          Made {made ?? ""}
        </span>,
        ...(k.two_factor_review
          ? [
              <span key="review" className="text-amber-300" data-testid="key-review">
                {reviewText(k.two_factor_review)}
              </span>,
            ]
          : []),
      ]}
      chips={
        <span className="flex min-w-0 flex-wrap gap-1.5" aria-label="Scopes">
          {k.scopes.map((sc) => (
            <Chip key={sc} title={sc}>
              {shortScope(scopeLabels[sc] ?? sc)}
            </Chip>
          ))}
        </span>
      }
      actions={
        onRevoke ? (
          <button type="button" className={smallDangerButton} onClick={onRevoke}>
            Revoke
          </button>
        ) : undefined
      }
    />
  );
}

/** "Retry, re-run, re-review, cancel…" is a scope's full help; its chip shows the first words. */
function shortScope(label: string): string {
  const first = label.split(/[,:(]/)[0].trim();
  return first.length > 28 ? `${first.slice(0, 27)}…` : first;
}

function CreateKeyModal({
  open,
  onOpenChange,
  list,
  made,
  onMade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ApiKeyList;
  made: { key: ApiKey; token: string } | null;
  onMade: (m: { key: ApiKey; token: string }) => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("90");
  const [rate, setRate] = useState(String(list.limits.default_rate_per_minute));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setScopes([]);
      setExpiry("90");
      setRate(String(list.limits.default_rate_per_minute));
      setError("");
    }
  }, [open, list.limits.default_rate_per_minute]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(rate);
    if (!name.trim()) return setError("Give the key a name, so you know later what uses it.");
    if (!Number.isInteger(n) || n < list.limits.min_rate_per_minute || n > list.limits.max_rate_per_minute) {
      return setError(
        `Pick a rate limit from ${list.limits.min_rate_per_minute} to ${list.limits.max_rate_per_minute} requests a minute.`,
      );
    }
    setSaving(true);
    setError("");
    try {
      onMade(
        await apiKeysApi.create({
          name: name.trim(),
          scopes,
          expires_in_days: expiry === "never" ? null : Number(expiry),
          rate_limit_per_minute: n,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key.");
    } finally {
      setSaving(false);
    }
  };

  if (made) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title={`Key "${made.key.name}" is ready`} wide>
        <div className="space-y-4">
          <Callout variant="warning" title="Copy it now">
            <p>This is the only time the key is shown. Store it in your secrets manager or CI secrets.</p>
          </Callout>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1" data-testid="new-api-key">
              <Code className="block px-2 py-1.5">{made.token}</Code>
            </span>
            <CopyButton text={made.token} label="Copy key" />
          </div>
          <CodeBlock code={curlExample(made.token)} lang="bash" title="Try it" wrap />
          <div className="flex justify-end">
            <button type="button" className={`${secondaryButton} ${fullWidthOnPhone}`} onClick={() => onOpenChange(false)}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create an API key"
      description="Give each program its own key, with only the scopes it needs."
      wide
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id={`${ids}-name`} label="Name" helper="What uses it, such as Deploy pipeline or Nightly report.">
          {(p) => (
            <input
              {...p}
              className={inputClass}
              value={name}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-zinc-100">Scopes</legend>
          <ul className="space-y-2">
            {list.scopes.map((s) => {
              const checked = s.always || scopes.includes(s.key);
              const disabled = s.always || !s.allowed;
              return (
                <li key={s.key}>
                  <label className={`flex items-start gap-2.5 text-sm ${disabled && !s.always ? "text-zinc-500" : "text-zinc-300"}`}>
                    <input
                      type="checkbox"
                      className={`mt-0.5 ${focusRing}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) =>
                        setScopes((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((k) => k !== s.key)))
                      }
                    />
                    <span className="min-w-0">
                      <Code>{s.key}</Code> {s.label}
                      {s.always && <span className="text-zinc-500"> (every key has this)</span>}
                      {!s.allowed && !s.always && <span> (your role doesn&apos;t include this)</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${ids}-expiry`} label="Expires after">
            {(p) => (
              <Select {...p} className="w-full" value={expiry} onChange={setExpiry} options={EXPIRY_CHOICES.map((c) => ({ value: c.value, label: c.label }))} />
            )}
          </Field>
          <Field
            id={`${ids}-rate`}
            label="Requests a minute"
            helper={`${list.limits.min_rate_per_minute} to ${list.limits.max_rate_per_minute.toLocaleString()}.`}
          >
            {(p) => (
              <input
                {...p}
                className={inputClass}
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
              />
            )}
          </Field>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={`${secondaryButton} ${fullWidthOnPhone}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} ${fullWidthOnPhone}`} disabled={saving}>
            {saving ? "Creating…" : "Create key"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
