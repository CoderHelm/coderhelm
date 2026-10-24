"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { pluginHref, pluginsApi, PluginError, runHref, type Draft } from "@/lib/plugins";
import { DraftStatusChip, PluginsGate, Refusal } from "@/components/plugins";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, Time } from "@/components/list";
import { Field } from "@/components/field";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { dangerButton, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

// One draft: its versions, editing (a new version), and the decisions on it.
// An approval names the version it approves; a stop is permanent.

export default function DraftPageGated() {
  return (
    <PluginsGate title="Draft">
      <Suspense fallback={<Page><ListSkeleton rows={3} label="Loading the draft" /></Page>}>
        <DraftPage />
      </Suspense>
    </PluginsGate>
  );
}

function errorOf(e: unknown): { code: string; message: string } {
  if (e instanceof PluginError) return { code: e.code, message: e.message };
  return { code: "", message: e instanceof Error ? e.message : "The request failed." };
}

/** A datetime-local value for an hour from now, in the viewer's own time. */
function inAnHour(): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DraftPage() {
  const id = useSearchParams().get("id") ?? "";
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const [when, setWhen] = useState(inAnHour);
  const [later, setLater] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await pluginsApi.draft(id);
      setDraft(r.draft);
      setError("");
    } catch (e) {
      setError(errorOf(e).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<{ draft: Draft }>, done: string) => {
    setBusy(key);
    setRefusal(null);
    try {
      const r = await fn();
      setDraft(r.draft);
      setShown(null);
      toast(done);
      return true;
    } catch (e) {
      const r = errorOf(e);
      setRefusal(r);
      toast(r.message, "error");
      await load();
      return false;
    } finally {
      setBusy("");
    }
  };

  if (!id) return <Page><ListEmpty title="No draft picked">Open a draft from the review queue.</ListEmpty></Page>;
  if (error && !draft) {
    return (
      <Page>
        <PageHeader detail title="Draft" />
        <div className="mt-6">
          <ListError title="We couldn't load this draft" onRetry={load}>
            {error}
          </ListError>
        </div>
      </Page>
    );
  }
  if (!draft) return <Page><ListSkeleton rows={3} label="Loading the draft" /></Page>;

  const d = draft;
  const current = d.versions.find((v) => v.version === d.version) ?? d.versions[d.versions.length - 1];
  const view = d.versions.find((v) => v.version === (shown ?? d.version)) ?? current;
  const canEdit = ["draft", "in_review", "rejected"].includes(d.status);
  const canSubmit = d.status === "draft" || d.status === "rejected";
  const inReview = d.status === "in_review";
  const canStop = !["stopped", "published", "cancelled", "failed"].includes(d.status);
  const scheduled = d.status === "scheduled";

  const stop = async () => {
    const ok = await confirm({
      title: "Stop this draft for good?",
      message: "A stop is permanent: nothing from this draft can be approved or go out afterwards, even if it is edited. To change the wording instead, edit it.",
      confirmLabel: "Stop for good",
      destructive: true,
    });
    if (ok) await act("stop", () => pluginsApi.stop(d.id), "Stopped. Nothing from this draft will go out.");
  };

  const cancel = async () => {
    const ok = await confirm({
      title: "Cancel the scheduled publish?",
      message: "It won't go out at the set time. The draft stays approved in the history; approve it again to pick a new time.",
      confirmLabel: "Cancel publish",
      cancelLabel: "Keep it scheduled",
    });
    if (ok) await act("cancel", () => pluginsApi.cancel(d.id), "Publish cancelled");
  };

  const approve = () => {
    const at = later ? new Date(when).toISOString() : undefined;
    return act(
      "approve",
      () => pluginsApi.approveDraft(d.id, d.version, at),
      at ? `Approved. It goes out ${new Date(at).toLocaleString()}.` : "Approved. It goes out now.",
    );
  };

  return (
    <Page>
      <PageHeader
        detail
        title={d.title}
        eyebrow={
          <>
            {d.kind} draft from <Link href={pluginHref(d.plugin_id)} className={linkButton}>{d.plugin_name}</Link>
          </>
        }
        status={<DraftStatusChip status={d.status} />}
        lead={
          <>
            Version {d.version} · asked by {d.requested_by}
            {d.target ? ` · goes out through ${d.target}` : ""}
          </>
        }
      />

      {refusal && (
        <div className="mt-6">
          <Refusal code={refusal.code} message={refusal.message} />
        </div>
      )}
      {d.status === "stopped" && (
        <div className="mt-6">
          <Refusal code="stopped" title="Stopped for good" />
        </div>
      )}
      {scheduled && d.publish_at && (
        <p className="mt-6 text-sm text-sky-300" data-testid="scheduled-note">
          Goes out <Time iso={d.publish_at} /> ({new Date(d.publish_at).toLocaleString()}). You can cancel until then.
        </p>
      )}
      {d.status === "published" && (
        <p className="mt-6 text-sm text-emerald-300" data-testid="published-note">
          Published{d.published_at ? ` ${new Date(d.published_at).toLocaleString()}` : ""}.{" "}
          {d.result_url && (
            <a href={d.result_url} target="_blank" rel="noreferrer" className={linkButton}>
              See it
            </a>
          )}
        </p>
      )}
      {d.status === "failed" && d.error && <p className="mt-6 text-sm text-red-300">It didn&apos;t go out: {d.error}</p>}

      <Section
        id="content"
        title={view.version === d.version ? `Version ${view.version}` : `Version ${view.version} (older)`}
        actions={
          canEdit && !editing && view.version === d.version ? (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setText(current.content);
                setTitle(current.title || d.title);
                setEditing(true);
              }}
            >
              Edit
            </button>
          ) : undefined
        }
      >
        {editing ? (
          <form
            className={`${cardClass} flex flex-col gap-4`}
            data-testid="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("edit", () => pluginsApi.editDraft(d.id, text, title), "Saved as a new version")) setEditing(false);
            }}
          >
            <Field id="draft-title" label="Title">
              {(props) => <input {...props} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field id="draft-content" label="Text" helper="Saving makes a new version. An approval waiting on the old version moves to the new one and must be given again.">
              {(props) => <textarea {...props} rows={12} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={primaryButton} disabled={busy === "edit" || !text.trim()}>
                Save new version
              </button>
              <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className={`${cardClass} whitespace-pre-wrap text-sm text-zinc-200`} data-testid="draft-content">
            {view.content}
          </div>
        )}
      </Section>

      {(canSubmit || inReview || canStop || scheduled) && (
        <Section id="decide" title="Decide">
          <div className={`${cardClass} flex flex-col gap-4`} data-testid="decide">
            {canSubmit && (
              <div>
                <button type="button" className={primaryButton} disabled={busy === "submit"} onClick={() => act("submit", () => pluginsApi.submit(d.id), "Sent for review")}>
                  Send for review
                </button>
              </div>
            )}
            {inReview && !d.can_approve && d.why_not && <Refusal code={d.why_not} title="You can't approve this one" />}
            {inReview && d.can_approve && (
              <>
                <p className="text-sm text-zinc-400">You approve version {d.version} exactly as shown. If anyone edits it, it needs approving again.</p>
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">When it goes out</legend>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                    <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} />
                    Now
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                    <input type="radio" name="when" checked={later} onChange={() => setLater(true)} />
                    At a time
                  </label>
                </fieldset>
                {later && (
                  <Field id="publish-at" label="Goes out at" helper="Your own time. It can be cancelled until then.">
                    {(props) => <input {...props} type="datetime-local" className={`${inputClass} max-w-xs`} value={when} onChange={(e) => setWhen(e.target.value)} />}
                  </Field>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primaryButton} disabled={busy === "approve" || (later && !when)} onClick={approve}>
                    {later ? "Approve for that time" : "Approve and publish now"}
                  </button>
                  <button type="button" className={secondaryButton} disabled={busy === "reject"} onClick={() => act("reject", () => pluginsApi.reject(d.id, d.version), "Rejected")}>
                    Reject
                  </button>
                </div>
              </>
            )}
            {scheduled && (
              <div>
                <button type="button" className={secondaryButton} disabled={busy === "cancel"} onClick={cancel}>
                  Cancel the scheduled publish
                </button>
              </div>
            )}
            {canStop && (
              <div>
                <button type="button" className={dangerButton} disabled={busy === "stop"} onClick={stop}>
                  Stop for good
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section id="history" title="Versions">
        <List label="Versions">
          {[...d.versions].reverse().map((v) => (
            <ListRow
              key={v.version}
              testId="draft-version"
              status={{ tone: v.version === d.version ? "success" : "muted" }}
              title={v.title || `Version ${v.version}`}
              meta={[`version ${v.version}`, `by ${v.author}`, d.approval && d.approval.version === v.version ? `approval ${d.approval.status}` : null]}
              time={v.created_at}
              actions={
                v.version !== (shown ?? d.version) ? (
                  <button type="button" className={linkButton} onClick={() => setShown(v.version)}>
                    Read
                  </button>
                ) : undefined
              }
            />
          ))}
        </List>
        <p className="mt-3 text-sm">
          <Link href={runHref(d.run_id)} className={linkButton}>
            The run that wrote it
          </Link>
        </p>
      </Section>
    </Page>
  );
}
