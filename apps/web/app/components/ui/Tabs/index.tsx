import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

type TabsProps = {
  /** The group's accessible name, e.g. ジャンル. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Lunt/Tab (24:155) group: 64px-wide text tabs with the selected one
 * underlined. The tabs switch a filter in place, so they are a group of
 * toggles rather than an ARIA tablist.
 */
export function Tabs({ label, children, className }: TabsProps) {
  return (
    <fieldset aria-label={label} className={cx("tabs", className)}>
      {children}
    </fieldset>
  );
}

type TabProps = Omit<ComponentProps<"button">, "aria-pressed"> & {
  selected: boolean;
};

export function Tab({
  selected,
  className,
  type = "button",
  ...rest
}: TabProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx("tab", className)}
      {...rest}
    />
  );
}
