"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { focusRing } from "./ui";

/**
 * A small modal for a short form ("Review a PR…", "Write notes for a tag…").
 * Radix supplies the focus trap, Escape, scroll lock, `aria-modal` and the
 * return of focus to the button that opened it. On a phone it sits at the
 * top of the screen, full width.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  returnFocus,
  children,
}: {
  /** Where focus goes on close when the dialog was not opened by a Radix trigger (e.g. from the address). */
  returnFocus?: React.RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(e) => {
            if (!returnFocus?.current) return;
            e.preventDefault();
            returnFocus.current.focus();
          }}
          className="fixed inset-x-4 top-4 z-[61] mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:top-[15vh]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-zinc-100">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-zinc-400">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close"
              className={`-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
