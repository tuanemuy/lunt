"use client";

import { type ReactNode, useId, useLayoutEffect, useRef } from "react";
import { Button } from "../Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** What confirming changes, e.g. a lead sentence and a `<ul>` of consequences. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Disables both actions while the confirmed operation runs. */
  pending?: boolean;
  onConfirm: () => void;
  /** Called for the cancel button, Escape and the backdrop alike. */
  onCancel: () => void;
};

/**
 * The confirmation before an irreversible or audience-reducing operation
 * (CS-12), as a native modal `<dialog>`: focus moves into it, the page behind
 * is inert, and Escape cancels. The owner keeps `open` and runs the operation.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "やめる",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click mirrors Escape, which `onCancel` already handles for keyboards
    <dialog
      ref={ref}
      className="m-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(event) => {
        // The panel fills the dialog, so only a backdrop click targets the dialog itself.
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="m-dialog__panel">
        <h2 className="m-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="m-dialog__body">{children}</div>
        <div className="m-dialog__actions">
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
