"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DRAFT_STATUS, draftHref, pluginHref, pluginsApi, PluginError, TRIGGER_LABEL, type AuditEvent, type Draft, type PluginRun } from "@/lib/plugins";
import { formatTokens } from "@/lib/usage";
import { AuditList, DraftStatusChip, PluginsGate, Refusal, RunStatusChip } from "@/components/plugins";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton } from "@/components/list";
import { linkButton } from "@/components/ui";

// One plugin run: what started it and with what, how it ended (or why it
// was refused), the drafts it wrote and every step on the audit log.

export default function PluginRunPageGated() {
  return (
    <PluginsGate title="Plugin run">
      <Suspense fallback={<Page><ListSkeleton rows={3} label="Loading the run" /></Page>}>
        <PluginRunPage />
      </Suspense>
    </PluginsGate>
  );
}

function PluginRunPage() {
  const id = useSearchParams().get("id") ?? "";
  const [run, setRun] = useState<PluginRun | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await pluginsApi.run(id);
      setRun(r.run);
      setDrafts(r.artifacts);
      setAudit(r.audit);
      setError("");
    } catch (e) {
      setError(e instanceof PluginError || e instanceof Error ? e.message : "The request failed.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A run that is still going is read again every few seconds.
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), 5000);
    return () => clearInterval(t);
  }, [run, load]);

  if (!id) return <Page><ListEmpty title="No run picked">Open a run from a plugin&apos;s page.</ListEmpty></Page>;
  if (error && !run) {
    return (
      <Page>
        <PageHeader detail title="Plugin run" />
        <div className="mt-6">
          <ListError title="We couldn't load this run" onRetry={load}>
            {error}
          </ListError>
        </div>
      </Page>
    );
  }
  if (!run) return <Page><ListSkeleton rows={3} label="Loading the run" /></Page>;

  const title = typeof run.inputs.brief === "string" && run.inputs.brief ? run.inputs.brief : `${run.plugin_name ?? run.plugin_id} run`;
  return (
    <Page>
      <PageHeader
        detail
        title={title}
        crumb={run.plugin_name ?? run.plugin_id}
        eyebrow={
          <>
            Run of <Link href={pluginHref(run.plugin_id)} className={linkButton}>{run.plugin_name ?? run.plugin_id}</Link> version {run.plugin_version}
          </>
        }
        status={<RunStatusChip status={run.status} />}
        lead={`Started by ${TRIGGER_LABEL[run.trigger]?.toLowerCase() ?? run.trigger}${run.requested_by ? ` (${run.requested_by})` : ""}${run.repo ? ` on ${run.repo}` : ""}.`}
      />

      {(run.status === "refused" || run.status === "failed") && (
        <div className="mt-6">
          <Refusal code={run.code} message={run.reason} title={run.status === "refused" ? "The run was refused" : "The run failed"} />
        </div>
      )}

      <Section id="inputs" title="What it was given">
        <dl className={`${cardClass} grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]`} data-testid="run-inputs">
          {Object.entries(run.inputs).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="capitalize text-zinc-500">{k}</dt>
              <dd className="min-w-0 whitespace-pre-wrap text-zinc-200">{Array.isArray(v) ? v.join(", ") : v}</dd>
            </div>
          ))}
          <dt className="text-zinc-500">Tokens</dt>
          <dd className="text-zinc-200">{formatTokens(run.tokens)}</dd>
        </dl>
      </Section>

      <Section id="drafts" title="Drafts it wrote">
        {drafts.length === 0 ? (
          <ListEmpty title="No drafts">{run.status === "running" || run.status === "queued" ? "Still working." : "This run wrote nothing to review."}</ListEmpty>
        ) : (
          <List label="Drafts it wrote">
            {drafts.map((d) => (
              <ListRow
                key={d.id}
                testId="run-draft"
                status={{ tone: DRAFT_STATUS[d.status]?.tone ?? "neutral" }}
                title={d.title}
                href={draftHref(d.id)}
                meta={[d.kind, `version ${d.version}`]}
                chips={<DraftStatusChip status={d.status} />}
              />
            ))}
          </List>
        )}
      </Section>

      <Section id="audit" title="Every step" description="Who or what acted, each tool and how much it could do, approvals and results.">
        {audit.length === 0 ? <ListEmpty title="Nothing logged yet" /> : <AuditList events={audit} label="Steps of this run" />}
      </Section>
    </Page>
  );
}
