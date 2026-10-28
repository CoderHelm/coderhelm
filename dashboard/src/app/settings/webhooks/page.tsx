"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader, SectionHeading, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Chip, List, ListRow, formatDate, formatMs, type Tone } from "@/components/list";
import { RepeatIcon } from "@/components/icons";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { CodeBlock } from "@/components/code-block";
import { Disclosure } from "@/components/disclosure";
import { Skeleton } from "@/components/skeleton";
import { Select } from "@/components/select";
import { Code } from "@/components/settings/code";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { relativeTime } from "@/lib/team";
import {
  WEBHOOK_DOCS_URL,
  WebhookError,
  endpointHref,
  eventsSummary,
  groupEvents,
  webhooksApi,
  type EndpointInput,
  type ReplayResult,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEndpointList,
  type WebhookEventType,
} from "@/lib/webhooks";
import {
  buttonClass,
  focusRing,
  fullWidthOnPhone,
  inputClass,
  linkButton,
  monoInputClass,
  primaryButton,
  secondaryButton,
  smallSecondaryButton,
} from "@/components/ui";

export default function WebhooksPageGuarded() {
  return (
    <RoleGuard need="webhooks">
      <Suspense fallback={null}>
        <WebhooksRouter />
      </Suspense>
    </RoleGuard>
  );
}

function WebhooksRouter() {
  const id = useSearchParams().get("endpoint") ?? "";
  return id ? <EndpointPage id={id} /> : <EndpointsPage />;
}

/** The host of an address, for a short name. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// ── Event types ─────────────────────────────────────────────────────

function useEventTypes() {
  const [types, setTypes] = useState<WebhookEventType[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    webhooksApi
      .eventTypes()
      .then((d) => setTypes(d.event_types))
      .catch((e) => setError(errText(e, "Could not load the event types.")));
  }, []);
  return { types, error };
}

/** Health in a few words, with a tone for the status dot. */
function health(e: WebhookEndpoint, disableAfter: number): { tone: Tone; label: string; detail?: string } {
  if (!e.enabled && e.disabled_reason === "failing") {
    return {
      tone: "danger",
      label: "Turned off: kept failing",
      detail: `Coderhelm turned it off after ${disableAfter} days in a row with no delivery getting through. Fix the endpoint, then turn it back on and replay the events it missed.`,
    };
  }
  if (!e.enabled) return { tone: "muted", label: "Off" };
  if (e.failing_since) {
    return {
      tone: "waiting",
      label: `Failing since ${relativeTime(e.failing_since) ?? formatDate(e.failing_since)}`,
      detail: `If nothing gets through for ${disableAfter} days in a row, Coderhelm turns it off and tells the team's admins.`,
    };
  }
  return { tone: "success", label: "On" };
}

// ── The list ────────────────────────────────────────────────────────

