// The Claude models a team can pick on Settings → AI models, and the two jobs
// they are picked for. Everything the page says about a model or a role is
// read from here, so the page cannot describe a model it does not offer.
//
// The gateway has no endpoint that lists models (it only checks the chosen ids
// against its own allow-list), so this list lives in the dashboard. Every `id`
// here must be on the gateway's ALLOWED_MODELS list.

export interface ModelInfo {
  id: string;
  /** Plain product name, shown in the select. */
  name: string;
  /** A few words on what it is good at, shown muted under the select. */
  blurb: string;
  /** Older models stay selectable but are grouped apart. */
  legacy?: boolean;
}

export const MODELS: ModelInfo[] = [
  { id: "claude-fable-5-1", name: "Claude Fable 5.1", blurb: "Most capable, and the slowest and most expensive" },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", blurb: "Strongest at writing and changing code" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", blurb: "Fast and smart, good for reading and planning" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", blurb: "Fastest and cheapest, for light work" },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", blurb: "Older model", legacy: true },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", blurb: "Older model", legacy: true },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", blurb: "Older model", legacy: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", blurb: "Older model", legacy: true },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", blurb: "Older model", legacy: true },
];

export type ModelRoleKey = "primary_model" | "heavy_model";

export interface ModelRole {
  /** The field the gateway stores the choice under. */
  key: ModelRoleKey;
  label: string;
  /** What this role does in a run. */
  does: string;
  /** Used when the team has not chosen, and marked "Recommended". */
  recommended: string;
}

export const MODEL_ROLES: ModelRole[] = [
  {
    key: "primary_model",
    label: "Planning & reviews",
    does: "Reads the ticket and the code, plans the change and reviews pull requests.",
    recommended: "claude-sonnet-5-5",
  },
  {
    key: "heavy_model",
    label: "Writing code",
    does: "Makes the code changes and fixes them until checks pass.",
    recommended: "claude-opus-5-5",
  },
];

export function modelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/** A model's name, or its raw id when it is no longer on the list. */
export function modelName(id: string): string {
  return modelInfo(id)?.name ?? id;
}
