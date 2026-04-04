"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

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

  const close = (result: ConfirmResult) => {
    setOpen(false);
    resolveRef.current?.(result);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-100">{opts.title}</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{opts.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {opts.cancelLabel || "Cancel"}
              </button>
              {opts.secondaryLabel && (
                <button
                  onClick={() => close("secondary")}
                  className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
                >
                  {opts.secondaryLabel}
                </button>
              )}
              <button
                onClick={() => close("primary")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
