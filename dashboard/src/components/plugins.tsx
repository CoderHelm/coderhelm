"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePluginsFlag } from "@/hooks/use-plugins-flag";
import { DRAFT_STATUS, RISK_ABOUT, RISK_LABEL, refusalText, RUN_STATUS, type AuditEvent, type DraftStatus, type Risk, type RunStatus } from "@/lib/plugins";
import { Callout } from "./callout";
import { Chip, List, ListRow, ListSkeleton, type Tone } from "./list";
import { Page, PageHeader } from "./page";
import { linkButton } from "./ui";
import { Code } from "./settings/code";

/**
 * Renders a plugin page only when the team's `plugins` flag is on; otherwise
 * says so plainly. `title` names the page while it checks.
 */
export function PluginsGate({ title, children }: { title: string; children: ReactNode }) {
  const flag = usePluginsFlag();
  if (flag === "checking") {
    return (
      <Page>
        <PageHeader title={title} />
        <div className="mt-8">
          <ListSkeleton rows={3} label="Loading" />
        </div>
      </Page>
    );
  }
  if (flag === "off") {
    return (
      <Page>
        <PageHeader title={title} />
        <div className="mt-6 max-w-xl" data-testid="plugins-off">
          <Callout title="Plugins are not turned on for this team">
            <p>Plugins are being switched on team by team. Nothing here runs until then.</p>
            <p className="pt-1">
              <Link href="/" className={linkButton}>
                Back to Runs
              </Link>
            </p>
          </Callout>
        </div>
      </Page>
    );
  }
  return <>{children}</>;
}

const RISK_TONE: Record<Risk, Tone> = { read: "neutral", write: "waiting", consequential: "danger" };

/** How much a tool may do, as a chip with its meaning on hover. */
export function RiskChip({ risk }: { risk: Risk }) {
  return (
    <span data-testid="risk-chip" data-risk={risk}>
      <Chip tone={RISK_TONE[risk]} title={RISK_ABOUT[risk]}>
        {RISK_LABEL[risk]}
      </Chip>
    </span>
  );
}

export function DraftStatusChip({ status }: { status: DraftStatus }) {
  const s = DRAFT_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span data-testid="draft-status" data-status={status}>
      <Chip tone={s.tone}>{s.label}</Chip>
    </span>
  );
}

export function RunStatusChip({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span data-testid="run-status" data-status={status}>
      <Chip tone={s.tone}>{s.label}</Chip>
    </span>
  );
}

/** A refusal, said plainly: the code's meaning, or the server's own sentence. */
export function Refusal({ code, message, title = "This can't be done" }: { code?: string; message?: string; title?: string }) {
  const text = refusalText(code) || message || "";
  if (!text) return null;
  return (
    <div data-testid="refusal" data-code={code || ""}>
      <Callout variant="warning" title={title}>
        <p>{text}</p>
      </Callout>
    </div>
  );
}

const ACTOR_KIND: Record<AuditEvent["actor_kind"], string> = { person: "Person", agent: "Agent", schedule: "Schedule", system: "Coderhelm" };

/** "draft.approved" → "draft approved". */
export function actionWords(action: string): string {
  return action.replace(/[._]/g, " ");
}

/** Audit events as a list, newest first as the server sends them. */
export function AuditList({ events, label = "Audit log" }: { events: AuditEvent[]; label?: string }) {
  return (
    <List label={label}>
      {events.map((e) => (
        <ListRow
          key={e.id}
          testId="audit-event"
          data={{ action: e.action }}
          status={{ tone: /fail|refus|denied|reject|stop/.test(e.result + e.action) ? "danger" : e.risk === "consequential" ? "waiting" : "neutral" }}
          title={
            <>
              {actionWords(e.action)}
              {e.tool && <> <Code>{e.tool}</Code></>}
            </>
          }
          meta={[
            `${ACTOR_KIND[e.actor_kind] ?? e.actor_kind}: ${e.actor}`,
            e.plugin_id ? `${e.plugin_id}${e.plugin_version ? ` ${e.plugin_version}` : ""}` : null,
            e.result,
          ]}
          summary={e.detail}
          chips={e.risk ? <RiskChip risk={e.risk} /> : undefined}
          time={e.at}
        />
      ))}
    </List>
  );
}