function EndpointsPage() {
  const { can } = useCan();
  const [data, setData] = useState<WebhookEndpointList | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<{ endpoint: WebhookEndpoint; secret: string } | null>(null);
  const { types, error: typesError } = useEventTypes();
  const canManage = can("webhooks");

  const load = useCallback(() => {
    webhooksApi
      .list()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(errText(e, "The request failed.")));
  }, []);
  useEffect(load, [load]);

  const full = !!data && data.endpoints.length >= data.max;
  const addButton = (size: "sm" | "md" = "md") =>
    canManage && data ? (
      <button type="button" className={buttonClass(size === "sm" ? "secondary" : "primary", size)} onClick={() => setCreating(true)} disabled={full}>
        Add endpoint
      </button>
    ) : undefined;

  return (
    <Page testId="webhooks-page">
      <PageHeader
        title="Webhooks"
        lead={
          <>
            <p>
              Coderhelm tells your own systems what it did: a run started or finished, a pull request opened, a review
              posted, an alert came in. Add an address and pick the events; each request is signed so you can check it
              came from Coderhelm.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4">
              <a href={WEBHOOK_DOCS_URL} target="_blank" rel="noreferrer" className={linkButton}>
                Read the webhooks guide
              </a>
              <Link href="/settings/deliveries/?source=webhook" className={linkButton}>
                See every delivery
              </Link>
            </p>
          </>
        }
        actions={addButton()}
      />

      <div className="mt-6 space-y-6">
        {error && (
          <Problem title="Couldn't load the endpoints" onRetry={load} details={error}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        )}
        {!data && !error && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading endpoints">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}
        {data && (
          <section aria-labelledby="endpoints-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <SectionHeading id="endpoints-heading" count={data.endpoints.length}>
                Endpoints
              </SectionHeading>
              {data.endpoints.length > 0 && addButton("sm")}
            </div>
            {full && (
              <p className="mb-3 text-sm text-zinc-400">A team can have {data.max} endpoints. Delete one to add another.</p>
            )}
            {data.endpoints.length === 0 ? (
              <EmptyState icon={<RepeatIcon />} title="No endpoints yet." action={addButton()}>
                Add the address of a service that should hear about Coderhelm&apos;s work, such as a deploy bot or your
                own dashboard.
              </EmptyState>
            ) : (
              <List label="Webhook endpoints">
                {data.endpoints.map((e) => {
                  const h = health(e, data.disable_after_days);
                  return (
                    <ListRow
                      key={e.id}
                      testId="webhook-endpoint"
                      data={{ id: e.id }}
                      status={{ tone: h.tone }}
                      title={<span className="wrap-anywhere">{e.url}</span>}
                      titleText={e.url}
                      href={endpointHref(e.id)}
                      meta={[
                        e.description || undefined,
                        eventsSummary(e.events),
                        e.last_success_at ? `Last delivered ${relativeTime(e.last_success_at) ?? ""}` : "Nothing delivered yet",
                      ]}
                      summary={h.tone === "danger" || h.tone === "waiting" ? h.label : undefined}
                      summaryTone={h.tone}
                      chips={<Chip tone={h.tone}>{h.tone === "success" ? "On" : h.tone === "waiting" ? "Failing" : h.tone === "danger" ? "Turned off" : "Off"}</Chip>}
                    />
                  );
                })}
              </List>
            )}
          </section>
        )}

        {data && (
          <section aria-labelledby="webhooks-how" className={cardClass}>
            <h2 id="webhooks-how" className="mb-2 text-sm font-semibold text-zinc-100">
              How delivery works
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>
                Each event is a <Code>POST</Code> with a JSON body and the Standard Webhooks headers{" "}
                <Code>webhook-id</Code>, <Code>webhook-timestamp</Code> and <Code>webhook-signature</Code>.
              </li>
              <li>Answer with a 2xx within 10 seconds. Do the work afterwards.</li>
              <li>
                Timeouts, 5xx, 408 and 429 answers are tried again for about a day. Other 4xx answers are final.
              </li>
              <li>
                An endpoint that fails for {data.disable_after_days} days in a row is turned off, and admins are told.
              </li>
              <li>Events and deliveries are kept {data.retention_days} days, so you can resend or replay them.</li>
              <li>Addresses must be https and on the public internet; private and internal addresses are refused.</li>
            </ul>
          </section>
        )}
      </div>

      {data && (
        <CreateEndpointModal
          open={creating}
          types={types}
          typesError={typesError}
          made={made}
          onOpenChange={(o) => {
            setCreating(o);
            if (!o) setMade(null);
          }}
          onMade={(m) => {
            setMade(m);
            load();
          }}
        />
      )}
    </Page>
  );
}

// ── The events picker ───────────────────────────────────────────────

