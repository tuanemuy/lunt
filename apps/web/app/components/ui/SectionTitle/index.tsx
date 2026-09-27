import type { ReactNode } from "react";
import { cx } from "../cx";

type SectionTitleProps = {
  /** `viewer`: Lunt/Section in the serif. `manage`: the sans 18/27 medium heading of management screens. */
  variant?: "viewer" | "manage";
  as?: "h2" | "h3";
  id?: string;
  children: ReactNode;
};

export function SectionTitle({
  variant = "viewer",
  as: Heading = "h2",
  id,
  children,
}: SectionTitleProps) {
  return (
    <Heading
      id={id}
      className={cx(
        "section-title",
        variant === "manage" && "section-title--manage",
      )}
    >
      {children}
    </Heading>
  );
}
