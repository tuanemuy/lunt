"use client";

import { useId, useMemo, useState } from "react";
import { useMapStyleUrl } from "@/components/map/useMapStyleUrl";
import { Button } from "@/components/ui/Button";
import {
  Field,
  type FieldRequirement,
  Input,
  RequirementMark,
} from "@/components/ui/Field";
import { PositionMap } from "../PositionMap";
import { PositionPicker } from "./PositionPicker";
import { formatCoordinate, parsePosition } from "./position";

/** The field's value: the form's two texts, as the transport takes them. */
export type PositionValue = Readonly<{ latitude: string; longitude: string }>;

type PositionFieldProps = PositionValue & {
  onChange: (change: PositionValue) => void;
  /** The in-page anchor CS-10's list leads to. */
  id?: string;
  /** Prefixes the coordinate inputs' ids (`place` → `place-latitude`). */
  idPrefix: string;
  /** 位置 / 開催場所の位置. */
  legend: string;
  requirement: FieldRequirement;
  /** Whose position, in the help text: 店舗 / 地域 / 開催場所. */
  subject: string;
  /** The pin's short text on the map (店, 地, 催). */
  mark: string;
  error?: string | undefined;
  disabled?: boolean;
};

/**
 * CF-09 位置の指定: the chosen point on a still map, and 「地図で位置を
 * 指定する / 選び直す」 opening the picker. The position never follows the
 * address. For the keyboard, a screen reader, or a map that cannot load,
 * 「緯度・経度で入力する」 edits the same value as two numbers.
 */
export function PositionField({
  latitude,
  longitude,
  onChange,
  id = "location",
  idPrefix,
  legend,
  requirement,
  subject,
  mark,
  error,
  disabled = false,
}: PositionFieldProps) {
  const styleUrl = useMapStyleUrl();
  const [picking, setPicking] = useState(false);
  const [coordinatesOpen, setCoordinatesOpen] = useState(false);
  const helpId = useId();
  const errorId = useId();
  const point = useMemo(
    () => parsePosition(latitude, longitude),
    [latitude, longitude],
  );
  const typedButInvalid =
    point === null && (latitude.trim() !== "" || longitude.trim() !== "");
  const describedBy = [error === undefined ? null : errorId, helpId]
    .filter((value) => value !== null)
    .join(" ");

  return (
    <fieldset
      id={id}
      className="m-field position-field"
      aria-describedby={describedBy}
    >
      <legend className="m-field__label">
        {legend}
        <RequirementMark requirement={requirement} />
      </legend>
      {point === null ? (
        <div
          className="position-field__map position-field__empty"
          aria-invalid={error === undefined ? undefined : true}
        >
          <span>位置はまだ指定していません</span>
        </div>
      ) : (
        <PositionMap
          className="position-field__map"
          point={point}
          name={legend}
          mark={mark}
          onUnavailable={() => setCoordinatesOpen(true)}
        />
      )}
      {error === undefined ? null : (
        <p className="m-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
      <p className="m-field__help" id={helpId}>
        地図の上で1点を選んで、{subject}
        の位置を指定します。位置は所在地から決まりません。
      </p>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => setPicking(true)}
      >
        {point === null ? "地図で位置を指定する" : "地図で位置を選び直す"}
      </Button>
      <details
        className="position-field__coordinates"
        open={coordinatesOpen || typedButInvalid}
        onToggle={(event) => setCoordinatesOpen(event.currentTarget.open)}
      >
        <summary>緯度・経度で入力する</summary>
        <div className="sm02-location">
          <Field id={`${idPrefix}-latitude`} label="緯度">
            {(control) => (
              <Input
                {...control}
                name="latitude"
                inputMode="decimal"
                placeholder="例: 35.6812"
                value={latitude}
                disabled={disabled}
                aria-invalid={error === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ latitude: event.currentTarget.value, longitude })
                }
              />
            )}
          </Field>
          <Field id={`${idPrefix}-longitude`} label="経度">
            {(control) => (
              <Input
                {...control}
                name="longitude"
                inputMode="decimal"
                placeholder="例: 139.7671"
                value={longitude}
                disabled={disabled}
                aria-invalid={error === undefined ? undefined : true}
                onChange={(event) =>
                  onChange({ latitude, longitude: event.currentTarget.value })
                }
              />
            )}
          </Field>
        </div>
      </details>
      <PositionPicker
        open={picking}
        title={`${subject}の位置を指定する`}
        mark={mark}
        initial={point}
        styleUrl={styleUrl}
        onConfirm={(picked) => {
          setPicking(false);
          onChange({
            latitude: formatCoordinate(picked.latitude),
            longitude: formatCoordinate(picked.longitude),
          });
        }}
        onCancel={() => setPicking(false)}
        onEnterCoordinates={() => {
          setPicking(false);
          setCoordinatesOpen(true);
        }}
      />
    </fieldset>
  );
}
