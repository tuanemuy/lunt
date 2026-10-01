"use client";

import type {
  LngLatBounds,
  Map as MapLibreMap,
  MapOptions,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DEFAULT_MAP_STYLE_URL } from "@/presentation/defaultMapStyle";
import { cx } from "../../ui/cx";
import { TextButton } from "../../ui/TextButton";
import {
  clampBounds,
  crowdedLabels,
  type LabelBox,
  pinCount,
  pinLayer,
  pinSelected,
  viewportKey,
  visibleBounds,
} from "../geometry";
import { tintStyle } from "../mapStyle";
import type {
  LngLat,
  MapBounds,
  MapClusterZoom,
  MapPickedPoint,
  MapPin,
  MapViewport,
  MapViewportCause,
  MapViewportChange,
} from "../types";

export type MapCanvasProps = {
  /** A MapLibre style URL (`loadMapStyleFn` gives the configured one). */
  styleUrl: string;
  viewport: MapViewport;
  pins: readonly MapPin[];
  /** The region's accessible name (e.g. 地図, 参加店舗の地図). */
  label: string;
  /** Draws the viewer's position; `null` or absent draws nothing. */
  userLocation?: LngLat | null | undefined;
  /**
   * Moves to `userLocation` whenever a new position arrives. Off when the
   * route opens the vicinity through `viewport` instead.
   */
  followUserLocation?: boolean;
  /**
   * The range once the map has settled: right after it first shows
   * (`initial`) and each time a move stops, after `debounceMs`.
   */
  onViewportChange?: (change: MapViewportChange) => void;
  /**
   * A pin was chosen, or `null` when the viewer taps the map away from
   * the pins or presses Escape (選択をやめる). A cluster also zooms in.
   */
  onSelect?: (pin: MapPin | null) => void;
  /**
   * Given, a chosen cluster does not zoom at once: the route reads the
   * range it will show and calls `zoomIn` (the move reports `cluster`).
   */
  onClusterZoom?: ((zoom: MapClusterZoom) => void) | undefined;
  /** A short note over the map, e.g. この範囲を探しています (再検索中). */
  status?: string | null | undefined;
  /** Other ways onward shown when the map cannot be drawn (CS-02). */
  unavailableActions?: ReactNode;
  /** The map could not be drawn (style or tiles unreachable, no WebGL). */
  onUnavailable?: () => void;
  debounceMs?: number;
  className?: string;
  /** The point a form places (CF-09), drawn over the pins. */
  picked?: MapPickedPoint | undefined;
  /**
   * Makes `picked` placeable: a tap on the map away from the pins puts
   * it there, and the picked pin can be dragged.
   */
  onPick?: ((point: LngLat) => void) | undefined;
  /**
   * Off: the map is only looked at (a form's preview of the point): no
   * pan, zoom or zoom buttons. Default on.
   */
  interactive?: boolean;
};

type Phase = "loading" | "ready" | "unavailable";

type MarkerEntry = { marker: Marker; host: HTMLElement; kind: MapPin["kind"] };

const FIT_PADDING = 48;
/** A region's name pill, as tall as `--leading-meta`; the rest of its button is touch area. */
const REGION_LABEL_HEIGHT = 20;
/** The region marker's `offset`: its dot's middle sits on the point. */
const REGION_OFFSET_X = -6;
const DEFAULT_MAX_ZOOM = 16;
const CLUSTER_MAX_ZOOM = 18;
const LOCATION_MIN_ZOOM = 14;
const LOAD_TIMEOUT_MS = 20_000;

const JA_LOCALE: Readonly<Record<string, string>> = {
  "Map.Title": "地図の表示範囲",
  "Marker.Title": "地図のピン",
  "NavigationControl.ZoomIn": "拡大",
  "NavigationControl.ZoomOut": "縮小",
  "NavigationControl.ResetBearing": "北を上にする",
  "AttributionControl.ToggleAttribution": "地図の出典を表示",
  "AttributionControl.MapFeedback": "地図への意見",
};

/**
 * Hides the names of regions whose label would overlap another's at the
 * current zoom (the dot stays, the name stays the accessible label and
 * shows on hover or focus). Selected regions win, then the pins' order.
 */
