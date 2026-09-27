import type { ReactNode } from "react";

type AlertProps = {
  title: string;
  children?: ReactNode;
  /** `<li>` entries of a bulleted list, e.g. links to the fields to fix (CS-10). */
  list?: ReactNode;
  actions?: ReactNode;
};

/**
 * The management error band (CS-02 communication error, CS-07 conflict,
 * CS-10 input errors, CS-15…): a focus-bordered box announced as an alert.
 */
export function Alert({ title, children, list, actions }: AlertProps) {
  return (
    <div className="m-alert" role="alert">
      <p className="m-alert__title">{title}</p>
      {children === undefined ? null : (
        <p className="m-alert__body">{children}</p>
      )}
      {list === undefined ? null : <ul>{list}</ul>}
      {actions === undefined ? null : (
        <div className="m-alert__actions">{actions}</div>
      )}
    </div>
  );
}
