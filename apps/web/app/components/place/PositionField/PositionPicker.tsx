"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { CurrentLocationChip } from "@/components/map/CurrentLocation";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { LngLat, MapPin, MapViewport } from "@/components/map/types";
import {
  type LocationUnavailableReason,
  useCurrentLocation,
} from "@/components/map/useCurrentLocation";
import { Button } from "@/components/ui/Button";
import { TextButton } from "@/components/ui/TextButton";
import { JAPAN_BOUNDS, POINT_ZOOM, positionText } from "./position";

type PositionPickerProps = {
  open: boolean;
  /** e.g. 店舗の位置を指定する. */
  title: string;
  /** The picked pin's short text (店, 地, 催). */
  mark: string;
  /** The point the field holds now; the picker starts there. */
  initial: LngLat | null;
  /** `null` while the style setting is on its way. */
  styleUrl: string | null;
  onConfirm: (point: LngLat) => void;
  onCancel: () => void;
  /** Leaves the map for the latitude / longitude fields (CS-02). */
  onEnterCoordinates: () => void;
};

const NO_PINS: readonly MapPin[] = [];

const LOCATION_NOTE: Readonly<Record<LocationUnavailableReason, string>> = {
  denied:
    "位置情報の利用が許可されていません。地図を動かして、位置を探してください。",
  unsupported:
    "この端末では現在地を使えません。地図を動かして、位置を探してください。",
  failed:
    "現在地を取得できませんでした。地図を動かして、位置を探してください。",
};

/**
 * CF-09's map (位置の指定): a modal `<dialog>` over the form, the full
 * screen on a phone. A tap puts the pin, a drag or another tap moves it,
 * and 「この位置にする」 hands the point back; leaving changes nothing.
 * The keyboard pans the map and takes its centre (「地図の中心を選ぶ」).
 */
export function PositionPicker({
  open,
  title,
  mark,
  initial,
  styleUrl,
  onConfirm,
  onCancel,
  onEnterCoordinates,
}: PositionPickerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="m-dialog position-picker"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {open ? (
        <PickerPanel
          titleId={titleId}
          title={title}
          mark={mark}
          initial={initial}
          styleUrl={styleUrl}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onEnterCoordinates={onEnterCoordinates}
        />
      ) : null}
    </dialog>
  );
}

function PickerPanel({
  titleId,
  title,
  mark,
  initial,
  styleUrl,
  onConfirm,
  onCancel,
  onEnterCoordinates,
}: Omit<PositionPickerProps, "open"> & { titleId: string }) {
  const [draft, setDraft] = useState<LngLat | null>(initial);
  const [viewport] = useState<MapViewport>(() =>
    initial === null
      ? { kind: "bounds", bounds: JAPAN_BOUNDS }
      : { kind: "center", center: initial, zoom: POINT_ZOOM },
  );
  const [center, setCenter] = useState<LngLat | null>(null);
  const { location, start, stop } = useCurrentLocation();
  const readoutId = useId();

  return (
    <div className="m-dialog__panel position-picker__panel">
      <h2 className="m-dialog__title" id={titleId}>
        {title}
      </h2>
      <p className="position-picker__lead">
        地図をタップして1点を選びます。ピンは、別の場所をタップするか、ドラッグして動かせます。位置は所在地から決まりません。
      </p>
      <div className="position-picker__tools">
        <CurrentLocationChip
          location={location}
          onStart={start}
          onStop={stop}
        />
        <TextButton
          disabled={center === null}
          aria-describedby={readoutId}
          onClick={() => {
            if (center !== null) setDraft(center);
          }}
        >
          地図の中心を選ぶ
        </TextButton>
      </div>
      {location.status === "unavailable" ? (
        <p className="position-picker__note" role="status">
          {LOCATION_NOTE[location.reason]}
        </p>
      ) : null}
      {styleUrl === null ? (
        <div className="map position-picker__map" role="status">
          <span className="skeleton map__skeleton" aria-hidden="true" />
          <span className="sr-only">地図を読み込んでいます</span>
        </div>
      ) : (
        <MapCanvas
          className="position-picker__map"
          styleUrl={styleUrl}
          label="位置を選ぶ地図"
          viewport={viewport}
          pins={NO_PINS}
          picked={{ position: draft, label: "選んだ位置", mark }}
          onPick={setDraft}
          userLocation={location.status === "on" ? location.position : null}
          onViewportChange={(change) => setCenter(change.center)}
          unavailableActions={
            <TextButton onClick={onEnterCoordinates}>
              緯度・経度で入力する
            </TextButton>
          }
        />
      )}
      <p className="position-picker__readout" id={readoutId} aria-live="polite">
        {draft === null
          ? "まだ位置を選んでいません"
          : `選んだ位置: ${positionText(draft)}`}
      </p>
      <div className="m-dialog__actions position-picker__actions">
        <Button
          variant="primary"
          disabled={draft === null}
          onClick={() => {
            if (draft !== null) onConfirm(draft);
          }}
        >
          この位置にする
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          やめる
        </Button>
      </div>
    </div>
  );
}
