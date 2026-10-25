"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { inputClass, monoInputClass } from "../ui";
import { RowMarks } from "./row";

/** The ids a custom control must carry so its label, help and error reach it. */
export interface FieldIds {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldBase {
  /** Visible label, tied to the control. */
  label: ReactNode;
  /** Help under the control. */
  help?: ReactNode;
  /** An error under the control; also marks it invalid. */
  error?: ReactNode;
  /** Shows "Unsaved" after the label. */
  unsaved?: boolean;
  /** Shows "Not default" after the label (when not unsaved). */
  notDefault?: boolean;
  /** Monospace control, for identifiers and values people copy (a label name, a URL). */
  mono?: boolean;
  /** Classes for the control, e.g. a width from `sm:` up ("sm:w-64"). */
  controlClassName?: string;
  /** Classes for the wrapper. */
  className?: string;
  /** Use this id instead of a generated one. */
  id?: string;
}

type Native<E> = Omit<E, "id" | "className" | "children">;

export type FieldProps =
  | (FieldBase & { as?: "input" } & Native<InputHTMLAttributes<HTMLInputElement>>)
  | (FieldBase & { as: "textarea" } & Native<TextareaHTMLAttributes<HTMLTextAreaElement>>)
  | (FieldBase & { as: "select"; children: ReactNode } & Native<SelectHTMLAttributes<HTMLSelectElement>>)
  | (FieldBase & { as: "custom"; children: (ids: FieldIds) => ReactNode });

/**
 * A labelled input, textarea or select with help and an error under it, or
 * any control (`as="custom"`, children get the ids). Used inside a setting's
 * own options and in plain forms.
 *
 *   <Field label="Tag prefix" help="Tags look like v1.2.4" mono value={v} onChange={...} />
 *   <Field as="select" label="Model" value={m} onChange={...}><option ...></Field>
 */
export function Field(props: FieldProps) {
  const generated = useId();
  const { label, help, error, unsaved, notDefault, mono, controlClassName = "", className = "", id: given } = props;
  const id = given ?? generated;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const ids: FieldIds = {
    id,
    "aria-describedby": [errorId, helpId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
  };
  const cls = `${mono ? monoInputClass : inputClass} ${controlClassName}`.trim();

  let control: ReactNode;
  if (props.as === "custom") {
    control = props.children(ids);
  } else if (props.as === "textarea") {
    const { as: _as, label: _l, help: _h, error: _e, unsaved: _u, notDefault: _n, mono: _m, controlClassName: _c, className: _w, id: _i, ...rest } = props;
    control = <textarea {...rest} {...ids} className={cls} />;
  } else if (props.as === "select") {
    const { as: _as, label: _l, help: _h, error: _e, unsaved: _u, notDefault: _n, mono: _m, controlClassName: _c, className: _w, id: _i, children, ...rest } = props;
    control = (
      <select {...rest} {...ids} className={cls}>
        {children}
      </select>
    );
  } else {
    const { as: _as, label: _l, help: _h, error: _e, unsaved: _u, notDefault: _n, mono: _m, controlClassName: _c, className: _w, id: _i, ...rest } = props;
    control = <input {...rest} {...ids} className={cls} />;
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">{label}</label>
        <RowMarks unsaved={unsaved} notDefault={notDefault} />
      </div>
      {control}
      {help && <p id={helpId} className="mt-1.5 max-w-prose text-sm text-zinc-400">{help}</p>}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
