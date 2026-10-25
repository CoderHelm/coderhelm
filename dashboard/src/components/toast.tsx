"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckIcon, AlertCircleIcon } from "./icons";
import { focusRing } from "./ui";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
  action?: ToastAction;
}

type ToastFn = (message: string, type?: "success" | "error", options?: { action?: ToastAction }) => void;

const ToastContext = createContext<{ toast: ToastFn }>({ toast: () => {} });

/**
 * Short confirmations ("Saved") and failures. An instant change that can be
 * taken back passes `{ action: { label: "Undo", onClick } }`; such a toast
 * stays up longer so there is time to press it.
 */
export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastFn>(
    (message, type = "success", options) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      setTimeout(() => dismiss(id), options?.action ? 8000 : 3000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* A live region, so screen readers announce each message. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed left-4 right-4 top-4 z-[9999] flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-lg animate-toast-in"
          >
            <span aria-hidden="true" className={t.type === "success" ? "text-emerald-400" : "text-red-400"}>
              {t.type === "success" ? <CheckIcon /> : <AlertCircleIcon />}
            </span>
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className={`-my-1 shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-zinc-100 underline underline-offset-4 hover:bg-zinc-800 ${focusRing}`}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
