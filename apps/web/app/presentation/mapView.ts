import type { FindMapExtentOutput } from "@repo/core/application/discovery/findMapExtent";
import type { ListMapTargetsOutput } from "@repo/core/application/discovery/listMapTargets";
import type { LocateParticipantsOutput } from "@repo/core/application/discovery/locateParticipants";
import type { ReadMapCellsOutput } from "@repo/core/application/discovery/readMapCells";
import type {
  MapPlaceSummary,
  PhotoRefs,
  PlaceCellView,
} from "@repo/core/application/discovery/views";
import { Address } from "@repo/core/domain/common/address";
import type {
  PlaceSummary,
  RegionSummary,
} from "@repo/core/domain/discovery/viewProjection";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { placeRow, type RegionRowItem, regionRow } from "./detailView";
import type { PhotoSource } from "./photoFraming";

/**
 * What VW-04 マップ and VW-08 参加店舗マップ show, as plain serializable
 * data built on the server from the Discovery usecases' outputs
 * (`spec/pages/browse.md`). Client-safe: no server imports.
 */

type LatLng = Readonly<{ latitude: number; longitude: number }>;

/** A range by its corners, as the map and the transport carry it. */
export type MapRange = Readonly<{ southWest: LatLng; northEast: LatLng }>;

/** VW-04's list, per kind and page (CF-05). */
export const MAP_LIST_PAGE_SIZE = 20;

/**
 * The clustering grid's cap per side. The map asks for one cell per
 * `MAP_CELL_PX` of its size; the transport refuses more than this.
 */
export const MAP_GRID_MAX = 64;

/**
 * The CSS pixels one grid cell spans. A pin is 44 and sits where its
 * places are, not at the cell's centre, so neighbours need the margin.
 */
export const MAP_CELL_PX = 72;

/** A place on the map, in its overview or in the list. */
export type MapPlaceItem = Readonly<{
  placeId: string;
  name: string;
  /** 所在地: the full address. */
  address: string;
  /** The displayed region's name; `null` while none is viewable. */
  regionName: string | null;
  operating: OperatingStatus;
  /** Its own cover, else the substitute listing photo (P-43), else none. */
  photo: PhotoSource | null;
  location: LatLng;
  /** Belongs to the region selected on the map (VW-04 only). */
  affiliated: boolean;
}>;

/** A region on the map, in its overview or in the list. */
export type MapRegionItem = RegionRowItem & Readonly<{ location: LatLng }>;

/**
 * A map cell as the screens draw it: one place, places sharing a spot
 * (selecting lists them), or a cluster to zoom into.
 */
export type MapCellItem =
  | Readonly<{ kind: "single"; place: MapPlaceItem }>
  | Readonly<{
      kind: "colocated";
      /** Stable for the spot, so its pin survives a re-read. */
      key: string;
      location: LatLng;
      /** Newest first. */
      places: readonly MapPlaceItem[];
    }>
  | Readonly<{
      kind: "cluster";
      key: string;
      count: number;
      /** Places of the selected region among them (0 without one). */
      affiliatedCount: number;
      /** Where the cluster's places lie; selecting it zooms to this. */
      extent: MapRange;
    }>;

/** One read of VW-04's map for a range, the criteria and a selected region. */
export type MapRead = Readonly<{
  cells: readonly MapCellItem[];
  /** Newest first; one point each, never grouped with places. */
  regions: readonly MapRegionItem[];
  /** The selected region, `null` without one or once it is not viewable. */
  selectedRegion: MapRegionItem | null;
}>;

/** A page of one kind of VW-04's list. */
export type MapTargetPage<T> = Readonly<{ items: readonly T[]; count: number }>;

export type MapTargets = Readonly<{
  places: MapTargetPage<MapPlaceItem> | null;
  regions: MapTargetPage<MapRegionItem> | null;
}>;

/** What VW-04's first range rests on (`findMapExtent`). */
export type MapExtentBasis = FindMapExtentOutput["basis"];

export type MapExtent = Readonly<{
  basis: MapExtentBasis;
  /** `null` only for a region that is not viewable. */
  range: MapRange | null;
}>;

/** VW-08's cells for a range (`locateParticipants`). */
export type ParticipantsRead = Readonly<{
  /** The header's title. */
  occasionName: string;
  cells: readonly MapCellItem[];
  /** The range holding every viewable participant; `null` without any. */
  extent: MapRange | null;
}>;

