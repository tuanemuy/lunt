import { centerOf } from "@/components/map/geometry";
import type { MapPin, MapPinEmphasis } from "@/components/map/types";
import type {
  MapCellItem,
  MapPlaceItem,
  MapRange,
  MapRegionItem,
} from "@/presentation/mapView";

/**
 * What the viewer picked on a map: a place (possibly from a spot's list),
 * the places sharing a spot, or a region (VW-04 only).
 */
export type MapSelection =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "place";
      place: MapPlaceItem;
      /** The spot it was picked from; its pin stays pressed. */
      spotKey: string | null;
    }>
  | Readonly<{
      kind: "spot";
      key: string;
      places: readonly MapPlaceItem[];
    }>
  | Readonly<{ kind: "region"; regionId: string }>;

export const NO_SELECTION: MapSelection = { kind: "none" };

export const placePinKey = (placeId: string): string => `place:${placeId}`;
const regionPinKey = (regionId: string): string => `region:${regionId}`;

/** While a region is selected (`regionName`), what sets a pin apart. */
type RegionFocus = Readonly<{ regionName: string }> | null;

const emphasisOf = (
  focus: RegionFocus,
  member: boolean,
): MapPinEmphasis | undefined =>
  focus === null ? undefined : member ? "member" : "other";

function cellPin(
  cell: MapCellItem,
  selection: MapSelection,
  focus: RegionFocus,
): MapPin {
  switch (cell.kind) {
    case "single": {
      const { place } = cell;
      const member = place.affiliated;
      return {
        kind: "target",
        target: "place",
        key: placePinKey(place.placeId),
        position: place.location,
        label:
          focus !== null && member
            ? `${place.name}（${focus.regionName}のお店）`
            : place.name,
        selected:
          selection.kind === "place" &&
          selection.place.placeId === place.placeId,
        emphasis: emphasisOf(focus, member),
      };
    }
    case "colocated": {
      const members = cell.places.filter((place) => place.affiliated).length;
      return {
        kind: "colocated",
        key: cell.key,
        position: cell.location,
        count: cell.places.length,
        label:
          focus !== null && members > 0
            ? `同じ位置の店舗 ${cell.places.length} 件（うち${focus.regionName}のお店 ${members} 件）`
            : `同じ位置の店舗 ${cell.places.length} 件`,
        selected:
          (selection.kind === "spot" && selection.key === cell.key) ||
          (selection.kind === "place" && selection.spotKey === cell.key),
        emphasis: emphasisOf(focus, members > 0),
      };
    }
    case "cluster":
      return {
        kind: "cluster",
        key: cell.key,
        position: centerOf(cell.extent),
        count: cell.count,
        extent: cell.extent,
        label:
          focus !== null && cell.affiliatedCount > 0
            ? `店舗 ${cell.count} 件、うち${focus.regionName}のお店 ${cell.affiliatedCount} 件（まとめたピン。選ぶと拡大）`
            : `店舗 ${cell.count} 件（まとめたピン。選ぶと拡大）`,
        emphasis: emphasisOf(focus, cell.affiliatedCount > 0),
      };
  }
}

/**
 * The pins of a read: the places' cells, then the regions (each once, the
 * selected one included wherever it lies). While a region is selected,
 * its places are `member` and the rest `other`.
 */
export function mapPins(
  cells: readonly MapCellItem[],
  regions: readonly MapRegionItem[],
  selection: MapSelection,
  selectedRegion: MapRegionItem | null,
): readonly MapPin[] {
  const focus: RegionFocus =
    selectedRegion === null ? null : { regionName: selectedRegion.name };
  const shownRegions = [
    ...regions,
    ...(selectedRegion === null ||
    regions.some((region) => region.regionId === selectedRegion.regionId)
      ? []
      : [selectedRegion]),
  ];
  return [
    ...cells.map((cell) => cellPin(cell, selection, focus)),
    ...shownRegions.map(
      (region): MapPin => ({
        kind: "region",
        key: regionPinKey(region.regionId),
        name: region.name,
        position: region.location,
        label: `まち ${region.name}`,
        selected:
          selection.kind === "region" && selection.regionId === region.regionId,
      }),
    ),
  ];
}

/**
 * The selection a chosen pin makes, from the cells it was drawn from;
 * `null` for a cluster (it only zooms) or a pin no longer drawn.
 */
export function selectionOfPin(
  pin: MapPin,
  cells: readonly MapCellItem[],
): MapSelection | null {
  switch (pin.kind) {
    case "cluster":
      return null;
    case "region":
      return { kind: "region", regionId: pin.key.slice("region:".length) };
    case "colocated": {
      const cell = cells.find(
        (each) => each.kind === "colocated" && each.key === pin.key,
      );
      return cell?.kind === "colocated"
        ? { kind: "spot", key: cell.key, places: cell.places }
        : null;
    }
    case "target": {
      const cell = cells.find(
        (each) =>
          each.kind === "single" && placePinKey(each.place.placeId) === pin.key,
      );
      return cell?.kind === "single"
        ? { kind: "place", place: cell.place, spotKey: null }
        : null;
    }
  }
}

type LatLng = Readonly<{ latitude: number; longitude: number }>;

/** Where a cell's pin sits. */
function anchorOf(cell: MapCellItem): LatLng {
  switch (cell.kind) {
    case "single":
      return cell.place.location;
    case "colocated":
      return cell.location;
    case "cluster":
      return centerOf(cell.extent);
  }
}

const inside = (range: MapRange, point: LatLng): boolean =>
  point.latitude >= range.southWest.latitude &&
  point.latitude <= range.northEast.latitude &&
  point.longitude >= range.southWest.longitude &&
  point.longitude <= range.northEast.longitude;

/**
 * VW-08 after a cluster's zoom: the zoomed range regrouped (`zoomed`, read
 * for `range`) with the earlier pins outside it kept, so every participant
 * stays on the map (「表示する店舗は、常にそのイベントのすべての参加店舗」).
 */
export function mergeZoomedCells(
  previous: readonly MapCellItem[],
  zoomed: readonly MapCellItem[],
  range: MapRange,
): readonly MapCellItem[] {
  return [
    ...previous.filter((cell) => !inside(range, anchorOf(cell))),
    ...zoomed,
  ];
}
