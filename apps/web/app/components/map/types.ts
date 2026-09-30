/** A point in degrees (WGS 84), as the core's `GeoPoint` carries it. */
export type LngLat = Readonly<{ latitude: number; longitude: number }>;

/** A rectangle by its south-west and north-east corners, as `GeoBounds`. */
export type MapBounds = Readonly<{ southWest: LngLat; northEast: LngLat }>;

/**
 * Where the map should look. Applied on mount and again whenever its value
 * changes; the map's own moves never write it back, so a route must not
 * echo `onViewportChange` into it.
 */
export type MapViewport =
  | Readonly<{
      kind: "bounds";
      bounds: MapBounds;
      /** Caps the zoom a small (or single-point) range would reach. */
      maxZoom?: number | undefined;
    }>
  | Readonly<{ kind: "center"; center: LngLat; zoom: number }>;

/**
 * Why the visible range changed: the first settled view, the viewer's
 * drag / zoom (the only cause VW-04 re-searches on), a new `viewport`
 * prop, the zoom into a selected cluster (VW-08 re-reads on it), or the
 * move to the viewer's position.
 */
export type MapViewportCause =
  | "initial"
  | "user"
  | "viewport"
  | "cluster"
  | "location";

export type MapViewportChange = Readonly<{
  /** Clamped to valid coordinates, so it always constructs a `GeoBounds`. */
  bounds: MapBounds;
  center: LngLat;
  zoom: number;
  /** The map's CSS pixel size, to derive the clustering grid from. */
  size: Readonly<{ width: number; height: number }>;
  cause: MapViewportCause;
}>;

/**
 * A cluster the viewer chose, before the map zooms into it: the range and
 * the size the map will show once zoomed, and the zoom itself. A route
 * that reads the range first (VW-08 keeps the view before the zoom while
 * reading and on failure) calls `zoomIn` once it has the pins.
 */
export type MapClusterZoom = Readonly<{
  bounds: MapBounds;
  size: Readonly<{ width: number; height: number }>;
  zoomIn: () => void;
}>;

/**
 * While a region is selected (`spec/pages/index.md` 「地図」), its places
 * are drawn as `member` and the others as `other`.
 */
export type MapPinEmphasis = "member" | "other";

type PinBase = Readonly<{
  /** Stable across renders; the marker is kept while the key stays. */
  key: string;
  position: LngLat;
  /** The pin's accessible name (e.g. 喫茶 日々, 店舗 3 件). */
  label: string;
}>;

/**
 * What the map draws. Places, listings and events are single `target`
 * pins; `colocated` is several places at one spot (selecting lists them);
 * `cluster` is nearby places grouped by the map cell, which the map zooms
 * into when selected; `region` is one point with its name and is never
 * grouped with places.
 */
export type MapPin =
  | (PinBase &
      Readonly<{
        kind: "target";
        target: "place" | "listing" | "occasion";
        selected: boolean;
        emphasis?: MapPinEmphasis | undefined;
      }>)
  | (PinBase &
      Readonly<{
        kind: "colocated";
        count: number;
        selected: boolean;
        emphasis?: MapPinEmphasis | undefined;
      }>)
  | (PinBase &
      Readonly<{
        kind: "cluster";
        count: number;
        /** The range its places span; selecting the pin zooms to it. */
        extent: MapBounds;
        emphasis?: MapPinEmphasis | undefined;
      }>)
  | (PinBase & Readonly<{ kind: "region"; name: string; selected: boolean }>);

/**
 * The one point a form places on the map (CF-09 位置の指定), drawn as a
 * selected pin apart from `pins`. It moves only through `onPick`.
 */
export type MapPickedPoint = Readonly<{
  /** `null` while nothing is chosen yet. */
  position: LngLat | null;
  /** The point's accessible name, e.g. 選んだ位置. */
  label: string;
  /** The pin's short text, e.g. 店 (MapPin Selected=true). */
  mark: string;
}>;
