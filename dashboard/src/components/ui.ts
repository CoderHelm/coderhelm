// Shared class strings for the small form components, so focus rings and
// button shapes stay identical everywhere they are used.
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100";

export const inputClass =
  "w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-100";

export const primaryButton =
  `inline-flex items-center justify-center min-h-9 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors motion-reduce:transition-none ${focusRing}`;

export const secondaryButton =
  `inline-flex items-center justify-center min-h-9 px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors motion-reduce:transition-none ${focusRing}`;

export const linkButton =
  `inline-flex items-center min-h-6 py-0.5 text-sm text-zinc-300 underline underline-offset-4 hover:text-zinc-100 rounded ${focusRing}`;