const latLng = (point: LatLng): LatLng => ({
  latitude: point.latitude,
  longitude: point.longitude,
});

/** A range as plain data (the core's `GeoBounds` carries brands). */
export const rangeOf = (bounds: MapRange): MapRange => ({
  southWest: latLng(bounds.southWest),
  northEast: latLng(bounds.northEast),
});

const spotKey = (point: LatLng): string =>
  `${point.latitude},${point.longitude}`;

function mapPlace(
  summary: PlaceSummary,
  refs: PhotoRefs,
  affiliated: boolean,
): MapPlaceItem {
  const row = placeRow(summary, refs);
  return {
    placeId: row.placeId,
    name: row.name,
    address: Address.text(summary.address),
    regionName: row.regionName,
    operating: row.operating,
    photo: row.photo,
    location: latLng(summary.location),
    affiliated,
  };
}

const mapPlaceOf = (summary: MapPlaceSummary, refs: PhotoRefs) =>
  mapPlace(summary, refs, summary.affiliated);

/** A region of a summary, with its point. */
export function mapRegion(
  summary: RegionSummary,
  refs: PhotoRefs,
): MapRegionItem {
  return { ...regionRow(summary, refs), location: latLng(summary.location) };
}

function mapCell(cell: PlaceCellView, refs: PhotoRefs): MapCellItem {
  switch (cell.kind) {
    case "single":
      return { kind: "single", place: mapPlaceOf(cell.place, refs) };
    case "colocated":
      return {
        kind: "colocated",
        key: `spot:${spotKey(cell.location)}`,
        location: latLng(cell.location),
        places: cell.places.map((place) => mapPlaceOf(place, refs)),
      };
    case "cluster":
      return {
        kind: "cluster",
        key: `cluster:${cell.column}:${cell.row}`,
        count: cell.count,
        affiliatedCount: cell.affiliatedCount,
        extent: rangeOf(cell.extent),
      };
  }
}

/** VW-04's map from `readMapCells`. */
export function toMapRead(output: ReadMapCellsOutput): MapRead {
  return {
    cells: output.cells.map((cell) => mapCell(cell, output.photos)),
    regions: output.regions.map((region) => mapRegion(region, output.photos)),
    selectedRegion:
      output.selectedRegion === null
        ? null
        : mapRegion(output.selectedRegion, output.photos),
  };
}

/** VW-04's list from `listMapTargets`. */
export function toMapTargets(output: ListMapTargetsOutput): MapTargets {
  return {
    places:
      output.places === null
        ? null
        : {
            items: output.places.items.map((place) =>
              mapPlace(place, output.photos, false),
            ),
            count: output.places.count,
          },
    regions:
      output.regions === null
        ? null
        : {
            items: output.regions.items.map((region) =>
              mapRegion(region, output.photos),
            ),
            count: output.regions.count,
          },
  };
}

/** VW-04's first range from `findMapExtent`. */
export function toMapExtent(output: FindMapExtentOutput): MapExtent {
  return {
    basis: output.basis,
    range: output.extent === null ? null : rangeOf(output.extent),
  };
}

/** VW-08's cells from `locateParticipants`. */
export function toParticipantsRead(
  output: LocateParticipantsOutput,
): ParticipantsRead {
  return {
    occasionName: output.occasionName,
    cells: output.cells.map((cell) => mapCell(cell, output.photos)),
    extent: output.extent === null ? null : rangeOf(output.extent),
  };
}

/** The clustering grid for a map of `size` CSS pixels. */
export function gridOfSize(
  size: Readonly<{ width: number; height: number }>,
): Readonly<{ columns: number; rows: number }> {
  const cells = (pixels: number) =>
    Math.min(MAP_GRID_MAX, Math.max(1, Math.round(pixels / MAP_CELL_PX)));
  return { columns: cells(size.width), rows: cells(size.height) };
}

/** How a place's closure is told (VW-04 休業中; VW-08 also 閉店). */
export function closureText(operating: OperatingStatus): string | null {
  switch (operating) {
    case "open":
      return null;
    case "temporarilyClosed":
      return "休業中";
    case "permanentlyClosed":
      return "閉店";
  }
}
