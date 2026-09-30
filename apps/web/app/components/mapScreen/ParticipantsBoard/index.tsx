"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
import type {
  MapPin,
  MapViewport,
  MapViewportChange,
} from "@/components/map/types";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import { locateParticipantsFn } from "@/presentation/map";
import {
  gridOfSize,
  type MapRange,
  type ParticipantsRead,
} from "@/presentation/mapView";
import { PlaceOverview, SpotList } from "../MapOverview";
import {
  type MapSelection,
  mapPins,
  mergeZoomedCells,
  NO_SELECTION,
  selectionOfPin,
} from "../pins";

type Grid = Readonly<{ columns: number; rows: number }>;

/** What a read regroups: the range the map shows and the grid for its size. */
type ReadTarget = Readonly<{
  bounds: MapRange;
  grid: Grid;
  cause: "open" | "zoom";
}>;

type ReadState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading"; target: ReadTarget }>
  | Readonly<{ kind: "failed"; target: ReadTarget }>;

type ParticipantsBoardProps = {
  styleUrl: string;
  occasionId: string;
  /** The range holding every participant (never `null` here: CS-09 is the route's). */
  extent: MapRange;
};

/**
 * VW-08 参加店舗マップ (EXP-10): every participant of the occasion from
 * the range holding them all, grouped like VW-04 — and regrouped only on
 * opening and after a cluster's zoom, never on the viewer's own moves.
 * The previous pins stay while a zoom reads (CS-01) or fails (CS-02).
 */
export function ParticipantsBoard({
  styleUrl,
  occasionId,
  extent,
}: ParticipantsBoardProps) {
  const [viewport] = useState<MapViewport>(() => ({
    kind: "bounds",
    bounds: extent,
  }));
  const [read, setRead] = useState<ParticipantsRead | null>(null);
  const [state, setState] = useState<ReadState>({ kind: "idle" });
  const [selection, setSelection] = useState<MapSelection>(NO_SELECTION);
  const seq = useRef(0);

  const runRead = useCallback(
    (target: ReadTarget) => {
      const current = ++seq.current;
      setState({ kind: "loading", target });
      locateParticipantsFn({
        data: { occasionId, bounds: target.bounds, grid: target.grid },
      })
        .then((result) => {
          if (current !== seq.current) return;
          setRead((previous) =>
            previous === null || target.cause === "open"
              ? result
              : {
                  ...result,
                  cells: mergeZoomedCells(
                    previous.cells,
                    result.cells,
                    target.bounds,
                  ),
                },
          );
          setState({ kind: "idle" });
        })
        .catch(() => {
          if (current === seq.current) setState({ kind: "failed", target });
        });
    },
    [occasionId],
  );

  const onViewportChange = useCallback(
    (change: MapViewportChange) => {
      if (change.cause !== "initial" && change.cause !== "cluster") return;
      if (change.size.width <= 0 || change.size.height <= 0) return;
      runRead({
        bounds: change.bounds,
        grid: gridOfSize(change.size),
        cause: change.cause === "initial" ? "open" : "zoom",
      });
    },
    [runRead],
  );

  const onSelect = (pin: MapPin | null) => {
    if (pin === null) {
      setSelection(NO_SELECTION);
      return;
    }
    const next = selectionOfPin(pin, read?.cells ?? []);
    if (next !== null) setSelection(next);
  };

  const pins = useMemo(
    () => (read === null ? [] : mapPins(read.cells, [], selection, null)),
    [read, selection],
  );

  const status =
    state.kind === "loading"
      ? state.target.cause === "zoom"
        ? "拡大した範囲を読み込んでいます"
        : "参加店舗を読み込んでいます"
      : null;
  const close = () => setSelection(NO_SELECTION);
  const back = (
    <TextLink to="/events/$occasionId" params={{ occasionId }}>
      参加店舗の一覧で所在地を見る
    </TextLink>
  );

  return (
    <div className="participants__layout">
      <div className="participants__main">
        <MapCanvas
          styleUrl={styleUrl}
          label="参加店舗の地図"
          viewport={viewport}
          pins={pins}
          status={status}
          onViewportChange={onViewportChange}
          onSelect={onSelect}
          unavailableActions={back}
        />
        {state.kind === "failed" ? (
          <Notice
            tone="error"
            title={
              state.target.cause === "zoom"
                ? "拡大した範囲を読み込めませんでした"
                : "参加店舗を読み込めませんでした"
            }
            actions={
              <>
                <TextButton onClick={() => runRead(state.target)}>
                  もう一度試す
                </TextButton>
                {back}
              </>
            }
          >
            {state.target.cause === "zoom"
              ? "拡大の前の表示のままです。"
              : "通信状況を確認して、もう一度お試しください。"}
          </Notice>
        ) : null}
      </div>
      <div className="participants__side">
        {selection.kind === "place" ? (
          <PlaceOverview place={selection.place} onClose={close} />
        ) : selection.kind === "spot" ? (
          <SpotList
            title={`同じ場所にある参加店舗（${selection.places.length}）`}
            places={selection.places}
            onChoose={(place) =>
              setSelection({ kind: "place", place, spotKey: selection.key })
            }
            onClose={close}
          />
        ) : read === null ? null : (
          <p className="participants__hint">
            ピンを選ぶと、お店の概要を示します。
          </p>
        )}
        <ButtonLink
          variant="secondary"
          to="/events/$occasionId"
          params={{ occasionId }}
        >
          参加店舗を一覧で見る
        </ButtonLink>
      </div>
    </div>
  );
}
