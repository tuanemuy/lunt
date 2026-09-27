import { cx } from "../cx";

type SkeletonProps = {
  /**
   * `viewer`: a still light surface (Figma 29:2478). `manage`: a paper
   * surface that pulses unless the user prefers reduced motion.
   */
  variant?: "viewer" | "manage";
  className?: string;
};

/**
 * Visual placeholder block for loading states. Size it with utilities
 * (`h-24 w-230`, `aspect-[348/193] w-full`).
 *
 * `aria-hidden` because the surrounding skeleton container owns the single
 * status announcement (`role="status"` + sr-only label); individual bars must
 * not each speak to a screen reader.
 */
export function Skeleton({ variant = "viewer", className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "skeleton",
        variant === "manage" && "skeleton--manage",
        className,
      )}
    />
  );
}
