import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary";

type ButtonStyleProps = {
  variant?: ButtonVariant;
  /** From `md`, caps the width at 348px and centres it (`.button--fit`). */
  fit?: boolean;
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  fit = false,
  className?: string,
): string {
  return cx("button", `button--${variant}`, fit && "button--fit", className);
}

/** Lunt/Button (13:18): full-width, 44px, Primary or Secondary. */
export function Button({
  variant,
  fit,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button
      type={type}
      className={buttonClassName(variant, fit, className)}
      {...rest}
    />
  );
}

function ButtonAnchor({
  variant,
  fit,
  className,
  ...rest
}: ComponentProps<"a"> & ButtonStyleProps) {
  return <a className={buttonClassName(variant, fit, className)} {...rest} />;
}

/** A router link drawn as a Lunt/Button. */
export const ButtonLink = createLink(ButtonAnchor);
