"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { rereadOnReturn } from "@/components/explore/entryMemory";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { removeBookmarkFn, saveBookmarkFn } from "@/presentation/bookmark";
import {
  deviceMerger,
  deviceSaves,
  useDeviceSaves,
  useMergeStatus,
} from "@/presentation/deviceSaveStore";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import {
  accountSaved,
  type SaveState,
  type SaveTarget,
} from "@/presentation/savedView";

/** A save or removal that did not go through; the toggle shows its state before it. */
export type SaveFailure = Readonly<{
  action: "save" | "remove";
  /** `null` when the device could not keep it (storage blocked). */
  error: ErrorState | null;
}>;

export type SaveToggleState = Readonly<{
  saved: boolean;
  pending: boolean;
  failure: SaveFailure | null;
  toggle: () => void;
}>;

/**
 * Once a screen knows it is signed in while this browser still holds
 * device saves (a login that returned elsewhere, the external login's
 * redirect), sends them to the account and reloads the screen once
 * (KEP-04). Only from rest: a failed merge waits for VW-10's retry, and a
 * refused one (the session ended) for the next page load.
 */
export function useMergeDeviceSaves(signedIn: boolean): void {
  const device = useDeviceSaves();
  const status = useMergeStatus();
  const reconcile = useReconcile();
  const [, startMerge] = useTransition();
  const waiting = device !== null && device.length > 0;
  useEffect(() => {
    if (!signedIn || !waiting || status.kind !== "idle") return;
    startMerge(async () => {
      await deviceMerger.mergeAndReconcile(reconcile);
    });
  }, [signedIn, waiting, status.kind, reconcile]);
}

/**
 * A save or removal the account confirmed, over the account's answer the
 * screen was read with (`basis`); a later read that answers otherwise
 * replaces it.
 */
type Confirmed = Readonly<{ basis: boolean; saved: boolean }>;

/**
 * CF-04 for one listing or place: whether it is saved, and the switch.
 * Signed in (`saveState.signedIn`), the account decides: the switch flips
 * at once (`useOptimistic`), runs `saveBookmarkFn` / `removeBookmarkFn`
 * and keeps what the account confirmed; a failure puts the display back
 * and reports it. Signed out, the device decides (`deviceSaves`), read
 * after hydration (the server and the hydrating render show 「保存していない」).
 *
 * A confirmed save does not re-read the screen: it holds whether or not
 * the target is still viewable (CF-04), so the detail or card the viewer
 * is looking at stays as shown even when its target has become unviewable
 * meanwhile. Signed in or out, the screens left before re-read on return
 * (`rereadOnReturn`), and a new navigation reads afresh.
 */
export function useSaveToggle({
  target,
  saveState,
}: {
  target: SaveTarget;
  saveState: SaveState;
}): SaveToggleState {
  const device = useDeviceSaves();
  const onAccount = accountSaved(saveState, target);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const accountValue =
    onAccount !== null && confirmed?.basis === onAccount
      ? confirmed.saved
      : onAccount;
  const [optimistic, setOptimistic] = useOptimistic(accountValue ?? false);
  const [pending, startToggle] = useTransition();
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  useMergeDeviceSaves(saveState.signedIn);

  const onDevice =
    device?.some(
      (entry) => entry.kind === target.kind && entry.id === target.id,
    ) === true;
  const saved = accountValue === null ? onDevice : optimistic;

  const toggle = useCallback(() => {
    const action = saved ? "remove" : "save";
    setFailure(null);
    if (onAccount === null) {
      const kept =
        action === "save"
          ? deviceSaves.save(target, Date.now())
          : deviceSaves.remove(target);
      if (kept) rereadOnReturn();
      else setFailure({ action, error: null });
      return;
    }
    if (pending) return;
    startToggle(async () => {
      setOptimistic(action === "save");
      try {
        await (action === "save" ? saveBookmarkFn : removeBookmarkFn)({
          data: target,
        });
        rereadOnReturn();
        // Inside the action, so the optimistic value gives way to it in one commit.
        startToggle(() =>
          setConfirmed({ basis: onAccount, saved: action === "save" }),
        );
      } catch (error) {
        setFailure({ action, error: classifyError(error) });
      }
    });
  }, [saved, onAccount, pending, target, setOptimistic]);

  return { saved, pending, failure, toggle };
}

/**
 * The bookmark IconButton of CF-04 (Off: bookmark / On: bookmark-filled,
 * `aria-pressed`). Placed by its container's CSS: `.hero__media` (DT) and
 * `.card` (cards) put it in the photo's top-right corner.
 */
export function SaveButton({
  state,
  label,
  className,
}: {
  state: SaveToggleState;
  /** The accessible name, e.g. 「この掲載を保存」「{名称}を保存」. */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx("icon-button save-button", className)}
      aria-pressed={state.saved}
      aria-label={label}
      aria-busy={state.pending || undefined}
      onClick={state.toggle}
    >
      <Icon name={state.saved ? "bookmark-filled" : "bookmark"} />
    </button>
  );
}

const FAILURE_TITLE = {
  save: "保存できませんでした",
  remove: "保存を解除できませんでした",
} as const;

function failureText(failure: SaveFailure): string {
  if (failure.error === null) {
    return "この端末に保存を残せませんでした。ブラウザの設定で、サイトのデータの保存を許可してください。";
  }
  return failure.error.kind === "failed"
    ? "通信状況を確認して、もう一度お試しください。"
    : failure.error.message;
}

/**
 * CS-02 of CF-04 on DT-01 / DT-02: the save or removal did not reach the
 * account, the switch shows its state before it, and it can be tried again.
 */
export function SaveFailureNotice({ state }: { state: SaveToggleState }) {
  const { failure } = state;
  if (failure === null) return null;
  return (
    <Notice
      tone="error"
      title={FAILURE_TITLE[failure.action]}
      actions={
        <button className="text-button" type="button" onClick={state.toggle}>
          {failure.action === "save" ? "もう一度保存する" : "もう一度解除する"}
        </button>
      }
    >
      {failureText(failure)}
    </Notice>
  );
}

/**
 * CF-04 on a listing card (VW-01's feed; `spec/pages/index.md`: the other
 * lists have none): the switch in the card's top-right corner and, when a
 * save or removal fails, a short alert under the card. Render it inside
 * the card's `<article className="card">`, after its link.
 */
export function SaveToggle({
  target,
  name,
  saveState,
}: {
  target: SaveTarget;
  /** The target's name, for the accessible name 「{name}を保存」. */
  name: string;
  saveState: SaveState;
}) {
  const state = useSaveToggle({ target, saveState });
  return (
    <>
      <SaveButton state={state} label={`${name}を保存`} />
      {state.failure === null ? null : (
        <p className="save-failure" role="alert">
          {FAILURE_TITLE[state.failure.action]}
        </p>
      )}
    </>
  );
}
