"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/**
 * The dock of actions and nav, fixed to the bottom on mobile. Its height,
 * which the actions note and the nav change, is published as
 * `--m-dock-height` so the page's `scroll-padding-bottom` keeps what is
 * scrolled into view (focus, in-page links, a control brought up) above it.
 */
export function ManageDock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const dock = ref.current;
    if (dock === null) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--m-dock-height", `${dock.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--m-dock-height");
    };
  }, []);
  return (
    <div className="m-dock" ref={ref}>
      {children}
    </div>
  );
}
