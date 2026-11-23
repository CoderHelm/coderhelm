"use client";

import type { AccountPermissions } from "@/hooks/use-permission-checks";

/**
 * One quiet line under a saved permission warning while the page checks the
 * role live, or while it waits for an update someone pressed.
 */
export function PermissionCheckNote({ s }: { s: AccountPermissions }) {
  const text = s.checking ? "Checking the role now…" : s.pressedAt ? "Waiting for the update. This checks again by itself." : null;
  return (
    <p role="status" aria-live="polite" className="mt-2 flex min-h-5 items-center gap-2 text-xs text-zinc-400" data-testid="permission-check-note">
      {text && (
        <>
          <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />
          {text}
        </>
      )}
    </p>
  );
}