function declutterRegions(
  map: MapLibreMap,
  pins: readonly MapPin[],
  markers: ReadonlyMap<string, MarkerEntry>,
  widths: Map<string, number>,
): void {
  const regions = pins
    .filter((pin) => pin.kind === "region")
    .sort((a, b) => Number(pinSelected(b)) - Number(pinSelected(a)));
  const boxes: LabelBox[] = [];
  for (const pin of regions) {
    const entry = markers.get(pin.key);
    if (entry === undefined) continue;
    const widthKey = `${pin.key}|${pin.kind === "region" ? pin.name : ""}`;
    if (entry.host.dataset.crowded !== "true" && entry.host.offsetWidth > 0) {
      widths.set(widthKey, entry.host.offsetWidth);
    }
    const width = widths.get(widthKey);
    if (width === undefined) continue;
    const point = map.project(toLngLat(pin.position));
    boxes.push({
      key: pin.key,
      x: point.x + REGION_OFFSET_X,
      y: point.y - REGION_LABEL_HEIGHT / 2,
      width,
      height: REGION_LABEL_HEIGHT,
    });
  }
  const crowded = crowdedLabels(boxes);
  for (const pin of regions) {
    const entry = markers.get(pin.key);
    if (entry === undefined) continue;
    if (crowded.has(pin.key)) entry.host.dataset.crowded = "true";
    else delete entry.host.dataset.crowded;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toLngLat(point: LngLat): [number, number] {
  return [point.longitude, point.latitude];
}

function toLngLatBounds(
  bounds: MapBounds,
): [[number, number], [number, number]] {
  return [toLngLat(bounds.southWest), toLngLat(bounds.northEast)];
}

function readBounds(bounds: LngLatBounds): MapBounds {
  return clampBounds(
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  );
}

/** Where `fitBounds` into a cluster's `extent` will take the map, before it moves. */
function planFit(
  map: MapLibreMap | null,
  extent: MapBounds,
): Omit<MapClusterZoom, "zoomIn"> | null {
  if (map === null) return null;
  const camera = map.cameraForBounds(toLngLatBounds(extent), {
    padding: FIT_PADDING,
    maxZoom: CLUSTER_MAX_ZOOM,
  });
  const center = camera?.center;
  if (center === undefined || camera?.zoom === undefined) return null;
  const point: LngLat = Array.isArray(center)
    ? { longitude: center[0], latitude: center[1] }
    : "lng" in center
      ? { longitude: center.lng, latitude: center.lat }
      : { longitude: center.lon, latitude: center.lat };
  const canvas = map.getCanvas();
  const size = { width: canvas.clientWidth, height: canvas.clientHeight };
  const zoom = Math.min(camera.zoom, map.getMaxZoom());
  return { bounds: visibleBounds(point, zoom, size), size };
}

/**
 * Folds the compact attribution to its ⓘ button (MapLibre does so on the
 * first drag only), so that after the viewer's first move or choice it no
 * longer covers the pins at the bottom edge. It opens again from ⓘ.
 */
function collapseAttribution(container: HTMLElement | null): void {
  container
    ?.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
    ?.classList.remove("maplibregl-compact-show");
}

async function loadStyle(url: string): Promise<StyleSpecification | string> {
  if (url !== DEFAULT_MAP_STYLE_URL) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Map style: HTTP ${response.status}`);
  return tintStyle((await response.json()) as StyleSpecification);
}

function PinButton({
  pin,
  onChoose,
}: {
  pin: MapPin;
  onChoose: (pin: MapPin) => void;
}) {
  const choose = () => onChoose(pin);
  if (pin.kind === "region") {
    return (
      <button
        type="button"
        className="map-region"
        aria-pressed={pin.selected}
        aria-label={pin.label}
        onClick={choose}
      >
        <span className="map-region__dot" aria-hidden="true" />
        <span className="map-region__name">{pin.name}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={cx(
        "map-pin",
        pin.emphasis === "member" && "map-pin--member",
        pin.emphasis === "other" && "map-pin--other",
      )}
      data-kind={pin.kind === "target" ? pin.target : pin.kind}
      aria-pressed={pinSelected(pin)}
      aria-label={pin.label}
      onClick={choose}
    >
      {pinCount(pin)}
    </button>
  );
}

/**
 * Lunt/MapCanvas over MapLibre GL JS and public vector tiles (design.md
 * D-13): pins, clusters and regions as focusable buttons over the tiles,
 * the viewer's position, a form's picked point (CF-09, `picked` /
 * `onPick`), and the range reported once a move settles.
 * Data-agnostic: the route turns its cells and targets into `pins`.
 *
 * MapLibre loads in the browser only (the server renders the loading
 * state). Rotation and pitch are off; arrow keys pan and +/− zoom while
 * the map has focus.
 */
export function MapCanvas({
  styleUrl,
  viewport,
  pins,
  label,
  userLocation = null,
  followUserLocation = true,
  onViewportChange,
  onSelect,
  onClusterZoom,
  status = null,
  unavailableActions,
  onUnavailable,
  debounceMs = 400,
  className,
  picked,
  onPick,
  interactive = true,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const meMarkerRef = useRef<Marker | null>(null);
  const pickedMarkerRef = useRef<Marker | null>(null);
  const markerClassRef = useRef<typeof Marker | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(
    () => new Map(),
  );
  const helpId = useId();

  // Handlers and props the long-lived map listeners read at call time.
  const latest = useRef({
    onViewportChange,
    onSelect,
    onClusterZoom,
    onUnavailable,
    debounceMs,
    onPick,
  });
  latest.current = {
    onViewportChange,
    onSelect,
    onClusterZoom,
    onUnavailable,
    debounceMs,
    onPick,
  };
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const labelWidths = useRef(new Map<string, number>());
  const appliedViewport = useRef<string | null>(null);
  const programmaticCause = useRef<MapViewportCause | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const moveTo = useCallback((target: MapViewport, cause: MapViewportCause) => {
    const map = mapRef.current;
    if (map === null) return;
    programmaticCause.current = cause;
    const duration = prefersReducedMotion() ? 0 : 300;
    if (target.kind === "bounds") {
      map.fitBounds(toLngLatBounds(target.bounds), {
        padding: FIT_PADDING,
        maxZoom: target.maxZoom ?? DEFAULT_MAX_ZOOM,
        duration,
      });
    } else {
      map.easeTo({
        center: toLngLat(target.center),
        zoom: target.zoom,
        duration,
      });
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry (`attempt`) recreates the map
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let disposed = false;
    let loaded = false;
    let map: MapLibreMap | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let userMove = false;
    let tileLoads = 0;
    let tileErrors = 0;
    const markers = markersRef.current;

    const fail = (reason: unknown) => {
      if (disposed) return;
      console.warn("[map] could not be drawn", reason);
      disposed = true;
      clearTimeout(loadTimeout);
      map?.remove();
      map = null;
      mapRef.current = null;
      meMarkerRef.current = null;
      pickedMarkerRef.current = null;
      markers.clear();
      setHosts(new Map());
      setPhase("unavailable");
      latest.current.onUnavailable?.();
    };

    const report = (cause: MapViewportCause) => {
      if (map === null) return;
      const canvas = map.getCanvas();
      const center = map.getCenter();
      latest.current.onViewportChange?.({
        bounds: readBounds(map.getBounds()),
        center: { latitude: center.lat, longitude: center.lng },
        zoom: map.getZoom(),
        size: { width: canvas.clientWidth, height: canvas.clientHeight },
        cause,
      });
    };

    setPhase("loading");
    const loadTimeout = setTimeout(() => fail("timed out"), LOAD_TIMEOUT_MS);

    (async () => {
      if (import.meta.env.SSR) return;
      const [{ maplibre: maplibregl }, style] = await Promise.all([
        import("./loadMaplibre"),
        loadStyle(styleUrl),
      ]);
      if (disposed) return;
      markerClassRef.current = maplibregl.Marker;
      const initial = viewportRef.current;
      const options: MapOptions = {
        container,
        style,
        locale: JA_LOCALE,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        renderWorldCopies: false,
        interactive,
        ...(initial.kind === "bounds"
          ? {
              bounds: toLngLatBounds(initial.bounds),
              fitBoundsOptions: {
                padding: FIT_PADDING,
                maxZoom: initial.maxZoom ?? DEFAULT_MAX_ZOOM,
              },
            }
          : { center: toLngLat(initial.center), zoom: initial.zoom }),
      };
      const created = new maplibregl.Map(options);
      map = created;
      mapRef.current = created;
      appliedViewport.current = viewportKey(initial);
      if (interactive) {
        created.touchZoomRotate.disableRotation();
        created.keyboard.disableRotation();
        created.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        created.getCanvas().setAttribute("aria-describedby", helpId);
      }

      // Before the first render a missing style fails the map at once;
      // tiles fail it only when none arrived at all (offline, host down).
      // Later tile errors leave the map as it is.
      created.on("error", (event) => {
        if (loaded) return;
        if ("tile" in event) tileErrors++;
        else fail(event.error);
      });
      created.on("sourcedata", (event) => {
        if (event.tile !== undefined) tileLoads++;
      });
      created.once("load", () => {
        clearTimeout(loadTimeout);
        if (disposed) return;
        if (tileErrors > 0 && tileLoads === 0) {
          fail("no tile could be loaded");
          return;
        }
        loaded = true;
        setPhase("ready");
        report("initial");
      });
      created.on("zoomend", () => {
        if (!loaded) return;
        declutterRegions(
          created,
          pinsRef.current,
          markers,
          labelWidths.current,
        );
      });
      created.on("movestart", (event) => {
        if (event.originalEvent !== undefined) userMove = true;
        if (loaded) collapseAttribution(container);
      });
      created.on("moveend", () => {
        if (!loaded) return;
        // Keyboard pans and resizes carry no original event, so any move
        // this component did not start counts as the viewer's.
        const cause: MapViewportCause = userMove
          ? "user"
          : (programmaticCause.current ?? "user");
        clearTimeout(timer);
        timer = setTimeout(() => {
          userMove = false;
          programmaticCause.current = null;
          report(cause);
        }, latest.current.debounceMs);
      });
      created.on("click", (event) => {
        const target = event.originalEvent.target;
        if (
          target instanceof Element &&
          target.closest(".maplibregl-marker") !== null
        ) {
          return;
        }
        latest.current.onSelect?.(null);
        latest.current.onPick?.({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        });
      });
    })().catch(fail);

    return () => {
      disposed = true;
      clearTimeout(loadTimeout);
      clearTimeout(timer);
      map?.remove();
      mapRef.current = null;
      meMarkerRef.current = null;
      pickedMarkerRef.current = null;
      markers.clear();
    };
  }, [styleUrl, attempt, helpId, interactive]);

  const key = viewportKey(viewport);
  useEffect(() => {
    if (phase !== "ready" || appliedViewport.current === key) return;
    appliedViewport.current = key;
    moveTo(viewportRef.current, "viewport");
  }, [phase, key, moveTo]);

  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    if (phase !== "ready" || map === null || MarkerClass === null) return;
    const markers = markersRef.current;
    const wanted = new Set(pins.map((pin) => pin.key));
    let changed = false;
    for (const [pinKey, entry] of markers) {
      const pin = pins.find((candidate) => candidate.key === pinKey);
      if (!wanted.has(pinKey) || pin?.kind !== entry.kind) {
        entry.marker.remove();
        markers.delete(pinKey);
        changed = true;
      }
    }
    for (const pin of pins) {
      let entry = markers.get(pin.key);
      if (entry === undefined) {
        const host = document.createElement("div");
        host.className = "map__marker";
        const marker = new MarkerClass({
          element: host,
          anchor: pin.kind === "region" ? "left" : "center",
          ...(pin.kind === "region"
            ? { offset: [REGION_OFFSET_X, 0] as [number, number] }
            : {}),
        });
        marker.setLngLat(toLngLat(pin.position)).addTo(map);
        entry = { marker, host, kind: pin.kind };
        markers.set(pin.key, entry);
        changed = true;
      } else {
        entry.marker.setLngLat(toLngLat(pin.position));
      }
      entry.host.style.zIndex = String(pinLayer(pin));
    }
    if (changed) {
      setHosts(
        new Map([...markers].map(([pinKey, { host }]) => [pinKey, host])),
      );
    }
  }, [phase, pins]);

  // After the pins' buttons are in their hosts, so their widths can be read.
  useEffect(() => {
    const map = mapRef.current;
    if (phase !== "ready" || map === null || hosts.size === 0) return;
    declutterRegions(map, pins, markersRef.current, labelWidths.current);
  }, [phase, pins, hosts]);

  const userLatitude = userLocation?.latitude ?? null;
  const userLongitude = userLocation?.longitude ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    if (phase !== "ready" || map === null || MarkerClass === null) return;
    if (userLatitude === null || userLongitude === null) {
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      return;
    }
    const here: LngLat = { latitude: userLatitude, longitude: userLongitude };
    if (meMarkerRef.current === null) {
      const dot = document.createElement("div");
      dot.className = "map-me";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "現在地");
      meMarkerRef.current = new MarkerClass({ element: dot })
        .setLngLat(toLngLat(here))
        .addTo(map);
    } else {
      meMarkerRef.current.setLngLat(toLngLat(here));
    }
    if (followUserLocation) {
      moveTo(
        {
          kind: "center",
          center: here,
          zoom: Math.max(map.getZoom(), LOCATION_MIN_ZOOM),
        },
        "location",
      );
    }
  }, [phase, userLatitude, userLongitude, followUserLocation, moveTo]);

  const pickedLatitude = picked?.position?.latitude ?? null;
  const pickedLongitude = picked?.position?.longitude ?? null;
  const pickedLabel = picked?.label ?? "";
  const pickedMark = picked?.mark ?? "";
  const pickable = onPick !== undefined;
  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    if (phase !== "ready" || map === null || MarkerClass === null) return;
    if (pickedLatitude === null || pickedLongitude === null) {
      pickedMarkerRef.current?.remove();
      pickedMarkerRef.current = null;
      return;
    }
    const at = toLngLat({
      latitude: pickedLatitude,
      longitude: pickedLongitude,
    });
    let marker = pickedMarkerRef.current;
    if (marker === null) {
      const pin = document.createElement("div");
      pin.className = "map-pin map-pick";
      pin.setAttribute("role", "img");
      const created = new MarkerClass({ element: pin, draggable: pickable });
      created.on("dragend", () => {
        const { lat, lng } = created.getLngLat();
        latest.current.onPick?.({ latitude: lat, longitude: lng });
      });
      marker = created.setLngLat(at).addTo(map);
      pickedMarkerRef.current = marker;
    } else {
      marker.setLngLat(at);
      marker.setDraggable(pickable);
    }
    const pin = marker.getElement();
    pin.textContent = pickedMark;
    pin.setAttribute("aria-label", pickedLabel);
    pin.dataset.pickable = pickable ? "true" : "false";
    pin.style.zIndex = "4";
  }, [
    phase,
    pickedLatitude,
    pickedLongitude,
    pickedLabel,
    pickedMark,
    pickable,
  ]);

  const choose = useCallback(
    (pin: MapPin) => {
      collapseAttribution(containerRef.current);
      if (pin.kind === "cluster") {
        const target: MapViewport = {
          kind: "bounds",
          bounds: pin.extent,
          maxZoom: CLUSTER_MAX_ZOOM,
        };
        const zoomIn = () => moveTo(target, "cluster");
        const deferred = latest.current.onClusterZoom;
        const planned =
          deferred === undefined ? null : planFit(mapRef.current, pin.extent);
        if (deferred !== undefined && planned !== null) {
          deferred({ ...planned, zoomIn });
        } else {
          zoomIn();
        }
      }
      latest.current.onSelect?.(pin);
    },
    [moveTo],
  );

  return (
    <section
      className={cx("map", pickable && "map--picking", className)}
      aria-label={label}
      data-phase={phase}
      onKeyDown={(event) => {
        if (event.key === "Escape") latest.current.onSelect?.(null);
      }}
    >
      <div ref={containerRef} className="map__canvas" />
      {interactive ? (
        <p id={helpId} className="sr-only">
          矢印キーで地図を動かし、＋と−で縮尺を変えます。ピンは Tab
          キーで選べます。
        </p>
      ) : null}
      {pins.map((pin) => {
        const host = hosts.get(pin.key);
        return host === undefined
          ? null
          : createPortal(
              <PinButton pin={pin} onChoose={choose} />,
              host,
              pin.key,
            );
      })}
      {phase === "loading" ? (
        <div className="map__loading" role="status">
          <span className="skeleton map__skeleton" aria-hidden="true" />
          <span className="sr-only">地図を読み込んでいます</span>
        </div>
      ) : null}
      {phase === "ready" && status !== null ? (
        <p className="map__status" role="status">
          {status}
        </p>
      ) : null}
      {phase === "unavailable" ? (
        <div className="map__unavailable" role="alert">
          <p className="map__unavailable-title">地図を表示できませんでした</p>
          <p className="map__unavailable-text">
            通信状況を確認して、もう一度お試しください。
          </p>
          <div className="map__unavailable-actions">
            <TextButton onClick={() => setAttempt((n) => n + 1)}>
              もう一度読み込む
            </TextButton>
            {unavailableActions}
          </div>
        </div>
      ) : null}
    </section>
  );
}
