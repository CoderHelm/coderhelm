// The dashboard reads runs, plans and review sessions through the public API, whose schemas
// are generated from the gateway's code (src/lib/openapi-fields.ts lists their
// fields). Each line below fails `npm run typecheck` when the dashboard's type
// reads a field the gateway's schema does not have, naming the field, so a
// field dropped on the server can't quietly render as an empty value.
// Nothing here runs; it is checked by the compiler only.

import type { OpenApiFields } from "./openapi-fields";
import type { ActivityGroup, ActivityItem, AnswerRunResult, OverviewFile, Plan, Review, ReviewOverview, ReviewSession, Run, RunAnswer, RunCheck, RunChecks, RunPrReview, RunDetail, RunDraftHold, RunDraftHoldReason, RunQuestion, RunTrigger, SessionStep, Task, api } from "./api";

type Answer<K extends keyof typeof api> = Awaited<ReturnType<(typeof api)[K]>>;

/** The dashboard type's fields the schema lacks; `never` when it has them all. */
type Undocumented<T, S extends keyof OpenApiFields> = Exclude<keyof T, OpenApiFields[S]>;

/** Compiles only when given `never`. */
type None<T extends never> = T;

// The runs list and one run (the run detail page).
export type RunsPageContract = None<Undocumented<Answer<"listRuns">, "RunsPage">>;
export type RunListContract = None<Undocumented<Run, "RunSummary">>;
export type RunContract = None<Undocumented<RunDetail, "Run">>;
// The checks on a run's pull request, and the reviewer's verdict on it.
export type RunChecksContract = None<Undocumented<RunChecks, "RunChecks">>;
export type RunCheckContract = None<Undocumented<RunCheck, "RunCheck">>;
export type RunCheckCountsContract = None<Undocumented<RunChecks["counts"], "RunCheckCounts">>;
export type RunPrReviewContract = None<Undocumented<RunPrReview, "RunPrReview">>;
// How a run was started (the runs list and the run page's header).
export type RunTriggerContract = None<Undocumented<RunTrigger, "RunTrigger">>;
// What a run asked, the answers given in Coderhelm, and answering.
export type RunQuestionContract = None<Undocumented<RunQuestion, "RunQuestion">>;
export type RunAnswerContract = None<Undocumented<RunAnswer, "RunAnswer">>;
export type AnswerRunContract = None<Undocumented<AnswerRunResult, "AnswerRunResult">>;
// Why a finished run's pull request is still a draft, and what to do about each reason.
export type RunDraftHoldContract = None<Undocumented<RunDraftHold, "RunDraftHold">>;
export type RunDraftHoldReasonContract = None<Undocumented<RunDraftHoldReason, "RunDraftHoldReason">>;

// Plans and their tasks (the plan pages and the runs they start).
export type PlansPageContract = None<Undocumented<Answer<"listPlans">, "PlansPage">>;
export type PlanContract = None<Undocumented<Answer<"getPlan">, "PlanWithTasks">>;
export type PlanListContract = None<Undocumented<Omit<Plan, "tasks">, "Plan">>;
export type TaskContract = None<Undocumented<Task, "PlanTask">>;

// A review's session (the page a PR's "Coderhelm review" check links to).
export type ReviewSessionContract = None<Undocumented<ReviewSession, "ReviewSession">>;
// One review (the review page), with the session that produced it.
export type ReviewContract = None<Undocumented<Review, "Review">>;
export type SessionStepContract = None<Undocumented<SessionStep, "SessionStep">>;
// What the reviewer did while it read the PR, and the overview it posted.
export type ActivityGroupContract = None<Undocumented<ActivityGroup, "ActivityGroup">>;
export type ActivityItemContract = None<Undocumented<ActivityItem, "ActivityItem">>;
export type ReviewOverviewContract = None<Undocumented<ReviewOverview, "ReviewOverview">>;
export type OverviewFileContract = None<Undocumented<OverviewFile, "OverviewFile">>;
