import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";

function HomeAnchor({
  "aria-current": _current,
  ...rest
}: ComponentProps<"a">) {
  return <a {...rest} />;
}

/**
 * A router link that never announces itself as the current page. For the
 * logo / brand entries: their target (`/`) matches every path as an
 * ancestor, and they are a way home rather than a navigation item.
 */
export const HomeLink = createLink(HomeAnchor);
