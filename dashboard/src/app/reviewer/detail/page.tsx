"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type Review } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Markdown } from "@/components/markdown";
import { ChatMarkdown } from "@/components/chat-markdown";
import { MarkdownEditor, clearDraft } from "@/components/markdown-editor";
import { langFromPath } from "@/lib/highlight";
import { useToast } from "@/components/toast";
import { ReReviewButton } from "@/components/re-review-button";
import { Callout } from "@/components/callout";
import { HelpLink } from "@/components/support";
import { Skeleton } from "@/components/skeleton";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";
import { ExternalLinkIcon, ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import { TONES, Time } from "@/components/list";
import { VerdictPill, RiskText } from "../labels";
import { WorkUsedLine } from "@/components/work-used";
import { bySeverity, fileUrl, reviewParts, type Finding } from "./findings";

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

type LoadState = "loading" | "ready" | "missing" | "error";

// What started the review, as the end of "Triggered by …".
const TRIGGERED_BY: Record<string, string> = {
  labeled: "Triggered by the review label",
  opened: "Triggered when the PR was opened",
  reopened: "Triggered when the PR was reopened",
  synchronize: "Triggered by new commits",
  ready_for_review: "Triggered when the PR was marked ready",
  reply: "Triggered by a reply to the reviewer",
  rerequest: "Asked for again",
  sweep: "Picked up by the reviewer's catch-up check",
  reconcile: "Picked up by the reviewer's catch-up check",
};

function triggeredBy(trigger: string): string | null {
  if (!trigger) return null;
  return TRIGGERED_BY[trigger] ?? `Triggered by: ${trigger.replace(/_/g, " ")}`;
}

/**
 * How the verdict reached GitHub, in words, when that differs from the
 * verdict. GitHub doesn't let a PR's author approve or request changes, so on
 * a PR Coderhelm opened the verdict goes up as a comment: a review whose
 * verdict is an approval or a change request but was posted as a comment is
 * one of those. Older reviews had a "comment" verdict of their own.
 */
function postedNote(verdict: string, postedAs: string): string | null {
  if (verdict === "QUESTION") return "Answered in a comment on the PR.";
  if (verdict === "COMMENT") return "Posted as a comment. Reviews from before verdicts were always an approval or a change request.";
  if (postedAs === "COMMENT" && (verdict === "APPROVE" || verdict === "REQUEST_CHANGES")) {
    return "Posted as a comment because Coderhelm opened this PR. GitHub doesn't let a PR's author approve or request changes.";
  }
  if (postedAs === "APPROVE") return "Posted on GitHub as an approval.";
  if (postedAs === "REQUEST_CHANGES") return "Posted on GitHub as a change request.";
  return null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ReviewDetailPage() {
  const params = useSearchParams();
  const sk = params.get("sk") || "";
  const [review, setReview] = useState<Review | null>(null);
  const [state, setState] = useState<LoadState>(sk ? "loading" : "missing");
  // Older reviews don't keep the PR's title; the live status may still have it.
  const [liveTitle, setLiveTitle] = useState("");

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

  const repo = review?.repo ?? "";
  const prNumber = review?.pr_number ?? 0;
  const hasTitle = !!review?.pr_title;
  useEffect(() => {
    if (!repo || !prNumber || hasTitle) return;
    let live = true;
    api
      .listLivePrs(repo)
      .then((prs) => {
        const t = prs.find((p) => p.pr_number === prNumber)?.pr_title;
        if (live && t) setLiveTitle(t);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repo, prNumber, hasTitle]);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "missing" || (state === "ready" && !review)) {
    return (
      <Page className="space-y-4">
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

  const created = review.created_at && !isNaN(new Date(review.created_at).getTime()) ? review.created_at : "";

  return (
    <Page>
      <Header review={review} title={review.pr_title || liveTitle} />

      <WorkUsedLine
        query={
          created
            ? {
                origin: `${review.repo}#${review.pr_number}`,
                repo: review.repo,
                pr: review.pr_number,
                // The review is kept when it's done; what it read came before.
                since: new Date(new Date(created).getTime() - 2 * 3600_000).toISOString(),
              }
            : null
        }
        standardNames={review.applied_standards}
        title="What the reviewer used"
        className="mt-6"
      />

      <ReviewBody review={review} />

      {review.action_summary && (
        <section className={`mt-6 ${cardClass} overflow-x-auto`} aria-labelledby="after-review">
          <h2 id="after-review" className="mb-2 text-sm font-semibold text-zinc-200">What happened after the review</h2>
          <Markdown>{review.action_summary}</Markdown>
        </section>
      )}

      <Rating review={review} onSaved={load} />

      <p className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/reviewer?repo=${encodeURIComponent(review.repo)}`} className={linkButton}>
          More reviews of {shortRepo(review.repo)}
        </Link>
        <HelpLink item={{ kind: "review", id: sk, label: `${review.repo} #${review.pr_number}`, repo: review.repo }}>
          Something wrong with this review?
        </HelpLink>
      </p>
    </Page>
  );
}

const shortRepo = (repo: string) => repo.split("/").pop() || repo;

const externalLink = `rounded hover:underline ${focusRing}`;

function Header({ review, title }: { review: Review; title: string }) {
  const prUrl = `https://github.com/${review.repo}/pull/${review.pr_number}`;
  const sha = review.head_sha;
  const posted = postedNote(review.verdict, review.posted_as);
  const trigger = triggeredBy(review.trigger);
  const repoRef = (
    <span title={review.repo}>
      {shortRepo(review.repo)} #{review.pr_number}
    </span>
  );
  return (
    <div className="min-w-0" data-testid="review-header">
      <PageHeader
        detail
        crumb={`${shortRepo(review.repo)} #${review.pr_number}`}
        title={
          <a href={prUrl} target="_blank" rel="noreferrer" className={`relative block truncate ${externalLink}`} title={title || review.repo}>
            {title || repoRef}
            <span className="sr-only"> (opens the PR on GitHub in a new tab)</span>
          </a>
        }
        titleClassName="w-full"
        lead={title ? <span className="text-zinc-500">{repoRef}</span> : undefined}
        actions={
          <>
            <a href={prUrl} target="_blank" rel="noreferrer" className={`${secondaryButton} gap-1.5`}>
              Open PR on GitHub
              <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <ReReviewButton repo={review.repo} pr={review.pr_number} className="min-h-9 !rounded-lg !px-4 !text-sm font-medium" />
          </>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <VerdictPill verdict={review.verdict} />
        <RiskText risk={review.risk} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500" aria-label="About this review">
        {trigger && <li>{trigger}</li>}
        {sha && (
          <li>
            Reviewed commit{" "}
            <a href={`https://github.com/${review.repo}/commit/${sha}`} target="_blank" rel="noreferrer" className={`font-mono text-zinc-300 ${externalLink}`}>
              {sha.slice(0, 7)}
            </a>
          </li>
        )}
        {review.created_at && (
          <li>
            <Time iso={review.created_at} />
          </li>
        )}
      </ul>
      {posted && <p className="mt-1.5 max-w-prose text-xs text-zinc-500" data-testid="posted-note">{posted}</p>}
    </div>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  blocking: TONES.danger.chip,
  high: TONES.danger.chip,
  medium: TONES.waiting.chip,
  low: TONES.neutral.chip,
  nit: TONES.muted.chip,
};

const KIND_WORD: Record<string, string> = {
  defect: "Defect",
  concern: "Unverified concern",
  question: "Question",
  note: "Note",
};

const chip = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

function FindingCard({ f, repo, sha }: { f: Finding; repo: string; sha: string }) {
  const url = fileUrl(repo, sha, f.file, f.line);
  const where = f.file ? `${f.file}${f.line > 0 ? `:${f.line}` : ""}` : "";
  return (
    <li className={`${cardClass} space-y-2`} data-testid="finding">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chip} ${SEVERITY_TONE[f.severity] ?? TONES.neutral.chip}`}>{f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}</span>
        {f.kind && <span className={`${chip} ${TONES.muted.chip}`}>{KIND_WORD[f.kind] ?? f.kind}</span>}
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 [overflow-wrap:anywhere]">{f.title || "Untitled finding"}</h3>
      {where &&
        (url ? (
          <a href={url} target="_blank" rel="noreferrer" className={`inline-block max-w-full font-mono text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200 hover:decoration-zinc-400 [overflow-wrap:anywhere] ${focusRing} rounded`}>
            {where}
            <span className="sr-only"> (opens the file on GitHub)</span>
          </a>
        ) : (
          <p className="font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]">{where}</p>
        ))}
      {f.body && (
        <div className="min-w-0 overflow-x-auto [&_p:last-child]:mb-0">
          <Markdown codeLang={langFromPath(f.file)}>{f.body}</Markdown>
        </div>
      )}
    </li>
  );
}

function FindingGroup({ id, title, list, repo, sha }: { id: string; title: string; list: Finding[]; repo: string; sha: string }) {
  if (list.length === 0) return null;
  return (
    <section className="mt-6" aria-labelledby={id}>
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title} <span className="text-zinc-600">· {list.length}</span>
      </h2>
      <ul className="mt-2 space-y-3">
        {list.map((f, i) => (
          <FindingCard key={`${f.file}:${f.line}:${i}`} f={f} repo={repo} sha={sha} />
        ))}
      </ul>
    </section>
  );
}

function ReviewBody({ review }: { review: Review }) {
  const { summary, findings, rest } = reviewParts(review);
  const known = findings.every((f) => f.holds !== null);
  const toFix = known ? findings.filter((f) => f.holds).sort(bySeverity) : [];
  const notes = known ? findings.filter((f) => !f.holds).sort(bySeverity) : [];
  const counts = known
    ? [toFix.length > 0 && `${toFix.length} to fix`, notes.length > 0 && plural(notes.length, "note", "notes")].filter(Boolean).join(" · ")
    : plural(findings.length, "finding", "findings");
  return (
    <>
      <section className={`mt-6 ${cardClass}`} aria-labelledby="review-summary">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="review-summary" className="text-sm font-semibold text-zinc-200">Summary</h2>
          {findings.length > 0 && <span className="text-xs text-zinc-500" data-testid="finding-counts">{counts}</span>}
        </div>
        <div className="min-w-0 overflow-x-auto [&_p:last-child]:mb-0">
          <Markdown>{summary || (findings.length > 0 ? "_No summary._" : "_The review has no text._")}</Markdown>
        </div>
      </section>

      {known ? (
        <>
          <FindingGroup id="findings-fix" title="To fix" list={toFix} repo={review.repo} sha={review.head_sha} />
          <FindingGroup id="findings-notes" title="Notes" list={notes} repo={review.repo} sha={review.head_sha} />
        </>
      ) : (
        <FindingGroup id="findings-all" title="Findings" list={[...findings].sort(bySeverity)} repo={review.repo} sha={review.head_sha} />
      )}

      {rest && (
        <section className={`mt-6 ${cardClass} overflow-x-auto`} aria-label="More from the review">
          <Markdown>{rest}</Markdown>
        </section>
      )}
    </>
  );
}

function Rating({ review, onSaved }: { review: Review; onSaved: () => void }) {
  const { toast } = useToast();
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  // One answer per visit: each press adds to the count, so a second press of
  // the same review would count the same person twice.
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const rate = async (value: "up" | "down") => {
    if (rating || rated) return;
    setRating(value);
    try {
      await api.rateReview(review.sk, value);
      setRated(value);
      setNoteOpen(true);
      toast(value === "up" ? "Saved: the review was right" : "Saved: the review was wrong");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the rating", "error");
    } finally {
      setRating(null);
    }
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api.rateReview(review.sk, "none", comment.trim());
      clearDraft(`review-note:${review.sk}`);
      toast("Note saved");
      setComment("");
      setNoteOpen(false);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the note", "error");
    }
    setSubmitting(false);
  };

  const answer = (value: "up" | "down") => {
    const Icon = value === "up" ? ThumbsUpIcon : ThumbsDownIcon;
    const chosen = rated === value;
    return (
      <button
        type="button"
        onClick={() => rate(value)}
        disabled={!!rating || !!rated}
        aria-pressed={chosen}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default motion-reduce:transition-none ${focusRing} ${
          chosen
            ? value === "up"
              ? TONES.success.chip
              : TONES.danger.chip
            : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        }`}
      >
        <span aria-hidden="true" className="inline-flex"><Icon /></span>
        {value === "up" ? "Yes" : "No"}
      </button>
    );
  };

  const total = review.thumbs_up + review.thumbs_down;
  return (
    <section className={`mt-6 ${cardClass}`} aria-labelledby="rate-review">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="rate-review" className="text-sm font-semibold text-zinc-200">Was this review right?</h2>
        <div className="flex items-center gap-2" role="group" aria-labelledby="rate-review">
          {answer("up")}
          {answer("down")}
        </div>
        {rated ? (
          <span className="text-xs text-zinc-500" role="status">Thanks, your answer is saved.</span>
        ) : (
          !noteOpen && (
            <button type="button" onClick={() => setNoteOpen(true)} className={linkButton}>
              Add a note
            </button>
          )
        )}
        {total > 0 && (
          <span className="text-xs text-zinc-500 sm:ml-auto" data-testid="rating-counts">
            {review.thumbs_up} said yes · {review.thumbs_down} said no
          </span>
        )}
      </div>

      {noteOpen && (
        <div className="mt-4">
          <label htmlFor="review-note" className="mb-1.5 block text-sm font-medium text-zinc-200">
            {rated ? "Tell the reviewer why (optional)" : "Leave a note so the reviewer learns"}
          </label>
          <MarkdownEditor
            textareaRef={noteRef}
            id="review-note"
            variant="prose"
            value={comment}
            onChange={setComment}
            minRows={3}
            maxLength={4000}
            draftKey={`review-note:${review.sk}`}
            onSubmitShortcut={() => void submitComment()}
            placeholder="For example: this changes the sign in flow. Flag changes like that next time."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={submitComment} disabled={submitting || !comment.trim()} className={primaryButton}>
              {submitting ? "Saving…" : "Save note"}
            </button>
            <button type="button" onClick={() => { setNoteOpen(false); setComment(""); }} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-500">
        Coderhelm also learns from your replies on the PR on its own, so there is no need to repeat them here.
      </p>

      {review.rating_comments.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-zinc-800 pt-4" aria-label="Notes on this review">
          {review.rating_comments.map((c, i) => (
            <li key={i} className="text-sm">
              <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span className="text-zinc-300">{c.by}</span>
                {c.rating === "up" && <span className={TONES.success.text}>said it was right</span>}
                {c.rating === "down" && <span className={TONES.danger.text}>said it was wrong</span>}
                {c.at && <span>· {new Date(c.at).toLocaleDateString()}</span>}
              </div>
              <div className="break-words"><ChatMarkdown breaks>{c.text}</ChatMarkdown></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
