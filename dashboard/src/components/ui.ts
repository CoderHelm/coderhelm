// Shared class strings for the small form components, so focus rings and
// button shapes stay identical everywhere they are used.
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100";

export const inputClass =
  "w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-100";

/** An input whose value is an identifier or something people copy: a label name, a URL, a key. */
export const monoInputClass = `${inputClass} font-mono`;

// ── Buttons ─────────────────────────────────────────────────────────
//
// One shape, four looks, two sizes. A button is as wide as its text; on a
// phone a form's main button may fill the row with `fullWidthOnPhone`, never
// wider screens (`npm run lint` warns on `w-full` that reaches `sm:`).

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_LOOK: Record<ButtonVariant, string> = {
  primary: "bg-white text-zinc-900 hover:bg-zinc-200",
  secondary: "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700",
  danger: "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1 text-xs",
  md: "min-h-9 px-4 py-2 text-sm",
  // The one large call to action on an empty page.
  lg: "min-h-11 px-6 py-2 text-base",
};

/** The class string for a button: `buttonClass("danger", "sm")`. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${BUTTON_BASE} ${BUTTON_LOOK[variant]} ${BUTTON_SIZE[size]} ${focusRing}`;
}

export const primaryButton = buttonClass("primary");
export const secondaryButton = buttonClass("secondary");
export const dangerButton = buttonClass("danger");
export const ghostButton = buttonClass("ghost");
export const smallPrimaryButton = buttonClass("primary", "sm");
export const smallSecondaryButton = buttonClass("secondary", "sm");
export const smallDangerButton = buttonClass("danger", "sm");

/** Full width on a phone, its own width from `sm:` up. The only full-width a button gets. */
export const fullWidthOnPhone = "w-full sm:w-auto";

export const linkButton =
  `inline-flex items-center min-h-6 py-0.5 text-sm text-zinc-300 underline underline-offset-4 hover:text-zinc-100 rounded ${focusRing}`;
