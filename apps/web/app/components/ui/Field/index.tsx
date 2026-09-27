import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

/**
 * 必須 / 任意 / 公開に必須 beside the label; omit when the field is neither
 * (e.g. a sub-field of a group). `publish`: a draft may leave it empty,
 * publishing needs it (CF-08).
 */
export type FieldRequirement = "required" | "optional" | "publish";

/** The attributes a `Field` wires onto its control. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  /** The control's id; the help and error texts derive theirs from it. */
  id: string;
  label: string;
  requirement?: FieldRequirement;
  help?: ReactNode;
  /** The CS-10 reason for this field. Marks the control invalid. */
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
};

function RequirementMark({ requirement }: { requirement: FieldRequirement }) {
  switch (requirement) {
    case "required":
      return <span className="m-field__req">必須</span>;
    case "publish":
      return <span className="m-field__req">公開に必須</span>;
    case "optional":
      return (
        <span className="m-field__req" data-optional="">
          任意
        </span>
      );
  }
}

function describedBy(
  id: string,
  help: ReactNode,
  error: string | undefined,
): Omit<FieldControlProps, "id"> {
  const ids = [
    error === undefined ? undefined : `${id}-error`,
    help === undefined ? undefined : `${id}-help`,
  ].filter((value) => value !== undefined);
  return {
    ...(ids.length === 0 ? {} : { "aria-describedby": ids.join(" ") }),
    ...(error === undefined ? {} : { "aria-invalid": true as const }),
  };
}

/**
 * A labelled form field (74:3420): label and 必須/任意 on one line, the
 * control below, then the error and help. The control is rendered by
 * `children`, which receives the id and aria wiring to spread onto it.
 */
export function Field({
  id,
  label,
  requirement,
  help,
  error,
  children,
}: FieldProps) {
  return (
    <div className="m-field">
      <label className="m-field__label" htmlFor={id}>
        {label}
        {requirement === undefined ? null : (
          <RequirementMark requirement={requirement} />
        )}
      </label>
      {children({ id, ...describedBy(id, help, error) })}
      {error === undefined ? null : (
        <p className="m-field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {help === undefined ? null : (
        <p className="m-field__help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

type FieldsetProps = {
  /** The target of in-page links to the field (CS-10's list, CS-16). */
  id?: string;
  legend: string;
  requirement?: FieldRequirement;
  help?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
};

/** A field made of several controls (a choice group, an address), labelled by its legend. */
export function Fieldset({
  id,
  legend,
  requirement,
  help,
  error,
  className,
  children,
}: FieldsetProps) {
  return (
    <fieldset id={id} className={cx("m-field", className)}>
      <legend className="m-field__label">
        {legend}
        {requirement === undefined ? null : (
          <RequirementMark requirement={requirement} />
        )}
      </legend>
      {children}
      {error === undefined ? null : (
        <p className="m-field__error" role="alert">
          {error}
        </p>
      )}
      {help === undefined ? null : <p className="m-field__help">{help}</p>}
    </fieldset>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx("m-input", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx("m-input", className)} {...rest} />;
}

export function Textarea({
  className,
  rows = 3,
  ...rest
}: ComponentProps<"textarea">) {
  return (
    <textarea className={cx("m-input", className)} rows={rows} {...rest} />
  );
}