function EventsPicker({
  types,
  error,
  value,
  onChange,
  fieldError,
}: {
  types: WebhookEventType[] | null;
  error: string;
  value: string[];
  onChange: (v: string[]) => void;
  fieldError?: string;
}) {
  const all = value.includes("*");
  const errId = useId();
  return (
    <fieldset aria-describedby={fieldError ? errId : undefined} data-testid="events-picker">
      <legend className="mb-1.5 text-sm font-semibold text-zinc-100">Events</legend>
      <label className="flex items-start gap-2.5 text-sm text-zinc-300">
        <input type="checkbox" className={`mt-0.5 ${focusRing}`} checked={all} onChange={(e) => onChange(e.target.checked ? ["*"] : [])} />
        <span>
          All events <span className="text-zinc-400">(including types added later)</span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {!all && !types && !error && <Skeleton className="mt-3 h-24 w-full" />}
      {!all && types && (
        <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {groupEvents(types).map((g) => (
            <div key={g.group} className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-zinc-400">{g.group}</p>
              <ul className="space-y-1.5">
                {g.types.map((t) => (
                  <li key={t.type}>
                    <label className="flex items-start gap-2.5 text-sm text-zinc-300" title={t.description}>
                      <input
                        type="checkbox"
                        className={`mt-0.5 ${focusRing}`}
                        checked={value.includes(t.type)}
                        onChange={(e) =>
                          onChange(e.target.checked ? [...value, t.type] : value.filter((x) => x !== t.type))
                        }
                      />
                      <span className="min-w-0">
                        <Code>{t.type}</Code> <span className="text-zinc-400">{t.summary}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {fieldError && (
        <p id={errId} className="mt-2 text-sm text-red-300" role="alert">
          {fieldError}
        </p>
      )}
    </fieldset>
  );
}

// ── Create ──────────────────────────────────────────────────────────

function CreateEndpointModal({
  open,
  onOpenChange,
  types,
  typesError,
  made,
  onMade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: WebhookEventType[] | null;
  typesError: string;
  made: { endpoint: WebhookEndpoint; secret: string } | null;
  onMade: (m: { endpoint: WebhookEndpoint; secret: string }) => void;
}) {
  const ids = useId();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);
  const [enabled, setEnabled] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setDescription("");
      setEvents(["*"]);
      setEnabled(true);
      setErrors({});
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim().startsWith("https://")) return setErrors({ url: "The address must start with https://" });
    if (events.length === 0) return setErrors({ events: "Pick at least one event, or all events." });
    setSaving(true);
    setErrors({});
    try {
      onMade(await webhooksApi.create({ url: url.trim(), description: description.trim(), events, enabled }));
    } catch (err) {
      const field = err instanceof WebhookError && err.field ? err.field : "form";
      setErrors({ [field]: errText(err, "Could not add the endpoint.") });
    } finally {
      setSaving(false);
    }
  };

  if (made) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title="Endpoint added" wide testId="webhook-created">
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Events now go to <span className="wrap-anywhere text-zinc-100">{made.endpoint.url}</span>.
          </p>
          <Callout variant="warning" title="Copy the signing secret now">
            <p>
              Your endpoint checks each request&apos;s signature with this secret. You won&apos;t see it again here, but
              admins can reveal it later on the endpoint&apos;s page.
            </p>
          </Callout>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="min-w-0 sm:flex-1" data-testid="new-webhook-secret">
              <Code className="block px-2 py-1.5">{made.secret}</Code>
            </span>
            <span className="flex shrink-0"><CopyButton text={made.secret} label="Copy secret" /></span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link href={endpointHref(made.endpoint.id)} className={`${secondaryButton} ${fullWidthOnPhone}`}>
              Open the endpoint
            </Link>
            <button type="button" className={`${primaryButton} ${fullWidthOnPhone}`} onClick={() => onOpenChange(false)}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a webhook endpoint" description="Coderhelm sends the events you pick to this address." wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id={`${ids}-url`} label="Address" helper="An https address on the public internet." error={errors.url}>
          {(p) => (
            <input
              {...p}
              className={monoInputClass}
              value={url}
              placeholder="https://hooks.example.com/coderhelm"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
        </Field>
        <Field id={`${ids}-desc`} label="Description" helper="Optional: what listens here, such as Deploy bot." error={errors.description}>
          {(p) => <input {...p} className={inputClass} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <EventsPicker types={types} error={typesError} value={events} onChange={setEvents} fieldError={errors.events} />
        <label className="flex items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" className={focusRing} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Send events now (turn off to set it up first)
        </label>
        {errors.form && (
          <Callout variant="error" title="Not added">
            <p>{errors.form}</p>
          </Callout>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${secondaryButton} ${fullWidthOnPhone}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} ${fullWidthOnPhone}`} disabled={saving}>
            {saving ? "Adding…" : "Add endpoint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── One endpoint ────────────────────────────────────────────────────

function EndpointPage({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [ep, setEp] = useState<WebhookEndpoint | null>(null);
  const [disableAfter, setDisableAfter] = useState(5);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deliveriesKey, setDeliveriesKey] = useState(0);
  const { types, error: typesError } = useEventTypes();

  const load = useCallback(() => {
    webhooksApi
      .get(id)
      .then((e) => {
        setEp(e);
        setError("");
      })
      .catch((e) => setError(errText(e, "The request failed.")));
    webhooksApi
      .list()
      .then((l) => setDisableAfter(l.disable_after_days))
      .catch(() => {});
  }, [id]);
  useEffect(load, [load]);

  const toggle = async () => {
    if (!ep) return;
    try {
      setEp(await webhooksApi.update(ep.id, { enabled: !ep.enabled }));
      toast(ep.enabled ? "Turned off. Nothing is sent until you turn it back on." : "Turned on.");
    } catch (e) {
      toast(errText(e, "Could not save."), "error");
    }
  };

  const remove = async () => {
    if (!ep) return;
    const ok = await confirm({
      title: "Delete this endpoint?",
      message: "Coderhelm stops sending to it at once, including retries already waiting. This can't be undone.",
      confirmLabel: "Delete endpoint",
      destructive: true,
    });
    if (ok !== "primary") return;
    try {
      await webhooksApi.remove(ep.id);
      toast("Endpoint deleted.");
      router.push("/settings/webhooks/");
    } catch (e) {
      toast(errText(e, "Could not delete the endpoint."), "error");
    }
  };

  if (error) {
    return (
      <Page>
        <PageHeader title="Endpoint" detail crumb="Endpoint" />
        <div className="mt-6">
          <Problem title="Couldn't load this endpoint" onRetry={load} details={error}>
            It may have been deleted.{" "}
            <Link href="/settings/webhooks/" className={linkButton}>
              Back to Webhooks
            </Link>
          </Problem>
        </div>
      </Page>
    );
  }
  if (!ep) {
    return (
      <Page>
        <div className="space-y-3" aria-busy="true" aria-label="Loading the endpoint">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Page>
    );
  }

  const h = health(ep, disableAfter);
  return (
    <Page testId="webhook-endpoint-page">
      <PageHeader
        detail
        crumb={ep.description || hostOf(ep.url)}
        eyebrow="Webhook endpoint"
        title={ep.description || hostOf(ep.url)}
        status={<Chip tone={h.tone}>{h.tone === "success" ? "On" : h.tone === "waiting" ? "Failing" : h.tone === "danger" ? "Turned off" : "Off"}</Chip>}
        lead={
          <span className="block min-w-0" data-testid="endpoint-url">
            <Code>{ep.url}</Code>
          </span>
        }
        actions={
          <>
            <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className={secondaryButton} onClick={() => void toggle()} data-testid="toggle-endpoint">
              {ep.enabled ? "Turn off" : "Turn on"}
            </button>
          </>
        }
        more={[{ label: "Delete endpoint", onSelect: () => void remove(), danger: true }]}
      />

      <div className="mt-6 space-y-8">
        {h.detail && (
          <Callout variant={h.tone === "danger" ? "error" : "warning"} title={h.label} testId="endpoint-health">
            <p>{h.detail}</p>
          </Callout>
        )}

        <section aria-labelledby="ep-facts" className={cardClass}>
          <h2 id="ep-facts" className="sr-only">
            Details
          </h2>
          <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-zinc-400">Events</dt>
            <dd className="min-w-0 text-zinc-200">
              {ep.events.includes("*") ? (
                "All events"
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {ep.events.map((t) => (
                    <Code key={t}>{t}</Code>
                  ))}
                </span>
              )}
            </dd>
            <dt className="text-zinc-400">Last delivered</dt>
            <dd className="text-zinc-200">{ep.last_success_at ? formatDate(ep.last_success_at, { time: true }) : "Not yet"}</dd>
            <dt className="text-zinc-400">Last failure</dt>
            <dd className="text-zinc-200">{ep.last_failure_at ? formatDate(ep.last_failure_at, { time: true }) : "None"}</dd>
            <dt className="text-zinc-400">Endpoint id</dt>
            <dd className="min-w-0">
              <Code>{ep.id}</Code>
            </dd>
            <dt className="text-zinc-400">Added</dt>
            <dd className="min-w-0 text-zinc-200">
              <span className="wrap-anywhere">
                {formatDate(ep.created_at)} by {ep.created_by || "someone"}
              </span>
            </dd>
          </dl>
        </section>

        <SecretSection ep={ep} onChanged={load} />
        <TestSection ep={ep} onSent={() => setDeliveriesKey((k) => k + 1)} />
        <DeliveriesSection ep={ep} refreshKey={deliveriesKey} />
        <ReplaySection ep={ep} onQueued={() => setDeliveriesKey((k) => k + 1)} />
      </div>

      <EditEndpointModal
        open={editing}
        onOpenChange={setEditing}
        ep={ep}
        types={types}
        typesError={typesError}
        onSaved={(e) => {
          setEp(e);
          setEditing(false);
          toast("Saved.");
        }}
      />
    </Page>
  );
}

function EditEndpointModal({
  open,
  onOpenChange,
  ep,
  types,
  typesError,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ep: WebhookEndpoint;
  types: WebhookEventType[] | null;
  typesError: string;
  onSaved: (e: WebhookEndpoint) => void;
}) {
  const ids = useId();
  const [url, setUrl] = useState(ep.url);
  const [description, setDescription] = useState(ep.description);
  const [events, setEvents] = useState<string[]>(ep.events);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setUrl(ep.url);
      setDescription(ep.description);
      setEvents(ep.events);
      setErrors({});
    }
  }, [open, ep]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (events.length === 0) return setErrors({ events: "Pick at least one event, or all events." });
    setSaving(true);
    setErrors({});
    const body: EndpointInput = { url: url.trim(), description: description.trim(), events };
    try {
      onSaved(await webhooksApi.update(ep.id, body));
    } catch (err) {
      const field = err instanceof WebhookError && err.field ? err.field : "form";
      setErrors({ [field]: errText(err, "Could not save.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit endpoint" wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id={`${ids}-url`} label="Address" error={errors.url}>
          {(p) => <input {...p} className={monoInputClass} value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} />}
        </Field>
        <Field id={`${ids}-desc`} label="Description" error={errors.description}>
          {(p) => <input {...p} className={inputClass} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <EventsPicker types={types} error={typesError} value={events} onChange={setEvents} fieldError={errors.events} />
        {errors.form && (
          <Callout variant="error" title="Not saved">
            <p>{errors.form}</p>
          </Callout>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${secondaryButton} ${fullWidthOnPhone}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} ${fullWidthOnPhone}`} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Secret ──────────────────────────────────────────────────────────

function SecretSection({ ep, onChanged }: { ep: WebhookEndpoint; onChanged: () => void }) {
  const ids = useId();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [shown, setShown] = useState<string | null>(null);
  const [rotated, setRotated] = useState<{ secret: string; until: string | null } | null>(null);
  const [overlap, setOverlap] = useState("24");
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      setShown((await webhooksApi.reveal(ep.id)).secret);
    } catch (e) {
      toast(errText(e, "Could not reveal the secret."), "error");
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    const hours = Number(overlap);
    const ok = await confirm({
      title: "Make a new signing secret?",
      message:
        hours > 0
          ? `For the next ${hours} hours every request carries two signatures, one with each secret, so your endpoint keeps working while you update it. Then only the new secret signs.`
          : "The old secret stops signing at once. Requests fail to verify until your endpoint has the new secret.",
      confirmLabel: "Make a new secret",
      destructive: hours === 0,
    });
    if (ok !== "primary") return;
    setBusy(true);
    try {
      const r = await webhooksApi.rotate(ep.id, hours);
      setShown(null);
      setRotated({ secret: r.secret, until: r.previous_secret_expires_at });
      onChanged();
    } catch (e) {
      toast(errText(e, "Could not make a new secret."), "error");
    } finally {
      setBusy(false);
    }
  };

  const previousLive = ep.previous_secret_expires_at && new Date(ep.previous_secret_expires_at).getTime() > Date.now();

  return (
    <section aria-labelledby="ep-secret" data-testid="secret-section">
      <SectionHeading id="ep-secret">Signing secret</SectionHeading>
      <div className={`mt-3 space-y-4 ${cardClass}`}>
        <p className="text-sm text-zinc-400">
          Your endpoint uses this secret to check each request&apos;s <Code>webhook-signature</Code> header. Revealing it is
          written to the team&apos;s log.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="min-w-0 sm:flex-1" data-testid="webhook-secret">
            <Code className="block px-2 py-1.5">{shown ?? ep.secret_hint}</Code>
          </span>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {shown ? (
              <>
                <CopyButton text={shown} label="Copy secret" />
                <button type="button" className={smallSecondaryButton} onClick={() => setShown(null)}>
                  Hide
                </button>
              </>
            ) : (
              <button type="button" className={smallSecondaryButton} onClick={() => void reveal()} disabled={busy}>
                Reveal
              </button>
            )}
          </div>
        </div>
        {previousLive && !rotated && (
          <p className="text-sm text-amber-300">
            The previous secret also signs until {formatDate(ep.previous_secret_expires_at!, { time: true })}.
          </p>
        )}
        {rotated && (
          <Callout variant="warning" title="New secret made. Copy it now" testId="rotated-secret">
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <span className="min-w-0 sm:flex-1">
                <Code className="block px-2 py-1.5">{rotated.secret}</Code>
              </span>
              <span className="flex shrink-0"><CopyButton text={rotated.secret} label="Copy new secret" /></span>
            </div>
            <p className="pt-1">
              {rotated.until
                ? `The old secret keeps signing too until ${formatDate(rotated.until, { time: true })}.`
                : "The old secret no longer signs."}
            </p>
          </Callout>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-overlap`} className="mb-1 block text-sm text-zinc-300">
              Keep the old secret signing for
            </label>
            <Select
              id={`${ids}-overlap`}
              value={overlap}
              onChange={setOverlap}
              options={[
                { value: "0", label: "No time (stop at once)" },
                { value: "1", label: "1 hour" },
                { value: "24", label: "24 hours" },
                { value: "72", label: "3 days" },
                { value: "168", label: "7 days" },
              ]}
            />
          </div>
          <button type="button" className={secondaryButton} onClick={() => void rotate()} disabled={busy}>
            Rotate secret
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Test ────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; tone: Tone }> = {
  handled: { label: "Delivered", tone: "success" },
  pending: { label: "Retrying", tone: "waiting" },
  failed: { label: "Failed", tone: "danger" },
  received: { label: "Queued", tone: "queued" },
  ignored: { label: "Skipped", tone: "muted" },
};

function codeTone(code?: number | null): Tone {
  if (!code) return "danger";
  return code >= 200 && code < 300 ? "success" : "danger";
}

function AttemptLine({ a }: { a: WebhookDelivery["attempts"][number] }) {
  return (
    <li className="min-w-0 text-sm" data-testid="webhook-attempt">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-zinc-300">{formatDate(a.at, { time: true })}</span>
        {a.code ? <Chip tone={codeTone(a.code)}>{`HTTP ${a.code}`}</Chip> : <Chip tone="danger">No answer</Chip>}
        {a.duration_ms ? <span className="text-xs tabular-nums text-zinc-400">{formatMs(a.duration_ms)}</span> : null}
      </span>
      {a.error && (
        <span className="mt-0.5 block text-red-300">
          <span className="wrap-anywhere">{a.error}</span>
        </span>
      )}
    </li>
  );
}

function TestSection({ ep, onSent }: { ep: WebhookEndpoint; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WebhookDelivery | null>(null);
  const [error, setError] = useState("");
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await webhooksApi.test(ep.id));
      onSent();
    } catch (e) {
      setError(errText(e, "Could not send the test."));
    } finally {
      setBusy(false);
    }
  };
  const last = result?.attempts[result.attempts.length - 1];
  const s = result ? STATUS[result.status] ?? STATUS.failed : null;
  return (
    <section aria-labelledby="ep-test">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading id="ep-test">Test</SectionHeading>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => void send()} disabled={busy}>
          {busy ? "Sending…" : "Send test event"}
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Sends one <Code>webhook.test</Code> event now, signed like every other event. It is tried once, even when the
        endpoint is off.
      </p>
      {error && (
        <div className="mt-3">
          <Callout variant="error" title="Not sent">
            <p>{error}</p>
          </Callout>
        </div>
      )}
      {result && s && (
        <div className="mt-3" data-testid="test-result" data-status={result.status}>
          <Callout
            variant={result.status === "handled" ? "success" : "error"}
            title={result.status === "handled" ? `Delivered${last?.code ? ` (HTTP ${last.code})` : ""}` : result.reason_message || result.outcome || s.label}
          >
            {last && (
              <ul className="pt-1">
                <AttemptLine a={last} />
              </ul>
            )}
            {result.reason_fix && (
              <p>
                <span className="font-medium text-zinc-100">How to fix: </span>
                {result.reason_fix}
              </p>
            )}
          </Callout>
        </div>
      )}
    </section>
  );
}

// ── Deliveries ──────────────────────────────────────────────────────

function DeliveriesSection({ ep, refreshKey }: { ep: WebhookEndpoint; refreshKey: number }) {
  const ids = useId();
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    webhooksApi
      .deliveries(ep.id, status)
      .then((d) => {
        setRows(d.deliveries);
        setError("");
      })
      .catch((e) => setError(errText(e, "The request failed.")));
  }, [ep.id, status]);
  useEffect(load, [load, refreshKey]);

  const resend = async (d: WebhookDelivery) => {
    setBusy(d.id);
    try {
      const r = await webhooksApi.resend(ep.id, d.id);
      setRows((cur) => cur?.map((x) => (x.id === r.id ? r : x)) ?? null);
      toast(r.status === "handled" ? "Sent again and delivered." : "Sent again; the endpoint didn't take it.", r.status === "handled" ? undefined : "error");
    } catch (e) {
      toast(errText(e, "Could not send it again."), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <section aria-labelledby="ep-deliveries">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading id="ep-deliveries" count={rows?.length}>
          Recent deliveries
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${ids}-status`} className="text-sm text-zinc-400">
            Show
          </label>
          <Select
            id={`${ids}-status`}
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Retrying" },
              { value: "ok", label: "Delivered" },
            ]}
          />
        </div>
      </div>
      <div className="mt-3">
        {error && (
          <Problem title="Couldn't load the deliveries" onRetry={load} details={error}>
            Try again in a moment.
          </Problem>
        )}
        {!rows && !error && <Skeleton className="h-24 w-full rounded-lg" />}
        {rows && rows.length === 0 && (
          <p className="text-sm text-zinc-400">No deliveries{status === "all" ? " yet" : " like that"}. Send a test event to see one.</p>
        )}
        {rows && rows.length > 0 && (
          <List label="Recent deliveries">
            {rows.map((d) => {
              const s = STATUS[d.status] ?? STATUS.failed;
              return (
                <ListRow
                  key={d.id}
                  testId="webhook-delivery"
                  data={{ status: d.status }}
                  status={{ tone: s.tone }}
                  title={<Code>{d.event}</Code>}
                  titleText={d.event}
                  meta={[
                    <span key="ev" className="wrap-anywhere">{d.event_id}</span>,
                    d.outcome || s.label,
                    d.attempts.length === 1 ? "1 attempt" : `${d.attempts.length} attempts`,
                    d.next_retry_at ? `Next try ${formatDate(d.next_retry_at, { time: true })}` : undefined,
                  ]}
                  summary={d.status === "failed" ? d.reason_message || undefined : undefined}
                  summaryTone="danger"
                  time={d.created_at}
                  chips={<Chip tone={s.tone}>{s.label}</Chip>}
                  actions={
                    <button type="button" className={smallSecondaryButton} disabled={busy === d.id} onClick={() => void resend(d)}>
                      {busy === d.id ? "Sending…" : "Resend"}
                    </button>
                  }
                  detailsLabel="Attempts"
                  detailsFor={`attempts of ${d.event_id}`}
                  details={
                    <div className="min-w-0 space-y-4">
                      {d.reason_fix && (
                        <p className="text-sm text-zinc-300">
                          <span className="font-medium text-zinc-100">How to fix: </span>
                          {d.reason_fix}
                        </p>
                      )}
                      <ol className="space-y-2">
                        {d.attempts.map((a, i) => (
                          <AttemptLine key={`${a.at}-${i}`} a={a} />
                        ))}
                      </ol>
                      {d.headers && Object.keys(d.headers).length > 0 && (
                        <Disclosure summary="Headers">
                          <dl className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[11rem_1fr]">
                            {Object.entries(d.headers).map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="text-zinc-400">{k}</dt>
                                <dd className="min-w-0 text-zinc-200">
                                  {v === "[redacted]" ? <Chip tone="muted">Hidden</Chip> : <span className="wrap-anywhere">{v}</span>}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </Disclosure>
                      )}
                      {d.payload_preview && (
                        <CodeBlock code={d.payload_preview} lang="json" title="Body (secret-looking values hidden)" wrap />
                      )}
                    </div>
                  }
                />
              );
            })}
          </List>
        )}
      </div>
    </section>
  );
}

// ── Replay ──────────────────────────────────────────────────────────

/** A datetime-local value for `minsAgo` minutes ago, in the browser's time. */
function localInput(minsAgo: number): string {
  const d = new Date(Date.now() - minsAgo * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReplaySection({ ep, onQueued }: { ep: WebhookEndpoint; onQueued: () => void }) {
  const ids = useId();
  const [since, setSince] = useState(() => localInput(24 * 60));
  const [until, setUntil] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = new Date(since);
    if (Number.isNaN(s.getTime())) return setError("Pick when to start.");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const u = until ? new Date(until) : null;
      setResult(
        await webhooksApi.replay(ep.id, {
          since: s.toISOString(),
          ...(u && !Number.isNaN(u.getTime()) ? { until: u.toISOString() } : {}),
          only_failed: onlyFailed,
        }),
      );
      onQueued();
    } catch (err) {
      setError(errText(err, "Could not replay."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ep-replay">
      <SectionHeading id="ep-replay">Replay events</SectionHeading>
      <form onSubmit={submit} className={`mt-3 space-y-4 ${cardClass}`} noValidate>
        <p className="text-sm text-zinc-400">
          Sends the events of a time range to this endpoint again, oldest first, with their original ids so your endpoint
          can skip ones it already handled. Events are kept 14 days.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${ids}-since`} label="From">
            {(p) => <input {...p} type="datetime-local" className={inputClass} value={since} onChange={(e) => setSince(e.target.value)} />}
          </Field>
          <Field id={`${ids}-until`} label="To" helper="Leave empty for now.">
            {(p) => <input {...p} type="datetime-local" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />}
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" className={`mt-0.5 ${focusRing}`} checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
          Only events this endpoint didn&apos;t get (failed or never sent)
        </label>
        {!ep.enabled && <p className="text-sm text-amber-300">Turn the endpoint on before replaying events to it.</p>}
        {error && (
          <Callout variant="error" title="Not replayed">
            <p>{error}</p>
          </Callout>
        )}
        {result && (
          <Callout variant="success" title={result.queued === 1 ? "1 event queued" : `${result.queued} events queued`} testId="replay-result">
            <p>
              {result.found} kept {result.found === 1 ? "event" : "events"} in the range.
              {result.capped ? " More matched than one replay sends (500): replay again from the last one." : ""}
            </p>
          </Callout>
        )}
        <div className="flex justify-end">
          <button type="submit" className={`${secondaryButton} ${fullWidthOnPhone}`} disabled={busy || !ep.enabled}>
            {busy ? "Queuing…" : "Replay"}
          </button>
        </div>
      </form>
    </section>
  );
}
