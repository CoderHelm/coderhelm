"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type Review } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Markdown } from "@/components/markdown";
import { useToast } from "@/components/toast";
import { ReReviewButton } from "@/components/re-review-button";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";
import { VerdictPill, riskLabel, triggerLabel } from "../labels";
import { AppliedStandards } from "@/components/applied-standards";

export default function ReviewDetailGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<DetailSkeleton />}>
        <ReviewDetailPage />
      </Suspense>
    </RoleGuard>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <div className="space-y-3" aria-busy="true" aria-label="Loading the review">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    </Page>
  );
}

const backLink = (
  <Link href="/reviewer" className={`text-sm text-zinc-500 hover:text-zinc-300 rounded ${focusRing}`}>
    ← Reviewer
  </Link>
);

type LoadState = "loading" | "ready" | "missing" | "error";

function ReviewDetailPage() {
  const { toast } = useToast();
  const params = useSearchParams();
  const sk = params.get("sk") || "";
  const [review, setReview] = useState<Review | null>(null);
  const [state, setState] = useState<LoadState>(sk ? "loading" : "missing");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  // One thumbs per visit: each press adds to the count, so a second press of
  // the same review would count the same person twice.
  const [rated, setRated] = useState<"up" | "down" | null>(null);

  const load = useCallback(() => {
    if (!sk) {
      setState("missing");
      return;
    }
    api
      .getReview(sk)
      .then((r) => {
        setReview(r);
        setState("ready");
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "";
        // 400 = not a review key, 404 = no such review: both mean the link is wrong.
        setState(/\b(400|404)\b/.test(msg) ? "missing" : "error");
      });
  }, [sk]);

  useEffect(() => { load(); }, [load]);

  const rate = async (value: "up" | "down") => {
    if (!review || rating || rated) return;
    setRating(value);
    try {
      await api.rateReview(review.sk, value);
      setRated(value);
      toast(value === "up" ? "Marked helpful" : "Marked not helpful");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the rating", "error");
    } finally {
      setRating(null);
    }
  };

  const submitComment = async () => {
    if (!review || !comment.trim()) return;
    setSubmitting(true);
    try {
      await api.rateReview(review.sk, "none", comment.trim());
      toast("Note saved");
      setComment("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the note", "error");
    }
    setSubmitting(false);
  };

  if (state === "loading") return <DetailSkeleton />;
  if (state === "missing" || (state === "ready" && !review)) {
    return (
      <Page className="space-y-4">
        {backLink}
        <Callout variant="warning" title="Review not found">
          <p>This link does not point to a review. It may be mistyped, or the review was removed.</p>
          <Link href="/reviewer" className={`mt-2 ${secondaryButton}`}>See all reviews</Link>
        </Callout>
      </Page>
    );
  }
  if (state === "error" || !review) {
    return (
      <Page className="space-y-4">
        {backLink}
        <Callout variant="error" title="Could not load this review">
          <p>Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => { setState("loading"); load(); }}
            className={`mt-2 ${secondaryButton}`}
          >
            Try again
          </button>
        </Callout>
      </Page>
    );
  }

  const prUrl = `https://github.com/${review.repo}/pull/${review.pr_number}`;
  const risk = riskLabel(review.risk);
  const meta = [
    review.head_sha && `commit ${review.head_sha.slice(0, 7)}`,
    review.trigger && `started by: ${triggerLabel(review.trigger).toLowerCase()}`,
    review.posted_as && `posted as ${review.posted_as}`,
    review.created_at && !isNaN(new Date(review.created_at).getTime()) && new Date(review.created_at).toLocaleString(),
  ].filter(Boolean) as string[];

  return (
    <Page>
      <PageHeader
        eyebrow={backLink}
        titleClassName="break-all"
        title={
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className={`rounded text-zinc-100 hover:underline ${focusRing}`}
          >
            {review.repo} #{review.pr_number}
            <span className="sr-only"> (opens GitHub in a new tab)</span>
          </a>
        }
        lead={
          <>
            <span className="flex flex-wrap items-center gap-3">
              <VerdictPill verdict={review.verdict} />
              {risk && <span className="text-xs font-medium text-zinc-400">{risk}</span>}
            </span>
            {meta.length > 0 && (
              <span className="mt-1 block text-xs text-zinc-500">{meta.join(" · ")}</span>
            )}
          </>
        }
        actions={<ReReviewButton repo={review.repo} pr={review.pr_number} className="min-h-9" />}
      />

      <AppliedStandards names={review.applied_standards} className="mt-4" />

      <div className={`mt-6 ${cardClass} overflow-x-auto`}>
        <Markdown>{review.body || "_The review has no text._"}</Markdown>
      </div>

      {review.action_summary && (
        <div className={`mt-4 ${cardClass} overflow-x-auto`}>
          <h2 className="text-sm font-semibold text-zinc-200 mb-2">What happened after the review</h2>
          <Markdown>{review.action_summary}</Markdown>
        </div>
      )}

      {/* Ratings */}
      <section className={`mt-6 ${cardClass}`}>
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">Rate this review</h2>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => rate("up")}
            disabled={!!rating || !!rated}
            aria-pressed={rated === "up"}
            className={`${secondaryButton} hover:border-emerald-500/40`}
          >
            <span aria-hidden="true" className="mr-1">👍</span> Helpful
            <span className="ml-1.5 text-zinc-500">{review.thumbs_up}</span>
          </button>
          <button
            type="button"
            onClick={() => rate("down")}
            disabled={!!rating || !!rated}
            aria-pressed={rated === "down"}
            className={`${secondaryButton} hover:border-red-500/40`}
          >
            <span aria-hidden="true" className="mr-1">👎</span> Not helpful
            <span className="ml-1.5 text-zinc-500">{review.thumbs_down}</span>
          </button>
          {rated && <span className="text-xs text-zinc-500">Thanks, your rating is saved.</span>}
        </div>

        <label htmlFor="review-note" className="block text-xs text-zinc-500 mb-1">
          Leave a note so the reviewer learns
        </label>
        <textarea
          id="review-note"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={4000}
          className={inputClass}
          placeholder="For example: this changes the sign in flow. Flag changes like that next time."
        />
        <button
          type="button"
          onClick={submitComment}
          disabled={submitting || !comment.trim()}
          className={`mt-2 ${primaryButton}`}
        >
          {submitting ? "Saving…" : "Add note"}
        </button>

        {review.rating_comments.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
            {review.rating_comments.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-0.5">
                  <span className="text-zinc-300">{c.by}</span>
                  {c.rating === "up" && <span className="text-emerald-400">marked helpful</span>}
                  {c.rating === "down" && <span className="text-red-400">marked not helpful</span>}
                  {c.at && <span>· {new Date(c.at).toLocaleDateString()}</span>}
                </div>
                <p className="text-zinc-400 whitespace-pre-line break-words">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6">
        <Link href={`/reviewer?repo=${encodeURIComponent(review.repo)}`} className={linkButton}>
          More reviews of {review.repo}
        </Link>
      </p>
    </Page>
  );
}
