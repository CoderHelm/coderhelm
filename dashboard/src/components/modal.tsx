"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { focusRing } from "./ui";

/**
 * The element a popover inside a modal portals into. A popover portaled to
 * <body> would sit outside the modal: the modal's scroll lock would swallow
 * its wheel events and its outside-click check would close the modal. Inside
 * the modal's own box it is still `position: fixed`, so the modal's scrolling
 * body never clips it.
 */
const ModalLayer = createContext<HTMLElement | null>(null);
export function useModalLayer(): HTMLElement | null {
  return useContext(ModalLayer);
}

const FooterSlot = createContext<HTMLElement | null>(null);

/**
 * The dialog's button row, from inside a form component rendered in the
 * body: it is drawn in the pinned footer. A submit button there sits outside
 * the <form> element, so give the form an id and the button `form={id}`.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  const slot = useContext(FooterSlot);
  if (!slot) return <div className={`mt-4 ${modalActions}`}>{children}</div>;
  return createPortal(<div className={modalActions}>{children}</div>, slot);
}

/** The button row every dialog ends with: Cancel first, the main action last (on top on a phone). */
export const modalActions = "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end";

/**
 * The one dialog. Radix supplies the focus trap, Escape, the scroll lock on
 * the page behind (with the scrollbar gap kept, so nothing shifts),
 * `aria-modal` and the return of focus to the button that opened it.
 *
 * Layout: the title row and the `footer` stay put; only the body scrolls, so
 * the main button is always on screen however long the form is. From `sm:`
 * up it is a centred card no taller than the screen less a margin; on a
 * phone it fills the screen with the footer above the home indicator, or,
 * with `sheet`, rises from the bottom only as tall as its content (a short
 * question that would look lost on a whole screen).
 *
 * Pass `onSubmit` and the body and footer become one <form>: Enter submits,
 * and a `type="submit"` button in the footer submits it.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  returnFocus,
  wide = false,
  sheet = false,
  footer,
  onSubmit,
  testId,
  role,
  initialFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Room for a longer form (a list of checkboxes): wider from `sm:` up. `"xl"` widens it again
   * from `lg:` up, for a body with two columns (a picker beside what is picked). `"md"` is a little
   * wider than the default, for options with a line of help each. */
  wide?: boolean | "md" | "xl";
  /** A short form: on a phone a bottom sheet as tall as its content instead of the whole screen, and
   * no rules between the title, the body and the buttons (nothing long enough to scroll under them). */
  sheet?: boolean;
  /** Where focus goes on close when the dialog was not opened by a Radix trigger (e.g. from the address). */
  returnFocus?: React.RefObject<HTMLElement | null>;
  /** The button row, laid out with `modalActions`. Always visible. */
  footer?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  testId?: string;
  /** `alertdialog` for a yes/no question. */
  role?: "dialog" | "alertdialog";
  /** Selector of the element to focus on open (default: the body's first field). */
  initialFocus?: string;
  children?: ReactNode;
}) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  // The element that had focus when the dialog opened. Radix gives focus back
  // to it on close, but not when the page unmounts the whole dialog with the
  // close (`{editing && <Editor />}`); then focus would fall to <body>.
  const opener = useRef<HTMLElement | null>(null);
  if (open && !opener.current && typeof document !== "undefined") {
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
  }
  useEffect(() => {
    if (!open) return;
    const ref = opener;
    const el = returnFocus?.current ?? ref.current;
    return () => {
      ref.current = null;
      window.setTimeout(() => {
        const a = document.activeElement;
        if (el?.isConnected && (!a || a === document.body)) el.focus();
      }, 0);
    };
  }, [open, returnFocus]);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  // A sheet draws no rule above its buttons, unless the body is taller than
  // the screen and scrolls under them: then the rule shows where it is cut.
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (!sheet || !bodyEl) return;
    const measure = () => setOverflows(bodyEl.scrollHeight > bodyEl.clientHeight + 1);
    const ro = new ResizeObserver(measure);
    ro.observe(bodyEl);
    for (const c of Array.from(bodyEl.children)) ro.observe(c);
    measure();
    return () => ro.disconnect();
  }, [sheet, bodyEl]);
  const body = (
    <div ref={setBodyEl} data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      {children}
    </div>
  );
  // One pinned footer: the `footer` prop, or whatever a <ModalFooter> in the
  // body portals in. Hidden while empty.
  const foot = (
    <div
      ref={setSlot}
      data-modal-footer
      className={`shrink-0 bg-zinc-900 px-5 empty:hidden ${sheet ? `border-t pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5 ${overflows ? "border-zinc-800" : "border-transparent"}` : "border-t border-zinc-800 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3"}`}
    >
      {footer}
    </div>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          ref={(el) => {
            box.current = el;
            setLayer(el);
          }}
          {...(role ? { role } : {})}
          {...(testId ? { "data-testid": testId } : {})}
          data-modal
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(e) => {
            // The named element, else the first field of the body, else
            // Radix's default (the first focusable: the close button).
            const el = initialFocus
              ? box.current?.querySelector<HTMLElement>(initialFocus)
              : box.current?.querySelector<HTMLElement>(
                  "[data-modal-body] :is(input:not([type=hidden]), select, textarea, button, [tabindex='0']):not(:disabled)",
                );
            if (!el) return;
            e.preventDefault();
            el.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (!returnFocus?.current) return;
            e.preventDefault();
            returnFocus.current.focus();
          }}
          className={`fixed z-[61] flex flex-col overflow-hidden bg-zinc-900 shadow-2xl sm:inset-x-4 sm:bottom-auto sm:top-[8dvh] sm:mx-auto sm:h-auto sm:max-h-[84dvh] sm:rounded-xl sm:border sm:border-zinc-800 ${sheet ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-zinc-800" : "inset-0 h-[100dvh]"} ${wide === "xl" ? "sm:max-w-2xl lg:max-w-4xl" : wide === "md" ? "sm:max-w-lg" : wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        >
          <div className={`flex shrink-0 items-start justify-between gap-3 px-5 ${sheet ? "pb-1 pt-5" : "border-b border-zinc-800 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4"}`}>
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
          <ModalLayer.Provider value={layer}>
          <FooterSlot.Provider value={slot}>
            {onSubmit ? (
              <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                {body}
                {foot}
              </form>
            ) : (
              <>
                {body}
                {foot}
              </>
            )}
          </FooterSlot.Provider>
          </ModalLayer.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
