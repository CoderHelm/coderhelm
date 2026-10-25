"use client";

// Which review steps a team agent runs in: reading the draft plan before
// it's kept, the pull request's code, or its description. Worked out by
// the agent's check from its name and description; an admin can set it
// instead, the same way as "always apply".

import { useEffect, useState } from "react";
import { Chip } from "@/components/list";
import { useToast } from "@/components/toast";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { REVIEW_STEPS, reviewsLabel, skillsApi, type ReviewStep, type ReviewSteps, type Skill } from "@/lib/skills";

/** "Reviews: Plan, Code" for a list, or nothing when it runs in none. */
export function ReviewStepsBadge({ item }: { item: Pick<Skill, "reviews" | "kind"> }) {
  const steps = item.reviews?.effective ?? [];
  if (item.kind !== "agent" || steps.length === 0) return null;
  return (
    <span data-testid="reviews-badge" className="inline-flex max-w-full">
      <Chip title="The review steps Coderhelm runs this agent in">Reviews: {reviewsLabel(steps)}</Chip>
    </span>
  );
}

const ordered = (steps: ReviewStep[]) => REVIEW_STEPS.map((s) => s.id).filter((id) => steps.includes(id));

/** The "Reviews: plan / code / prose" setting on an agent's page. */
export function ReviewStepsSection({
  item,
  canManage,
  onSaved,
}: {
  item: Skill;
  canManage: boolean;
  onSaved: (r: ReviewSteps) => void;
}) {
  const { toast } = useToast();
  const saved = item.reviews;
  const effective = saved?.effective ?? [];
  const [draft, setDraft] = useState<ReviewStep[]>(effective);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savedKey = effective.join();

  useEffect(() => setDraft(saved?.effective ?? []), [savedKey, saved]);

  if (!saved) return null;
  const dirty = ordered(draft).join() !== effective.join();

  const save = async (set: boolean, steps: ReviewStep[]) => {
    setError("");
    setSaving(true);
    try {
      const r = await skillsApi.setReviews(item.repo, item.path, set, ordered(steps));
      onSaved(r.reviews);
      toast(set ? `${item.name} reviews: ${reviewsLabel(r.reviews.effective)}` : `${item.name} follows its check again`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="reviews-heading" className="mt-6 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5" data-testid="reviews-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="reviews-heading" className="text-sm font-medium text-zinc-200">
            Reviews: plan / code / prose
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            In a review step Coderhelm runs this agent on every matching run, not only when an agent thinks to ask it (at most two agents a step). Its
            answer is advice: the planner, reviewer or writer weighs each gap.
          </p>
          <p className="mt-2 text-sm text-zinc-200">
            Runs in: <span className="font-medium">{reviewsLabel(effective)}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {saved.set
              ? `Set by ${saved.by || "an admin"}${saved.at ? ` ${new Date(saved.at).toLocaleDateString()}` : ""}. The check says: ${reviewsLabel(saved.auto)}.`
              : "Worked out by its check from its name and description."}
          </p>
        </div>
      </div>

      {canManage && (
        <fieldset className="mt-4 min-w-0">
          <legend className="sr-only">Review steps</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2">
            {REVIEW_STEPS.map((s) => (
              <label key={s.id} className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-800 p-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className={`mt-0.5 h-4 w-4 shrink-0 accent-emerald-500 ${focusRing}`}
                  checked={draft.includes(s.id)}
                  onChange={() => setDraft(draft.includes(s.id) ? draft.filter((x) => x !== s.id) : [...draft, s.id])}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-200">{s.label}</span>
                  <span className="block text-xs text-zinc-500">{s.means}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {dirty && (
              <>
                <button type="button" className={primaryButton} disabled={saving} onClick={() => save(true, draft)}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" className={secondaryButton} disabled={saving} onClick={() => setDraft(effective)}>
                  Cancel
                </button>
              </>
            )}
            {saved.set && !dirty && (
              <button type="button" className={`${linkButton} text-xs`} disabled={saving} onClick={() => save(false, [])}>
                Use what the check says ({reviewsLabel(saved.auto)})
              </button>
            )}
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
