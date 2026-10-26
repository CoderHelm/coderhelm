"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { focusRing } from "./ui";

/**
 * One item's details beside the list it came from: a panel that slides in
 * from the right from `sm:` up and fills the screen on a phone. Radix
 * supplies the focus trap, Escape, the scroll lock and the return of focus
 * to the row that opened it, as for <Modal>.
 *
 * The header (title, `actions`) and `footer` stay put; only the body scrolls.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  actions,
  footer,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** A short line under the title. */
  description?: ReactNode;
  /** Small buttons beside the close button (Copy id). */
  actions?: ReactNode;
  footer?: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          data-testid={testId}
          {...(description ? {} : { "aria-describedby": undefined })}
          className="fixed inset-0 z-[61] flex h-[100dvh] flex-col overflow-hidden bg-zinc-900 shadow-2xl sm:left-auto sm:w-[min(40rem,100vw)] sm:border-l sm:border-zinc-800"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-zinc-100 [overflow-wrap:anywhere]">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-zinc-400">{description}</Dialog.Description>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <Dialog.Close
                aria-label="Close"
                className={`-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </Dialog.Close>
            </div>
          </div>
          <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
