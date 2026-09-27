import type { ReactNode } from "react";

type EmptyPanelProps = {
  title: string;
  /** `h1` when the panel stands in for the whole screen (no title band). */
  headingLevel?: "h1" | "h2";
  children?: ReactNode;
  actions?: ReactNode;
};

/**
 * The management state guide shown instead of the body (CS-04 login
 * required, CS-05 no permission, CS-09 empty, CS-17 missing target…).
 */
export function EmptyPanel({
  title,
  headingLevel: Heading = "h2",
  children,
  actions,
}: EmptyPanelProps) {
  return (
    <div className="m-empty">
      <Heading className="m-empty__title">{title}</Heading>
      {children === undefined ? null : (
        <p className="m-empty__body">{children}</p>
      )}
      {actions === undefined ? null : (
        <div className="m-empty__actions">{actions}</div>
      )}
    </div>
  );
}
