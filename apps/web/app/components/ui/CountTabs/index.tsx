import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

type CountTabsProps = {
  /** e.g. 掲載の区分 */
  label: string;
  children: ReactNode;
};

/**
 * Management tabs that are entries into a filtered list, each with a count
 * (SM-01 掲載: 公開中 3 / 下書き 1 …). They navigate, so the current one is
 * marked with `aria-current`, which the router sets on the active link.
 */
export function CountTabs({ label, children }: CountTabsProps) {
  return (
    <nav className="m-tabs" aria-label={label}>
      {children}
    </nav>
  );
}

function CountTabAnchor({
  count,
  className,
  children,
  ...rest
}: ComponentProps<"a"> & { count: number }) {
  return (
    <a className={cx("m-tab", className)} {...rest}>
      {children}
      <span>{count}</span>
    </a>
  );
}

export const CountTab = createLink(CountTabAnchor);
