import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { cx } from "../cx";

/** A small bordered pill action placed beside an item (e.g. 前へ / 外す on a photo). */
export function ChipButton({
  className,
  type = "button",
  ...rest
}: ComponentProps<"button">) {
  return (
    <button type={type} className={cx("chip-button", className)} {...rest} />
  );
}

function ChipAnchor({ className, ...rest }: ComponentProps<"a">) {
  return <a className={cx("chip-button", className)} {...rest} />;
}

/** A router link drawn as a chip button (an entry beside a row, e.g. 対象の運営). */
export const ChipLink = createLink(ChipAnchor);
