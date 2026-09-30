"use client";

import type { ReactNode } from "react";
import { Chip } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { TextButton } from "../../ui/TextButton";
import type {
  CurrentLocation,
  LocationUnavailableReason,
} from "../useCurrentLocation";

type CurrentLocationChipProps = {
  location: CurrentLocation;
  onStart: () => void;
  onStop: () => void;
  /** The label while in use; VW-01 says 現在地の近くから. */
  activeLabel?: string;
};

/**
 * 「現在地を使う」 (Lunt/Chip as a toggle): pressed while the position is
 * in use, busy while the browser answers. Pressing it again stops.
 */
export function CurrentLocationChip({
  location,
  onStart,
  onStop,
  activeLabel = "現在地を使う",
}: CurrentLocationChipProps) {
  const active = location.status === "on";
  const locating = location.status === "locating";
  return (
    <Chip
      selected={active}
      aria-busy={locating}
      onClick={active ? onStop : onStart}
    >
      {locating
        ? "現在地を取得しています"
        : active
          ? activeLabel
          : "現在地を使う"}
    </Chip>
  );
}

type LocationFeedbackProps = {
  /**
   * Why the position is not in use; `null` when it was never asked for
   * (VW-04 opened with no area and no position).
   */
  reason: LocationUnavailableReason | null;
  /** Asks the browser again (許可してやり直す / もう一度取得する / 現在地を使う). */
  onRetry: () => void;
  /** The way to choose an area (VW-02), e.g. a secondary `ButtonLink`. */
  areaAction: ReactNode;
};

const RETRY_LABEL: Readonly<
  Record<LocationUnavailableReason | "idle", string>
> = {
  denied: "位置情報を許可してやり直す",
  unsupported: "位置情報を許可してやり直す",
  failed: "現在地をもう一度取得する",
  idle: "現在地を使う",
};

/**
 * CS-03 位置情報未許可 (Figma 41:2659): the screen keeps the view without
 * the position and offers an area, the permission again, or another try.
 */
export function LocationFeedback({
  reason,
  onRetry,
  areaAction,
}: LocationFeedbackProps) {
  return (
    <div className="feedback" role="status">
      <Icon name="place" />
      <h2 className="feedback__title">エリアを選んで、はじめる。</h2>
      <p className="feedback__body">
        位置情報を使わなくても、
        <br />
        気になる地域から探せます。
      </p>
      <div className="feedback__actions">
        {areaAction}
        <div className="feedback__links">
          <TextButton onClick={onRetry}>
            {RETRY_LABEL[reason ?? "idle"]}
          </TextButton>
        </div>
      </div>
    </div>
  );
}
