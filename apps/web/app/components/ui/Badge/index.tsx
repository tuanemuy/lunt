import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "muted" | "alert" | "count";

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
};

/**
 * A small status pill for management screens. The wording carries the
 * meaning; the tone only reinforces it. `count` is for pending-item counts,
 * keeping `--focus` for focus and errors.
 */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span className="badge" data-tone={tone === "neutral" ? undefined : tone}>
      {children}
    </span>
  );
}
