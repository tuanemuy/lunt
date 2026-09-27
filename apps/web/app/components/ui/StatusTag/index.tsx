import type { ReactNode } from "react";
import { cx } from "../cx";

type StatusTagProps = {
  /** Paper surface with a line border, for states that take the object out of use (提供終了, 閉店…). */
  quiet?: boolean;
  children: ReactNode;
};

/** The state label of a published object on viewer screens (提供開始前, 休業中…). */
export function StatusTag({ quiet = false, children }: StatusTagProps) {
  return (
    <span className={cx("status-tag", quiet && "status-tag--quiet")}>
      {children}
    </span>
  );
}

/** Lays several status tags out in a wrapping row. */
export function StatusTags({ children }: { children: ReactNode }) {
  return <div className="status-tags">{children}</div>;
}
