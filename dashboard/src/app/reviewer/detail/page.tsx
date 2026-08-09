"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type Review } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Markdown } from "@/components/markdown";
import { useToast } from "@/components/toast";

export default function ReviewDetailGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<div className="text-zinc-500 text-sm">Loading…</div>}>
        <ReviewDetailPage />
      </Suspense>
    </RoleGuard>
  );
}

function verdictBadge(v: string) {
  const map: Record<string, string> = {
    APPROVE: "bg-green-500/10 text-green-400 border-green-500/30",
    REQUEST_CHANGES: "bg-red-500/10 text-red-400 border-red-500/30",
    QUESTION: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const label: Record<string, string> = {
    APPROVE: "Approved",
    REQUEST_CHANGES: "Changes requested",
    QUESTION: "Answered",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${map[v] ?? "bg-zinc-700/30 text-zinc-400 border-zinc-600"}`}>
      {label[v] ?? v}
    </span>
  );
}

function ReviewDetailPage() {
  const { toast } = useToast();
  const params = useSearchParams();
  const sk = params.get("sk") || "";
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!sk) return;
    api
      .getReview(sk)
      .then(setReview)
      .catch(() => setReview(null))
      .finally(() => setLoading(false));
  }, [sk]);

  useEffect(() => { load(); }, [load]);

  const rate = async (rating: "up" | "down") => {
    if (!review) return;
    try {
      await api.rateReview(review.sk, rating);
      toast(rating === "up" ? "Marked helpful 👍" : "Marked unhelpful 👎");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rating failed", "error");
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
      toast(e instanceof Error ? e.message : "Save failed", "error");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="text-zinc-500 text-sm">Loading…</div>;
  if (!review) return <div className="text-zinc-500 text-sm">Review not found.</div>;

  const prUrl = `https://github.com/${review.repo}/pull/${review.pr_number}`;

  return (
    <div className="max-w-3xl">
      <Link href="/reviewer" className="text-sm text-zinc-500 hover:text-zinc-300">← Reviewer</Link>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {verdictBadge(review.verdict)}
        {review.risk && review.risk !== "N/A" && (
          <span className="text-xs font-medium text-zinc-400">risk: {review.risk}</span>
        )}
        <a href={prUrl} target="_blank" rel="noreferrer" className="text-lg font-semibold text-zinc-100 hover:underline">
          {review.repo} #{review.pr_number}
        </a>
      </div>
      <div className="mt-1 text-xs text-zinc-500 flex items-center gap-3 flex-wrap">
        {review.head_sha && <span>commit {review.head_sha.slice(0, 7)}</span>}
        {review.trigger && <span>· triggered by {review.trigger}</span>}
        {review.posted_as && <span>· posted as {review.posted_as}</span>}
        {review.created_at && <span>· {new Date(review.created_at).toLocaleString()}</span>}
      </div>

      <div className="mt-5 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <Markdown>{review.body || "_No body._"}</Markdown>
      </div>

      {review.action_summary && (
        <div className="mt-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
          <Markdown>{review.action_summary}</Markdown>
        </div>
      )}

      {/* Ratings */}
      <div className="mt-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">Rate this review</h2>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => rate("up")} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-green-600/20 border border-zinc-700 hover:border-green-500/40 text-sm transition-colors">
            👍 Helpful <span className="text-zinc-500">{review.thumbs_up}</span>
          </button>
          <button onClick={() => rate("down")} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/20 border border-zinc-700 hover:border-red-500/40 text-sm transition-colors">
            👎 Not helpful <span className="text-zinc-500">{review.thumbs_down}</span>
          </button>
        </div>

        <label className="block text-xs text-zinc-500 mb-1">Leave a note so the reviewer learns</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:border-zinc-500 outline-none"
          placeholder="e.g. Missed that this changes the auth flow — flag those next time."
        />
        <button
          onClick={submitComment}
          disabled={submitting || !comment.trim()}
          className="mt-2 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Add note"}
        </button>

        {review.rating_comments.length > 0 && (
          <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
            {review.rating_comments.map((c, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-0.5">
                  <span className="text-zinc-300">{c.by}</span>
                  {c.rating === "up" && <span className="text-green-400">👍</span>}
                  {c.rating === "down" && <span className="text-red-400">👎</span>}
                  {c.at && <span>· {new Date(c.at).toLocaleDateString()}</span>}
                </div>
                <p className="text-zinc-400">{c.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
