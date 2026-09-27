import type { ReactNode } from "react";

type DonePanelProps = {
  title: string;
  children?: ReactNode;
  /** The primary next step first, then any secondary destinations (CS-13). */
  actions: ReactNode;
  /** `h1` when the panel is the whole screen (`DoneScreen`). */
  headingLevel?: "h1" | "h2";
};

/**
 * Completion (CS-13), after the Figma 状態/… frames: a vertically centred
 * block with a title, what happened, and where to go next.
 */
export function DonePanel({
  title,
  children,
  actions,
  headingLevel: Heading = "h2",
}: DonePanelProps) {
  return (
    <div className="m-done" role="status">
      <Heading className="m-done__title">{title}</Heading>
      {children === undefined ? null : (
        <p className="m-done__body">{children}</p>
      )}
      <div className="m-done__actions">{actions}</div>
    </div>
  );
}
