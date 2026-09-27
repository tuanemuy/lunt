import type { ReactNode } from "react";
import { cx } from "../cx";

type NoticeProps =
  | {
      /** Viewer: a short paper-coloured notice inside the content (CS-03, a failed "load more"). */
      variant?: "viewer";
      /** `error` draws the focus border and announces itself as an alert. */
      tone?: "default" | "error";
      title?: string;
      children: ReactNode;
      actions?: ReactNode;
    }
  | {
      /** Management: Notice 73:3377, a full-bleed light panel with body-sized text. */
      variant: "manage";
      tone?: "light" | "paper";
      title?: ReactNode;
      children?: ReactNode;
      actions?: ReactNode;
    };

export function Notice(props: NoticeProps) {
  const { title, children, actions } = props;
  const isManage = props.variant === "manage";
  const isError = props.variant !== "manage" && props.tone === "error";
  return (
    <div
      className={cx(
        "notice",
        isManage && "notice--manage",
        isError && "notice--error",
      )}
      data-tone={isManage && props.tone === "paper" ? "paper" : undefined}
      role={isManage ? undefined : isError ? "alert" : "status"}
    >
      {title === undefined ? null : <p className="notice__title">{title}</p>}
      {children === undefined ? null : (
        <p className="notice__text">{children}</p>
      )}
      {actions === undefined ? null : (
        <div className="notice__actions">{actions}</div>
      )}
    </div>
  );
}
