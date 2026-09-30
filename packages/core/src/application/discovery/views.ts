import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId, RegionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { CoverPhoto, PlaceEntry } from "@repo/core/domain/discovery/entry";
import type { PlaceCell } from "@repo/core/domain/discovery/mapClustering";
import {
  type ArticleSummary,
  type ListingSummary,
  type OccasionSummary,
  type PlaceSummary,
  type RegionSummary,
  type ShowcaseSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { RequestContainer } from "../di/types";

/**
 * Display refs of the photos a result shows, keyed by `PhotoId`
 * (`PhotoStorage.displayRefs`). Every photo id in the result has an entry.
 */
export type PhotoRefs = Readonly<Record<PhotoId, PhotoDisplayRef>>;

/** Today's calendar day in Japan time, from the container's clock. */
export const todayOf = (
  container: Pick<RequestContainer, "clock">,
): LocalDate => LocalDate.fromInstant(container.clock.now());

/** Display refs of `photoIds` (any number, repeats allowed), in 100-id batches. */
export async function photoRefsOf(
  container: Pick<RequestContainer, "photoStorage">,
  photoIds: readonly PhotoId[],
): Promise<PhotoRefs> {
  const distinct = [...new Set(photoIds)];
  const refs: Record<PhotoId, PhotoDisplayRef> = {};
  for (let i = 0; i < distinct.length; i += IdBatch.maxSize) {
    const batch = await container.photoStorage.displayRefs(
      distinct.slice(i, i + IdBatch.maxSize),
    );
    for (const [photoId, ref] of batch) refs[photoId] = ref;
  }
  return refs;
}

export const coverPhotoIds = (cover: CoverPhoto | null): readonly PhotoId[] =>
  cover === null ? [] : [cover.photoId];

export const listingSummaryPhotoIds = (
  summary: ListingSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const placeSummaryPhotoIds = (
  summary: PlaceSummary,
): readonly PhotoId[] => coverPhotoIds(summary.cover);

export const regionSummaryPhotoIds = (
  summary: RegionSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const occasionSummaryPhotoIds = (
  summary: OccasionSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const articleSummaryPhotoIds = (
  summary: ArticleSummary,
): readonly PhotoId[] => [summary.cover.photoId];

export const showcaseSummaryPhotoIds = (
  showcase: ShowcaseSummary,
): readonly PhotoId[] => {
  switch (showcase.kind) {
    case "listing":
      return listingSummaryPhotoIds(showcase.summary);
    case "place":
      return placeSummaryPhotoIds(showcase.summary);
    case "region":
      return regionSummaryPhotoIds(showcase.summary);
    case "occasion":
      return occasionSummaryPhotoIds(showcase.summary);
  }
};

/**
 * A place on the map: its summary (operating status included, the
 * displayed region named) and whether it belongs to the selected region —
 * which the displayed region cannot tell when that is another of its
 * regions. Always `false` without a selected region.
 */
export type MapPlaceSummary = PlaceSummary & Readonly<{ affiliated: boolean }>;

/**
 * A map cell as the screen shows it: a single place or the colocated
 * places, or a cluster's count and the extent to zoom into.
 */
export type PlaceCellView =
  | Readonly<{
      kind: "single";
      column: number;
      row: number;
      place: MapPlaceSummary;
    }>
  | Readonly<{
      kind: "cluster";
      column: number;
      row: number;
      count: number;
      /** Places of the selected region among them (0 without one). */
      affiliatedCount: number;
      /** Read it as the next bounds to split the cluster. */
      extent: GeoBounds;
    }>
  | Readonly<{
      kind: "colocated";
      column: number;
      row: number;
      location: GeoPoint;
      /** Newest first. */
      places: readonly MapPlaceSummary[];
    }>;

const mapPlace = (
  entry: PlaceEntry,
  selectedRegionId: RegionId | null,
): MapPlaceSummary => ({
  ...ViewProjection.placeSummary(entry, { kind: "displayed" }),
  affiliated:
    selectedRegionId !== null &&
    entry.regions.some((region) => region.id === selectedRegionId),
});

/**
 * A cell's places as summaries naming their displayed region, each marked
 * when it belongs to `selectedRegionId`.
 */
export function placeCellView(
  cell: PlaceCell,
  selectedRegionId: RegionId | null,
): PlaceCellView {
  switch (cell.kind) {
    case "single":
      return { ...cell, place: mapPlace(cell.place, selectedRegionId) };
    case "colocated":
      return {
        ...cell,
        places: cell.places.map((entry) => mapPlace(entry, selectedRegionId)),
      };
    case "cluster":
      return cell;
  }
}

export const placeCellPhotoIds = (cell: PlaceCellView): readonly PhotoId[] => {
  switch (cell.kind) {
    case "single":
      return placeSummaryPhotoIds(cell.place);
    case "colocated":
      return cell.places.flatMap(placeSummaryPhotoIds);
    case "cluster":
      return [];
  }
};

type LatLng = Readonly<{ latitude: number; longitude: number }>;

/** A range as it arrives from the transport, before `GeoBounds.create`. */
export type BoundsInput = Readonly<{ southWest: LatLng; northEast: LatLng }>;

/** A position as it arrives from the transport, before `GeoPoint.create`. */
export type PointInput = LatLng;

/**
 * `GeoBounds.create` of a transport range.
 *
 * @throws BusinessRuleError `COMMON_INVALID_GEO_POINT` or
 *   `COMMON_INVALID_GEO_BOUNDS`.
 */
export const boundsFromInput = (input: BoundsInput): GeoBounds =>
  GeoBounds.create(
    GeoPoint.create(input.southWest.latitude, input.southWest.longitude),
    GeoPoint.create(input.northEast.latitude, input.northEast.longitude),
  );

/** `GeoPoint.create` of a transport position (`COMMON_INVALID_GEO_POINT`). */
export const pointFromInput = (input: PointInput): GeoPoint =>
  GeoPoint.create(input.latitude, input.longitude);
