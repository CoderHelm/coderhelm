"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Asks before the tab closes or reloads while `when` is true. (Links inside
 * the app are not stopped; a page that switches context itself, like a repo
 * picker, asks with its own confirm.)
 */
export function useLeaveWarning(when: boolean) {
  useEffect(() => {
    if (!when) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when]);
}

/** Empty, false, null and missing all mean "not set", so a cleared box is not a change. */
export function sameSetting(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === null || v === "" || v === false ? "" : JSON.stringify(v));
  return norm(a) === norm(b);
}

export interface DirtyFormOptions<T> {
  /** How one field's edited and saved values compare. Default: `sameSetting`. */
  same?: (edited: unknown, saved: unknown, key: keyof T) => boolean;
  /** Nothing counts as unsaved (and nothing warns) while true, e.g. while loading or after a failed load. */
  disabled?: boolean;
  /** Ask before leaving the page with unsaved changes. Default true. */
  warnOnLeave?: boolean;
}

export interface DirtyForm<T> {
  /** The values being edited. */
  values: T;
  /** The values last loaded or saved. */
  saved: T;
  /** Change one field. */
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Change several fields, or everything from the previous values. */
  update: (patch: Partial<T> | ((prev: T) => T)) => void;
  /** Loaded or saved from the server: both the edited and the saved values become `next`. */
  reset: (next: T) => void;
  /** Throw the edits away. */
  discard: () => void;
  /** The fields that differ from what is saved. */
  dirtyKeys: (keyof T)[];
  /** True when any of `keys` (or, without keys, any field) is unsaved. */
  isDirty: (...keys: (keyof T)[]) => boolean;
  /** Number of unsaved fields; what a `SaveBar` shows. */
  count: number;
  dirty: boolean;
}

/**
 * Edited values against saved ones, field by field, for a settings form with
 * a `SaveBar`. Leaving the page with unsaved changes asks first.
 *
 *   const form = useDirtyForm(DEFAULTS, { disabled: loadFailed });
 *   form.reset(await api.load());           // after a load or a save
 *   <SettingsRow unsaved={form.isDirty("label")} ... />
 *   <SaveBar count={form.count} onDiscard={form.discard} ... />
 */
export function useDirtyForm<T extends object>(initial: T, options: DirtyFormOptions<T> = {}): DirtyForm<T> {
  const { same = sameSetting, disabled = false, warnOnLeave = true } = options;
  const [values, setValues] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setValues((p) => ({ ...p, [key]: value })), []);
  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T)) => setValues((p) => (typeof patch === "function" ? patch(p) : { ...p, ...patch })),
    [],
  );
  const reset = useCallback((next: T) => {
    setValues(next);
    setSaved(next);
  }, []);
  const discard = useCallback(() => setValues(saved), [saved]);

  const dirtyKeys = useMemo(() => {
    if (disabled) return [];
    const keys = Object.keys({ ...saved, ...values }) as (keyof T)[];
    return keys.filter((k) => !same(values[k], saved[k], k));
  }, [values, saved, same, disabled]);

  const dirty = dirtyKeys.length > 0;
  useLeaveWarning(warnOnLeave && dirty);

  const isDirty = useCallback(
    (...keys: (keyof T)[]) => (keys.length === 0 ? dirtyKeys.length > 0 : keys.some((k) => dirtyKeys.includes(k))),
    [dirtyKeys],
  );

  return { values, saved, set, update, reset, discard, dirtyKeys, isDirty, count: dirtyKeys.length, dirty };
}
