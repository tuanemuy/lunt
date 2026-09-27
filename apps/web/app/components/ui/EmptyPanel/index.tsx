import type { ReactNode } from "react";

type EmptyPanelProps = {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
};

/**
 * The management state guide shown instead of the body (CS-04 login
 * required, CS-05 no permission, CS-09 empty, CS-17 missing target…).
 */
export function EmptyPanel({ title, children, actions }: EmptyPanelProps) {
  return (
    <div className="m-empty">
      <h2 className="m-empty__title">{title}</h2>
      {children === undefined ? null : (
        <p className="m-empty__body">{children}</p>
      )}
      {actions === undefined ? null : (
        <div className="m-empty__actions">{actions}</div>
      )}
    </div>
  );
}
