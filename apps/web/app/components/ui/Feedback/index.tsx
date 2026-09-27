import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

type FeedbackProps = {
  /** `empty` (CS-09) is a quiet region; `error` (CS-02) is announced as an alert. */
  kind: "empty" | "error";
  title: string;
  body?: ReactNode;
  icon?: IconName;
  /** The main next step, typically a secondary `Button`/`ButtonLink`. */
  action?: ReactNode;
  /** Other ways onward, typically `TextLink`s. */
  links?: ReactNode;
  headingLevel?: "h1" | "h2";
};

/**
 * Lunt/EmptyState (22:6) and the communication-error frame (41:2648): a
 * centred icon, serif title, body and next steps that replace the content
 * of a viewer screen.
 */
export function Feedback({
  kind,
  title,
  body,
  icon = "compass",
  action,
  links,
  headingLevel: Heading = "h2",
}: FeedbackProps) {
  return (
    <div className="feedback" role={kind === "error" ? "alert" : undefined}>
      <Icon name={icon} />
      <Heading className="feedback__title">{title}</Heading>
      {body === undefined ? null : <p className="feedback__body">{body}</p>}
      {action === undefined && links === undefined ? null : (
        <div className="feedback__actions">
          {action}
          {links === undefined ? null : (
            <div className="feedback__links">{links}</div>
          )}
        </div>
      )}
    </div>
  );
}
