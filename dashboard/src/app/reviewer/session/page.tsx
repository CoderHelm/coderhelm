"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, errorStatus, type ReviewSession } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { StatusText } from "@/components/list";
import { secondaryButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { ReReviewButton } from "@/components/re-review-button";
import { useCan } from "@/hooks/use-can";
import { isSessionId, reviewHref, SESSION_POLL_MS, sessionLook } from "./session";
import { SessionActivity, SessionFacts, SessionNotice, SessionOutcome, SessionOverview } from "./sections";

// One review job, step by step (`?id=<job id>`). A PR's "Coderhelm review"
// check links here from its Details link. Each job has its own session, so an
// older check keeps showing its own review. The page refreshes while the
// review runs and the tab is visible.

export default function SessionPageGuarded() {
  return (
    <RoleGuard need="view">
      <Suspense fallback={<SessionSkeleton />}>
        <SessionPage />
      </Suspense>
    </RoleGuard>
  );
}

function SessionSkeleton() {
  return (
    <Page>
      <div className="space-y-3" aria-busy="true" aria-label="Loading the review session">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </Page>
  );
}

type LoadState = "loading" | "ready" | "missing" | "forbidden" | "error";

function SessionPage() {
  const id = useSearchParams().get("id") || "";
  const valid = isSessionId(id);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [state, setState] = useState<LoadState>(valid ? "loading" : "missing");
  const [now, setNow] = useState(() => Date.now());
  // Anyone may read a session; asking for a new review is for those who may.
  const { can } = useCan();

  const load = useCallback(() => {
    if (!valid) return;
    api
      .getReviewSession(id)
      .then((s) => {
        setSession(s);
        setNow(Date.now());
        setState("ready");
      })
      .catch((e: unknown) => {
        const code = errorStatus(e);
        // A failed refresh keeps the session on screen; the next one retries.
        setState((prev) =>
          code === 400 || code === 404 ? "missing" : code === 403 ? "forbidden" : prev === "ready" ? "ready" : "error",
        );
      });
  }, [id, valid]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while the review runs, only while the tab is visible; coming
  // back to the tab refreshes at once.
  const inFlight = !!session?.in_flight;
  useEffect(() => {
    if (!inFlight) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, SESSION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [inFlight, load]);

  if (state === "loading") return <SessionSkeleton />;
  if (state !== "ready" || !session) return <SessionProblem state={state} onRetry={() => { setState("loading"); load(); }} />;

  const look = sessionLook(session.status, session.kind);
  const prUrl = `https://github.com/${session.repo}/pull/${session.pr_number}`;
  const name = `${session.repo.split("/").pop()} #${session.pr_number}`;

  return (
    <Page className="space-y-6" testId="review-session">
      <PageHeader
        detail
        crumb={name}
        title={session.pr_title || `${session.repo} #${session.pr_number}`}
        eyebrow="Review session"
        status={<span data-testid="session-status"><StatusText look={look} /></span>}
        lead={<span className="[overflow-wrap:anywhere]">{session.repo} #{session.pr_number}</span>}
        actions={
          <>
            {session.review_sk && (
              <Link href={reviewHref(session.review_sk)} className={secondaryButton} data-testid="session-review-link">
                See the findings
              </Link>
            )}
            <a href={prUrl} target="_blank" rel="noreferrer" className={`${secondaryButton} gap-1.5`}>
              Open on GitHub
              <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {(session.status === "failed" || session.status === "stalled") && can("reviews") && <ReReviewButton repo={session.repo} pr={session.pr_number} size="md" />}
          </>
        }
      />
      <SessionNotice session={session} />
      <SessionOutcome session={session} />
      <SessionActivity session={session} now={now} />
      <SessionOverview session={session} />
      <SessionFacts session={session} now={now} />
    </Page>
  );
}

function SessionProblem({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  if (state === "forbidden") {
    return (
      <Page className="space-y-4">
        <Callout variant="info" title="You can't open this review">
          <p>Your role can&apos;t see reviews. Ask a team admin if you need it.</p>
          <Link href="/" className={`mt-2 ${secondaryButton}`}>Back to Runs</Link>
        </Callout>
      </Page>
    );
  }
  if (state === "error") {
    return (
      <Page className="space-y-4">
        <Callout variant="error" title="Could not load the review">
          <p>Check your connection and try again.</p>
          <button type="button" onClick={onRetry} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  return (
    <Page className="space-y-4">
      <Callout variant="warning" title="Review not found">
        <p>
          This link doesn&apos;t point to a review of your team. If you belong to more than one team, switch to the team
          that owns the repo and open the link again. Older reviews are kept for a while, then removed.
        </p>
        <Link href="/reviewer" className={`mt-2 ${secondaryButton}`}>See the Reviewer</Link>
      </Callout>
    </Page>
  );
}
