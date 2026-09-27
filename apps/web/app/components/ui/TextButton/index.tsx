import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { cx } from "../cx";

type TextButtonStyleProps = {
  /** Meta-sized, secondary-coloured, for supplementary entries (e.g. procedures). */
  quiet?: boolean;
};

function textButtonClassName(quiet = false, className?: string): string {
  return cx("text-button", quiet && "text-button--quiet", className);
}

/** An underlined text action (`.text-button` / `.m-link`). */
export function TextButton({
  quiet,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & TextButtonStyleProps) {
  return (
    <button
      type={type}
      className={textButtonClassName(quiet, className)}
      {...rest}
    />
  );
}

function TextAnchor({
  quiet,
  className,
  ...rest
}: ComponentProps<"a"> & TextButtonStyleProps) {
  return <a className={textButtonClassName(quiet, className)} {...rest} />;
}

/** A router link drawn as a text action. */
export const TextLink = createLink(TextAnchor);
