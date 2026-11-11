"use client";

// Insights › Infrastructure, "Running in AWS": what Coderhelm read in the
// team's AWS accounts (one row per fix group: an Auto Scaling group, a node
// group, a database), with its versions, whether the internet reaches it,
// where it is defined, what AWS has pending, and its open findings, each
// linked to the finding on Security › Infrastructure.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { Tabs } from "@/components/tabs";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { AwsIcon } from "@/components/icons";
import { Chip, DetailBlock, List, ListRow, ListSkeleton, SearchField, Time } from "@/components/list";
import { Code } from "@/components/settings";
import { linkButton, primaryButton } from "@/components/ui";
import { KIND_LABEL, countWords, findingHref, infraApi, versionWords, type InfraAccount, type InfraResource } from "@/lib/infra-security";
import { ExposureText, MissingReads, dayWords } from "../security/infrastructure/parts";
import { OutLink } from "../security/parts";

/** The two views of Insights › Infrastructure, as tabs. */
export function InfraViews({ value }: { value: "review" | "running" }) {
  return (
    <Tabs
      label="Infrastructure views"
      value={value}
      items={[
        { value: "review", label: "Code review", href: "/infrastructure" },
        { value: "running", label: "Running in AWS", href: "/infrastructure?view=running" },
      ]}
    />
  );
}

export function LiveResources() {
  const [data, setData] = useState<{ accounts: InfraAccount[]; resources: InfraResource[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    setError(null);
    setData(null);
    infraApi.resources().then(
      (r) => live && setData(r),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    const list = data?.resources ?? [];
    const sorted = [...list].sort((a, b) => b.findings.length - a.findings.length || a.name.localeCompare(b.name));
    if (!words) return sorted;
    return sorted.filter((r) => [r.name, r.id, KIND_LABEL[r.kind], versionWords(r), r.defined_in?.repo ?? ""].join(" ").toLowerCase().includes(words));
  }, [data, q]);

  const withFindings = (data?.resources ?? []).filter((r) => r.findings.length > 0).length;
  return (
    <Page>
      <PageHeader
        title="Infrastructure"
        lead="Security, cost and reliability review of the code that sets up your cloud infrastructure, and what runs in your AWS accounts."
      />
      <InfraViews value="running" />
      <div className="mt-6">
        {error ? (
          <Problem title="We couldn't load what runs in AWS" onRetry={() => setAttempt((n) => n + 1)} testId="resources-error">
            {error}
          </Problem>
        ) : !data ? (
          <ListSkeleton rows={4} label="Loading resources" />
        ) : data.resources.length === 0 ? (
          <EmptyState
            icon={<AwsIcon />}
            title="Nothing read from AWS yet"
            testId="resources-empty"
            action={
              <Link href="/settings/integrations/aws" className={primaryButton}>
                See AWS accounts
              </Link>
            }
          >
            Switch on Infrastructure vulnerabilities for a connected AWS account. Coderhelm reads what runs there once a day, read-only, and lists it here.
          </EmptyState>
        ) : (
          <>
            <MissingReads accounts={data.accounts} />
            <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400" data-testid="resources-summary">
                {data.resources.length} resource{data.resources.length === 1 ? "" : "s"}, {withFindings} with something to fix.{" "}
                <Link href="/security/infrastructure" className={linkButton}>
                  See the findings
                </Link>
              </p>
              <div className="w-full sm:w-64">
                <SearchField value={q} onChange={setQ} label="Search resources" placeholder="Search resources" />
              </div>
            </div>
            <div className="mt-3">
              {shown.length === 0 ? (
                <EmptyState compact title="No resources match" onClear={() => setQ("")} />
              ) : (
                <List label="Resources">
                  {shown.map((r) => (
                    <ResourceRow key={r.id} r={r} />
                  ))}
                </List>
              )}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

function ResourceRow({ r }: { r: InfraResource }) {
  const version = versionWords(r);
  const d = r.defined_in;
  const where = d ? [d.repo, d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : "", d.address].filter(Boolean).join(" · ") : "";
  const whereHref = d?.repo && d.file ? `https://github.com/${d.repo}/blob/HEAD/${d.file}${d.line ? `#L${d.line}` : ""}` : null;
  return (
    <ListRow
      testId="resource-row"
      data={{ kind: r.kind }}
      status={{ tone: r.findings.length > 0 ? "attention" : "success" }}
      title={`${KIND_LABEL[r.kind] ?? r.kind} ${r.name}`}
      titleText={r.id}
      meta={[version, countWords(r.kind, r.count), <ExposureText key="x" exposure={r.exposure} />, `${r.account} · ${r.region}`]}
      chips={
        <>
          {r.findings.length > 0 ? (
            <Link href={findingHref(r.findings[0])} className={`${linkButton} !text-xs`} data-testid="resource-findings">
              {r.findings.length} open finding{r.findings.length === 1 ? "" : "s"}
            </Link>
          ) : (
            <Chip tone="success">Nothing to fix</Chip>
          )}
          {r.pending.length > 0 && <Chip tone="attention">Pending in AWS</Chip>}
          {r.source === "iac" && (
            <span title="Read from your Terraform: Coderhelm never reads Lambda function settings, which hold environment variables.">
              <Chip tone="muted">From your code</Chip>
            </span>
          )}
        </>
      }
      time={r.seen_at}
      details={
        <>
          <DetailBlock title="Versions">
            <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {Object.entries(r.versions)
                .filter(([k, v]) => typeof v === "string" && v && k !== "ami")
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-zinc-400">{k.replace(/_/g, " ")}</dt>
                    <dd className="min-w-0 text-zinc-300 [overflow-wrap:anywhere]">{k === "oldest_task_started" ? <Time iso={v as string} /> : (v as string)}</dd>
                  </div>
                ))}
            </dl>
          </DetailBlock>
          <DetailBlock title="Where it's defined">
            {whereHref ? <OutLink href={whereHref}>{where}</OutLink> : <span className="text-zinc-300">{where || "Not found in your connected repos yet"}</span>}
          </DetailBlock>
          {r.pending.length > 0 && (
            <DetailBlock title="Pending in AWS">
              <ul className="space-y-1">
                {r.pending.map((p) => (
                  <li key={`${p.kind}-${p.name}`} className="text-sm text-zinc-300">
                    <Code>{p.name}</Code> {p.description}
                    {p.apply_by && <span className="text-zinc-400"> (apply by {dayWords(p.apply_by)})</span>}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}
          {r.findings.length > 0 && (
            <DetailBlock title="Open findings">
              <div className="flex flex-wrap gap-3">
                {r.findings.map((id, i) => (
                  <Link key={id} href={findingHref(id)} className={linkButton}>
                    {r.findings.length === 1 ? "Open it on Security" : `Finding ${i + 1} on Security`}
                  </Link>
                ))}
              </div>
            </DetailBlock>
          )}
        </>
      }
      detailsFor={`details of ${r.name}`}
    />
  );
}
