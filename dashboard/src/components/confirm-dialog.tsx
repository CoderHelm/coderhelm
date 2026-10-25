"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, modalActions } from "./modal";
import { dangerButton, primaryButton, secondaryButton } from "./ui";

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

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {/* The shared dialog: focus starts on Cancel (the safe choice), Tab stays
          inside, Escape cancels, focus goes back where it was. */}
      <Modal
        open={open}
        onOpenChange={(v) => !v && close(false)}
        role="alertdialog"
        title={opts.title}
        description={opts.message}
        testId="confirm-dialog"
        initialFocus="[data-confirm-cancel]"
        footer={
          <div className={modalActions}>
            <button type="button" data-confirm-cancel onClick={() => close(false)} className={secondaryButton}>
              {opts.cancelLabel || "Cancel"}
            </button>
            {opts.secondaryLabel && (
              <button type="button" onClick={() => close("secondary")} className={dangerButton}>
                {opts.secondaryLabel}
              </button>
            )}
            <button type="button" onClick={() => close("primary")} className={opts.destructive ? dangerButton : primaryButton}>
              {opts.confirmLabel || "Confirm"}
            </button>
          </div>
        }
      />
    </ConfirmContext.Provider>
  );
}
