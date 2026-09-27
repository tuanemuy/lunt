"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextButton } from "@/components/ui/TextButton";
import {
  controlsOf,
  FRAMING_MAX_ZOOM,
  type FramingControls,
  framingOf,
} from "@/presentation/framing";
import type { Framing } from "@/presentation/listingView";
import { FramedPhoto } from "../FramedPhoto";

type FramingDialogProps = {
  /** e.g. 1枚目 */
  ordinal: string;
  url: string | null;
  framing: Framing | null;
  onConfirm: (framing: Framing | null) => void;
  onCancel: () => void;
};

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="sm04-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

/**
 * CF-01 見せる範囲 of one listing photo: enlarge and move the frame, and
 * see it as the list card and the detail page will show it.
 */
export function FramingDialog({
  ordinal,
  url,
  framing,
  onConfirm,
  onCancel,
}: FramingDialogProps) {
  const [controls, setControls] = useState<FramingControls>(() =>
    controlsOf(framing),
  );
  const frame = framingOf(controls);
  const set = (change: Partial<FramingControls>) =>
    setControls((current) => ({ ...current, ...change }));
  return (
    <ConfirmDialog
      open
      title={`${ordinal}の見せる範囲`}
      confirmLabel="この範囲にする"
      onConfirm={() => onConfirm(frame)}
      onCancel={onCancel}
    >
      <div className="sm04-crop__whole">
        {url === null ? null : <img src={url} alt="" />}
        {frame === null ? null : (
          <span
            className="sm04-crop__frame"
            aria-hidden="true"
            style={{
              left: `${frame.x * 100}%`,
              top: `${frame.y * 100}%`,
              width: `${frame.width * 100}%`,
              height: `${frame.height * 100}%`,
            }}
          />
        )}
      </div>
      <p className="m-field__help">
        拡大して、見せる部分を選びます。拡大しないときは、写真の全体を見せます。
      </p>
      <div className="sm04-sliders">
        <Slider
          label="拡大"
          min={1}
          max={FRAMING_MAX_ZOOM}
          step={0.05}
          value={controls.zoom}
          onChange={(zoom) => set({ zoom })}
        />
        <Slider
          label="横の位置"
          min={0}
          max={1}
          step={0.01}
          value={controls.centerX}
          onChange={(centerX) => set({ centerX })}
        />
        <Slider
          label="縦の位置"
          min={0}
          max={1}
          step={0.01}
          value={controls.centerY}
          onChange={(centerY) => set({ centerY })}
        />
      </div>
      <TextButton
        onClick={() => setControls({ zoom: 1, centerX: 0.5, centerY: 0.5 })}
      >
        写真の全体を見せる
      </TextButton>
      <div className="sm04-crop__previews">
        <figure>
          <FramedPhoto
            url={url}
            framing={frame}
            alt=""
            ratio={1}
            className="sm04-crop__card"
          />
          <figcaption>一覧のカード</figcaption>
        </figure>
        <figure>
          <FramedPhoto
            url={url}
            framing={frame}
            alt=""
            ratio={348 / 220}
            className="sm04-crop__hero"
          />
          <figcaption>掲載ページ</figcaption>
        </figure>
      </div>
    </ConfirmDialog>
  );
}
