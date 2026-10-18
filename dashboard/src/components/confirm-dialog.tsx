"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { focusRing } from "./ui";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  destructive?: boolean;
}

type ConfirmResult = false | "primary" | "secondary";

const ConfirmContext = createContext<{
  confirm: (opts: ConfirmOptions) => Promise<ConfirmResult>;
}>({ confirm: (_opts: ConfirmOptions) => Promise.resolve(false as ConfirmResult) });

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "", message: "" });
  const resolveRef = useRef<((v: ConfirmResult) => void) | undefined>(undefined);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setOpen(true);
    return new Promise<ConfirmResult>((res) => {
      resolveRef.current = res;
    });
  }, []);

  const close = useCallback((result: ConfirmResult) => {
    setOpen(false);
    resolveRef.current?.(result);
  }, []);

  const titleId = useId();
  const messageId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  // A real modal: focus moves in (to Cancel, the safe choice), Tab stays
  // inside, Escape cancels, and focus goes back where it was on close.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const buttons = () => Array.from(box?.querySelectorAll<HTMLElement>("button") ?? []);
    buttons()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = buttons();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open, close]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div aria-hidden="true" className="absolute inset-0 bg-black/60" onClick={() => close(false)} />
          <div
            ref={boxRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            className="relative w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">{opts.title}</h2>
            <p id={messageId} className="mt-2 text-sm text-zinc-400 leading-relaxed break-words">{opts.message}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className={`rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 ${focusRing}`}
              >
                {opts.cancelLabel || "Cancel"}
              </button>
              {opts.secondaryLabel && (
                <button
                  type="button"
                  onClick={() => close("secondary")}
                  className={`rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 ${focusRing}`}
                >
                  {opts.secondaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => close("primary")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${focusRing} ${
                  opts.destructive
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {opts.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
