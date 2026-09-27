import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";

type IconButtonOwnProps = {
  icon: IconName;
  /** The accessible name; the icon itself is decorative. */
  label: string;
  /** State=Neutral: a 1px line border. */
  neutral?: boolean;
};

function iconButtonClassName(neutral = false, className?: string): string {
  return cx("icon-button", neutral && "icon-button--neutral", className);
}

/**
 * Lunt/IconButton (14:18): a 44px round icon control. Pass `aria-pressed`
 * for a toggle (State=On draws the light surface).
 */
export function IconButton({
  icon,
  label,
  neutral,
  className,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "children"> & IconButtonOwnProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={iconButtonClassName(neutral, className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

function IconAnchor({
  icon,
  label,
  neutral,
  className,
  href,
  ...rest
}: Omit<ComponentProps<"a">, "children"> & IconButtonOwnProps) {
  return (
    <a
      href={href}
      aria-label={label}
      className={iconButtonClassName(neutral, className)}
      {...rest}
    >
      <Icon name={icon} />
    </a>
  );
}

/** A router link drawn as a Lunt/IconButton. */
export const IconButtonLink = createLink(IconAnchor);
