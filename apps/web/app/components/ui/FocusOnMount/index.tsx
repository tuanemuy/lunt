"use client";

import { type ReactNode, useEffect, useRef } from "react";

type FocusOnMountProps = {
  /** `alert` when the content replaces a failed step and must be announced. */
  role?: "alert" | "status";
  children: ReactNode;
};

/**
 * Moves focus to its content when it appears — for a state that replaces
 * the part of the screen holding focus (a step of a flow, a panel after an
 * operation), so keyboard and screen-reader users land on the new state
 * instead of `<body>`.
 */
export function FocusOnMount({ role, children }: FocusOnMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role={role} className="outline-none">
      {children}
    </div>
  );
}
