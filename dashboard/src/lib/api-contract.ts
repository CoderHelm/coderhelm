// The dashboard reads runs and plans through the public API, whose schemas
// are generated from the gateway's code (src/lib/openapi-fields.ts lists their
// fields). Each line below fails `npm run typecheck` when the dashboard's type
// reads a field the gateway's schema does not have, naming the field, so a
// field dropped on the server can't quietly render as an empty value.
// Nothing here runs; it is checked by the compiler only.

import type { OpenApiFields } from "./openapi-fields";
import type { AnswerRunResult, Plan, Run, RunAnswer, RunDetail, RunQuestion, RunTrigger, Task, api } from "./api";

type Answer<K extends keyof typeof api> = Awaited<ReturnType<(typeof api)[K]>>;

/** The dashboard type's fields the schema lacks; `never` when it has them all. */
type Undocumented<T, S extends keyof OpenApiFields> = Exclude<keyof T, OpenApiFields[S]>;

/** Compiles only when given `never`. */
type None<T extends never> = T;

// The runs list and one run (the run detail page).
export type RunsPageContract = None<Undocumented<Answer<"listRuns">, "RunsPage">>;
export type RunListContract = None<Undocumented<Run, "RunSummary">>;
export type RunContract = None<Undocumented<RunDetail, "Run">>;
// How a run was started (the runs list and the run page's header).
export type RunTriggerContract = None<Undocumented<RunTrigger, "RunTrigger">>;
// What a run asked, the answers given in Coderhelm, and answering.
export type RunQuestionContract = None<Undocumented<RunQuestion, "RunQuestion">>;
export type RunAnswerContract = None<Undocumented<RunAnswer, "RunAnswer">>;
export type AnswerRunContract = None<Undocumented<AnswerRunResult, "AnswerRunResult">>;

// Plans and their tasks (the plan pages and the runs they start).
export type PlansPageContract = None<Undocumented<Answer<"listPlans">, "PlansPage">>;
export type PlanContract = None<Undocumented<Answer<"getPlan">, "PlanWithTasks">>;
export type PlanListContract = None<Undocumented<Omit<Plan, "tasks">, "Plan">>;
export type TaskContract = None<Undocumented<Task, "PlanTask">>;
