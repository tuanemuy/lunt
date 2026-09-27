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
