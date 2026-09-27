import type { ReactNode } from "react";

const GLYPHS = {
  back: <path d="M14 5L7 12L14 19" />,
  book: (
    <path d="M12 20C15 18 19 18 22 19V4C19 3 15 3 12 5C9 3 5 3 2 4V19C5 18 9 18 12 20ZM12 5V20" />
  ),
  bookmark: <path d="M6 3H18V21L12 17L6 21V3Z" />,
  "bookmark-filled": (
    <path
      d="M6 3H18V22L12 18L6 22V3Z"
      fill="currentColor"
      strokeLinecap="butt"
      strokeLinejoin="miter"
    />
  ),
  chevron: <path d="M9 5L16 12L9 19" />,
  close: <path d="M6 6L18 18M6 18L18 6" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8L13.5 13.5L8 16L10.5 10.5L16 8Z" />
    </>
  ),
  down: <path d="M6 9L12 15L18 9" />,
  filter: (
    <>
      <path d="M4 7H20M4 17H20" />
      <circle cx="9" cy="7" r="2" fill="currentColor" />
      <circle cx="15" cy="17" r="2" fill="currentColor" />
    </>
  ),
  map: (
    <path d="M15 5L9 3L3 5V21L9 19M9 3V19M9 19L15 21L21 19V3L15 5M15 5V21" />
  ),
  place: (
    <>
      <path d="M19 10C19 15 12 21 12 21C12 21 5 15 5 10C5 9.08075 5.18106 8.1705 5.53284 7.32122C5.88463 6.47194 6.40024 5.70026 7.05025 5.05025C7.70026 4.40024 8.47194 3.88463 9.32122 3.53284C10.1705 3.18106 11.0807 3 12 3C12.9193 3 13.8295 3.18106 14.6788 3.53284C15.5281 3.88463 16.2997 4.40024 16.9497 5.05025C17.5998 5.70026 18.1154 6.47194 18.4672 7.32122C18.8189 8.1705 19 9.08075 19 10Z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  region: (
    <path d="M3 21V9L9 5V21M9 11L15 7V21M15 13L21 10V21M2 21H22M6 10V12M6 15V17M12 14V17M18 15V17" />
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16L21 21" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/** The 13 icons of `spec/design/assets/icon-*.svg`. */
export type IconName = keyof typeof GLYPHS;

type IconProps = {
  name: IconName;
  className?: string;
};

/**
 * A 24px design icon drawn in `currentColor`. Always decorative: the control
 * that holds it carries the accessible name.
 */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none" }}
    >
      {GLYPHS[name]}
    </svg>
  );
}
