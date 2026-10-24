"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type TestRecommendation } from "@/lib/api";
import { EVIDENCE_LABEL, RECOMMENDATION_STATUS, plural, testHref } from "@/lib/tests";
import { errorMessage } from "@/lib/data-sources";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { EmptyBox, LoadError, Loading, SectionHeading } from "./common";
import { useLoad } from "./use-load";

export function CoverageView({ repo, canEdit }: { repo: string; canEdit: boolean }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { data, setData, error, loading, reload } = useLoad(() => api.getTestCoverage(repo), `coverage:${repo}`);
  const [busy, setBusy] = useState("");
  const [showCovered, setShowCovered] = useState(false);

  const setStatus = (id: string, status: TestRecommendation["status"]) =>
    setData((prev) =>
      prev ? { ...prev, recommendations: prev.recommendations.map((r) => (r.id === id ? { ...r, status } : r)) } : prev,
    );

  const accept = async (r: TestRecommendation) => {
    const ok = await confirm({
      title: "Write this test?",
      message:
        "Coderhelm writes the test and opens a pull request for your team to review. It only opens the PR once the test builds and passes 10 runs in a row, and for a bug, fails on the code before the fix.",
      confirmLabel: "Write the test",
    });
    if (ok !== "primary") return;
    setBusy(r.id);
    try {
      await api.acceptTestRecommendation(r.id);
      setStatus(r.id, "generating");
      toast("Coderhelm is writing the test");
    } catch (e) {
      toast(errorMessage(e, "Couldn't start it."), "error");
    } finally {
      setBusy("");
    }
  };

  const dismiss = async (r: TestRecommendation) => {
    setBusy(r.id);
    try {
      await api.dismissTestRecommendation(r.id);
      setStatus(r.id, "dismissed");
      toast("Dismissed");
    } catch (e) {
      toast(errorMessage(e, "Couldn't dismiss it."), "error");
    } finally {
      setBusy("");
    }
  };

  if (error) return <LoadError what="coverage" message={error} onRetry={reload} />;
  if (loading && !data) return <Loading what="coverage" />;
  const areas = data?.areas ?? [];
  const gaps = areas.filter((a) => !a.covered);
  const covered = areas.filter((a) => a.covered);
  const open = (data?.recommendations ?? []).filter((r) => r.status !== "dismissed");

  return (
    <div className="space-y-8">
      <section aria-labelledby="recs-heading">
        <SectionHeading id="recs-heading">Tests worth adding</SectionHeading>
        <p className="mb-3 max-w-prose text-sm text-zinc-400">
          Each suggestion comes with its evidence: a bug fixed without a test, a change to code no test covers, a page no test visits, or a busy journey.
        </p>
        {open.length === 0 ? (
          <EmptyBox>No suggestions right now.</EmptyBox>
        ) : (
          <ul aria-label="Suggested tests" className="space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 basis-64 text-sm font-medium text-zinc-100">{r.title}</p>
                  <StatusPill tone={r.status === "pr_opened" ? "success" : "neutral"}>{RECOMMENDATION_STATUS[r.status]}</StatusPill>
                </div>
                {r.area && <p className="mt-1 text-xs text-zinc-500">Area: {r.area}</p>}
                <p className="mt-2 max-w-prose text-sm text-zinc-300">{r.why}</p>
                {r.evidence.length > 0 && (
                  <ul aria-label="Evidence" className="mt-2 space-y-1 text-xs text-zinc-400">
                    {r.evidence.map((ev, i) => (
                      <li key={i}>
                        <span className="text-zinc-500">{EVIDENCE_LABEL[ev.kind]}:</span>{" "}
                        {ev.url ? (
                          <a href={ev.url} target="_blank" rel="noreferrer" className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100">{ev.text}</a>
                        ) : (
                          ev.text
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.pr_url && <a href={r.pr_url} target="_blank" rel="noreferrer" className={linkButton}>Open the PR</a>}
                  {canEdit && r.status === "open" && (
                    <>
                      <button type="button" onClick={() => accept(r)} disabled={busy === r.id} className={`${primaryButton} !min-h-8 !py-1`}>
                        Write this test
                      </button>
                      <button type="button" onClick={() => dismiss(r)} disabled={busy === r.id} className={`${secondaryButton} !min-h-8 !py-1`}>
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="areas-heading">
        <SectionHeading id="areas-heading">Areas</SectionHeading>
        <p className="mb-3 max-w-prose text-sm text-zinc-400">
          The parts of the app your test map names, and the tests that cover them. {gaps.length > 0 ? `${plural(gaps.length, "area has", "areas have")} no test.` : "Every area has a test."}
        </p>
        {areas.length === 0 ? (
          <EmptyBox>
            No test map found. Add one (for example <code className="text-zinc-300">e2e/test-map.json</code> listing each area&apos;s paths) and Coderhelm can show which parts of the app have no test.
          </EmptyBox>
        ) : (
          <>
            <ul aria-label="Areas without a test" className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
              {gaps.map((a) => <AreaRow key={a.area} area={a} />)}
              {showCovered && covered.map((a) => <AreaRow key={a.area} area={a} />)}
            </ul>
            {covered.length > 0 && (
              <p className="mt-3">
                <button type="button" onClick={() => setShowCovered((v) => !v)} className={linkButton} aria-expanded={showCovered}>
                  {showCovered ? "Hide covered areas" : `Show ${plural(covered.length, "covered area")}`}
                </button>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AreaRow({ area }: { area: { area: string; paths: string[]; tests: { id: string; title: string }[]; runs_30d: number; covered: boolean } }) {
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-zinc-100">{area.area}</p>
        {area.covered ? <StatusPill tone="success">{plural(area.tests.length, "test")}</StatusPill> : <StatusPill tone="warning">No test</StatusPill>}
      </div>
      {area.paths.length > 0 && (
        <p className="mt-1 break-all font-mono text-xs text-zinc-500">{area.paths.slice(0, 4).join("  ")}{area.paths.length > 4 ? `  +${area.paths.length - 4} more` : ""}</p>
      )}
      {area.tests.length > 0 && (
        <ul aria-label={`Tests for ${area.area}`} className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {area.tests.slice(0, 6).map((t) => (
            <li key={t.id} className="min-w-0 max-w-full">
              <Link href={testHref(t.id)} className={`${linkButton} text-left`}>{t.title}</Link>
            </li>
          ))}
        </ul>
      )}
      {area.covered && <p className="mt-1 text-xs text-zinc-500">{plural(area.runs_30d, "run")} in the last 30 days</p>}
    </li>
  );
}
