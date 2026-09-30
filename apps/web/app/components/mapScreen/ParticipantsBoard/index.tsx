"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  entryMemory,
  useHistoryEntryKey,
} from "@/components/explore/entryMemory";
import { MapCanvas } from "@/components/map/MapCanvas";
import type {
  LngLat,
  MapClusterZoom,
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
  NO_SELECTION,
  selectionOfPin,
} from "../pins";

type Grid = Readonly<{ columns: number; rows: number }>;

/**
 * What a read regroups: the range the map shows (or, for a zoom, will
 * show) and the grid for its size. A zoom moves the map only once read.
 */
type ReadTarget =
  | Readonly<{ cause: "open"; bounds: MapRange; grid: Grid }>
  | Readonly<{
      cause: "zoom";
      bounds: MapRange;
      grid: Grid;
      zoomIn: () => void;
    }>;

type ReadState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading"; target: ReadTarget }>
  | Readonly<{ kind: "failed"; target: ReadTarget }>;

/** What the board had, kept per history entry for the way back from a detail. */
type BoardMemory = Readonly<{
  extentKey: string;
  camera: Readonly<{ center: LngLat; zoom: number }>;
  read: ParticipantsRead;
  selection: MapSelection;
}>;

const boardMemory = entryMemory<BoardMemory>();

type ParticipantsBoardProps = {
  styleUrl: string;
  occasionId: string;
  /** The range holding every participant (never `null` here: CS-09 is the route's). */
  extent: MapRange;
};

/**
 * VW-08 参加店舗マップ (EXP-10): every participant of the occasion from
 * the range holding them all, grouped like VW-04 — and regrouped only on
 * opening and for a cluster's zoom, never on the viewer's own moves.
 * Each read regroups every participant — the range's at its grid, the
 * rest over the range holding them all — so each is shown exactly once
 * whatever was zoomed before.
 * A zoom reads its range first: the view and pins before it stay while
 * it reads (CS-01) or when it fails (CS-02), and the map zooms once read.
 * Coming back from a detail finds the range, the pins read so far and
 * the selection as they were (`spec/pages/browse.md` 画面群に共通).
 */
export function ParticipantsBoard({
  styleUrl,
  occasionId,
  extent,
}: ParticipantsBoardProps) {
  const entry = useHistoryEntryKey();
  const extentKey = JSON.stringify(extent);
  const [remembered] = useState(() => {
    const kept = boardMemory.recall(entry, "participants");
    return kept?.extentKey === extentKey ? kept : undefined;
  });
  const [viewport] = useState<MapViewport>(() =>
    remembered === undefined
      ? { kind: "bounds", bounds: extent }
      : { kind: "center", ...remembered.camera },
  );
  const [read, setRead] = useState<ParticipantsRead | null>(
    remembered?.read ?? null,
  );
  const [state, setState] = useState<ReadState>({ kind: "idle" });
  const [selection, setSelection] = useState<MapSelection>(
    remembered?.selection ?? NO_SELECTION,
  );
  const [camera, setCamera] = useState(remembered?.camera ?? null);
  const seq = useRef(0);

  useEffect(() => {
    if (camera === null || read === null) return;
    boardMemory.remember(entry, "participants", {
      extentKey,
      camera,
      read,
      selection,
    });
  }, [entry, extentKey, camera, read, selection]);

  const runRead = useCallback(
    (target: ReadTarget) => {
      const current = ++seq.current;
      setState({ kind: "loading", target });
      locateParticipantsFn({
        data: { occasionId, bounds: target.bounds, grid: target.grid },
      })
        .then((result) => {
          if (current !== seq.current) return;
          setRead(result);
          setState({ kind: "idle" });
          if (target.cause === "zoom") target.zoomIn();
        })
        .catch(() => {
          if (current === seq.current) setState({ kind: "failed", target });
        });
    },
    [occasionId],
  );

  const onViewportChange = useCallback(
    (change: MapViewportChange) => {
      setCamera({ center: change.center, zoom: change.zoom });
      if (change.cause !== "initial") return;
      if (change.size.width <= 0 || change.size.height <= 0) return;
      // Restored from the memory: the pins read before are shown as they were.
      if (remembered !== undefined) return;
      runRead({
        cause: "open",
        bounds: change.bounds,
        grid: gridOfSize(change.size),
      });
    },
    [runRead, remembered],
  );

  // The view before the zoom stays while the zoomed range is read (CS-01)
  // and when the read fails (CS-02); the map zooms in once it has the pins.
  const onClusterZoom = useCallback(
    (zoom: MapClusterZoom) => {
      if (zoom.size.width <= 0 || zoom.size.height <= 0) {
        zoom.zoomIn();
        return;
      }
      runRead({
        cause: "zoom",
        bounds: zoom.bounds,
        grid: gridOfSize(zoom.size),
        zoomIn: zoom.zoomIn,
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
          onClusterZoom={onClusterZoom}
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
