import type { ComponentProps } from "react";
import { cx } from "../cx";
import { Icon } from "../Icon";

type ChipProps = Omit<ComponentProps<"button">, "aria-pressed"> & {
  /** Selected=true. Rendered as `aria-pressed`, so the chip is a toggle. */
  selected: boolean;
};

/** Lunt/Chip (15:25): a pill toggle, 44px high. */
export function Chip({
  selected,
  className,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx("chip", className)}
      {...rest}
    />
  );
}

type RemovableChipProps = Omit<
  ComponentProps<"button">,
  "children" | "aria-label"
> & {
  children: string;
  /** e.g. 条件「食べる」を解除 */
  removeLabel: string;
};

/** A selected condition that removes itself on press (CF-03). */
export function RemovableChip({
  children,
  removeLabel,
  className,
  type = "button",
  ...rest
}: RemovableChipProps) {
  return (
    <button
      type={type}
      aria-label={removeLabel}
      className={cx("chip chip--selected chip--removable", className)}
      {...rest}
    >
      {children}
      <Icon name="close" />
    </button>
  );
}
